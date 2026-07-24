// iOS で音を鳴らすには「ユーザー操作の中」で AudioContext を作る/再開する必要がある。
// 最初のタップで一度だけ生成・再開しておき、以降はそれを使い回す。
let sharedAudioContext = null;

function primeAudio() {
    if (!sharedAudioContext) {
        try {
            sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            return;
        }
    }
    if (sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume();
    }
}

document.addEventListener('touchend', primeAudio, { once: true });
document.addEventListener('click', primeAudio, { once: true });

function playBeep(times = 3) {
    if (!sharedAudioContext) return;
    try {
        for (let i = 0; i < times; i++) {
            setTimeout(() => {
                const oscillator = sharedAudioContext.createOscillator();
                const gainNode = sharedAudioContext.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(sharedAudioContext.destination);
                oscillator.frequency.value = 1000;
                gainNode.gain.setValueAtTime(0.3, sharedAudioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, sharedAudioContext.currentTime + 0.15);
                oscillator.start(sharedAudioContext.currentTime);
                oscillator.stop(sharedAudioContext.currentTime + 0.15);
            }, i * 200);
        }
    } catch (e) {
        // 音が鳴らせなくてもアプリは継続
    }
}

function formatTime(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// セッション全体タイマー（トレーニング開始〜終了までの1つだけ）
// iOSはバックグラウンド中にsetIntervalのカウントを止める/間引くため、
// 経過時間は必ず実時刻(endAt)から逆算する。tick自体は表示更新のきっかけに過ぎない。
class Timer {
    constructor() {
        this.duration = 70 * 60;
        this.remaining = this.duration;
        this.isRunning = false;
        this.intervalId = null;
        this.endAt = null;
    }

    setDuration(minutes) {
        this.stop();
        this.duration = minutes * 60;
        this.remaining = this.duration;
        this.updateDisplay();
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.endAt = Date.now() + this.remaining * 1000;

        this.intervalId = setInterval(() => this.tick(), 250);
        this.updateDisplay();
    }

    tick() {
        const remainingMs = this.endAt - Date.now();

        if (remainingMs <= 0) {
            this.stop();
            playBeep(6);
            this.remaining = 0;
            this.updateDisplay();
            return;
        }

        this.remaining = Math.ceil(remainingMs / 1000);
        this.updateDisplay();
    }

    // アプリがバックグラウンドから復帰した直後などに、待たずに即座へ補正する
    syncNow() {
        if (this.isRunning) this.tick();
    }

    pause() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.endAt) {
            this.remaining = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
        }
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
    }

    reset() {
        this.stop();
        this.remaining = this.duration;
        this.updateDisplay();
    }

    updateDisplay() {
        const timerEl = document.getElementById('timerValue');
        const timerCard = document.querySelector('.timer-card');
        if (!timerEl || !timerCard) return;

        timerEl.textContent = formatTime(this.remaining);

        const percentage = (this.remaining / this.duration) * 100;
        timerCard.classList.remove('warning', 'critical');
        if (percentage <= 10) {
            timerCard.classList.add('critical');
        } else if (percentage <= 30) {
            timerCard.classList.add('warning');
        }
    }
}

const timer = new Timer();

// 種目ごとのレストタイマー（複数同時に存在できる）
// Timerと同じく、実時刻(endAt)から逆算してバックグラウンド復帰後も正確な残り時間にする。
class RestTimer {
    constructor(minutes, onTick) {
        this.duration = Math.max(0, minutes) * 60;
        this.remaining = this.duration;
        this.isRunning = false;
        this.intervalId = null;
        this.onTick = onTick;
        this.endAt = null;
    }

    setMinutes(minutes) {
        this.stop();
        this.duration = Math.max(0, minutes) * 60;
        this.remaining = this.duration;
        if (this.onTick) this.onTick(this);
    }

    toggle() {
        if (this.isRunning) {
            this.pause();
        } else {
            this.start();
        }
    }

    start() {
        if (this.isRunning) return;
        // 0で止まっている状態から再度スタートした場合は、満タンから取り直せるようにする
        if (this.remaining <= 0) {
            this.remaining = this.duration;
        }
        if (this.remaining <= 0) return;

        this.isRunning = true;
        this.endAt = Date.now() + this.remaining * 1000;
        this.intervalId = setInterval(() => this.tick(), 250);
        if (this.onTick) this.onTick(this);
    }

    tick() {
        const remainingMs = this.endAt - Date.now();

        if (remainingMs <= 0) {
            this.remaining = 0;
            this.stop();
            playBeep(4);
        } else {
            this.remaining = Math.ceil(remainingMs / 1000);
        }
        if (this.onTick) this.onTick(this);
    }

    // アプリがバックグラウンドから復帰した直後などに、待たずに即座へ補正する
    syncNow() {
        if (this.isRunning) this.tick();
    }

    pause() {
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.endAt) {
            this.remaining = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
        }
        if (this.onTick) this.onTick(this);
    }

    stop() {
        this.pause();
    }

    reset() {
        this.stop();
        this.remaining = this.duration;
        if (this.onTick) this.onTick(this);
    }
}
