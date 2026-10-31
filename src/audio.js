// Tiny procedural sound engine. No external assets, only WebAudio.

export class SoundEngine {
  constructor() {
    this.ctx = null
    this.enabled = true
    this.master = null
    this.lastStep = 0
    this.birdTimer = 6
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.55
    this.master.connect(this.ctx.destination)
    this.noiseBuffer = this.createNoise(1.2)
  }

  createNoise(seconds) {
    const rate = this.ctx.sampleRate
    const buffer = this.ctx.createBuffer(1, Math.floor(rate * seconds), rate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  setEnabled(enabled) {
    this.enabled = enabled
    if (this.master) this.master.gain.value = enabled ? 0.55 : 0
  }

  tone(freq, duration, type = 'sine', volume = 0.14, slide = 0) {
    if (!this.enabled || !this.ctx) return
    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + duration)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }

  noise(duration, volume = 0.18, filterFreq = 900, type = 'lowpass') {
    if (!this.enabled || !this.ctx) return
    const now = this.ctx.currentTime
    const source = this.ctx.createBufferSource()
    source.buffer = this.noiseBuffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = filterFreq
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(volume, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    source.start(now)
    source.stop(now + duration)
  }

  click() {
    this.tone(720, 0.05, 'triangle', 0.07, 160)
  }

  place() {
    this.noise(0.12, 0.22, 560)
    this.tone(150, 0.08, 'sine', 0.12, -40)
  }

  breakBlock() {
    this.noise(0.18, 0.26, 1200)
    this.tone(110, 0.12, 'triangle', 0.08, -40)
  }

  step() {
    if (!this.enabled || !this.ctx) return
    const now = this.ctx.currentTime
    if (now - this.lastStep < 0.16) return
    this.lastStep = now
    this.noise(0.06, 0.075, 420)
  }

  jump() {
    this.noise(0.05, 0.05, 700)
  }

  pickup() {
    this.tone(640, 0.06, 'square', 0.04, 120)
    this.tone(960, 0.09, 'square', 0.03, 90)
  }

  splash() {
    this.noise(0.3, 0.12, 1600, 'bandpass')
  }

  update(dt) {
    if (!this.enabled || !this.ctx) return
    this.birdTimer -= dt
    if (this.birdTimer <= 0) {
      this.birdTimer = 9 + Math.random() * 16
      const base = 1700 + Math.random() * 900
      const delay = Math.random() * 0.22
      setTimeout(() => this.tone(base, 0.12, 'sine', 0.028, 320), delay * 1000)
      setTimeout(() => this.tone(base + 260, 0.1, 'sine', 0.02, -120), (delay + 0.16) * 1000)
    }
  }
}
