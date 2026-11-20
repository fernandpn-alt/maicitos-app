// Web Audio API sound synthesizer for tactile feedback

class SoundEffects {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
  }

  // Quick crisp tap sound on action button press
  playSaleClick(qty = 1) {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(qty > 1 ? [35, 20, 35] : 30);
      }

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const baseFreq = 520 + Math.min(qty, 10) * 30;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.45, now + 0.08);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // ignore audio errors
    }
  }

  // Cash register chime on sale / box confirm
  playCashChime() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([50, 35, 70]);
      }

      const now = this.ctx.currentTime;
      const freqs = [587.33, 880, 1174.66];
      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.06);

        gain.gain.setValueAtTime(0.22, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.32);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.32);
      });
    } catch {
      // ignore
    }
  }

  // Soft two-note chime when an incoming WhatsApp order syncs from another device
  playOrderAlert() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const now = this.ctx.currentTime;
      const freqs = [659.25, 987.77]; // E5 -> B5
      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.11);

        gain.gain.setValueAtTime(0.2, now + idx * 0.11);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.11);
        osc.stop(now + idx * 0.11 + 0.25);
      });
    } catch {
      // ignore
    }
  }

  // Undo swoosh sound
  playUndo() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(25);
      }

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.13);
    } catch {
      // ignore
    }
  }
}

export const sounds = new SoundEffects();
