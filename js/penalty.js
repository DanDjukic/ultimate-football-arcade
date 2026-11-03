'use strict';
/* ============ Elfmeterschießen (eigener Modus & K.-o.-Entscheidung) ============ */
class PenaltyGame {
  constructor(cfg) {
    this.cfg = cfg; this.mode = 'penalties'; this.user = 0;
    this.st = STADIUMS[cfg.stadium] || STADIUMS.nordlicht;
    const diff = DIFF[Store.d.settings.difficulty] || DIFF.normal;
    this.teams = [0, 1].map(i => {
      const def = cfg.teams[i], tobj = { human: i === 0, dir: 1, idx: i };
      const players = def.entries.map((e, j) => new PlayerEnt(tobj, j, e, i === 0 ? 0 : diff.bonus));
      const keeper = players.find(p => p.isGK) || players[0];
      const shooters = players.filter(p => p !== keeper).sort((a, b) => b.st.sho - a.st.sho);
      return { def, name: def.name, short: def.short, c1: def.c1, c2: def.c2, gk: def.gk, players, keeper, shooters, score: 0, kicks: [] };
    });
    this.t = 0; this.stateT = 0; this.round = 0; this.turn = 0; this.camX = 0; this.camY = 0; this.jump = 0;
    this.particles = []; this.banner = null; this.charge = -1;
    this.ball = { x: PH.HL - PH.PEN, y: 0, z: 0, rot: 0 };
    this.aimY = 0; this.aimZ = 1; this.state = 'play';
    this.startKick();
  }
  get shooterTeam() { return this.teams[this.turn]; }
  get keeperTeam() { return this.teams[this.turn ^ 1]; }
  startKick() {
    const st = this.shooterTeam;
    this.shooter = st.shooters[st.kicks.length % st.shooters.length];
    this.keeper = this.keeperTeam.keeper;
    this.keeper.x = PH.HL - .3; this.keeper.y = 0; this.keeper.dive = null; this.keeper.vy = 0;
    this.shooter.x = PH.HL - PH.PEN - 2.2; this.shooter.y = -.6; this.shooter.face = 0;
    Object.assign(this.ball, { x: PH.HL - PH.PEN, y: 0, z: 0 });
    this.phase = this.turn === 0 ? 'aim' : 'keep'; this.stateT = 0; this.charge = -1;
    this.aimY = 0; this.aimZ = 1; this.userDive = null; this.kickTime = 0; this.outcome = null;
    if (this.turn === 1) {
      const s = this.shooter;
      this.aiDelay = 1.2 + rnd() * 1.2;
      this.aiTarget = { y: (rnd() < .5 ? -1 : 1) * (1 + rnd() * 2.4), z: .2 + rnd() * 1.8, power: .5 + rnd() * .35 };
    }
    Commentator.say(`${this.shooter.full} tritt an …`);
  }
  update(dt) {
    this.t += dt; this.stateT += dt;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    this.jump = Math.max(0, this.jump - dt * .3);
    for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 120 * dt; q.life -= dt; q.rot += q.vr * dt; }
    this.particles = this.particles.filter(q => q.life > 0);
    if (this.state !== 'play') return;
    const m = Input.move(), k = this.keeper, s = this.shooter;
    if (this.phase === 'aim') {
      this.aimY = clamp(this.aimY + m.x * dt * 5, -4.3, 4.3);
      this.aimZ = clamp(this.aimZ - m.y * dt * 3, 0, 3.2);
      if (Input.pressed.shoot) this.charge = 0;
      if (this.charge >= 0 && Input.held.shoot) this.charge = Math.min(1, this.charge + dt / 1.0);
      if (Input.released.shoot && this.charge >= 0) {
        this.power = Math.max(.2, this.charge); this.charge = -1; this.target = { y: this.aimY, z: this.aimZ };
        this.phase = 'runup'; this.stateT = 0;
      }
      if (this.stateT > 15) { this.power = .6; this.target = { y: this.aimY, z: this.aimZ }; this.phase = 'runup'; this.stateT = 0; }
    } else if (this.phase === 'keep') {
      if (Input.pressed.shoot || Input.pressed.tackle) this.userDive = { dir: Math.abs(m.x) > .25 ? sgn(m.x) : 0, high: m.y < -.4 };
      if (this.stateT > this.aiDelay) { this.power = this.aiTarget.power; this.target = { y: this.aiTarget.y, z: this.aiTarget.z }; this.phase = 'runup'; this.stateT = 0; }
    } else if (this.phase === 'runup') {
      if (this.turn === 1 && (Input.pressed.shoot || Input.pressed.tackle) && !this.userDive) this.userDive = { dir: Math.abs(m.x) > .25 ? sgn(m.x) : 0, high: m.y < -.4 };
      s.x += dt * 4.5; s.y += dt * 1.2; s.spd = 4.5; s.phase += dt * 11;
      if (this.stateT > .45) this.kick();
    } else if (this.phase === 'flight') {
      this.flightT += dt;
      if (this.turn === 1 && (Input.pressed.shoot || Input.pressed.tackle) && !k.dive) this.startDive(k, Math.abs(m.x) > .25 ? sgn(m.x) : 0, m.y < -.4, 0);
      if (this.pendingDive && this.flightT >= this.pendingDive.at) { const d = this.pendingDive; this.pendingDive = null; this.startDive(k, d.dir, d.high, 0); }
      if (k.dive) { k.dive.t += dt; if (k.dive.t < .6) k.y += k.dive.dir * k.dive.v * dt; }
      const u = Math.min(1, this.flightT / this.T), b = this.ball;
      b.x = this.from.x + (this.to.x - this.from.x) * u; b.y = this.from.y + (this.to.y - this.from.y) * u;
      b.z = this.to.z * u + Math.sin(u * Math.PI) * .3; b.rot += dt * 20;
      if (!this.outcome && this.checkSave(u)) { }
      if (u >= 1 && !this.outcome) this.resolve();
      if (this.outcome === 'saved') { b.x -= dt * 6; b.y += dt * 3 * sgn(b.y || 1); }
    } else if (this.phase === 'result') {
      if (this.stateT > 1.9) this.next();
    }
    s.spd *= .9;
  }
  startDive(k, dir, high, delay) {
    if (k.dive) return;
    k.dive = { dir, t: 0, high, v: dir ? 4.5 + k.st.div / 125 * 4 : 0 };
  }
  kick() {
    const s = this.shooter, k = this.keeper, p = this.power, tg = this.target;
    let sig = (.55 - s.st.sho / 125 * .35) * (1 - .25 * s.f('precision_shot')) * (.7 + p * .6);
    let ty = tg.y + gauss() * sig, tz = Math.max(0, tg.z + gauss() * sig * .6);
    if (p > .85) tz += (p - .85) * 8 * (1 - s.st.sho / 250);
    const speed = 17 + p * 11 + 2 * s.f('power_shot');
    this.from = { x: this.ball.x, y: this.ball.y }; this.to = { x: PH.HL + .3, y: ty, z: tz };
    this.T = PH.PEN / speed; this.flightT = 0; this.phase = 'flight'; this.stateT = 0;
    Sound.kick(.5 + p * .5);
    if (this.turn === 0) {
      const pC = .33 + k.st.div / 125 * .2 + .05 * k.f('gk_1v1');
      let dir;
      if (rnd() < .18) dir = 0; else if (rnd() < pC) dir = Math.abs(tg.y) < .8 ? 0 : sgn(tg.y); else dir = rnd() < .5 ? -1 : 1;
      this.pendingDive = { dir, high: tz > 1.3, at: clamp(.18 - k.st.ref / 125 * .1 - .03 * k.f('reflexes'), .04, .2) };
    } else if (this.userDive) {
      const d = this.userDive; this.pendingDive = { dir: d.dir, high: d.high, at: .05 };
    }
  }
  checkSave(u) {
    const b = this.ball, k = this.keeper;
    if (u < .93) return false;
    const reach = k.dive ? (k.dive.dir ? 1.05 + k.st.div / 125 * .6 : .7) : .65;
    const reachZ = k.dive && k.dive.high ? 2.5 : 1.9;
    if (Math.abs(this.to.y) > PH.GW || this.to.z > PH.GH) return false;
    if (Math.abs(this.to.y - k.y) < reach && this.to.z < reachZ) {
      const pS = .72 + k.st.han / 125 * .2 - this.power * .15 + .05 * k.f('reflexes');
      if (rnd() < pS) { this.setOutcome('saved'); return true; }
      this.setOutcome('goal'); return true;
    }
    return false;
  }
  resolve() {
    const ay = Math.abs(this.to.y), z = this.to.z;
    if (Math.abs(ay - PH.GW) < .15 && z < PH.GH + .1) { Sound.post(); this.setOutcome('post'); }
    else if (ay < PH.GW && Math.abs(z - PH.GH) < .12) { Sound.post(); this.setOutcome('post'); }
    else if (ay < PH.GW && z < PH.GH) this.setOutcome('goal');
    else this.setOutcome('miss');
  }
  setOutcome(o) {
    this.outcome = o; const st = this.shooterTeam;
    const ok = o === 'goal'; st.kicks.push(ok); if (ok) st.score++;
    if (this.turn === 0 && ok) Store.d.stats.pens++;
    this.phase = 'result'; this.stateT = 0;
    if (ok) {
      Sound.goal(); this.jump = 1; this.banner = { txt: 'TOR!', t: 1.8, big: true, sub: this.shooter.full };
      for (let i = 0; i < 50; i++) this.particles.push({ x: R.W * rnd(), y: -20, vx: (rnd() - .5) * 80, vy: rnd() * 60, c: i % 2 ? st.c1 : st.c2, life: 2.5, rot: 0, vr: 6 });
      Commentator.ev('goal', this.shooter.full, '', 2);
    } else if (o === 'saved') { Sound.oooh(); this.banner = { txt: 'GEHALTEN!', t: 1.8, small: true }; Commentator.ev('save', this.keeper.full, '', 2); }
    else { Sound.oooh(); this.banner = { txt: o === 'post' ? 'PFOSTEN!' : 'VERSCHOSSEN!', t: 1.8, small: true }; Commentator.ev(o === 'post' ? 'post' : 'miss', '', '', 2); }
  }
  decided() {
    const [a, b] = this.teams, ka = a.kicks.length, kb = b.kicks.length;
    if (ka <= 5 && kb <= 5) {
      const remA = 5 - ka, remB = 5 - kb;
      if (a.score + remA < b.score || b.score + remB < a.score) return true;
      return ka === 5 && kb === 5 && a.score !== b.score;
    }
    return ka === kb && a.score !== b.score;
  }
  next() {
    if (this.decided()) {
      this.state = 'fulltime'; Sound.whistle(true);
      Engine.finish({ mode: 'penalties', cfg: this.cfg, userSide: 0, pens: [this.teams[0].score, this.teams[1].score], teams: this.teams.map(t => ({ name: t.name, short: t.short, c1: t.c1, c2: t.c2, score: t.score, kicks: t.kicks, def: t.def })) });
      return;
    }
    this.turn ^= 1; this.startKick();
  }
  skipReplay() { }
  drawable(p, t) {
    return { x: p.x, y: p.y, isGK: p.isGK || p === this.keeper, gk: t.gk, c1: t.c1, c2: t.c2, num: p.num, spd: p.spd || 0, phase: p.phase, fx: 1, dive: p.dive && p.dive.dir ? p.dive.dir * Math.min(1.35, p.dive.t * 5) : 0, cele: p.dive && !p.dive.dir && p.dive.high, skin: p.skin, hair: p.hair, slide: 0 };
  }
  render() {
    R.setCam(PH.HL - 4, 0, 1.0, 0, .13, 21, Math.max(R.H * 1.6, R.W * .85));
    const st = this.shooterTeam, kt = this.keeperTeam;
    const players = [this.drawable(this.keeper, kt), this.drawable(this.shooter, st)];
    R.scene({ players, ball: this.ball }, this.st, this.t, this.jump);
    const ctx = R.ctx;
    if (this.phase === 'aim') {
      const p = R.p(PH.HL, this.aimY, this.aimZ);
      if (p) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p[0], p[1], 14, 0, 6.29); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p[0] - 20, p[1]); ctx.lineTo(p[0] + 20, p[1]); ctx.moveTo(p[0], p[1] - 20); ctx.lineTo(p[0], p[1] + 20); ctx.stroke(); }
    }
    if (this.charge >= 0) {
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(R.W / 2 - 100, R.H - 60, 200, 14);
      const c = this.charge; ctx.fillStyle = c > .85 ? '#ef4444' : c > .6 ? '#facc15' : '#22c55e'; ctx.fillRect(R.W / 2 - 98, R.H - 58, 196 * c, 10);
    }
    // Anzeige
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    this.teams.forEach((t, i) => {
      const y = 64 + i * 28;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(10, y - 12, 250, 24);
      ctx.fillStyle = t.c1; ctx.fillRect(10, y - 12, 6, 24);
      ctx.fillStyle = '#fff'; ctx.font = '800 13px Arial'; ctx.fillText(t.short + ' ' + t.score, 22, y);
      const n = Math.max(5, t.kicks.length);
      for (let j = 0; j < n; j++) {
        const k = t.kicks[j]; ctx.fillStyle = k === undefined ? '#475569' : k ? '#22c55e' : '#ef4444';
        ctx.beginPath(); ctx.arc(110 + j * 18, y, 6, 0, 6.29); ctx.fill();
      }
    });
    ctx.fillStyle = '#fff'; ctx.font = '700 14px Arial'; ctx.textAlign = 'center';
    const hint = this.phase === 'aim' ? 'Ziel mit Joystick wählen – SCHUSS halten & loslassen' : this.phase === 'keep' ? 'Du bist Torwart: Richtung halten + HECHTEN drücken' : '';
    if (hint) { ctx.fillStyle = 'rgba(0,0,0,.55)'; const w = ctx.measureText(hint).width + 30; ctx.fillRect(R.W / 2 - w / 2, 100, w, 28); ctx.fillStyle = '#fff'; ctx.fillText(hint, R.W / 2, 114); }
    for (const q of this.particles) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.c; ctx.fillRect(-4, -2, 8, 4); ctx.restore(); }
    if (this.banner) drawBanner(this.banner);
  }
}
