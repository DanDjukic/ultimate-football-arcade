'use strict';
/* ============ Renderer: 3D-Projektion auf Canvas 2D ============ */
const PH = { HL: 52.5, HW: 34, GW: 3.66, GH: 2.44, BOXL: 16.5, BOXW: 20.16, SIXL: 5.5, SIXW: 9.16, PEN: 11 };
const STADIUMS = {
  nordlicht: { n: 'Arena Nordlicht', night: true, sky: ['#020617', '#0f2350'], grass: ['#23863b', '#1d7432'], apron: '#17602a', light: '220,235,255', stand: ['#1e293b', '#0f172a'], seats: ['#1d4ed8', '#e2e8f0', '#facc15', '#ef4444', '#94a3b8', '#60a5fa'] },
  sonnenpark: { n: 'Sonnenpark', night: false, sky: ['#38bdf8', '#e0f2fe'], grass: ['#46a546', '#3c933d'], apron: '#357f36', light: '255,250,220', stand: ['#64748b', '#475569'], seats: ['#f97316', '#fde047', '#ffffff', '#16a34a', '#ef4444', '#a855f7'] },
  kristall: { n: 'Kristallkessel', night: true, sky: ['#14052b', '#3b0764'], grass: ['#1f7d40', '#1a6c37'], apron: '#155a2d', light: '233,213,255', stand: ['#2e1065', '#1e0845'], seats: ['#a855f7', '#e9d5ff', '#22d3ee', '#f0abfc', '#ffffff', '#7c3aed'] }
};

function clipNear(cs, n) {
  const out = [];
  for (let i = 0; i < cs.length; i++) {
    const A = cs[i], B = cs[(i + 1) % cs.length];
    const ain = A[2] >= n, bin = B[2] >= n;
    if (ain) out.push(A);
    if (ain !== bin) { const t = (n - A[2]) / (B[2] - A[2]); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, n]); }
  }
  return out;
}

const R = {
  ctx: null, W: 0, H: 0, F: 800, near: .8, C: [0, 0, 0], f: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0],
  crowd: null, crowdKey: '',
  setCam(tx, ty, tz, yaw, pitch, D, F) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    this.f = [cy * cp, sy * cp, -sp]; this.r = [-sy, cy, 0]; this.u = [cy * sp, sy * sp, cp];
    this.C = [tx - this.f[0] * D, ty - this.f[1] * D, tz - this.f[2] * D]; this.F = F;
  },
  cam(x, y, z) {
    const a = x - this.C[0], b = y - this.C[1], c = z - this.C[2], f = this.f, r = this.r, u = this.u;
    return [a * r[0] + b * r[1], a * u[0] + b * u[1] + c * u[2], a * f[0] + b * f[1] + c * f[2]];
  },
  scr(c) { const s = this.F / c[2]; return [this.W / 2 + c[0] * s, this.H / 2 - c[1] * s, s]; },
  p(x, y, z) { const c = this.cam(x, y, z); if (c[2] < this.near) return null; return this.scr(c); },
  poly(pts, fill) {
    let cs = pts.map(q => this.cam(q[0], q[1], q[2]));
    cs = clipNear(cs, this.near); if (cs.length < 3) return;
    const ctx = this.ctx; ctx.beginPath();
    cs.forEach((c, i) => { const s = this.scr(c); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  },
  seg(a, b) {
    let A = this.cam(a[0], a[1], a[2]), B = this.cam(b[0], b[1], b[2]);
    if (A[2] < this.near && B[2] < this.near) return;
    if (A[2] < this.near) { const t = (this.near - A[2]) / (B[2] - A[2]); A = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, this.near]; }
    if (B[2] < this.near) { const t = (this.near - B[2]) / (A[2] - B[2]); B = [B[0] + (A[0] - B[0]) * t, B[1] + (A[1] - B[1]) * t, this.near]; }
    const sa = this.scr(A), sb = this.scr(B);
    this.ctx.moveTo(sa[0], sa[1]); this.ctx.lineTo(sb[0], sb[1]);
  },
  buildCrowd(st, quality) {
    const key = st.n + quality; if (this.crowdKey === key) return;
    this.crowdKey = key; const pts = []; const rnd = mulberry32(42);
    const step = quality === 'niedrig' ? 2.6 : quality === 'mittel' ? 1.9 : 1.45;
    for (let i = 0; i < 14; i++) for (let x = -72; x <= 72; x += step) {
      if (rnd() < .12) continue;
      pts.push([x + rnd() * .5, -42.5 - i * 1.9, 1.6 + i * 1.35, st.seats[Math.floor(rnd() * st.seats.length)], rnd() * 6.28]);
    }
    for (const s of [1, -1]) for (let i = 0; i < 12; i++) for (let y = -38; y <= 38; y += step) {
      if (rnd() < .12) continue;
      pts.push([s * (60 + i * 1.9), y + rnd() * .5, 1.6 + i * 1.35, st.seats[Math.floor(rnd() * st.seats.length)], rnd() * 6.28]);
    }
    this.crowd = pts;
  },
  drawStadium(st, t, jump) {
    const ctx = this.ctx, W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, st.sky[0]); g.addColorStop(1, st.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Tribünen
    this.poly([[-76, -41, 0], [76, -41, 0], [76, -70, 21], [-76, -70, 21]], st.stand[0]);
    this.poly([[-76, -70, 21], [76, -70, 21], [76, -72, 30], [-76, -72, 30]], st.stand[1]);
    for (const s of [1, -1]) {
      this.poly([[s * 58, -41, 0], [s * 58, 41, 0], [s * 83, 41, 21], [s * 83, -41, 21]], st.stand[0]);
      this.poly([[s * 58, -41, 0], [s * 76, -41, 0], [s * 76, -70, 21], [s * 83, -41, 21]], st.stand[1]);
    }
    // Zuschauer
    const crowd = this.crowd;
    for (let i = 0; i < crowd.length; i++) {
      const c = crowd[i];
      const z = c[2] + (jump > 0 ? Math.abs(Math.sin(t * 9 + c[4])) * .6 * jump : Math.sin(t * 2 + c[4]) * .05);
      const p = this.p(c[0], c[1], z); if (!p || p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) continue;
      const s = Math.max(1.2, p[2] * .42);
      ctx.fillStyle = c[3]; ctx.fillRect(p[0] - s / 2, p[1] - s, s, s * 1.1);
      if (s > 6) { ctx.fillStyle = '#e8c4a0'; ctx.beginPath(); ctx.arc(p[0], p[1] - s * 1.25, s * .32, 0, 6.29); ctx.fill(); }
    }
    // Flutlicht-Masten
    if (st.night) {
      for (const s of [1, -1]) {
        const a = this.p(s * 70, -62, 0), b = this.p(s * 70, -62, 44);
        if (a && b) {
          ctx.strokeStyle = '#475569'; ctx.lineWidth = Math.max(1, b[2] * .5); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
          ctx.fillStyle = '#f8fafc'; const w = b[2] * 6; ctx.fillRect(b[0] - w / 2, b[1] - b[2] * 2.5, w, b[2] * 2.5);
        }
      }
    }
  },
  drawPitch(st) {
    const ctx = this.ctx;
    this.poly([[-60, -40, 0], [60, -40, 0], [60, 44, 0], [-60, 44, 0]], st.apron);
    for (let i = 0; i < 14; i++) {
      const x0 = -PH.HL + i * 7.5;
      this.poly([[x0, -PH.HW, 0], [x0 + 7.5, -PH.HW, 0], [x0 + 7.5, PH.HW, 0], [x0, PH.HW, 0]], st.grass[i % 2]);
    }
    // Werbebanden
    const cols = ['#16a34a', '#0f172a', '#dc2626', '#1d4ed8', '#facc15', '#7c3aed'];
    for (let i = 0; i < 12; i++) {
      const x0 = -60 + i * 10;
      this.poly([[x0, -38, 0], [x0 + 10, -38, 0], [x0 + 10, -38, 1], [x0, -38, 1]], cols[i % cols.length]);
      const p = this.p(x0 + 5, -38, .5);
      if (p && p[2] > 4) {
        ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(p[2] * .6)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(i % 2 ? 'UFA 26' : 'ARCADE', p[0], p[1]);
      }
    }
    // Linien
    const z = .01; ctx.beginPath();
    const L = (a, b) => this.seg([a[0], a[1], z], [b[0], b[1], z]);
    const rect = (x0, y0, x1, y1) => { L([x0, y0], [x1, y0]); L([x1, y0], [x1, y1]); L([x1, y1], [x0, y1]); L([x0, y1], [x0, y0]); };
    const arc = (cx, cy, r, a0, a1, n = 28, cond) => {
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n, pt = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
        if (cond && !cond(pt)) { prev = null; continue; }
        if (prev) L(prev, pt); prev = pt;
      }
    };
    rect(-PH.HL, -PH.HW, PH.HL, PH.HW); L([0, -PH.HW], [0, PH.HW]);
    arc(0, 0, 9.15, 0, Math.PI * 2, 40);
    for (const s of [1, -1]) {
      rect(s * PH.HL, -PH.BOXW, s * (PH.HL - PH.BOXL), PH.BOXW);
      rect(s * PH.HL, -PH.SIXW, s * (PH.HL - PH.SIXL), PH.SIXW);
      arc(s * (PH.HL - PH.PEN), 0, 9.15, 0, Math.PI * 2, 40, pt => s * pt[0] < PH.HL - PH.BOXL);
      arc(s * (PH.HL - PH.PEN), 0, .2, 0, Math.PI * 2, 8);
      for (const t of [1, -1]) arc(s * PH.HL, t * PH.HW, 1, 0, Math.PI * 2, 16, pt => Math.abs(pt[0]) <= PH.HL && Math.abs(pt[1]) <= PH.HW);
    }
    arc(0, 0, .25, 0, Math.PI * 2, 8);
    const c = this.p(0, 0, 0); ctx.lineWidth = Math.max(1.2, (c ? c[2] : 15) * .12); ctx.strokeStyle = 'rgba(255,255,255,.88)'; ctx.stroke();
  },
  drawGoal(s) {
    const ctx = this.ctx, x0 = s * PH.HL, x1 = s * (PH.HL + 2), gw = PH.GW, gh = PH.GH;
    this.poly([[x0, -gw, gh], [x1, -gw, 1.9], [x1, gw, 1.9], [x0, gw, gh]], 'rgba(255,255,255,.12)');
    this.poly([[x1, -gw, 0], [x1, gw, 0], [x1, gw, 1.9], [x1, -gw, 1.9]], 'rgba(255,255,255,.14)');
    this.poly([[x0, -gw, 0], [x1, -gw, 0], [x1, -gw, 1.9], [x0, -gw, gh]], 'rgba(255,255,255,.1)');
    this.poly([[x0, gw, 0], [x1, gw, 0], [x1, gw, 1.9], [x0, gw, gh]], 'rgba(255,255,255,.1)');
    ctx.beginPath();
    for (let y = -gw; y <= gw + .01; y += .6) { this.seg([x0, y, gh], [x1, y, 1.9]); this.seg([x1, y, 1.9], [x1, y, 0]); }
    for (let z = 0; z <= 1.9; z += .5) { this.seg([x1, -gw, z], [x1, gw, z]); this.seg([x0, -gw, z * gh / 1.9], [x1, -gw, z]); this.seg([x0, gw, z * gh / 1.9], [x1, gw, z]); }
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
    const pp = this.p(x0, 0, 1); const lw = Math.max(2, (pp ? pp[2] : 10) * .14);
    ctx.beginPath(); this.seg([x0, -gw, 0], [x0, -gw, gh]); this.seg([x0, gw, 0], [x0, gw, gh]); this.seg([x0, -gw, gh], [x0, gw, gh]);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
  },
  drawCone(x, y) {
    const p = this.p(x, y, 0), q = this.p(x, y, .5); if (!p || !q) return;
    const ctx = this.ctx, w = p[2] * .25;
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(p[0] - w, p[1]); ctx.lineTo(p[0] + w, p[1]); ctx.lineTo(q[0], q[1]); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(p[0] - w * .5, p[1] - (p[1] - q[1]) * .55, w, (p[1] - q[1]) * .12);
  },
  shadow(x, y, rw, night) {
    const ctx = this.ctx;
    const offs = night ? [[-.5, -.4], [.5, -.4], [0, .5]] : [[.6, .35]];
    for (const o of offs) {
      const p = this.p(x + o[0] * rw, y + o[1] * rw, 0); if (!p) continue;
      ctx.fillStyle = night ? 'rgba(0,0,0,.16)' : 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(p[0], p[1], rw * p[2] * .9, rw * p[2] * .38, 0, 0, 6.29); ctx.fill();
    }
  },
  drawPlayer(d, t) {
    const p = this.p(d.x, d.y, 0); if (!p) return;
    if (p[0] < -60 || p[0] > this.W + 60 || p[1] < -20 || p[1] > this.H + 120) return;
    const ctx = this.ctx, s = p[2];
    const shirt = d.isGK ? d.gk : d.c1, sec = d.c2;
    ctx.save(); ctx.translate(p[0], p[1]);
    let flip = d.fx < 0 ? -1 : 1;
    if (d.dive) { ctx.translate(0, -s * .5 * Math.abs(Math.sin(d.dive))); ctx.rotate(d.dive); }
    if (d.slide) ctx.rotate(d.slide);
    const mv = Math.min(1, d.spd / 3), sw = Math.sin(d.phase) * .3 * s * mv * flip;
    const lw = Math.max(1.5, s * .15);
    ctx.lineCap = 'round';
    // Beine
    ctx.strokeStyle = sec; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(-.1 * s, -.85 * s); ctx.lineTo(-.1 * s + sw, -.05 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(.1 * s, -.85 * s); ctx.lineTo(.1 * s - sw, -.05 * s); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.fillRect(-.1 * s + sw - lw * .6, -.08 * s, lw * 1.2, lw * .7); ctx.fillRect(.1 * s - sw - lw * .6, -.08 * s, lw * 1.2, lw * .7);
    // Hose & Trikot
    ctx.fillStyle = d.isGK ? '#111' : sec; ctx.fillRect(-.24 * s, -1.02 * s, .48 * s, .26 * s);
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-.27 * s, -1.52 * s, .54 * s, .56 * s, .1 * s) : ctx.rect(-.27 * s, -1.52 * s, .54 * s, .56 * s); ctx.fill();
    ctx.fillStyle = sec; ctx.globalAlpha = .55; ctx.fillRect(-.27 * s, -1.52 * s, .54 * s, .07 * s); ctx.globalAlpha = 1;
    if (s > 9) {
      ctx.fillStyle = d.isGK ? '#111' : sec; ctx.font = `900 ${Math.round(s * .3)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.num, 0, -1.24 * s);
    }
    // Arme
    ctx.strokeStyle = shirt; ctx.lineWidth = lw * .85;
    const up = d.cele || d.dive ? 1 : 0;
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * .27 * s, -1.45 * s);
      if (up) ctx.lineTo(sd * .45 * s, -2.05 * s + Math.sin(t * 12 + sd) * .08 * s);
      else ctx.lineTo(sd * .36 * s - sw * sd * .5, -1.0 * s);
      ctx.stroke();
      if (d.isGK) { ctx.fillStyle = '#fef08a'; const hx = up ? sd * .45 * s : sd * .36 * s - sw * sd * .5, hy = up ? -2.05 * s : -1.0 * s; ctx.beginPath(); ctx.arc(hx, hy, lw * .7, 0, 6.29); ctx.fill(); }
    }
    // Kopf
    ctx.fillStyle = d.skin; ctx.beginPath(); ctx.arc(0, -1.7 * s, .15 * s, 0, 6.29); ctx.fill();
    ctx.fillStyle = d.hair; ctx.beginPath(); ctx.arc(0, -1.73 * s, .15 * s, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    if (d.card) { ctx.fillStyle = d.card; ctx.fillRect(.2 * s, -2.1 * s, .18 * s, .25 * s); }
    ctx.restore();
  },
  drawBall(b, t) {
    const ctx = this.ctx;
    const p = this.p(b.x, b.y, b.z + .11); if (!p) return;
    const r = Math.max(2.6, p[2] * .2);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.29); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#111';
    for (let i = 0; i < 3; i++) {
      const a = b.rot + i * 2.09; ctx.beginPath(); ctx.arc(p[0] + Math.cos(a) * r * .5, p[1] + Math.sin(a) * r * .5, r * .28, 0, 6.29); ctx.fill();
    }
  },
  glow(st) {
    if (!st.night) return;
    const ctx = this.ctx; ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const s of [1, -1]) {
      const b = this.p(s * 70, -62, 43); if (!b) continue;
      const rr = Math.max(60, b[2] * 30);
      const g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], rr);
      g.addColorStop(0, `rgba(${st.light},.55)`); g.addColorStop(.25, `rgba(${st.light},.15)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(b[0] - rr, b[1] - rr, rr * 2, rr * 2);
    }
    ctx.restore();
  },
  /* Szene zeichnen: view = {players:[drawables], ball, cones, sel} */
  scene(view, st, t, jump) {
    this.drawStadium(st, t, jump);
    this.drawPitch(st);
    if (view.cones) for (const c of view.cones) this.drawCone(c[0], c[1]);
    this.drawGoal(1); this.drawGoal(-1);
    for (const d of view.players) this.shadow(d.x, d.y, .45, st.night);
    if (view.ball) this.shadow(view.ball.x, view.ball.y, .22 + view.ball.z * .05, st.night);
    if (view.sel) this.marker(view.sel);
    const ents = view.players.map(d => ({ d, depth: this.cam(d.x, d.y, 0)[2] }));
    if (view.ball) ents.push({ ball: view.ball, depth: this.cam(view.ball.x, view.ball.y, 0)[2] - .05 });
    ents.sort((a, b) => b.depth - a.depth);
    for (const e of ents) e.ball ? this.drawBall(e.ball, t) : this.drawPlayer(e.d, t);
    this.glow(st);
  },
  marker(d) {
    const ctx = this.ctx, p = this.p(d.x, d.y, 0); if (!p) return;
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = Math.max(2, p[2] * .08);
    ctx.beginPath(); ctx.ellipse(p[0], p[1], p[2] * .7, p[2] * .3, 0, 0, 6.29); ctx.stroke();
    const h = this.p(d.x, d.y, 2.45); if (!h) return;
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(h[0] - 6, h[1] - 9); ctx.lineTo(h[0] + 6, h[1] - 9); ctx.lineTo(h[0], h[1]); ctx.fill();
    ctx.font = '700 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(d.label || '', h[0], h[1] - 11);
    ctx.fillStyle = '#fff'; ctx.fillText(d.label || '', h[0], h[1] - 11);
  },
  radar(players, ball, x0, y0, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,30,10,.55)'; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1;
    ctx.fillRect(x0, y0, w, h); ctx.strokeRect(x0, y0, w, h);
    ctx.beginPath(); ctx.moveTo(x0 + w / 2, y0); ctx.lineTo(x0 + w / 2, y0 + h); ctx.stroke();
    const mx = x => x0 + (x + PH.HL) / (PH.HL * 2) * w, my = y => y0 + (y + PH.HW) / (PH.HW * 2) * h;
    for (const d of players) {
      ctx.fillStyle = d.isGK ? d.gk : d.c1; ctx.beginPath(); ctx.arc(mx(d.x), my(d.y), d.sel ? 3.6 : 2.6, 0, 6.29); ctx.fill();
      ctx.strokeStyle = d.sel ? '#facc15' : 'rgba(0,0,0,.6)'; ctx.lineWidth = d.sel ? 1.5 : .7; ctx.stroke();
    }
    if (ball) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx(ball.x), my(ball.y), 2.2, 0, 6.29); ctx.fill(); }
  }
};
