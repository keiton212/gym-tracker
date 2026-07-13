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
class Timer {
    constructor() {
        this.duration = 70 * 60;
        this.remaining = this.duration;
        this.isRunning = false;
        this.intervalId = null;
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

        this.intervalId = setInterval(() => {
            this.remaining--;

            if (this.remaining < 0) {
                this.stop();
                playBeep(3);
                this.remaining = 0;
                this.updateDisplay();
                return;
            }

            this.updateDisplay();
        }, 1000);

        this.updateDisplay();
    }

    pause() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
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
class RestTimer {
    constructor(minutes, onTick) {
        this.duration = Math.max(0, minutes) * 60;
        this.remaining = this.duration;
        this.isRunning = false;
        this.intervalId = null;
        this.onTick = onTick;
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
        if (this.isRunning || this.remaining <= 0) return;
        this.isRunning = true;
        this.intervalId = setInterval(() => {
            this.remaining--;
            if (this.remaining <= 0) {
                this.remaining = 0;
                this.stop();
                playBeep(2);
            }
            if (this.onTick) this.onTick(this);
        }, 1000);
        if (this.onTick) this.onTick(this);
    }

    pause() {
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
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
