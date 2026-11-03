'use strict';
/* ============ Spielkern Teil 2: Ablauf, Physik, Regeln, Training ============ */
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

Object.assign(Game.prototype, {
  update(dt) {
    this.t += dt; this.stateT += dt;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    this.jump = Math.max(0, this.jump - dt * .25);
    for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 120 * dt; q.life -= dt; q.rot += q.vr * dt; }
    this.particles = this.particles.filter(q => q.life > 0);
    if (this.state === 'play') this.updatePlay(dt);
    else if (this.state === 'setpiece') this.updateSetPiece(dt);
    else if (this.state === 'goal') this.updateGoal(dt);
    else if (this.state === 'replay') this.updateReplay(dt);
    this.updateCam(dt);
  },
  periodLen() { return this.period > 2 ? this.halfSec / 3 : this.halfSec; },
  updatePlay(dt) {
    const b = this.ball;
    if (!this.training) { this.clock += dt; if (b.owner) b.owner.team.stats.poss += dt; }
    if (b.noPickT > 0) b.noPickT -= dt;
    this.humanControl(dt);
    for (const t of this.teams) this.aiTeam(t, dt);
    this.movePlayers(dt);
    this.updateBall(dt);
    if (this.state !== 'play') return;
    this.checkHeaders(); this.checkSlides();
    if (this.training) this.trainingUpdate(dt); else this.checkOut();
    this.record(dt);
    if (!this.training && this.state === 'play' && this.clock >= this.periodLen() + this.stoppage && b.kind !== 'shot') this.endPeriod();
  },
  humanControl(dt) {
    if (this.user < 0) return;
    const t = this.teams[this.user], b = this.ball;
    if (Input.pressed.switch && this.controlled) this.switchPlayer();
    if (b.owner && b.owner.team === t && !b.owner.isGK && !b.owner.static && b.owner !== this.controlled) this.setControlled(b.owner);
    if (!this.controlled || this.controlled.sentOff) {
      let best = null, bd = 1e9;
      for (const p of t.players) if (!p.isGK && !p.sentOff && !p.static) { const d = dist(p.x, p.y, b.x, b.y); if (d < bd) { bd = d; best = p; } }
      this.controlled = best;
    }
    const p = this.controlled; if (!p) return;
    const m = Input.move(), ml = Math.hypot(m.x, m.y);
    const gk = this.gkOf(t);
    if (gk && b.owner === gk && gk.holding && (Input.pressed.pass || Input.pressed.through)) this.distribute(gk, ml > .3 ? m : null);
    if (Store.d.settings.autoSwitch && b.owner && b.owner.team !== t && !this.training) {
      this.idleT = ml < .1 ? this.idleT + dt : 0;
      if (dist(p.x, p.y, b.x, b.y) > 16 && this.idleT > .4) { this.switchPlayer(); }
    }
    if (p.stunned > 0 || p.slideT > 0) return;
    const has = b.owner === p, sprint = !!Input.held.sprint;
    const sp = p.maxSpd * (sprint ? 1.28 : 1) * (has ? .9 + .05 * p.f('dribbler') : 1);
    if (Input.held.tackle && !has && b.owner && b.owner.team !== t && ml < .2) p.goTo(b.owner.x, b.owner.y, 1);
    else { const k = Math.min(1, ml * 1.3); p.wx = m.x / (ml || 1) * sp * k; p.wy = m.y / (ml || 1) * sp * k; p.sprinting = sprint && ml > .2; }
    if (Input.pressed.shoot) this.charge = 0;
    if (this.charge >= 0 && Input.held.shoot) this.charge = Math.min(1, this.charge + dt / .9);
    if (Input.released.shoot && this.charge >= 0) {
      const pw = Math.max(.15, this.charge); this.charge = -1;
      const aim = ml > .3 ? { x: m.x, y: m.y } : null;
      if (has) this.shoot(p, pw, aim); else p.buffer = { type: 'shot', power: pw, aim, t: .7 };
    }
    if (Input.pressed.pass || Input.pressed.through) {
      const th = !!Input.pressed.through, dir = ml > .25 ? { x: m.x, y: m.y } : null;
      if (has) this.pass(p, dir, th); else p.buffer = { type: 'pass', dir, through: th, t: .6 };
    }
    if (Input.pressed.tackle && !has && p.tackleCD <= 0) this.tackle(p);
    if (p.buffer) { p.buffer.t -= dt; if (p.buffer.t <= 0) p.buffer = null; }
  },
  movePlayers(dt) {
    const ps = this.all(), b = this.ball;
    for (const p of ps) {
      p.stunned = Math.max(0, p.stunned - dt); p.tackleCD -= dt; p.kickT -= dt; p.headT -= dt;
      if (p.slideT > 0) { p.slideT -= dt; p.vx *= 1 - 2.5 * dt; p.vy *= 1 - 2.5 * dt; }
      else if (p.dive) {
        p.dive.t += dt; if (p.dive.t > .45) { p.vx *= 1 - 6 * dt; p.vy *= 1 - 6 * dt; }
        if (p.dive.t > 1.0) { p.dive = null; p.stunned = .3; }
      } else if (p.stunned > 0 || p.frozen) { p.vx *= 1 - 6 * dt; p.vy *= 1 - 6 * dt; }
      else {
        let dvx = p.wx - p.vx, dvy = p.wy - p.vy; const l = Math.hypot(dvx, dvy), a = p.acc * dt;
        if (l > a) { dvx *= a / l; dvy *= a / l; }
        p.vx += dvx; p.vy += dvy;
      }
      p.x = clamp(p.x + p.vx * dt, -57, 57); p.y = clamp(p.y + p.vy * dt, -37, 37);
      p.spd = Math.hypot(p.vx, p.vy); p.phase += p.spd * dt * 2.4;
      if (p.spd > .4 && !p.dive && !p.frozen) {
        const rate = (b.owner === p ? 7 + 2 * p.f('dribbler') : 11) * dt;
        p.face += clamp(angDiff(Math.atan2(p.vy, p.vx), p.face), -rate, rate);
      }
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], c = ps[j]; const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d < .75 && d > 0.001 && !a.frozen && !c.frozen && !a.dive && !c.dive) {
        const k = (.75 - d) / 2 / d; a.x -= dx * k; a.y -= dy * k; c.x += dx * k; c.y += dy * k;
      }
    }
  },
  updateBall(dt) {
    const b = this.ball;
    if (b.owner) {
      const o = b.owner;
      if (o.holding) { b.x = o.x + Math.cos(o.face) * .3; b.y = o.y + Math.sin(o.face) * .3; b.z = 1.0; }
      else {
        const lead = .55 + (o.sprinting ? .35 * (1 - .4 * o.f('dribbler')) : 0) + (Math.sin(o.phase * .5) * .15 + .15) * Math.min(1, o.spd / 4);
        b.x = o.x + Math.cos(o.face) * lead; b.y = o.y + Math.sin(o.face) * lead; b.z = 0;
      }
      b.vx = o.vx; b.vy = o.vy; b.vz = 0; b.rot += o.spd * dt * 3; return;
    }
    const n = 4, h = dt / n;
    for (let i = 0; i < n; i++) {
      const px = b.x, py = b.y, pz = b.z;
      if (b.z > 0 || b.vz > 0) { b.vz -= GRAV * h; b.vx *= 1 - .05 * h; b.vy *= 1 - .05 * h; }
      else { const sp = Math.hypot(b.vx, b.vy); if (sp > 0) { const ns = Math.max(0, sp - ROLL * h); b.vx *= ns / sp; b.vy *= ns / sp; } }
      if (b.curve) {
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 6) { b.vx += -b.vy / sp * b.curve * h; b.vy += b.vx / sp * b.curve * h; } else b.curve = 0;
      }
      b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
      if (b.z < 0) { b.z = 0; if (b.vz < -2) { b.vz = -b.vz * .45; b.vx *= .85; b.vy *= .85; } else b.vz = 0; }
      b.rot += Math.hypot(b.vx, b.vy) * h * 3;
      if (this.checkGoalLine(px, py, pz)) return;
      if (this.state === 'play') { this.checkSaves(); this.checkPickup(); if (b.owner) return; }
    }
  },
  checkGoalLine(px, py, pz) {
    const b = this.ball;
    if (b.inNet) {
      const s = sgn(b.x);
      if (Math.abs(b.x) > 54.3) { b.x = s * 54.3; b.vx *= -.15; b.vy *= .5; }
      if (Math.abs(b.y) > 3.5) { b.y = sgn(b.y) * 3.5; b.vy *= -.3; }
      if (b.z > 2.2) { b.z = 2.2; b.vz = -Math.abs(b.vz) * .2; }
      return false;
    }
    if (this.state !== 'play') return false;
    for (const s of [1, -1]) {
      if (px * s <= PH.HL && b.x * s > PH.HL) {
        const k = (s * PH.HL - px) / (b.x - px), y = py + (b.y - py) * k, z = pz + (b.z - pz) * k, ay = Math.abs(y);
        if (ay < PH.GW - .11 && z < PH.GH - .11) { b.inNet = true; this.goal(s); return true; }
        if (Math.abs(ay - PH.GW) < .22 && z < PH.GH + .1) {
          b.x = s * (PH.HL - .05); b.vx = -b.vx * .55; b.vy += sgn(y) * rnd() * 3; this.aluminium(); return true;
        }
        if (ay < PH.GW && Math.abs(z - PH.GH) < .2) {
          b.x = s * (PH.HL - .05); b.vx = -b.vx * .5; b.vz = z > PH.GH ? 2 : -Math.abs(b.vz) * .5; this.aluminium(); return true;
        }
      }
    }
    return false;
  },
  aluminium() { Sound.post(); this.ball.kind = 'loose'; if (!this.training) { Commentator.ev('post', '', '', 2); Sound.oooh(); } },
  checkSaves() {
    const b = this.ball;
    if (b.kind !== 'shot' || !b.shotBy) return;
    const t = this.other(b.shotBy.team), gk = this.gkOf(t);
    if (!gk || b.gkTried === gk || gk.stunned > 0) return;
    if (b.vx * -t.dir <= 0) return;
    if (Math.abs(b.x - gk.x) > .7) return;
    const reachY = gk.dive ? 1.0 + gk.st.div / 125 * .9 : .8, reachZ = gk.dive ? 2.35 : 2.3;
    if (Math.abs(b.y - gk.y) > reachY || b.z > reachZ) return;
    b.gkTried = gk;
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    let ps = .62 + (gk.st.ref + gk.st.div) / 250 * .38 - (sp - 20) / 45 + .07 * gk.f('reflexes');
    if ((b.shotDist || 20) < 12) ps += .08 * gk.f('gk_1v1') - .05;
    if (rnd() > clamp(ps, .25, .97)) return;
    t.stats.saves++; b.shotBy.team.stats.onT++;
    const cp = gk.st.han / 125 * .85 - (sp - 18) / 40 + .08 * gk.f('cross_catcher');
    if (rnd() < cp) { this.setOwner(gk); gk.holding = true; gk.holdT = 0; }
    else {
      b.vx = t.dir * (3 + rnd() * 6); b.vy = sgn(b.y - gk.y || rnd() - .5) * (4 + rnd() * 7); b.vz = 2 + rnd() * 4;
      b.kind = 'parry'; b.last = gk; b.lastTeam = t; b.noPick = gk; b.noPickT = .5; b.curve = 0;
    }
    Sound.kick(.4);
    if (!this.training) { Commentator.ev('save', gk.name, '', 2); Sound.oooh(); }
  },
  checkPickup() {
    const b = this.ball; if (b.owner) return;
    let best = null, bd = 1e9;
    for (const t of this.teams) for (const p of t.players) {
      if (p.sentOff || p.stunned > 0 || p.frozen || p.dive) continue;
      if (p === b.noPick && b.noPickT > 0) continue;
      const box = p.isGK && this.inOwnBox(p, b.x, b.y);
      if (b.z > (box ? 2.5 : 1.0)) continue;
      if (p.isGK && b.kind === 'shot' && b.shotBy && b.shotBy.team !== p.team && Math.hypot(b.vx, b.vy) > 12) continue;
      let reach = box ? 1.25 : .75 + .2 * p.f('technician');
      if ((b.kind === 'pass' || b.kind === 'cross' || b.kind === 'through') && b.lastTeam !== p.team)
        reach += .35 * p.f('interceptor') + p.st.def / 125 * .12 - (b.safe || 0);
      const d = dist(p.x, p.y, b.x, b.y);
      if (d < reach && d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    const sp = Math.hypot(b.vx, b.vy);
    const isPass = b.kind === 'pass' || b.kind === 'through' || b.kind === 'cross';
    if (isPass && b.lastTeam && b.lastTeam !== best.team && b.target !== best) {
      if (this.t - (b.kickT || 0) < .15) return;
      if (sp > 9) {
        b.tried = b.tried || new Set(); if (b.tried.has(best)) return; b.tried.add(best);
        const pc = clamp(.3 + best.st.def / 125 * .35 + .15 * best.f('interceptor') - (b.safe || 0) - (sp - 10) / 40, .1, .85);
        if (rnd() > pc) { if (rnd() < .3) { b.vx *= .75; b.vy = b.vy * .75 + (rnd() - .5) * 4; } return; }
      }
    }
    const ctrl = 15 + best.st.dri / 125 * 9 + 5 * best.f('technician') + (best.isGK ? 12 : 0);
    if (sp < ctrl || b.target === best) {
      this.setOwner(best);
      if (best.isGK && this.inOwnBox(best, best.x, best.y)) { best.holding = true; best.holdT = 0; }
    } else {
      const wasShot = b.kind === 'shot';
      b.vx *= -.25; b.vy = b.vy * .3 + (rnd() - .5) * 8; b.vz = 1 + rnd() * 2;
      b.last = best; b.lastTeam = best.team; b.noPick = best; b.noPickT = .3; b.kind = 'loose'; b.curve = 0;
      if (wasShot && !this.training) Commentator.say('Geblockt von ' + best.name + '!');
    }
  },
  setOwner(p) {
    const b = this.ball;
    if (b.offside && b.offside.team === p.team && b.offside.set.has(p) && this.state === 'play' && !this.training) {
      b.offside = null; Sound.whistle(); Commentator.ev('offside', '', '', 2); this.flash('ABSEITS');
      this.startSetPiece('freekick', this.other(p.team), clamp(p.x, -50, 50), clamp(p.y, -32, 32)); return;
    }
    b.offside = null;
    if (b.passer && b.passer.team === p.team && b.passer !== p && (b.kind === 'pass' || b.kind === 'through' || b.kind === 'cross')) {
      p.team.stats.passOk++;
      if (this.training && p === this.controlled) { this.tr.passes++; this.tr.xp += 1; }
    }
    b.owner = p; b.vx = b.vy = b.vz = 0; b.z = 0; b.kind = null; b.target = null; b.curve = 0; b.shotBy = null; b.gkTried = null;
    b.last = p; b.lastTeam = p.team; b.inNet = false; b.safe = 0; b.passer = null;
    p.decT = .15 + rnd() * .25; p.holding = false; p.holdT = 0; p.run = null;
    for (const t of this.teams) { const g = this.gkOf(t); if (g) g.react = null; }
    if (p.team.human && !p.isGK && !p.static) this.setControlled(p);
    if (p.buffer && p.buffer.t > 0) {
      const a = p.buffer; p.buffer = null;
      if (a.type === 'shot') this.shoot(p, a.power, a.aim); else this.pass(p, a.dir, a.through);
    }
  },
  checkHeaders() {
    const b = this.ball; if (b.owner || b.z < 1.0 || b.z > 2.9 || b.vz > 3) return;
    let best = null, bs = -1e9;
    for (const p of this.all()) {
      if (p.isGK || p.stunned > 0 || (p === b.noPick && b.noPickT > 0)) continue;
      const d = dist(p.x, p.y, b.x, b.y), reach = .9 + .35 * (p.f('header') + p.f('aerial'));
      if (d > reach) continue;
      const attacking = this.rel(p.team, p.x) > .5;
      const sc = (p.st.phy + (attacking ? p.st.sho : p.st.def)) / 250 + .25 * (attacking ? p.f('header') : p.f('aerial')) + rnd() * .35 - d * .3;
      if (sc > bs) { bs = sc; best = p; }
    }
    if (best) this.header(best);
  },
  header(p) {
    const t = p.team, b = this.ball, dg = dist(p.x, p.y, t.dir * PH.HL, 0);
    p.headT = .4; b.offside = b.offside && b.offside.team === t && b.offside.set.has(p) ? b.offside : null;
    if (b.offside && !this.training) { this.setOwner(p); return; }
    const human = t.human && p === this.controlled;
    if ((p.buffer && p.buffer.type === 'shot') || (human && dg < 14) || (!human && dg < 16 && rnd() < .85)) {
      const a = p.buffer; p.buffer = null; this.shoot(p, .6, a && a.aim, true);
    } else if (this.rel(t, p.x) < .35) {
      this.kick(p, t.dir * (12 + rnd() * 6 + 3 * p.f('aerial')), (rnd() - .5) * 10, 5, 'loose');
    } else if (p.buffer && p.buffer.type === 'pass') { const a = p.buffer; p.buffer = null; this.pass(p, a.dir, a.through); }
    else { this.kick(p, Math.cos(p.face) * 8, Math.sin(p.face) * 8, 2, 'loose'); }
  },
  checkSlides() {
    for (const p of this.all()) if (p.slideT > 0 && p.slideHit) {
      const c = p.slideHit;
      if (this.ball.owner !== c) { p.slideHit = null; continue; }
      if (dist(p.x, p.y, c.x, c.y) < 1.3) { p.slideHit = null; this.resolveTackle(p, c, true); }
    }
  },
  checkOut() {
    const b = this.ball; if (b.owner || b.inNet || this.state !== 'play') return;
    if (Math.abs(b.y) > PH.HW + .15) {
      const t = b.lastTeam ? this.other(b.lastTeam) : this.teams[0];
      if (b.kind === 'shot') { Commentator.ev('miss'); Sound.oooh(); }
      this.startSetPiece('throwin', t, clamp(b.x, -52, 52), sgn(b.y) * (PH.HW + .2)); return;
    }
    if (Math.abs(b.x) > PH.HL + .15) {
      const s = sgn(b.x), def = this.teams.find(t => sgn(this.ownGoalX(t)) === s), att = this.other(def);
      if (b.kind === 'shot') { Commentator.ev('miss'); Sound.oooh(); }
      if (b.lastTeam === def) { Commentator.ev('corner', '', att.name); this.startSetPiece('corner', att, s * (PH.HL - .3), sgn(b.y) * (PH.HW - .3)); }
      else this.startSetPiece('goalkick', def, s * (PH.HL - 5.5), sgn(b.y) * 4);
    }
  },
  /* ---------- Standards ---------- */
  startSetPiece(type, team, x, y) {
    const b = this.ball;
    Object.assign(b, { x, y, z: 0, vx: 0, vy: 0, vz: 0, owner: null, kind: null, target: null, curve: 0, inNet: false, offside: null, passer: null, shotBy: null });
    this.state = 'setpiece'; this.stateT = 0; this.charge = -1;
    for (const p of this.all()) { p.dive = null; p.react = null; p.stunned = 0; p.slideT = 0; p.buffer = null; p.holding = false; p.frozen = false; p.run = null; p.cele = false; }
    const cand = team.players.filter(p => !p.sentOff && !p.isGK);
    const gx = team.dir * PH.HL, near = dist(x, y, gx, 0) < 30;
    let tk;
    if (type === 'goalkick') tk = this.gkOf(team) || cand[0];
    else if (type === 'penalty' || (type === 'freekick' && near)) tk = cand.slice().sort((a, c) => c.st.sho - a.st.sho)[0];
    else if (type === 'kickoff') tk = cand.slice().sort((a, c) => c.fx - a.fx || Math.abs(a.fy) - Math.abs(c.fy))[0];
    else tk = cand.slice().sort((a, c) => dist(a.x, a.y, x, y) - dist(c.x, c.y, x, y))[0];
    if (type === 'kickoff') this.placeKickoff();
    if (type === 'penalty') this.placePenalty(team, x);
    let ox = -team.dir * .6, oy = 0;
    if (type === 'throwin') { ox = 0; oy = sgn(y) * .4; }
    if (type === 'corner') { ox = sgn(x) * .5; oy = sgn(y) * .5; }
    tk.x = x + ox; tk.y = y + oy; tk.vx = tk.vy = 0; tk.face = Math.atan2(-oy - (type === 'corner' ? 0 : 0), -ox || .0001);
    if (type === 'throwin') tk.face = Math.atan2(-sgn(y), team.dir * .3);
    tk.frozen = true;
    this.sp = { type, team, x, y, taker: tk, auto: type === 'kickoff' ? 1.1 : 1.5 + rnd() * .7 };
    if (team.human) this.setControlled(tk.isGK ? this.controlled : tk);
    const lbl = { corner: 'ECKBALL', freekick: 'FREISTOSS', penalty: 'ELFMETER', goalkick: 'ABSTOSS', throwin: 'EINWURF' }[type];
    if (lbl && !this.banner) this.banner = { txt: lbl, t: 1.3, small: true };
  },
  placeKickoff() {
    for (const t of this.teams) for (const p of t.players) {
      if (p.sentOff) continue;
      const rel = p.isGK ? .01 : Math.min(.46, .05 + p.fx * .45);
      p.x = this.ownGoalX(t) + t.dir * rel * PH.HL * 2; p.y = p.isGK ? 0 : p.fy * t.dir * 26;
      p.vx = p.vy = 0; p.face = t.dir > 0 ? 0 : Math.PI;
    }
  },
  placePenalty(team, x) {
    const s = sgn(x), def = this.other(team);
    let i = 0;
    for (const t of this.teams) for (const p of t.players) {
      if (p.sentOff) continue;
      if (p.isGK) { if (t === def) { p.x = s * (PH.HL - .4); p.y = 0; } else { p.x = this.ownGoalX(t) + t.dir; p.y = 0; } continue; }
      p.x = s * (PH.HL - 19 - (i % 3) * 2); p.y = ((i % 9) - 4) * 4; i++; p.vx = p.vy = 0;
    }
  },
  setPieceSpot(p, sp) {
    if (sp.type === 'corner' && !p.isGK) {
      const s = sgn(sp.x);
      if (p.team === sp.team && p.fx >= .4) return { x: s * (PH.HL - 6 - (p.idx % 4) * 2.5), y: ((p.idx % 5) - 2) * 3 };
      if (p.team !== sp.team && p.fx < .5) return { x: s * (PH.HL - 4 - (p.idx % 3) * 3), y: ((p.idx % 5) - 2) * 3.2 };
    }
    return this.home(p, p.team === sp.team);
  },
  updateSetPiece(dt) {
    const sp = this.sp, b = this.ball, tk = sp.taker;
    if (sp.type !== 'kickoff' && !this.training) this.clock += dt;
    b.x = sp.x; b.y = sp.y; b.z = sp.type === 'throwin' ? 1.9 : 0; b.vx = b.vy = b.vz = 0;
    for (const t of this.teams) for (const p of t.players) {
      if (p === tk || p.sentOff) continue;
      if (sp.type === 'kickoff' || sp.type === 'penalty') { p.stop(); continue; }
      if (p.isGK) { this.gkAI(p, dt); continue; }
      const h = this.setPieceSpot(p, sp); p.goTo(h.x, h.y, 1);
      if (p.team !== sp.team && sp.type !== 'throwin') {
        const d = dist(p.x, p.y, sp.x, sp.y);
        if (d < 9.15 && d > .01) { p.x = sp.x + (p.x - sp.x) / d * 9.15; p.y = sp.y + (p.y - sp.y) / d * 9.15; }
      }
    }
    tk.stop(); this.movePlayers(dt);
    tk.x = sp.x + (tk.x - sp.x) * 0; tk.x = sp.x - Math.cos(tk.face) * .6; tk.y = sp.y - Math.sin(tk.face) * .6;
    const human = sp.team.human;
    const ready = this.stateT > (sp.type === 'kickoff' ? .5 : .9);
    if (human) {
      const m = Input.move(), ml = Math.hypot(m.x, m.y);
      if (ml > .3) tk.face = Math.atan2(m.y, m.x);
      if (ready) {
        if (Input.pressed.shoot) this.charge = 0;
        if (this.charge >= 0 && Input.held.shoot) this.charge = Math.min(1, this.charge + dt / .9);
        if (Input.released.shoot && this.charge >= 0) {
          const pw = Math.max(.2, this.charge); this.charge = -1;
          if (sp.type === 'corner' || sp.type === 'throwin' || sp.type === 'kickoff' || sp.type === 'goalkick') this.execSP({ pass: true, dir: ml > .25 ? m : null, lofted: sp.type !== 'kickoff' });
          else this.execSP({ shot: true, power: pw, aim: ml > .3 ? m : null });
          return;
        }
        if (Input.pressed.pass || Input.pressed.through) { this.execSP({ pass: true, dir: ml > .25 ? m : null, through: !!Input.pressed.through }); return; }
      }
      if (this.stateT > (sp.type === 'kickoff' ? 4 : 10) || (tk.isGK && this.stateT > 2.2)) this.execSP(this.aiSP(sp));
    } else if (this.stateT > sp.auto) this.execSP(this.aiSP(sp));
  },
  execSP(a) {
    const sp = this.sp, tk = sp.taker, b = this.ball;
    tk.frozen = false; this.state = 'play'; this.stateT = 0; this.sp = null;
    b.owner = tk;
    const opts = { noOffside: ['throwin', 'corner', 'goalkick', 'kickoff'].includes(sp.type), throwin: sp.type === 'throwin', rec: a.rec, lofted: a.lofted };
    if (sp.type === 'kickoff') { Sound.whistle(); Commentator.ev('kickoff'); Sound.crowdLevel(.3); }
    if (a.shot) this.shoot(tk, a.power, a.aim);
    else this.pass(tk, a.dir, a.through, opts);
  },
  aiSP(sp) {
    const tk = sp.taker, t = sp.team, gx = t.dir * PH.HL;
    if (sp.type === 'kickoff') {
      const r = t.players.filter(p => p !== tk && !p.isGK && !p.sentOff).sort((a, c) => dist(a.x, a.y, 0, 0) - dist(c.x, c.y, 0, 0))[0];
      return { pass: true, rec: r };
    }
    if (sp.type === 'penalty') return { shot: true, power: .5 + rnd() * .3, aim: { x: 0, y: (rnd() < .5 ? -1 : 1) * (.55 + rnd() * .45) } };
    if (sp.type === 'corner') {
      const c = t.players.filter(p => !p.isGK && !p.sentOff && p !== tk && this.rel(t, p.x) > .8 && Math.abs(p.y) < 12);
      c.sort((a, d) => (d.st.phy + 40 * d.f('header') + rnd() * 30) - (a.st.phy + 40 * a.f('header') + rnd() * 30));
      return { pass: true, rec: c[0] || this.bestPassTarget(tk), lofted: true };
    }
    if (sp.type === 'freekick' && dist(sp.x, sp.y, gx, 0) < 28 && Math.abs(sp.y) < 18 && rnd() < .7) return { shot: true, power: .5 + rnd() * .2 };
    if (sp.type === 'goalkick') return { pass: true, rec: this.distTarget(tk), lofted: rnd() < .6 };
    return { pass: true, rec: this.bestPassTarget(tk) };
  },
  /* ---------- Tore & Wiederholung ---------- */
  goal(s) {
    if (this.training) { this.tr.goals++; this.tr.xp += 2; this.flash('TOR! ⚽'); Sound.goal(); this.trReset = 1.3; return; }
    const def = this.teams.find(t => sgn(this.ownGoalX(t)) === s), sc = this.other(def), b = this.ball;
    sc.score++;
    const scorer = b.last, og = scorer && scorer.team !== sc;
    if (b.kind === 'shot' && !og) sc.stats.onT++;
    this.scorers.push({ team: sc.idx, name: scorer ? scorer.full : '?', min: this.minute().txt, og });
    this.state = 'goal'; this.stateT = 0; this.goalTeam = sc; this.scorer = og ? null : scorer; this.kickoffTeam = def;
    this.banner = { txt: 'TOR!', sub: (og ? 'Eigentor: ' : '') + (scorer ? scorer.full : ''), t: 3, big: true };
    Sound.whistle(); Sound.goal(); Sound.crowdLevel(1); this.jump = 1;
    Commentator.ev('goal', scorer ? scorer.full : '', '', 2);
    for (let i = 0; i < 90; i++) this.particles.push({ x: R.W * rnd(), y: -20 - rnd() * 100, vx: (rnd() - .5) * 80, vy: rnd() * 60, c: i % 2 ? sc.c1 : sc.c2, life: 3 + rnd() * 1.5, rot: rnd() * 6, vr: (rnd() - .5) * 10 });
    for (const p of sc.players) p.cele = true;
  },
  updateGoal(dt) {
    const sc = this.goalTeam, s = this.scorer;
    const cx = sc.dir * 48, cy = s ? sgn(s.y || 1) * 28 : 0;
    for (const t of this.teams) for (const p of t.players) {
      if (p.sentOff) continue;
      if (t === sc && !p.isGK) { if (p === s) p.goTo(cx, cy, 1); else if (s) p.goTo(s.x - sc.dir * 2 + (p.idx % 3 - 1) * 1.5, s.y + (p.idx % 4 - 1.5) * 1.5, .9); else p.stop(); }
      else p.goTo(p.x * .99, p.y, .3);
    }
    this.movePlayers(dt); this.updateBall(dt);
    if (this.stateT < 1) this.record(dt);
    if (this.stateT > 2.8) {
      if (this.replay.length > 60) { this.state = 'replay'; this.rPos = Math.max(0, this.replay.length - 150); this.stateT = 0; }
      else this.afterGoal();
    }
  },
  updateReplay(dt) {
    this.rPos += dt * 30 * .65;
    if (this.rPos >= this.replay.length - 1) this.afterGoal();
  },
  skipReplay() { if (this.state === 'replay' || (this.state === 'goal' && this.stateT > .8)) this.afterGoal(); },
  afterGoal() {
    this.replay = [];
    for (const p of this.all()) p.cele = false;
    this.startSetPiece('kickoff', this.kickoffTeam, 0, 0);
  },
  record(dt) {
    this.recT += dt; if (this.recT < 1 / 30) return; this.recT = 0;
    const b = this.ball;
    this.replay.push({ b: { x: b.x, y: b.y, z: b.z, rot: b.rot }, p: this.drawables() });
    if (this.replay.length > 200) this.replay.shift();
  },
  /* ---------- Spielabschnitte ---------- */
  endPeriod() {
    Sound.whistle(true);
    const draw = this.teams[0].score === this.teams[1].score;
    if (this.period === 1) { this.state = 'break'; Commentator.ev('half', '', '', 2); Engine.showBreak('HALBZEIT', '2. Halbzeit starten'); }
    else if (this.period === 2 && this.cfg.ko && draw) { this.state = 'break'; Engine.showBreak('VERLÄNGERUNG', 'Verlängerung starten'); }
    else if (this.period === 3) { this.state = 'break'; Engine.showBreak('PAUSE VERLÄNGERUNG', 'Weiter'); }
    else this.finish(this.cfg.ko && draw);
  },
  nextPeriod() {
    this.period++; this.clock = 0;
    const len = this.period > 2 ? 15 : 45;
    this.stoppage = this.periodLen() * (.5 + rnd() * 2) / len;
    for (const t of this.teams) t.dir *= -1;
    this.startSetPiece('kickoff', this.teams[this.period % 2 === 0 ? 1 : 0], 0, 0);
  },
  finish(needPens) {
    this.state = 'fulltime'; Commentator.ev('full', '', '', 2); Sound.crowdLevel(.6);
    Engine.finish(this.result(needPens));
  },
  result(needPens) {
    return {
      mode: this.mode, cfg: this.cfg, userSide: this.user, needPens,
      teams: this.teams.map(t => ({ name: t.name, short: t.short, c1: t.c1, c2: t.c2, score: t.score, stats: t.stats, def: t.def })),
      scorers: this.scorers, events: this.events
    };
  },
  /* ---------- Training ---------- */
  setupTraining() {
    const t0 = this.teams[0], t1 = this.teams[1];
    const spots = [[20, 0], [32, -20], [32, 20], [8, -16], [8, 16]];
    t0.players.forEach((p, i) => { p.x = spots[i][0]; p.y = spots[i][1]; if (i) p.static = { x: spots[i][0], y: spots[i][1] }; });
    t1.players.forEach(p => { p.x = PH.HL - 1; p.y = 0; });
    this.cones = [-16, -21, -26, -31, -36].map((x, i) => [x, 22 + (i % 2 ? 2.2 : -2.2)]);
    this.tr = { goals: 0, passes: 0, slalom: null, best: null, hits: 0, xp: 0, timer: null };
    this.state = 'play'; this.controlled = t0.players[0]; this.setOwner(t0.players[0]);
  },
  trainingUpdate(dt) {
    const b = this.ball, p = this.controlled, tr = this.tr;
    if (this.trReset > 0) { this.trReset -= dt; if (this.trReset <= 0) this.resetTrainBall(); return; }
    if (!b.inNet && !b.owner && (Math.abs(b.x) > PH.HL + 1 || Math.abs(b.y) > PH.HW + 1)) { this.trReset = .6; return; }
    this.trIdle = (!b.owner && Math.hypot(b.vx, b.vy) < 1.5) ? (this.trIdle || 0) + dt : 0;
    if (this.trIdle > 2.5) { this.trIdle = 0; this.resetTrainBall(); return; }
    if (b.owner === p) {
      if (tr.timer === null && p.x < -11 && p.x > -14 && Math.abs(p.y - 22) < 6 && p.vx < 0) { tr.timer = 0; tr.hits = 0; this.cones.forEach(c => c.hit = false); this.flash('SLALOM LÄUFT'); }
      if (tr.timer !== null) {
        tr.timer += dt;
        for (const c of this.cones) if (!c.hit && dist(b.x, b.y, c[0], c[1]) < .55) { c.hit = true; tr.hits++; }
        if (p.x < -41) {
          const time = tr.timer + tr.hits;
          tr.best = tr.best === null ? time : Math.min(tr.best, time); tr.xp += 3;
          this.flash(`Slalom: ${time.toFixed(2)} s (${tr.hits} Fehler)`); Sound.reveal(1); tr.timer = null;
        } else if (Math.abs(p.y - 22) > 10 || tr.timer > 25) tr.timer = null;
      }
    } else if (tr.timer !== null && b.owner && b.owner !== p) tr.timer = null;
  },
  resetTrainBall() {
    const b = this.ball, p = this.controlled;
    Object.assign(b, { inNet: false, vx: 0, vy: 0, vz: 0, z: 0, kind: null, offside: null });
    const gk = this.gkOf(this.teams[1]); if (gk) { gk.x = PH.HL - 1; gk.y = 0; gk.holding = false; gk.dive = null; }
    this.setOwner(p);
  },
  /* ---------- Darstellung ---------- */
  drawables() {
    const out = [];
    for (const t of this.teams) for (const p of t.players) {
      if (p.sentOff) continue;
      out.push({
        x: p.x, y: p.y, isGK: p.isGK, gk: t.gk, c1: t.c1, c2: t.c2, num: p.num, spd: p.spd, phase: p.phase, fx: Math.cos(p.face),
        dive: p.dive ? p.dive.dir * Math.min(1.35, p.dive.t * 5) : 0, slide: p.slideT > 0 ? 1.25 * sgn(Math.cos(p.face)) : 0,
        cele: p.cele || p.headT > 0, skin: p.skin, hair: p.hair, card: p.yellow ? '#facc15' : null,
        sel: p === this.controlled, label: p.name, team: t.idx
      });
    }
    return out;
  },
  updateCam(dt) {
    const b = this.state === 'replay' ? this.replay[Math.floor(this.rPos)].b : this.ball;
    let lead = 0; if (b.owner) lead = b.owner.team.dir * 5;
    const tx = clamp(b.x + lead + (this.ball.vx || 0) * .25, -38, 38), ty = clamp(b.y * .55, -15, 12);
    const k = Math.min(1, dt * 3.2);
    this.camX += (tx - this.camX) * k; this.camY += (ty - this.camY) * k;
  },
  render() {
    const replay = this.state === 'replay';
    const fr = replay ? this.replay[Math.floor(this.rPos)] : null;
    const view = replay ? { players: fr.p, ball: fr.b } : { players: this.drawables(), ball: this.ball };
    view.cones = this.cones;
    view.sel = replay ? null : view.players.find(d => d.sel);
    R.setCam(this.camX, this.camY, 0, -Math.PI / 2, .56, 46, Engine.focal());
    R.scene(view, this.st, this.t, this.jump);
    const ctx = R.ctx;
    // Schuss-Power-Leiste
    if (this.charge >= 0 && this.controlled) {
      const h = R.p(this.controlled.x, this.controlled.y, 2.3);
      if (h) {
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(h[0] - 26, h[1] - 34, 52, 8);
        const c = this.charge; ctx.fillStyle = c > .85 ? '#ef4444' : c > .6 ? '#facc15' : '#22c55e'; ctx.fillRect(h[0] - 25, h[1] - 33, 50 * c, 6);
      }
    }
    // Radar
    const rw = Math.min(170, R.W * (R.H < 500 ? .14 : .2)), rh = rw * 68 / 105;
    R.radar(view.players, view.ball, R.W / 2 - rw / 2, R.H - rh - 8, rw, rh);
    for (const q of this.particles) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.c; ctx.fillRect(-4, -2, 8, 4); ctx.restore(); }
    if (replay) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(14, 60, 190, 34);
      ctx.fillStyle = '#facc15'; ctx.font = '900 16px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('● WIEDERHOLUNG', 24, 77);
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '600 11px Arial'; ctx.fillText('Tippen zum Überspringen', 24, 104);
    }
    if (this.banner) drawBanner(this.banner);
  }
});

function drawBanner(bn) {
  const ctx = R.ctx;
  {
    {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (bn.big) {
        const sc = 1 + Math.max(0, bn.t - 2.6) * 2;
        ctx.save(); ctx.translate(R.W / 2, R.H * .38); ctx.scale(sc, sc);
        ctx.font = `900 ${Math.round(Math.min(110, R.W * .13))}px Arial`;
        ctx.lineWidth = 8; ctx.strokeStyle = '#052e16'; ctx.strokeText(bn.txt, 0, 0);
        const g = ctx.createLinearGradient(0, -50, 0, 50); g.addColorStop(0, '#fef08a'); g.addColorStop(1, '#22c55e');
        ctx.fillStyle = g; ctx.fillText(bn.txt, 0, 0); ctx.restore();
        if (bn.sub) { ctx.font = '800 20px Arial'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(bn.sub, R.W / 2, R.H * .38 + 60); ctx.fillStyle = '#fff'; ctx.fillText(bn.sub, R.W / 2, R.H * .38 + 60); }
      } else {
        ctx.font = '900 22px Arial'; const w = ctx.measureText(bn.txt).width + 40;
        ctx.fillStyle = 'rgba(5,46,22,.85)'; ctx.fillRect(R.W / 2 - w / 2, R.H * .25 - 22, w, 44);
        ctx.fillStyle = '#4ade80'; ctx.fillRect(R.W / 2 - w / 2, R.H * .25 + 20, w, 3);
        ctx.fillStyle = '#fff'; ctx.fillText(bn.txt, R.W / 2, R.H * .25);
      }
    }
  }
}
