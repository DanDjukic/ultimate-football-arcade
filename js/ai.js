'use strict';
/* ============ KI: Mannschaftsverhalten, Ballführer, Torhüter ============ */
Object.assign(Game.prototype, {
  predict(t) {
    const b = this.ball, sp = Math.hypot(b.vx, b.vy);
    if (sp < .01) return { x: b.x, y: b.y };
    let s;
    if (b.z > .3 || b.vz > 1) {
      const tl = (b.vz + Math.sqrt(Math.max(0, b.vz * b.vz + 2 * GRAV * b.z))) / GRAV;
      if (t < tl) s = sp * t; else { const s2 = sp * .8, tr = Math.min(t - tl, s2 / ROLL); s = sp * tl + s2 * tr - .5 * ROLL * tr * tr; }
    } else { const ts = Math.min(t, sp / ROLL); s = sp * ts - .5 * ROLL * ts * ts; }
    return { x: clamp(b.x + b.vx / sp * s, -54, 54), y: clamp(b.y + b.vy / sp * s, -35, 35) };
  },
  intercept(p) {
    const b = this.ball;
    if (b.owner) return { x: b.owner.x, y: b.owner.y, t: dist(p.x, p.y, b.owner.x, b.owner.y) / p.maxSpd };
    for (let t = 0; t <= 3; t += .1) {
      const q = this.predict(t);
      if (dist(p.x, p.y, q.x, q.y) <= p.maxSpd * 1.1 * t + .6) return { x: q.x, y: q.y, t };
    }
    const q = this.predict(3); return { x: q.x, y: q.y, t: 3 + dist(p.x, p.y, q.x, q.y) / p.maxSpd };
  },
  offsideLine(t) { // rel. x (in Angriffsrichtung) des vorletzten Gegenspielers
    const o = this.other(t).players.filter(q => !q.sentOff).map(q => q.x * t.dir).sort((a, c) => c - a);
    return o.length > 1 ? o[1] : PH.HL;
  },
  home(p, attacking) {
    const t = p.team, b = this.ball, dir = t.dir, og = this.ownGoalX(t);
    if (p.isGK) return { x: og + dir * 1.5, y: clamp(b.y * .1, -2, 2) };
    const br = clamp(this.rel(t, b.x), 0, 1);
    let rel = attacking ? .08 + p.fx * .72 + br * .22 : .03 + p.fx * .45 + br * .26;
    if (!attacking && p.f('positioning')) rel -= .02 * p.f('positioning');
    rel = clamp(rel, .03, .92);
    let x = og + dir * rel * PH.HL * 2;
    if (attacking && Store.d.settings.offside) {
      const line = Math.max(this.offsideLine(t), b.x * dir) - .5;
      if (x * dir > line) x = line * dir;
    }
    const w = attacking ? 29 : 21;
    let y = p.fy * dir * w + b.y * (attacking ? .2 : .4);
    if (!attacking && p.f('positioning')) y = y * .9 + b.y * .1;
    return { x, y: clamp(y, -32, 32) };
  },
  aiTeam(t, dt) {
    const b = this.ball, oppHas = b.owner && b.owner.team !== t;
    const own = (b.owner && b.owner.team === t) || (!b.owner && b.lastTeam === t && (b.kind === 'pass' || b.kind === 'through' || b.kind === 'cross'));
    const ctrl = t.human ? this.controlled : null;
    let c1 = null, c2 = null;
    if (!own) {
      const list = t.players.filter(p => !p.sentOff && !p.isGK && !p.static).map(p => ({ p, tt: this.intercept(p).t })).sort((a, c) => a.tt - c.tt);
      const rest = list.filter(e => e.p !== ctrl);
      if (ctrl && list.length && list[0].p === ctrl) { c2 = rest[0] && rest[0].p; }
      else { c1 = rest[0] && rest[0].p; c2 = rest[1] && rest[1].p; }
      if (b.target && b.target.team === t && !b.owner) c1 = b.target === ctrl ? null : b.target;
    }
    for (const p of t.players) {
      if (p.sentOff || p === ctrl) continue;
      if (p.frozen || p.stunned > 0 || p.slideT > 0) { if (!p.dive) p.stop(); continue; }
      if (p.isGK) { this.gkAI(p, dt); continue; }
      if (b.target === p && !b.owner) { const ip = this.intercept(p); p.goTo(ip.x, ip.y, 1); continue; }
      if (p.static) { this.staticAI(p, dt); continue; }
      if (b.owner === p) { this.carrierAI(p, dt); continue; }
      if (own) { this.supportAI(p, dt); continue; }
      if (p === c1) {
        const ip = this.intercept(p); p.goTo(ip.x, ip.y, 1);
        if (oppHas) this.aiTackle(p, dt);
        continue;
      }
      if (p === c2 && b.owner && b.owner.team !== t) {
        const c = b.owner, og = this.ownGoalX(t), d = dist(c.x, c.y, og, 0) || 1;
        p.goTo(c.x + (og - c.x) / d * 5, c.y - c.y / d * 5, .95); this.aiTackle(p, dt * .4); continue;
      }
      // Abfangen von Pässen in der Nähe
      if (!b.owner && (b.kind === 'pass' || b.kind === 'through' || b.kind === 'cross') && b.lastTeam !== t) {
        const ip = this.intercept(p); if (ip.t < .7 + .4 * p.f('interceptor')) { p.goTo(ip.x, ip.y, 1); continue; }
      }
      const h = this.home(p, false);
      // Manndeckung: nächsten Gegner in Zone leicht anlaufen
      let mark = null, md = 8;
      for (const q of this.other(t).players) { if (q.sentOff || q.isGK) continue; const d = dist(q.x, q.y, h.x, h.y); if (d < md) { md = d; mark = q; } }
      if (mark) { const og = this.ownGoalX(t); h.x = h.x * .6 + (mark.x + (og - mark.x) * .1) * .4; h.y = h.y * .6 + mark.y * .4; }
      p.goTo(h.x, h.y, .85);
    }
  },
  aiTackle(p, dt) {
    const c = this.ball.owner; if (!c || c.team === p.team || p.tackleCD > 0) return;
    const d = dist(p.x, p.y, c.x, c.y);
    const rate = (p.team.human ? .8 : this.diff.tackle) * (1 + .3 * p.f('slide_tackle'));
    if (d < 1.6 && rnd() < dt * rate * 1.2) { p.tackleCD = 1.0; this.resolveTackle(p, c, false); }
    else if (d < 2.8 && d > 1.8 && rnd() < dt * rate * .25 * (1 + p.f('slide_tackle'))) { p.tackleCD = 1.2; p.slideT = .5; p.slideHit = c; p.vx = (c.x - p.x) / d * 9; p.vy = (c.y - p.y) / d * 9; }
  },
  staticAI(p, dt) {
    const b = this.ball;
    if (b.owner === p) {
      p.stop(); p.holdT += dt;
      if (p.holdT > .8 && this.controlled) this.pass(p, null, false, { rec: this.controlled, noOffside: true });
    } else p.goTo(p.static.x, p.static.y, .8);
  },
  supportAI(p, dt) {
    const t = p.team, c = this.ball.owner;
    p.spaceT -= dt;
    if (p.run) { p.run.t -= dt; if (p.run.t <= 0) p.run = null; else { p.goTo(p.run.x, p.run.y, 1); return; } }
    const h = this.home(p, true);
    if (p.spaceT <= 0 || !p.spot) {
      p.spaceT = .6 + rnd() * .5;
      const pm = c ? c.f('playmaker') : 0;
      if (p.fx >= .55 && c && this.rel(t, c.x) > .35 && rnd() < .45 * (1 + .5 * pm)) {
        const line = this.offsideLine(t);
        p.run = { x: t.dir * clamp(line + 2 + rnd() * 9, -50, 47), y: clamp(p.y * .7 + (rnd() - .5) * 10, -28, 28), t: 1.8 };
      }
      let best = null, bs = -1e9;
      for (let k = 0; k < 7; k++) {
        const cx = h.x + (k ? (rnd() - .5) * 14 : 0), cy = h.y + (k ? (rnd() - .5) * 14 : 0);
        let sc = Math.min(8, this.nearestOpp(p, cx, cy)) - dist(cx, cy, h.x, h.y) * .15;
        if (c && this.laneClear(t, c.x, c.y, cx, cy)) sc += 2;
        if (sc > bs) { bs = sc; best = { x: cx, y: cy }; }
      }
      p.spot = best;
    }
    p.goTo(clamp(p.spot.x, -51, 51), clamp(p.spot.y, -32, 32), dist(p.x, p.y, p.spot.x, p.spot.y) > 8 ? 1 : .8);
  },
  bestPassTarget(p, forward = .6) {
    const t = p.team; let best = null, bs = -1e9;
    for (const q of t.players) {
      if (q === p || q.sentOff || q.isGK) continue;
      const d = dist(p.x, p.y, q.x, q.y); if (d < 4 || d > 45) continue;
      const prog = (this.rel(t, q.x) - this.rel(t, p.x)) * 10;
      const open = this.nearestOpp(q);
      let sc = prog * forward + Math.min(1.5, open / 4) * 1.4 - d / 50 - (open < 2.5 ? 1 : 0);
      if (!this.laneClear(t, p.x, p.y, q.x, q.y)) sc -= 2.2;
      if (sc > bs) { bs = sc; best = q; }
    }
    return best;
  },
  distTarget(gk) {
    const t = gk.team;
    const c = t.players.filter(q => !q.isGK && !q.sentOff).map(q => ({ q, s: Math.min(10, this.nearestOpp(q)) + rnd() * 4 + (this.rel(t, q.x) > .4 ? 3 * gk.f('gk_kick') : 0) })).sort((a, d) => d.s - a.s);
    return c.length ? c[0].q : null;
  },
  distribute(gk, dir) {
    if (this.training) { this.pass(gk, null, false, { rec: this.controlled, noOffside: true }); return; }
    const rec = dir ? null : this.distTarget(gk);
    const far = rec && dist(gk.x, gk.y, rec.x, rec.y) > 30;
    this.pass(gk, dir, false, { rec, lofted: far, noOffside: true });
  },
  carrierAI(p, dt) {
    const t = p.team, b = this.ball, gx = t.dir * PH.HL;
    if (p.isGK) return;
    p.decT -= dt;
    const dg = dist(p.x, p.y, gx, 0), press = this.nearestOpp(p);
    // Dribbelrichtung: zum Tor mit Ausweichen
    let vx = gx - p.x, vy = -p.y * .4; const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
    for (const q of this.other(t).players) {
      if (q.sentOff) continue; const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
      if (d < 7 && d > .01) { const k = (1 + .3 * p.f('one_on_one')) * 2.2 / (d * d); vx += dx / d * k * 2; vy += dy / d * k * 2; vx += -dy / d * k * sgn(p.y || 1) * .5; }
    }
    if (Math.abs(p.y) > 30) vy -= sgn(p.y) * .8;
    const vl = Math.hypot(vx, vy) || 1;
    const space = press > 3.5;
    const spd = p.maxSpd * (space ? 1.2 : .95) * (.9 + .05 * p.f('dribbler'));
    p.wx = vx / vl * spd; p.wy = vy / vl * spd; p.sprinting = space;
    if (p.decT > 0) return;
    p.decT = this.diff.dec * (t.human ? .7 : 1) * (.6 + rnd() * .8);
    // Schuss?
    if (dg < 30) {
      let q = 1 - dg / 32; q *= 1 - Math.min(.5, Math.abs(p.y) / dg * .6);
      if (!this.laneClear(t, p.x, p.y, gx, 0, 1.0)) q *= .7;
      if (press < 2.5 && dg < 22) q += .15;
      if (q > this.diff.shoot || (dg < 14 && rnd() < .7)) {
        const pw = dg > 20 ? .78 + rnd() * .15 : .5 + rnd() * .25;
        this.shoot(p, pw, null); if (dg < 18 && !this.training) Commentator.ev('chance'); return;
      }
    }
    // Flanke
    if (this.rel(t, p.x) > .8 && Math.abs(p.y) > 13) {
      const box = t.players.filter(q => q !== p && !q.sentOff && this.rel(t, q.x) > .8 && Math.abs(q.y) < 12);
      if (box.length && rnd() < .7) { this.pass(p, null, false, { rec: box[Math.floor(rnd() * box.length)] }); return; }
    }
    // Befreiungsschlag
    if (this.rel(t, p.x) < .2 && press < 3) { this.kick(p, t.dir * (16 + rnd() * 6), (rnd() - .5) * 12, 6 + rnd() * 2, 'loose'); return; }
    // Pass
    let blocked = false;
    for (const q of this.other(t).players) { if (q.sentOff) continue; const dx = (q.x - p.x) * t.dir; if (dx > 0 && dx < 5 && Math.abs(q.y - p.y) < 2.5) { blocked = true; break; } }
    const rec = this.bestPassTarget(p, .9);
    if (rec) {
      const runner = t.players.find(q => q.run && q !== p && !q.sentOff && this.rel(t, q.x) > this.rel(t, p.x));
      if (runner && rnd() < .3 * (1 + .5 * p.f('through_pass'))) { this.pass(p, null, true, { rec: runner }); return; }
      const prog = this.rel(t, rec.x) - this.rel(t, p.x);
      let want = press < 2.2 ? .75 : blocked ? .5 : .08;
      if (this.rel(t, p.x) > .68 && dg > 14) want *= .55;
      if (prog > .1 && this.laneClear(t, p.x, p.y, rec.x, rec.y)) want += .2;
      if (prog < -.05) want *= .5;
      if (rnd() < want) { this.pass(p, null, false, { rec }); return; }
    }
  },
  gkAI(p, dt) {
    const t = p.team, b = this.ball, og = this.ownGoalX(t), dir = t.dir;
    if (b.owner === p) {
      p.stop(); p.face = dir > 0 ? 0 : Math.PI; p.holdT += dt;
      if (p.holdT > (t.human ? 1.8 : 1.3)) this.distribute(p, null);
      return;
    }
    if (p.dive) return;
    // Schussreaktion
    if (b.kind === 'shot' && b.shotBy && b.shotBy.team !== t && b.vx * -dir > 0) {
      if (!p.react) p.react = { t: clamp(.32 - p.st.ref / 125 * .2 - .05 * p.f('reflexes'), .05, .4) * (t.human ? 1 : this.diff.react) };
      p.react.t -= dt;
      if (p.react.t <= 0) {
        const tg = (p.x - b.x) / b.vx;
        if (tg > 0) {
          const yP = clamp(b.y + b.vy * tg, -PH.GW - .3, PH.GW + .3), zP = b.z + b.vz * tg - .5 * GRAV * tg * tg, dy = yP - p.y;
          if (Math.abs(dy) > .7 && !p.dive && zP < 3) {
            const v = 4.5 + p.st.div / 125 * 4.5;
            p.dive = { dir: sgn(dy), t: 0 }; p.vy = sgn(dy) * Math.min(v, Math.abs(dy) / Math.max(.15, tg) + 1); p.vx = 0;
          } else p.goTo(p.x, yP, 1);
        }
      }
      return;
    }
    p.react = null;
    // Hohe Bälle / Flanken
    if (!b.owner && b.z > 1 && b.z < 3.2 && this.inOwnBox(p, b.x, b.y) && b.lastTeam !== t) {
      const r = 1.6 + .6 * p.f('cross_catcher');
      if (dist(p.x, p.y, b.x, b.y) < r && rnd() < (.5 + p.st.han / 250) * dt * 12) { this.setOwner(p); p.holding = true; p.holdT = 0; return; }
      if (Math.abs(b.x - og) < 8 + 3 * p.f('cross_catcher')) { const ip = this.intercept(p); p.goTo(ip.x, ip.y, 1); return; }
    }
    // Lose Bälle im Strafraum
    if (!b.owner && this.inOwnBox(p, b.x, b.y) && Math.hypot(b.vx, b.vy) < 14) {
      const ip = this.intercept(p), other = this.other(t).players.filter(q => !q.sentOff).map(q => this.intercept(q).t);
      if (ip.t < Math.min(...other, 9) + .2) { p.goTo(ip.x, ip.y, 1); return; }
    }
    // 1-gegen-1: rauslaufen
    const c = b.owner;
    if (c && c.team !== t) {
      const dc = dist(c.x, c.y, og, 0);
      if (dc < 15 + 3 * p.f('gk_1v1') && Math.abs(c.y) < 17) {
        const out = Math.min(dc - 1.5, 5 + 3 * p.f('gk_1v1') + p.st.pos / 125 * 2);
        p.goTo(og + (c.x - og) / dc * out, c.y / dc * out, 1);
        if (dist(p.x, p.y, c.x, c.y) < 1.4 && p.tackleCD <= 0) {
          p.tackleCD = .9;
          if (rnd() < .25 + p.st.pos / 125 * .3 + .15 * p.f('gk_1v1')) { this.setOwner(p); p.holding = this.inOwnBox(p, p.x, p.y); p.holdT = 0; c.stunned = .5; }
        }
        return;
      }
    }
    // Stellungsspiel auf der Linie Ball–Tormitte
    const db = dist(b.x, b.y, og, 0) || 1;
    const dd = clamp(1.2 + (db - 8) * .05, 1, 3.5) * (.7 + .3 * p.st.pos / 125);
    p.goTo(og + (b.x - og) / db * dd, clamp(b.y / db * dd * 1.6, -PH.GW + .3, PH.GW - .3), .9);
  }
});
