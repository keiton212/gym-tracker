import Foundation
import AVFoundation
import Capacitor

@objc(GymAudioSessionPlugin)
public class GymAudioSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GymAudioSessionPlugin"
    public let jsName = "GymAudioSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configureForWorkoutRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "teardown", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNativeCapture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopNativeCapture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listInputs", returnType: CAPPluginReturnPromise)
    ]

    private let engine = AVAudioEngine()
    private var converter: AVAudioConverter?
    private var accumulating = [Float]()
    private var sequence = 0
    private var capturing = false
    private let targetRate: Double = 16000
    private let samplesPerBlock = 16000
    private let lock = NSLock()

    @objc func configureForWorkoutRecording(_ call: CAPPluginCall) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playAndRecord,
                mode: .spokenAudio,
                options: [.mixWithOthers, .allowBluetooth, .defaultToSpeaker]
            )
            try session.setActive(true, options: [])
            call.resolve([
                "ok": true,
                "category": session.category.rawValue,
                "sampleRate": session.sampleRate
            ])
        } catch {
            call.reject("AVAudioSession configure failed: \(error.localizedDescription)")
        }
    }

    @objc func teardown(_ call: CAPPluginCall) {
        stopEngine()
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            // Still resolve — session may already be inactive.
        }
        call.resolve(["ok": true])
    }

    @objc func listInputs(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        let inputs = (session.availableInputs ?? []).map { port -> [String: String] in
            [
                "id": port.uid,
                "label": port.portName,
                "type": port.portType.rawValue
            ]
        }
        call.resolve(["inputs": inputs])
    }

    @objc func startNativeCapture(_ call: CAPPluginCall) {
        do {
            try configureSessionInternal()
            if let preferredId = call.getString("deviceId"), !preferredId.isEmpty {
                if let match = AVAudioSession.sharedInstance().availableInputs?.first(where: { $0.uid == preferredId }) {
                    try AVAudioSession.sharedInstance().setPreferredInput(match)
                }
            }
            try startEngine()
            call.resolve(["ok": true, "rate": targetRate])
        } catch {
            stopEngine()
            call.reject("Native capture failed: \(error.localizedDescription)")
        }
    }

    @objc func stopNativeCapture(_ call: CAPPluginCall) {
        flushPartialBlock()
        stopEngine()
        notifyListeners("pcmFlushed", data: [:])
        call.resolve(["ok": true])
    }

    private func configureSessionInternal() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .spokenAudio,
            options: [.mixWithOthers, .allowBluetooth, .defaultToSpeaker]
        )
        try session.setActive(true, options: [])
    }

    private func startEngine() throws {
        stopEngine()
        sequence = 0
        accumulating.removeAll(keepingCapacity: true)

        let input = engine.inputNode
        let inputFormat = input.inputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
            throw NSError(domain: "GymAudioSession", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Microphone format is not ready"
            ])
        }

        guard let outFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: targetRate,
            channels: 1,
            interleaved: false
        ) else {
            throw NSError(domain: "GymAudioSession", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Could not create 16kHz mono format"
            ])
        }

        converter = AVAudioConverter(from: inputFormat, to: outFormat)
        capturing = true

        input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
            self?.handleInput(buffer: buffer, outFormat: outFormat)
        }

        engine.prepare()
        try engine.start()
    }

    private func handleInput(buffer: AVAudioPCMBuffer, outFormat: AVAudioFormat) {
        guard capturing, let converter = converter else { return }

        let ratio = outFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
        guard let converted = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: capacity) else { return }

        var consumed = false
        let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
            if consumed {
                outStatus.pointee = .noDataNow
                return nil
            }
            consumed = true
            outStatus.pointee = .haveData
            return buffer
        }
        var error: NSError?
        converter.convert(to: converted, error: &error, withInputFrom: inputBlock)
        if error != nil { return }
        guard let channel = converted.floatChannelData?[0] else { return }

        let frames = Int(converted.frameLength)
        lock.lock()
        for i in 0..<frames {
            accumulating.append(channel[i])
        }
        while accumulating.count >= samplesPerBlock {
            let block = Array(accumulating.prefix(samplesPerBlock))
            accumulating.removeFirst(samplesPerBlock)
            let seq = sequence
            sequence += 1
            lock.unlock()
            emitBlock(block, sequence: seq)
            lock.lock()
        }
        lock.unlock()
    }

    private func emitBlock(_ samples: [Float], sequence: Int) {
        let data = samples.withUnsafeBufferPointer { ptr in
            Data(buffer: ptr)
        }
        notifyListeners("pcmBlock", data: [
            "base64": data.base64EncodedString(),
            "rate": Int(targetRate),
            "sequence": sequence,
            "samples": samples.count
        ])
    }

    private func flushPartialBlock() {
        lock.lock()
        let leftover = accumulating
        accumulating.removeAll(keepingCapacity: true)
        let seq = sequence
        if !leftover.isEmpty { sequence += 1 }
        lock.unlock()
        if !leftover.isEmpty {
            emitBlock(leftover, sequence: seq)
        }
    }

    private func stopEngine() {
        capturing = false
        if engine.inputNode.numberOfInputs > 0 {
            engine.inputNode.removeTap(onBus: 0)
        }
        if engine.isRunning {
            engine.stop()
        }
        converter = nil
    }

    deinit {
        stopEngine()
    }
}
