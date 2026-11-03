'use strict';
/* ============ Eingabe: Touch-Joystick, Buttons (Multi-Touch), Maus, Tastatur ============ */
const KEYMAP = {
  Space: 'shoot', KeyK: 'shoot', KeyE: 'pass', KeyJ: 'pass', KeyR: 'through', KeyL: 'through',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyF: 'tackle', KeyI: 'tackle', KeyQ: 'switch', KeyU: 'switch'
};
const Input = {
  jx: 0, jy: 0, joyId: null, ox: 0, oy: 0, held: {}, pressed: {}, released: {}, keys: {}, active: false,
  down(n) { if (!this.held[n]) { this.held[n] = true; this.pressed[n] = true; } },
  up(n) { if (this.held[n]) { this.held[n] = false; this.released[n] = true; } },
  consume() { this.pressed = {}; this.released = {}; },
  reset() {
    this.held = {}; this.pressed = {}; this.released = {}; this.jx = this.jy = 0; this.joyId = null; this.keys = {};
    document.querySelectorAll('[data-btn].on').forEach(b => b.classList.remove('on'));
    const base = document.getElementById('joyBase'); if (base) base.classList.remove('show');
  },
  move() {
    let x = this.jx, y = this.jy; const k = this.keys;
    const kx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    const ky = (k.ArrowDown || k.KeyS ? 1 : 0) - (k.ArrowUp || k.KeyW ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); x = kx / l; y = ky / l; }
    return { x, y };
  },
  bind() {
    const joy = document.getElementById('joy'), knob = document.getElementById('joyKnob'), base = document.getElementById('joyBase');
    const R = 56;
    joy.addEventListener('pointerdown', e => {
      if (this.joyId !== null) return;
      e.preventDefault(); Sound.init();
      this.joyId = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch (_) { }
      this.ox = e.clientX; this.oy = e.clientY;
      base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; base.classList.add('show');
      knob.style.transform = 'translate(-50%,-50%)';
    });
    joy.addEventListener('pointermove', e => {
      if (e.pointerId !== this.joyId) return;
      let dx = e.clientX - this.ox, dy = e.clientY - this.oy; const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.jx = dx / R; this.jy = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = e => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null; this.jx = this.jy = 0; base.classList.remove('show');
    };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end); joy.addEventListener('lostpointercapture', end);

    document.querySelectorAll('[data-btn]').forEach(b => {
      const n = b.dataset.btn;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation(); Sound.init();
        try { b.setPointerCapture(e.pointerId); } catch (_) { }
        this.down(n); b.classList.add('on');
      });
      const u = () => { this.up(n); b.classList.remove('on'); };
      b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('lostpointercapture', u);
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
    window.addEventListener('keydown', e => {
      if (!this.active) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { Engine.togglePause(); e.preventDefault(); return; }
      this.keys[e.code] = true;
      const n = KEYMAP[e.code]; if (n) { this.down(n); e.preventDefault(); }
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
      const n = KEYMAP[e.code]; if (n) this.up(n);
    });
    window.addEventListener('blur', () => this.reset());
  }
};
