'use strict';
/* ============ Spielkern: Spieler, Teams, Aktionen ============ */
const GRAV = 9.81, ROLL = 4.2;
const rnd = Math.random;
const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const sgn = v => v < 0 ? -1 : 1;
const DIFF = {
  leicht: { bonus: -10, tackle: .6, react: 1.35, dec: .6, shoot: .36, n: 'Leicht' },
  normal: { bonus: 0, tackle: 1.0, react: 1, dec: .42, shoot: .28, n: 'Normal' },
  schwer: { bonus: 6, tackle: 1.5, react: .85, dec: .3, shoot: .25, n: 'Schwer' },
  legende: { bonus: 14, tackle: 2.1, react: .7, dec: .22, shoot: .22, n: 'Legende' }
};

class PlayerEnt {
  constructor(team, idx, e, bonus) {
    const c = e.card;
    this.team = team; this.idx = idx; this.card = c; this.slot = e.slot; this.fx = e.fx; this.fy = e.fy;
    this.full = c.name; this.name = c.name.split(' ').slice(-1)[0]; this.num = c.num;
    this.isGK = e.slot === 'GK';
    const s = c.stats, fit = e.fit || 1, add = (e.chem || 0) + (bonus || 0);
    let F, G;
    if (c.pos === 'GK') { F = { pac: s.pac || 50, sho: 35, pas: s.kic, dri: 40, def: 45, phy: 60 }; G = { ref: s.ref, div: s.div, pos: s.pos, han: s.han, kic: s.kic }; }
    else { F = Object.assign({}, s); G = { ref: 35, div: 35, pos: 35, han: 35, kic: s.pas }; }
    const st = {};
    for (const k in F) st[k] = clamp(F[k] * fit + add, 1, MAX_GES);
    for (const k in G) st[k] = clamp(G[k] * fit + add, 1, MAX_GES);
    this.st = st;
    this.ps = {}; for (const p of c.ps) this.ps[p.id] = p.plus ? PS_PLUS_FACTOR : 1;
    this.maxSpd = (this.isGK ? 5.2 : 5.5) + 3.3 * st.pac / 125;
    this.acc = (15 + 7 * st.pac / 125) * (1 + .3 * this.f('quick_step'));
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.wx = 0; this.wy = 0; this.face = 0; this.phase = 0; this.spd = 0;
    this.stunned = 0; this.tackleCD = 0; this.decT = 0; this.spaceT = 0; this.kickT = 0; this.slideT = 0; this.headT = 0;
    this.dive = null; this.react = null; this.holding = false; this.holdT = 0; this.buffer = null; this.run = null;
    this.yellow = 0; this.sentOff = false; this.frozen = false; this.sprinting = false; this.cele = false;
    const r = mulberry32(c.look || 7); this.skin = SKIN[Math.floor(r() * SKIN.length)]; this.hair = HAIRC[Math.floor(r() * HAIRC.length)];
  }
  f(id) { return this.ps[id] || 0; }
  goTo(x, y, urg = 1) {
    const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
    if (d < .25) { this.wx = this.wy = 0; this.sprinting = false; return; }
    this.sprinting = d > 7 && urg >= .95;
    const sp = this.maxSpd * urg * (this.sprinting ? 1.25 : 1) * Math.min(1, d / 1.5);
    this.wx = dx / d * sp; this.wy = dy / d * sp;
  }
  stop() { this.wx = this.wy = 0; this.sprinting = false; }
}

/* ---------- Teamdefinitionen ---------- */
const TeamFactory = {
  club(id) {
    const c = CLUB_BY_ID[id], slots = FORMATIONS['4-3-3'];
    return {
      id, name: c.name, short: c.id, c1: c.c1, c2: c.c2, gk: c.gk, formation: '4-3-3',
      entries: CLUB_SQUADS[id].map((card, i) => ({ card, slot: slots[i].pos, fx: slots[i].fx, fy: slots[i].fy, fit: 1, chem: 0 }))
    };
  },
  mine() {
    const s = Store.d.settings, lu = Store.d.lineup, slots = FORMATIONS[lu.formation];
    const cards = lu.slots.map((uid, i) => { const inst = uid && Store.inst(uid); return inst ? effCard(inst) : genericCard(slots[i].pos, 60, i); });
    const chem = this.chemistry(cards);
    return {
      id: 'MY', name: s.teamName || 'Mein Team', short: 'MEIN', c1: s.c1, c2: s.c2, gk: s.gk, formation: lu.formation,
      entries: cards.map((card, i) => ({ card, slot: slots[i].pos, fx: slots[i].fx, fy: slots[i].fy, fit: posFit(card.pos, slots[i].pos), chem: chem[i] }))
    };
  },
  // Teamchemie: 0–3 Bonuspunkte je Spieler (gleiche Nation/gleicher Verein), bewusst klein gehalten
  chemistry(cards) {
    return cards.map((c, i) => {
      if (c.generic) return 0;
      let l = 0; cards.forEach((o, j) => { if (j !== i && !o.generic) { if (o.nat === c.nat) l++; if (o.club === c.club) l++; } });
      return Math.min(3, Math.floor(l / 2));
    });
  },
  ovr(def) { return Math.round(def.entries.reduce((a, e) => a + e.card.ges, 0) / def.entries.length); },
  list() { return [{ id: 'MY', name: Store.d.settings.teamName, c1: Store.d.settings.c1, c2: Store.d.settings.c2 }, ...CLUBS]; },
  get(id) { return id === 'MY' ? this.mine() : this.club(id); }
};

/* ---------- Game ---------- */
class Game {
  constructor(cfg) {
    this.cfg = cfg; this.mode = cfg.mode; this.training = cfg.mode === 'training';
    this.st = STADIUMS[cfg.stadium] || STADIUMS.nordlicht;
    this.diff = DIFF[Store.d.settings.difficulty] || DIFF.normal;
    this.user = cfg.userSide === undefined ? 0 : cfg.userSide;
    this.teams = [0, 1].map(i => this.makeTeam(cfg.teams[i], i, i === 0 ? 1 : -1));
    this.ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, curve: 0, rot: 0, owner: null, last: null, lastTeam: null, kind: null, target: null, noPick: null, noPickT: 0, offside: null, inNet: false };
    this.period = 1; this.clock = 0; this.halfSec = (cfg.halfMin || 3) * 60; this.stoppage = this.halfSec * (.5 + Math.random() * 2) / 45;
    this.state = 'setpiece'; this.sp = null; this.t = 0; this.stateT = 0;
    this.scorers = []; this.replay = []; this.recT = 0; this.particles = [];
    this.camX = 0; this.camY = 0; this.jump = 0; this.controlled = null; this.idleT = 0; this.charge = -1;
    this.banner = null; this.events = [];
    if (this.training) this.setupTraining(); else this.startSetPiece('kickoff', this.teams[0], 0, 0);
  }
  makeTeam(def, idx, dir) {
    const t = {
      idx, def, name: def.name, short: def.short, c1: def.c1, c2: def.c2, gk: def.gk, dir, score: 0, players: [],
      human: idx === this.user, stats: { shots: 0, onT: 0, passes: 0, passOk: 0, fouls: 0, yellow: 0, red: 0, poss: 0, tackles: 0, saves: 0 }
    };
    const bonus = (t.human || this.training) ? 0 : this.diff.bonus;
    def.entries.forEach((e, i) => t.players.push(new PlayerEnt(t, i, e, bonus)));
    return t;
  }
  other(t) { return this.teams[t.idx ^ 1]; }
  gkOf(t) { return t.players.find(p => p.isGK && !p.sentOff); }
  all() { return this.teams[0].players.concat(this.teams[1].players).filter(p => !p.sentOff); }
  ownGoalX(t) { return -t.dir * PH.HL; }
  rel(t, x) { return (x - this.ownGoalX(t)) * t.dir / (PH.HL * 2); } // 0 eigenes Tor .. 1 gegn. Tor
  inOwnBox(p, x, y) { const g = this.ownGoalX(p.team); return Math.abs(x - g) < PH.BOXL && Math.abs(y) < PH.BOXW && Math.sign(x || 1) === Math.sign(g); }
  nearestOpp(p, x = p.x, y = p.y) {
    let best = 99; for (const q of this.other(p.team).players) if (!q.sentOff) best = Math.min(best, dist(x, y, q.x, q.y)); return best;
  }
  laneClear(t, ax, ay, bx, by, w = 1.8) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    for (const q of this.other(t).players) {
      if (q.sentOff) continue;
      const u = clamp(((q.x - ax) * dx + (q.y - ay) * dy) / L2, 0, 1);
      if (u > .05 && dist(q.x, q.y, ax + dx * u, ay + dy * u) < w) return false;
    }
    return true;
  }
  minute() {
    const base = [0, 0, 45, 90, 105][this.period], len = this.period > 2 ? 15 : 45;
    const plen = this.period > 2 ? this.halfSec / 3 : this.halfSec;
    const m = this.clock / plen * len;
    if (m >= len) return { txt: `${base + len}+${Math.floor(m - len) + 1}`, over: true };
    return { txt: `${Math.floor(base + m)}'`, over: false };
  }
  setControlled(p) {
    if (!p || p.isGK || p.sentOff || !p.team.human) return;
    this.controlled = p; this.idleT = 0;
  }
  switchPlayer() {
    const t = this.teams[this.user], b = this.ball;
    let best = null, bd = 1e9;
    const m = Input.move();
    for (const p of t.players) {
      if (p.isGK || p.sentOff || p === this.controlled || p.static) continue;
      let d = dist(p.x, p.y, b.x, b.y);
      if (Math.hypot(m.x, m.y) > .4) { const dx = p.x - this.controlled.x, dy = p.y - this.controlled.y, l = Math.hypot(dx, dy) || 1; d -= ((dx * m.x + dy * m.y) / l) * 12; }
      if (d < bd) { bd = d; best = p; }
    }
    if (best) this.setControlled(best);
  }

  /* ---------- Ballaktionen ---------- */
  kick(p, vx, vy, vz, kind) {
    const b = this.ball;
    b.owner = null; b.vx = vx; b.vy = vy; b.vz = vz; b.kind = kind; b.last = p; b.lastTeam = p.team; b.passer = p;
    b.noPick = p; b.noPickT = .28; b.curve = 0; b.gkTried = null; b.target = null; b.safe = 0; b.inNet = false; b.kickT = this.t; b.tried = null;
    p.holding = false; p.kickT = .25;
    Sound.kick(Math.min(1, Math.hypot(vx, vy) / 30));
  }
  pass(p, dirVec, through, opts = {}) {
    const t = p.team, b = this.ball;
    let dir = dirVec && Math.hypot(dirVec.x, dirVec.y) > .25 ? { x: dirVec.x, y: dirVec.y } : { x: Math.cos(p.face), y: Math.sin(p.face) };
    const dl = Math.hypot(dir.x, dir.y) || 1; dir.x /= dl; dir.y /= dl;
    let rec = opts.rec || null;
    const noDir = !(dirVec && Math.hypot(dirVec.x, dirVec.y) > .25);
    if (!rec) {
      let best = -1e9;
      for (const q of t.players) {
        if (q === p || q.sentOff) continue;
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        if (d < 2.5 || d > 65) continue;
        const cos = (dx * dir.x + dy * dir.y) / d; if (cos < .25) continue;
        let sc = cos * 2.4 - d / 45 + Math.min(1, this.nearestOpp(q) / 8) * .6 + (this.laneClear(t, p.x, p.y, q.x, q.y) ? .4 : 0);
        if (q.isGK) sc -= 1.5;
        if (sc > best) { best = sc; rec = q; }
      }
      if (!rec && noDir && !opts.throwin) rec = this.bestPassTarget(p, .3);
    }
    const pressured = this.nearestOpp(p) < 2.5;
    let tx, ty;
    if (rec) {
      if (through) {
        const lead = 7 + 3 * p.f('through_pass');
        tx = rec.x + t.dir * lead; ty = rec.y * .85;
        rec.run = { x: tx, y: ty, t: 2.5 };
      } else {
        const tt = dist(p.x, p.y, rec.x, rec.y) / 18;
        tx = rec.x + rec.vx * tt * .7; ty = rec.y + rec.vy * tt * .7;
      }
    } else { tx = p.x + dir.x * 20; ty = p.y + dir.y * 20; }
    tx = clamp(tx, -51, 51); ty = clamp(ty, -33, 33);
    const d = dist(p.x, p.y, tx, ty);
    const crossing = !through && rec && this.rel(t, p.x) > .72 && Math.abs(p.y) > 12 && Math.abs(rec.y) < 13 && this.rel(t, rec.x) > .82;
    const lofted = opts.lofted || crossing || d > 40 || opts.throwin;
    let sig = (.14 - .11 * p.st.pas / 125) * (1 - .3 * p.f('precision_pass')) * (through ? 1 - .3 * p.f('through_pass') : 1)
      * (crossing ? 1 - .35 * p.f('crosser') : 1) * (pressured ? 1.35 : 1) * (p.isGK ? 1 - .35 * p.f('gk_kick') : 1);
    if (p.isGK) sig = (.16 - .12 * p.st.kic / 125) * (1 - .35 * p.f('gk_kick'));
    const ang = Math.atan2(ty - p.y, tx - p.x) + gauss() * sig;
    const dd = Math.max(3, d * (1 + gauss() * sig * .6));
    let vx, vy, vz = 0;
    if (lofted) {
      const T = .55 + dd / 32, sp = dd / T, zEnd = crossing ? 1.6 : (opts.throwin ? 0.4 : 0);
      vx = Math.cos(ang) * sp; vy = Math.sin(ang) * sp; vz = (zEnd - (opts.throwin ? 1.9 : 0) + .5 * GRAV * T * T) / T;
    } else {
      const sp = clamp(Math.sqrt(60 + 2 * ROLL * dd) * (through ? 1.05 : 1.1) + 1.5 * p.f('outside_foot'), 9, 30);
      vx = Math.cos(ang) * sp; vy = Math.sin(ang) * sp;
    }
    this.kick(p, vx, vy, vz, crossing ? 'cross' : through ? 'through' : 'pass');
    if (opts.throwin) b.z = 1.9;
    b.target = rec; b.safe = .15 * (p.f('outside_foot') + p.f('playmaker'));
    t.stats.passes++;
    if (Store.d.settings.offside && !opts.noOffside && !this.training) this.snapOffside(p);
    if (t.human && rec && !rec.isGK && !rec.static) this.setControlled(rec);
  }
  snapOffside(p) {
    const t = p.team, o = this.other(t), b = this.ball;
    const r = x => x * t.dir;
    const opps = o.players.filter(q => !q.sentOff).map(q => r(q.x)).sort((a, c) => c - a);
    const second = opps.length > 1 ? opps[1] : (opps[0] || PH.HL);
    const line = Math.max(second, r(p.x), 0);
    const set = new Set(t.players.filter(q => q !== p && !q.sentOff && r(q.x) > line + .4));
    b.offside = set.size ? { team: t, set } : null;
  }
  shoot(p, power, aim, header) {
    const t = p.team, o = this.other(t), gx = t.dir * PH.HL, gk = this.gkOf(o), b = this.ball;
    let aimY;
    if (aim && Math.abs(aim.y) > .3) aimY = clamp(aim.y, -1, 1) * 2.9;
    else if (Math.abs(p.y) > 8) aimY = -sgn(p.y) * (2.3 + rnd() * .8);
    else aimY = (gk && gk.y > 0 ? -1 : 1) * (2.2 + rnd() * .9);
    const d = dist(p.x, p.y, gx, aimY);
    let zt = header ? .4 + rnd() * 1.3 : .15 + power * 1.75 + Math.max(0, d - 18) * .02;
    const fin = !header && p.f('finesse') > 0 && power < .8 && d > 10;
    let sig = (.12 - .09 * p.st.sho / 125) * (1 - .28 * p.f('precision_shot')) * (1 + .7 * power * power)
      * (this.nearestOpp(p) < 2 ? 1.3 : 1) * (fin ? 1 - .15 * p.f('finesse') : 1) * (header ? 1.3 - .35 * p.f('header') : 1);
    let speed = header ? 11 + (p.st.phy + p.st.sho) / 250 * 7 + 2 * p.f('header')
      : 15 + power * 13 + p.st.sho / 125 * 6 + 2.4 * p.f('power_shot') * (.4 + power);
    let ang = Math.atan2(aimY - p.y, gx - p.x), curve = 0;
    if (fin) {
      const T = d / speed, off = 1.3 * Math.min(1.4, p.f('finesse'));
      ang = Math.atan2(aimY + sgn(aimY) * off - p.y, gx - p.x);
      curve = -sgn(aimY) * (2 * off / (T * T)) * t.dir;
    }
    ang += gauss() * sig; zt = Math.max(.1, zt + gauss() * sig * d * .5);
    const T = d / speed, vz = (zt - b.z + .5 * GRAV * T * T) / T;
    this.kick(p, Math.cos(ang) * speed, Math.sin(ang) * speed, vz, 'shot');
    b.curve = curve; b.shotBy = p; b.shotDist = d;
    t.stats.shots++;
    if (gk) gk.react = null;
    if (d < 16 && !this.training) Sound.crowdLevel(.8);
  }
  tackle(p) {
    const b = this.ball, c = b.owner;
    p.tackleCD = .7;
    if (!c || c.team === p.team) { p.slideT = .45; return; }
    const d = dist(p.x, p.y, c.x, c.y);
    const stand = 1.7 + .4 * p.f('slide_tackle'), slide = 3.3 + .8 * p.f('slide_tackle');
    if (d <= stand) this.resolveTackle(p, c, false);
    else if (d <= slide) { p.slideT = .5; p.slideHit = c; const l = d || 1; p.vx = (c.x - p.x) / l * 9; p.vy = (c.y - p.y) / l * 9; }
    else p.slideT = .45;
  }
  resolveTackle(t, c, slide) {
    const att = (t.st.def * .65 + t.st.phy * .35) * (1 + .12 * t.f('slide_tackle') + .1 * t.f('duel'));
    const res = (c.st.dri * .6 + c.st.phy * .4) * (1 + .1 * c.f('dribbler') + .12 * c.f('one_on_one') + .08 * c.f('duel'));
    const pr = clamp(.55 + (att - res) / 70, .12, .9);
    const fx = Math.cos(c.face), fy = Math.sin(c.face), dx = c.x - t.x, dy = c.y - t.y, l = Math.hypot(dx, dy) || 1;
    const behind = (fx * dx + fy * dy) / l > .5;
    if (rnd() < pr) {
      const b = this.ball; b.owner = null; b.last = t; b.lastTeam = t.team; b.kind = 'loose';
      if (!slide && rnd() < .6) { this.setOwner(t); }
      else { b.vx = -dx / l * 4 + (rnd() - .5) * 4; b.vy = -dy / l * 4 + (rnd() - .5) * 4; b.vz = .5; b.noPick = c; b.noPickT = .5; }
      c.stunned = .45; t.team.stats.tackles++;
      if (!this.training && rnd() < .5) Commentator.ev('tackle', t.name);
    } else {
      t.stunned = slide ? .9 : .45;
      const foulP = (slide ? .28 : .1) + (behind ? .25 : 0);
      if (!this.training && rnd() < foulP) this.foul(t, c, slide && behind);
    }
  }
  foul(t, c, harsh) {
    t.team.stats.fouls++;
    const r = rnd();
    if (harsh && r < .1) this.card(t, 'red');
    else if (r < (harsh ? .45 : .14)) this.card(t, 'yellow');
    else Commentator.ev('foul');
    Sound.whistle();
    const ct = c.team;
    if (this.inOwnBox(t, c.x, c.y)) { Commentator.ev('penalty', '', '', 2); this.startSetPiece('penalty', ct, -this.ownGoalX(ct) * (1 - PH.PEN / PH.HL), 0); }
    else this.startSetPiece('freekick', ct, clamp(c.x, -50, 50), clamp(c.y, -32, 32));
  }
  card(p, col) {
    if (col === 'yellow') { p.yellow++; p.team.stats.yellow++; if (p.yellow >= 2) col = 'red'; else { Commentator.ev('yellow', p.name, '', 2); this.flash('🟨 ' + p.full); } }
    if (col === 'red') {
      p.team.stats.red++; Commentator.ev('red', p.name, '', 2); this.flash('🟥 ' + p.full);
      p.sentOff = true; p.x = 0; p.y = 40;
      if (this.controlled === p) this.controlled = null;
      if (this.ball.owner === p) this.ball.owner = null;
    }
    this.events.push({ type: col, team: p.team.idx, name: p.full, min: this.minute().txt });
  }
  flash(txt) { this.banner = { txt, t: 2.2, small: true }; }
}
