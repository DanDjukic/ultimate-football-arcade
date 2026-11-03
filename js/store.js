'use strict';
/* ============ Speicherung (LocalStorage) ============ */
const SAVE_KEY = 'ufa26_save_v1';
const Store = {
  d: null,
  defaults() {
    return {
      v: 1, coins: 5000, xp: 200, nextUid: 1,
      collection: [], // {u, c, r(rank), t:{stat:+n}, x:[extra ps ids], p:[plus ps ids], n:time}
      lineup: { formation: '4-3-3', slots: Array(11).fill(null) },
      settings: { halfMin: 3, difficulty: 'normal', sound: true, voice: true, offside: true, autoSwitch: true, btnSize: 1, quality: 'hoch', teamName: 'Mein Ultimate FC', c1: '#22c55e', c2: '#0b1f12', gk: '#f97316' },
      tournament: null, tournamentHistory: [],
      stats: { drafts: 0, matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, best: 0, has121: false, has115: false, pens: 0, rankups: 0, tourPlayed: 0, tourWon: 0 },
      claimed: [], market: null
    };
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const def = this.defaults(); const d = JSON.parse(raw);
        this.d = Object.assign(def, d);
        this.d.settings = Object.assign(def.settings, d.settings || {});
        this.d.stats = Object.assign(def.stats, d.stats || {});
        this.d.collection = this.d.collection.filter(i => CARD_BY_ID[i.c]);
      }
    } catch (e) { console.warn('Laden fehlgeschlagen', e); }
    if (!this.d) { this.d = this.defaults(); this.starterPack(); this.save(); }
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.d)); }
    catch (e) { if (window.UI) UI.toast('⚠️ Speicher voll – bitte Karten verwerten/verkaufen.'); }
  },
  reset() { localStorage.removeItem(SAVE_KEY); this.d = null; this.load(); },
  starterPack() {
    // Startelf aus Gold-/Selten-Karten passend zur Formation
    const slots = FORMATIONS['4-3-3'];
    const rnd = mulberry32(Date.now() & 0xffff), used = new Set();
    slots.forEach((s, i) => {
      const cand = POOL.filter(c => c.pos === s.pos && c.ges >= 70 && c.ges <= 80 && !used.has(c.id));
      const c = cand[Math.floor(rnd() * cand.length)] || POOL[0];
      used.add(c.id);
      const inst = this.addCard(c.id, true);
      this.d.lineup.slots[i] = inst.u;
    });
  },
  addCard(cardId, silent) {
    const inst = { u: this.d.nextUid++, c: cardId, r: 0, t: {}, x: [], p: [], n: Date.now() };
    this.d.collection.push(inst);
    const c = CARD_BY_ID[cardId];
    if (!silent) {
      this.d.stats.drafts += 0;
      if (c.ges > this.d.stats.best) this.d.stats.best = c.ges;
      if (c.ges >= 115) this.d.stats.has115 = true;
      if (c.ges >= 121) this.d.stats.has121 = true;
    }
    return inst;
  },
  inst(uid) { return this.d.collection.find(i => i.u === uid); },
  removeInst(uid) {
    this.d.collection = this.d.collection.filter(i => i.u !== uid);
    const sl = this.d.lineup.slots; for (let i = 0; i < sl.length; i++) if (sl[i] === uid) sl[i] = null;
  },
  dupCount(cardId) { return this.d.collection.filter(i => i.c === cardId).length; }
};

/* Effektive Kartenwerte inkl. Rang & Training */
const RANK_BONUS = 2, MAX_RANK = 5, MAX_TRAIN = 15;
function effCard(inst) {
  const base = CARD_BY_ID[inst.c];
  const stats = {};
  for (const k in base.stats) stats[k] = clamp(base.stats[k] + inst.r * RANK_BONUS + ((inst.t && inst.t[k]) || 0), 1, MAX_GES);
  const ps = base.ps.map(p => ({ id: p.id, plus: p.plus || (inst.p || []).includes(p.id) }));
  for (const x of (inst.x || [])) if (!ps.find(p => p.id === x)) ps.push({ id: x, plus: (inst.p || []).includes(x) });
  return Object.assign({}, base, { stats, ges: calcGES(base.pos, stats), baseGes: base.ges, ps, inst });
}
function trainCount(inst) { let s = 0; for (const k in (inst.t || {})) s += inst.t[k]; return s; }
