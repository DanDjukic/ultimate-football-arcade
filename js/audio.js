'use strict';
/* ============ Sound (WebAudio-Synthese) & Kommentator ============ */
const Sound = {
  ctx: null, master: null, crowdGain: null, crowdSrc: null, noiseBuf: null,
  on() { return Store.d && Store.d.settings.sound; },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = .7; this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2; this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  tone(freq, dur, type = 'sine', vol = .2, when = 0, slide = 0) {
    if (!this.ctx || !this.on()) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .05);
  },
  noise(dur, vol = .3, freq = 1000, q = 1, when = 0, type = 'bandpass') {
    if (!this.ctx || !this.on()) return;
    const t = this.ctx.currentTime + when, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(.4, dur * .3)); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + .05);
  },
  click() { this.tone(880, .06, 'square', .06); this.tone(1320, .05, 'square', .04, .03); },
  kick(p = .5) { this.tone(140 + p * 60, .12, 'sine', .35 + p * .25, 0, -90); this.noise(.06, .15 + p * .2, 2500, .8); },
  whistle(long) {
    if (!this.ctx || !this.on()) return;
    const n = long ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const t = this.ctx.currentTime + i * .45, o = this.ctx.createOscillator(), l = this.ctx.createOscillator(), lg = this.ctx.createGain(), g = this.ctx.createGain();
      o.frequency.value = 2900; l.frequency.value = 28; lg.gain.value = 120; l.connect(lg); lg.connect(o.frequency);
      const dur = long && i === 2 ? .8 : .32;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .02); g.gain.setValueAtTime(.12, t + dur - .05); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); l.start(t); o.stop(t + dur + .02); l.stop(t + dur + .02);
    }
  },
  post() { this.tone(1800, .35, 'triangle', .15); this.tone(2650, .3, 'triangle', .08); },
  goal() { this.noise(3.5, .5, 900, .5); this.noise(3, .25, 2400, .7, .2); this.tone(523, .25, 'sawtooth', .05, 0); this.tone(659, .25, 'sawtooth', .05, .15); this.tone(784, .5, 'sawtooth', .05, .3); },
  oooh() { this.noise(1.6, .25, 600, .8); },
  crowd(start) {
    if (!this.ctx || !this.on()) return;
    if (start && !this.crowdSrc) {
      const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      s.buffer = this.noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = .6; g.gain.value = .05;
      s.connect(f); f.connect(g); g.connect(this.master); s.start(); this.crowdSrc = s; this.crowdGain = g;
    } else if (!start && this.crowdSrc) { try { this.crowdSrc.stop(); } catch (e) { } this.crowdSrc = null; }
  },
  crowdLevel(v) { if (this.crowdGain) this.crowdGain.gain.setTargetAtTime(.04 + v * .14, this.ctx.currentTime, .3); },
  reveal(tier) {
    if (!this.ctx || !this.on()) return;
    const notes = [523, 659, 784, 1047, 1319, 1568];
    const n = 2 + Math.min(4, tier);
    for (let i = 0; i < n; i++) this.tone(notes[i], .5, tier >= 3 ? 'sawtooth' : 'triangle', .07, i * .09);
    if (tier >= 3) { this.noise(1.5, .2, 3000, .5, .3); this.tone(80, 1.2, 'sine', .3, 0, -40); }
    if (tier >= 4) this.tone(2093, 1, 'sine', .08, .6);
  },
  flip() { this.noise(.15, .2, 3500, 1.5); }
};

const Commentator = {
  last: 0,
  say(text, prio = 1) {
    const el = document.getElementById('ticker');
    if (el) { el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
    const s = Store.d && Store.d.settings;
    if (!s || !s.voice || !s.sound || !window.speechSynthesis) return;
    const now = performance.now();
    if (prio < 2 && now - this.last < 2500) return;
    this.last = now;
    try {
      if (prio >= 2) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[^\wäöüÄÖÜß!?,. '-]/g, ''));
      u.lang = 'de-DE'; u.rate = 1.12; u.pitch = 1.05; u.volume = .9;
      speechSynthesis.speak(u);
    } catch (e) { }
  },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  lines: {
    goal: ['TOOOR! {p} trifft!', 'Was für ein Tor von {p}!', 'Drin ist das Ding! {p}!', '{p} schiebt eiskalt ein!', 'Ein Traumtor von {p}!'],
    save: ['Glänzende Parade von {p}!', '{p} ist zur Stelle!', 'Stark gehalten von {p}!', 'Was für ein Reflex von {p}!'],
    miss: ['Knapp vorbei!', 'Das war nah dran!', 'Drüber! Die Chance ist dahin.', 'Vorbei – da war mehr drin!'],
    post: ['Pfosten! Unglaublich!', 'Nur Aluminium!', 'Latte! Das Stadion hält den Atem an!'],
    tackle: ['Starker Ballgewinn von {p}!', 'Sauber getackelt von {p}!', '{p} erobert den Ball.'],
    foul: ['Foul! Der Schiedsrichter pfeift.', 'Das war zu hart – Freistoß.', 'Unfair gestoppt!'],
    yellow: ['Gelbe Karte für {p}!', '{p} sieht Gelb.'],
    red: ['Rote Karte! {p} muss runter!', 'Platzverweis für {p}!'],
    penalty: ['Elfmeter!', 'Der Schiri zeigt auf den Punkt!'],
    offside: ['Abseits! Die Fahne ist oben.', 'Knapp im Abseits.'],
    corner: ['Ecke.', 'Eckball für {t}.'],
    chance: ['Große Chance!', 'Jetzt wird es gefährlich!'],
    kickoff: ['Anstoß! Los geht\'s!', 'Der Ball rollt!'],
    half: ['Halbzeit!', 'Pause – die Teams gehen in die Kabine.'],
    full: ['Abpfiff! Das Spiel ist aus.', 'Schluss, aus, vorbei!']
  },
  ev(type, p, t, prio = 1) {
    const l = this.lines[type]; if (!l) return;
    this.say(this.pick(l).replace('{p}', p || '').replace('{t}', t || ''), prio);
  }
};
