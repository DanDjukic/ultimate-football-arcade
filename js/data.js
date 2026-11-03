'use strict';
/* ============================================================
   ULTIMATE FOOTBALL ARCADE 26 – Daten: Spieler, Karten, Teams,
   PlayStyles, Formationen, Drafts (alles fiktiv)
   ============================================================ */

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Echte Zufallszahlen (kryptografisch) für Drafts & Packs
function secureRandom() {
  const c = (typeof globalThis !== 'undefined') ? globalThis.crypto : null;
  if (c && c.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 4294967296; }
  return Math.random();
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const MAX_GES = 125;

const FIELD_STATS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
const GK_STATS = ['ref', 'div', 'pos', 'han', 'kic'];
const STAT_LABEL = { pac: 'PAC', sho: 'SHO', pas: 'PAS', dri: 'DRI', def: 'DEF', phy: 'PHY', ref: 'REF', div: 'HEC', pos: 'STE', han: 'FAN', kic: 'ABS' };
const STAT_NAME = { pac: 'Tempo', sho: 'Schuss', pas: 'Pass', dri: 'Dribbling', def: 'Verteidigung', phy: 'Physis', ref: 'Reflexe', div: 'Hechten', pos: 'Stellungsspiel', han: 'Fangsicherheit', kic: 'Abschläge' };

const POS_WEIGHTS = {
  ST: { sho: .42, pac: .2, dri: .18, phy: .12, pas: .08 },
  LW: { pac: .3, dri: .32, sho: .2, pas: .18 },
  RW: { pac: .3, dri: .32, sho: .2, pas: .18 },
  LM: { pac: .28, dri: .27, pas: .27, sho: .1, phy: .08 },
  RM: { pac: .28, dri: .27, pas: .27, sho: .1, phy: .08 },
  CAM: { pas: .34, dri: .32, sho: .22, pac: .12 },
  CM: { pas: .35, dri: .2, def: .15, phy: .15, sho: .15 },
  CDM: { def: .36, pas: .24, phy: .26, dri: .14 },
  LB: { pac: .28, def: .36, pas: .16, phy: .2 },
  RB: { pac: .28, def: .36, pas: .16, phy: .2 },
  CB: { def: .52, phy: .3, pac: .1, pas: .08 },
  GK: { ref: .3, div: .25, pos: .25, han: .15, kic: .05 }
};
// Profil-Abweichungen für die Generierung
const POS_PROFILE = {
  ST: { pac: 2, sho: 5, pas: -8, dri: 1, def: -45, phy: 0 },
  LW: { pac: 5, sho: -2, pas: -3, dri: 4, def: -45, phy: -12 },
  RW: { pac: 5, sho: -2, pas: -3, dri: 4, def: -45, phy: -12 },
  LM: { pac: 4, sho: -8, pas: 1, dri: 2, def: -30, phy: -8 },
  RM: { pac: 4, sho: -8, pas: 1, dri: 2, def: -30, phy: -8 },
  CAM: { pac: -2, sho: 0, pas: 4, dri: 4, def: -35, phy: -10 },
  CM: { pac: -6, sho: -4, pas: 4, dri: 1, def: -8, phy: -2 },
  CDM: { pac: -10, sho: -18, pas: 0, dri: -5, def: 3, phy: 3 },
  LB: { pac: 3, sho: -30, pas: -4, dri: -6, def: 1, phy: -2 },
  RB: { pac: 3, sho: -30, pas: -4, dri: -6, def: 1, phy: -2 },
  CB: { pac: -12, sho: -40, pas: -12, dri: -20, def: 3, phy: 2 },
  GK: { ref: 2, div: 1, pos: 0, han: -2, kic: -8 }
};
const POSITIONS = Object.keys(POS_WEIGHTS);
const POS_GROUP = { GK: 'TW', CB: 'ABW', LB: 'ABW', RB: 'ABW', CDM: 'MIT', CM: 'MIT', CAM: 'MIT', LM: 'MIT', RM: 'MIT', LW: 'STU', RW: 'STU', ST: 'STU' };
const POS_COMPAT = {
  GK: ['GK'], CB: ['CB', 'CDM'], LB: ['LB', 'LM'], RB: ['RB', 'RM'], CDM: ['CDM', 'CM', 'CB'], CM: ['CM', 'CDM', 'CAM'],
  CAM: ['CAM', 'CM', 'ST'], LM: ['LM', 'LW', 'LB'], RM: ['RM', 'RW', 'RB'], LW: ['LW', 'LM', 'ST'], RW: ['RW', 'RM', 'ST'], ST: ['ST', 'CAM', 'LW', 'RW']
};
// Passung Karte -> Slot: 1 = perfekt, 0.95 = passend, 0.85 = falsche Position, 0.5 = TW/Feld vertauscht
function posFit(cardPos, slotPos) {
  if (cardPos === slotPos) return 1;
  if ((cardPos === 'GK') !== (slotPos === 'GK')) return 0.5;
  if ((POS_COMPAT[slotPos] || []).includes(cardPos)) return 0.95;
  return 0.85;
}

function calcGES(pos, stats) {
  const w = POS_WEIGHTS[pos]; let s = 0;
  for (const k in w) s += w[k] * (stats[k] || 0);
  return clamp(Math.round(s), 1, MAX_GES);
}

/* ---------------- Nationen (eigene Flaggengrafiken) ---------------- */
const NATIONS = [
  { id: 'DE', n: 'Deutschland', t: 'h', c: ['#111', '#dd0000', '#ffce00'] },
  { id: 'FR', n: 'Frankreich', t: 'v', c: ['#0055a4', '#fff', '#ef4135'] },
  { id: 'IT', n: 'Italien', t: 'v', c: ['#009246', '#fff', '#ce2b37'] },
  { id: 'ES', n: 'Spanien', t: 'h', c: ['#aa151b', '#f1bf00', '#aa151b'] },
  { id: 'NL', n: 'Niederlande', t: 'h', c: ['#ae1c28', '#fff', '#21468b'] },
  { id: 'BE', n: 'Belgien', t: 'v', c: ['#111', '#fdda24', '#ef3340'] },
  { id: 'AT', n: 'Österreich', t: 'h', c: ['#ed2939', '#fff', '#ed2939'] },
  { id: 'BR', n: 'Brasilien', t: 'd', c: ['#009c3b', '#ffdf00', '#002776'] },
  { id: 'AR', n: 'Argentinien', t: 'h', c: ['#74acdf', '#fff', '#74acdf'] },
  { id: 'PT', n: 'Portugal', t: 'v', c: ['#006600', '#ff0000', '#ff0000'] },
  { id: 'EN', n: 'England', t: 'x', c: ['#fff', '#ce1124'] },
  { id: 'HR', n: 'Kroatien', t: 'h', c: ['#ff0000', '#fff', '#171796'] },
  { id: 'NG', n: 'Nigeria', t: 'v', c: ['#008751', '#fff', '#008751'] },
  { id: 'JP', n: 'Japan', t: 'o', c: ['#fff', '#bc002d'] },
  { id: 'SN', n: 'Senegal', t: 'v', c: ['#00853f', '#fdef42', '#e31b23'] },
  { id: 'CO', n: 'Kolumbien', t: 'h', c: ['#fcd116', '#003893', '#ce1126'] },
  { id: 'IE', n: 'Irland', t: 'v', c: ['#169b62', '#fff', '#ff883e'] },
  { id: 'PL', n: 'Polen', t: 'h', c: ['#fff', '#fff', '#dc143c'] },
  { id: 'SE', n: 'Schweden', t: 'n', c: ['#006aa7', '#fecc00'] },
  { id: 'DK', n: 'Dänemark', t: 'n', c: ['#c8102e', '#fff'] },
  { id: 'CH', n: 'Schweiz', t: 'x', c: ['#d52b1e', '#fff'] },
  { id: 'GH', n: 'Ghana', t: 'h', c: ['#ce1126', '#fcd116', '#006b3f'] },
  { id: 'CI', n: 'Elfenbeinküste', t: 'v', c: ['#f77f00', '#fff', '#009e60'] },
  { id: 'KR', n: 'Südkorea', t: 'o', c: ['#fff', '#cd2e3a'] },
  { id: 'MX', n: 'Mexiko', t: 'v', c: ['#006847', '#fff', '#ce1126'] },
  { id: 'UY', n: 'Uruguay', t: 'h', c: ['#fff', '#0038a8', '#fff'] }
];
const NATION_BY_ID = Object.fromEntries(NATIONS.map(n => [n.id, n]));
function flagSVG(id, w = 24, h = 16) {
  const f = NATION_BY_ID[id]; if (!f) return '';
  const c = f.c; let inner = '';
  if (f.t === 'h') inner = `<rect width="30" height="7" fill="${c[0]}"/><rect y="7" width="30" height="6" fill="${c[1]}"/><rect y="13" width="30" height="7" fill="${c[2]}"/>`;
  else if (f.t === 'v') inner = `<rect width="10" height="20" fill="${c[0]}"/><rect x="10" width="10" height="20" fill="${c[1]}"/><rect x="20" width="10" height="20" fill="${c[2]}"/>`;
  else if (f.t === 'x') inner = `<rect width="30" height="20" fill="${c[0]}"/><rect x="12" width="6" height="20" fill="${c[1]}"/><rect y="7" width="30" height="6" fill="${c[1]}"/>`;
  else if (f.t === 'n') inner = `<rect width="30" height="20" fill="${c[0]}"/><rect x="8" width="5" height="20" fill="${c[1]}"/><rect y="7.5" width="30" height="5" fill="${c[1]}"/>`;
  else if (f.t === 'o') inner = `<rect width="30" height="20" fill="${c[0]}"/><circle cx="15" cy="10" r="6" fill="${c[1]}"/>`;
  else if (f.t === 'd') inner = `<rect width="30" height="20" fill="${c[0]}"/><path d="M15 2 L28 10 L15 18 L2 10Z" fill="${c[1]}"/><circle cx="15" cy="10" r="4.5" fill="${c[2]}"/>`;
  return `<svg class="flag" viewBox="0 0 30 20" width="${w}" height="${h}"><title>${f.n}</title>${inner}</svg>`;
}

/* ---------------- Vereine (fiktiv) ---------------- */
const CLUBS = [
  { id: 'NHW', name: 'Nordhafen Wölfe', c1: '#1d4ed8', c2: '#ffffff', gk: '#facc15', ovr: 84 },
  { id: 'RSR', name: 'Rotstadt Raketen', c1: '#dc2626', c2: '#111827', gk: '#22c55e', ovr: 88 },
  { id: 'BFC', name: 'Blaustein FC', c1: '#38bdf8', c2: '#0c4a6e', gk: '#f97316', ovr: 80 },
  { id: 'ASO', name: 'Atlético Sonnental', c1: '#f59e0b', c2: '#7c2d12', gk: '#3b82f6', ovr: 92 },
  { id: 'EBU', name: 'Eisenberg United', c1: '#4b5563', c2: '#fde047', gk: '#ec4899', ovr: 86 },
  { id: 'RCD', name: 'Real Costa Dorada', c1: '#f8fafc', c2: '#d4a017', gk: '#16a34a', ovr: 95 },
  { id: 'SPL', name: 'Sporting Lumen', c1: '#16a34a', c2: '#f0fdf4', gk: '#a855f7', ovr: 82 },
  { id: 'OKR', name: 'Olympia Kristall', c1: '#7c3aed', c2: '#e9d5ff', gk: '#f43f5e', ovr: 90 },
  { id: 'GAL', name: 'Galaxy Allstars', c1: '#0f172a', c2: '#22d3ee', gk: '#f97316', ovr: 112, boss: true }
];
const LEGENDS_CLUB = { id: 'LEG', name: 'Legenden', c1: '#e7d7a8', c2: '#6b4f12', gk: '#111', ovr: 110 };
const CLUB_BY_ID = Object.fromEntries([...CLUBS, LEGENDS_CLUB].map(c => [c.id, c]));
function clubShort(c) { return c.short || c.id; }
function badgeSVG(club, size = 22) {
  if (!club) return '';
  const ini = (club.short || club.id).slice(0, 3);
  return `<svg class="badge" viewBox="0 0 40 46" width="${size}" height="${size * 1.15}"><title>${club.name}</title>
  <path d="M20 1 L38 7 V22 C38 34 29 41 20 45 C11 41 2 34 2 22 V7 Z" fill="${club.c1}" stroke="${club.c2}" stroke-width="3"/>
  <path d="M2 22 H38" stroke="${club.c2}" stroke-width="2" opacity=".5"/>
  <text x="20" y="28" text-anchor="middle" font-size="12" font-weight="900" font-family="Arial" fill="${club.c2}" stroke="${club.c1}" stroke-width=".5">${ini}</text></svg>`;
}

/* ---------------- Seltenheiten ---------------- */
const RARITIES = {
  basis: { n: 'Basis', order: 1 },
  selten: { n: 'Selten', order: 2 },
  gold: { n: 'Gold', order: 3 },
  elite: { n: 'Elite', order: 4 },
  hero: { n: 'Hero', order: 5 },
  icon: { n: 'Icon', order: 6 },
  tots: { n: 'Team of the Season', order: 7 },
  toty: { n: 'Team of the Year', order: 8 },
  animiert: { n: 'Animierte Spezialkarte', order: 9 },
  event: { n: 'Limitierte Event-Karte', order: 10 }
};
const EVENT_SERIES = ['Winterzauber', 'Champions-Nacht', 'Sommerhitze', 'Halloween-Spuk', 'Futur-Stars', 'Frühlingssturm'];

/* ---------------- PlayStyles ---------------- */
const PLAYSTYLES = {
  precision_shot: { n: 'Präzisionsschuss', i: '🎯', cat: 'Angriff', d: 'Höhere Schussgenauigkeit.' },
  power_shot: { n: 'Power-Schuss', i: '💥', cat: 'Angriff', d: 'Besonders kräftige, schnelle Schüsse.' },
  finesse: { n: 'Finesse', i: '🌀', cat: 'Angriff', d: 'Effet-/Kurvenschüsse bei dosierter Schusskraft, genauer.' },
  header: { n: 'Kopfballstärke', i: '🔝', cat: 'Angriff', d: 'Größere Reichweite und präzisere Kopfbälle.' },
  quick_step: { n: 'Schneller Antritt', i: '⚡', cat: 'Angriff', d: 'Schnellere Beschleunigung.' },
  dribbler: { n: 'Dribbelkünstler', i: '✨', cat: 'Angriff', d: 'Engere Ballführung, weniger Tempoverlust mit Ball.' },
  technician: { n: 'Techniker', i: '🧲', cat: 'Angriff', d: 'Bessere Ballannahme auch bei scharfen Bällen.' },
  one_on_one: { n: 'Eins-gegen-eins', i: '🥊', cat: 'Angriff', d: 'Gewinnt öfter Dribbelduelle gegen Verteidiger.' },
  precision_pass: { n: 'Präzisionspass', i: '📐', cat: 'Passen', d: 'Genauere Pässe.' },
  through_pass: { n: 'Steilpass-Spezialist', i: '🏹', cat: 'Passen', d: 'Steilpässe genauer und besser getimt.' },
  crosser: { n: 'Flankengeber', i: '🌈', cat: 'Passen', d: 'Genauere Flanken.' },
  outside_foot: { n: 'Außenristpass', i: '👟', cat: 'Passen', d: 'Schärfere Pässe mit Effet, schwerer abzufangen.' },
  playmaker: { n: 'Spielmacher', i: '🧠', cat: 'Passen', d: 'Offensive Pässe schwerer abzufangen, Mitspieler starten früher.' },
  interceptor: { n: 'Abfangjäger', i: '✋', cat: 'Verteidigung', d: 'Größerer Radius beim Abfangen von Pässen.' },
  slide_tackle: { n: 'Grätschen-Spezialist', i: '🦵', cat: 'Verteidigung', d: 'Größere Reichweite und Erfolgsquote bei Tacklings.' },
  duel: { n: 'Zweikampfstärke', i: '💪', cat: 'Verteidigung', d: 'Bessere Ergebnisse in Duellen.' },
  positioning: { n: 'Stellungsspiel', i: '📍', cat: 'Verteidigung', d: 'Intelligentere defensive Positionierung.' },
  aerial: { n: 'Luftabwehr', i: '🦅', cat: 'Verteidigung', d: 'Gewinnt öfter Kopfballduelle in der Abwehr.' },
  reflexes: { n: 'Reflexmonster', i: '👀', cat: 'Torwart', d: 'Schnellere Reaktion auf Schüsse.' },
  gk_1v1: { n: 'Eins-gegen-eins-Keeper', i: '🧤', cat: 'Torwart', d: 'Besser in direkten Duellen, kommt mutiger raus.' },
  cross_catcher: { n: 'Flankenfänger', i: '🙌', cat: 'Torwart', d: 'Fängt hohe Bälle sicherer und aus größerem Radius.' },
  gk_kick: { n: 'Abschlag-Spezialist', i: '🚀', cat: 'Torwart', d: 'Genauere und weitere Abwürfe/Abschläge.' }
};
const PS_PLUS_FACTOR = 1.7;
const PS_BY_POS = {
  ST: ['precision_shot', 'power_shot', 'finesse', 'header', 'quick_step', 'one_on_one', 'technician', 'dribbler'],
  LW: ['finesse', 'quick_step', 'dribbler', 'one_on_one', 'technician', 'crosser', 'precision_shot', 'outside_foot'],
  RW: ['finesse', 'quick_step', 'dribbler', 'one_on_one', 'technician', 'crosser', 'precision_shot', 'outside_foot'],
  LM: ['crosser', 'quick_step', 'dribbler', 'precision_pass', 'technician', 'through_pass', 'finesse'],
  RM: ['crosser', 'quick_step', 'dribbler', 'precision_pass', 'technician', 'through_pass', 'finesse'],
  CAM: ['playmaker', 'through_pass', 'precision_pass', 'finesse', 'technician', 'dribbler', 'outside_foot', 'power_shot'],
  CM: ['precision_pass', 'playmaker', 'through_pass', 'outside_foot', 'technician', 'interceptor', 'power_shot'],
  CDM: ['interceptor', 'duel', 'slide_tackle', 'positioning', 'precision_pass', 'aerial'],
  LB: ['crosser', 'quick_step', 'interceptor', 'slide_tackle', 'duel', 'positioning'],
  RB: ['crosser', 'quick_step', 'interceptor', 'slide_tackle', 'duel', 'positioning'],
  CB: ['aerial', 'duel', 'slide_tackle', 'interceptor', 'positioning', 'header'],
  GK: ['reflexes', 'gk_1v1', 'cross_catcher', 'gk_kick']
};

/* ---------------- Formationen ---------------- */
// fx: 0 = eigenes Tor, 1 = gegnerisches Tor; fy: -1 links, +1 rechts (aus Sicht Angriffsrichtung)
const FORMATIONS = {
  '4-3-3': [
    { pos: 'GK', fx: 0, fy: 0 }, { pos: 'LB', fx: .2, fy: -.75 }, { pos: 'CB', fx: .16, fy: -.27 }, { pos: 'CB', fx: .16, fy: .27 }, { pos: 'RB', fx: .2, fy: .75 },
    { pos: 'CM', fx: .43, fy: -.42 }, { pos: 'CDM', fx: .35, fy: 0 }, { pos: 'CM', fx: .43, fy: .42 },
    { pos: 'LW', fx: .7, fy: -.72 }, { pos: 'ST', fx: .78, fy: 0 }, { pos: 'RW', fx: .7, fy: .72 }],
  '4-2-3-1': [
    { pos: 'GK', fx: 0, fy: 0 }, { pos: 'LB', fx: .2, fy: -.75 }, { pos: 'CB', fx: .16, fy: -.27 }, { pos: 'CB', fx: .16, fy: .27 }, { pos: 'RB', fx: .2, fy: .75 },
    { pos: 'CDM', fx: .34, fy: -.25 }, { pos: 'CDM', fx: .34, fy: .25 },
    { pos: 'LM', fx: .58, fy: -.72 }, { pos: 'CAM', fx: .57, fy: 0 }, { pos: 'RM', fx: .58, fy: .72 }, { pos: 'ST', fx: .8, fy: 0 }],
  '4-4-2': [
    { pos: 'GK', fx: 0, fy: 0 }, { pos: 'LB', fx: .2, fy: -.75 }, { pos: 'CB', fx: .16, fy: -.27 }, { pos: 'CB', fx: .16, fy: .27 }, { pos: 'RB', fx: .2, fy: .75 },
    { pos: 'LM', fx: .48, fy: -.75 }, { pos: 'CM', fx: .41, fy: -.22 }, { pos: 'CM', fx: .41, fy: .22 }, { pos: 'RM', fx: .48, fy: .75 },
    { pos: 'ST', fx: .77, fy: -.2 }, { pos: 'ST', fx: .77, fy: .2 }]
};

/* ---------------- Namen (frei erfunden) ---------------- */
const FIRST = ['Luca', 'Mateo', 'Jonas', 'Kenji', 'Amadou', 'Rafael', 'Elias', 'Noah', 'Tiago', 'Leon', 'Milan', 'Kofi', 'Yuki', 'Sander', 'Bruno', 'Oskar', 'Emil', 'Dario', 'Ivan', 'Sami', 'Theo', 'Marco', 'Nico', 'Adrian', 'Malik', 'Enzo', 'Lars', 'Felix', 'Hugo', 'Joel', 'Pablo', 'Diego', 'Andrés', 'Kai', 'Ayo', 'Femi', 'Jules', 'Matteo', 'Aron', 'Timo', 'Rui', 'Joaquín', 'Taro', 'Moussa', 'Lennart', 'Vito', 'Bastian', 'Ilias', 'Caio', 'Hiro', 'Yannick', 'Sven', 'Mats', 'Olu', 'Ricardo', 'Tomás', 'Jarno', 'Lio', 'Benji', 'Davi'];
const LAST = ['Aldenhoven', 'Barrosa', 'Castellin', 'Dravic', 'Eberwein', 'Fontanel', 'Gorvalo', 'Halvorsund', 'Ibarreta', 'Jankowik', 'Kaltenbach', 'Lindqvar', 'Moretto', 'Nakamaru', 'Okafeme', 'Pellegrin', 'Quaresmo', 'Rautenberg', 'Santorell', 'Tavernol', 'Ulrichsen', 'Valdemar', 'Wendlinger', 'Xandros', 'Yamazato', 'Zelinsky', 'Abelardo', 'Brightwater', 'Corvino', 'Delamarre', 'Esterhaus', 'Ferrolux', 'Grünwald', 'Hartwigsen', 'Iturbe', 'Jovanek', 'Kessmann', 'Lombardo', 'Mbaye-Sol', 'Nordström', 'Oyelaran', 'Picotti', 'Rinaldo', 'Sorensby', 'Toussaint', 'Uzokwe', 'Vercelli', 'Wolfram', 'Yilmazer', 'Zambrano', 'Achterberg', 'Belmonte', 'Cissokho', 'Dunmore', 'Escalona', 'Falkner', 'Gallardi', 'Holtkamp', 'Isaksen', 'Kovalen', 'Laroque', 'Montaño', 'Nwosuike', 'Ortolani', 'Prestwick', 'Rosenthal', 'Silvado', 'Takeda', 'Vasquell', 'Weissdorn'];

/* ---------------- Kartengenerierung ---------------- */
function genStats(pos, target, rnd) {
  const prof = POS_PROFILE[pos];
  const keys = pos === 'GK' ? GK_STATS : FIELD_STATS;
  const st = {};
  for (const k of keys) st[k] = clamp(Math.round(target + prof[k] + (rnd() * 10 - 5)), 20, MAX_GES);
  const w = POS_WEIGHTS[pos];
  let g = calcGES(pos, st), guard = 0;
  const wk = Object.keys(w);
  while (Math.abs(g - target) > 1 && guard++ < 200) {
    const d = g < target ? 1 : -1;
    for (const k in w) st[k] = clamp(st[k] + d, 20, MAX_GES);
    g = calcGES(pos, st);
  }
  guard = 0;
  while (g !== target && guard++ < 300) {
    const k = wk[guard % wk.length];
    st[k] = clamp(st[k] + (g < target ? 1 : -1), 20, MAX_GES);
    g = calcGES(pos, st);
  }
  if (pos === 'GK') { st.pac = clamp(Math.round(target * .55 + rnd() * 10), 30, 99); st.pas = st.kic; }
  return st;
}
function pickWeighted(list, rnd) {
  let tot = 0; for (const it of list) tot += it[1];
  let r = rnd() * tot;
  for (const it of list) { r -= it[1]; if (r <= 0) return it[0]; }
  return list[list.length - 1][0];
}
function genPlayStyles(pos, rarity, ges, rnd) {
  const cand = PS_BY_POS[pos].slice();
  let n = ges < 65 ? (rnd() < .5 ? 1 : 0) : ges < 80 ? 1 + (rnd() < .4 ? 1 : 0) : ges < 95 ? 2 : ges < 110 ? 3 : 4;
  let plus = ges < 85 ? 0 : ges < 100 ? (rnd() < .5 ? 1 : 0) : ges < 112 ? 1 : 2;
  if (rarity === 'icon' || rarity === 'toty') plus++;
  const res = [];
  for (let i = 0; i < n && cand.length; i++) {
    const j = Math.floor(rnd() * cand.length);
    res.push({ id: cand.splice(j, 1)[0], plus: false });
  }
  for (let i = 0; i < Math.min(plus, res.length); i++) res[i].plus = true;
  return res;
}
const POS_WEIGHT_LIST = [['GK', 10], ['CB', 17], ['LB', 7], ['RB', 7], ['CDM', 8], ['CM', 14], ['CAM', 8], ['LM', 4], ['RM', 4], ['LW', 6], ['RW', 6], ['ST', 14]];
function rarityForGES(ges, rnd) {
  if (ges < 58) return 'basis';
  if (ges < 65) return rnd() < .3 ? 'selten' : 'basis';
  if (ges < 70) return 'selten';
  if (ges < 75) return rnd() < .3 ? 'gold' : 'selten';
  if (ges < 85) return 'gold';
  if (ges < 95) return rnd() < .25 ? 'gold' : 'elite';
  if (ges < 105) return pickWeighted([['elite', 40], ['hero', 20], ['tots', 20], ['animiert', 20]], rnd);
  if (ges < 110) return pickWeighted([['tots', 50], ['hero', 25], ['animiert', 25]], rnd);
  if (ges < 115) return pickWeighted([['tots', 40], ['hero', 15], ['animiert', 20], ['toty', 25]], rnd);
  return pickWeighted([['toty', 50], ['tots', 25], ['animiert', 25]], rnd);
}
function makeCard(id, opts, rnd) {
  const pos = opts.pos || pickWeighted(POS_WEIGHT_LIST, rnd);
  const stats = genStats(pos, opts.ges, rnd);
  const ges = calcGES(pos, stats);
  const rarity = opts.rarity || rarityForGES(ges, rnd);
  const nat = NATIONS[Math.floor(rnd() * NATIONS.length)].id;
  const club = opts.club || (rarity === 'icon' ? 'LEG' : CLUBS[Math.floor(rnd() * 8)].id);
  const name = FIRST[Math.floor(rnd() * FIRST.length)] + ' ' + LAST[Math.floor(rnd() * LAST.length)];
  const num = pos === 'GK' ? (rnd() < .7 ? 1 : 12 + Math.floor(rnd() * 20)) : 2 + Math.floor(rnd() * 98) % 98;
  return {
    id, name, pos, nat, club, num, rarity, ges, stats,
    ps: genPlayStyles(pos, rarity, ges, rnd),
    series: rarity === 'event' ? EVENT_SERIES[Math.floor(rnd() * EVENT_SERIES.length)] : null,
    look: Math.floor(rnd() * 1e9)
  };
}

// Deterministischer Kartenpool (stabile Karten-IDs über Neuladen hinweg)
const POOL = [];
const CARD_BY_ID = {};
(function buildPool() {
  const rnd = mulberry32(260026);
  let n = 1;
  const add = (opts) => {
    const id = 'UFA-' + String(n++).padStart(4, '0');
    const c = makeCard(id, opts, rnd); POOL.push(c); CARD_BY_ID[id] = c;
  };
  for (let g = 45; g <= 122; g++) for (let i = 0; i < 8; i++) add({ ges: g });
  for (let g = 90; g <= 122; g++) {
    add({ ges: g, rarity: 'icon' }); add({ ges: g, rarity: 'icon' });
    add({ ges: g, rarity: 'hero' });
    add({ ges: g, rarity: 'event' }); add({ ges: g, rarity: 'event' });
    add({ ges: g, rarity: 'animiert' });
  }
})();

// Vereinskader (CPU-Teams), ebenfalls deterministisch
const CLUB_SQUADS = {};
(function buildSquads() {
  CLUBS.forEach((club, ci) => {
    const rnd = mulberry32(9100 + ci * 77);
    const slots = FORMATIONS['4-3-3'];
    CLUB_SQUADS[club.id] = slots.map((s, i) => {
      const ges = clamp(club.ovr + Math.round(rnd() * 8 - 4) + (i === 9 ? 2 : 0), 40, 122);
      const c = makeCard(`${club.id}-${i + 1}`, { ges, pos: s.pos, club: club.id }, rnd);
      c.num = [1, 3, 4, 5, 2, 8, 6, 10, 11, 9, 7][i];
      CARD_BY_ID[c.id] = c;
      return c;
    });
  });
})();

function genericCard(pos, ges, idx) {
  const id = `SUB-${pos}-${ges}-${idx}`;
  if (CARD_BY_ID[id]) return CARD_BY_ID[id];
  const c = makeCard(id, { pos, ges, rarity: 'basis', club: 'NHW' }, mulberry32(ges * 31 + idx));
  c.name = 'Ersatzspieler ' + (idx + 1); c.generic = true; c.num = 12 + idx;
  CARD_BY_ID[id] = c; return c;
}

/* ---------------- Drafts ---------------- */
const BANDS_STANDARD = [{ p: 60, min: 80, max: 99 }, { p: 25, min: 100, max: 109 }, { p: 12, min: 110, max: 115 }, { p: 2.5, min: 116, max: 120 }, { p: 0.5, min: 121, max: 122 }];
const DRAFTS = [
  { id: 'standard', n: 'Standard-Draft', d: 'Zufällige Spieler aus allen Bewertungsstufen.', bands: BANDS_STANDARD },
  { id: 'premium', n: 'Premium-Draft', d: 'Höhere Chancen auf starke Spieler.', bands: [{ p: 35, min: 80, max: 99 }, { p: 35, min: 100, max: 109 }, { p: 22, min: 110, max: 115 }, { p: 6, min: 116, max: 120 }, { p: 2, min: 121, max: 122 }] },
  { id: 'elite', n: 'Elite-Draft', d: 'Besonders starke und seltene Karten.', bands: [{ p: 30, min: 100, max: 109 }, { p: 45, min: 110, max: 115 }, { p: 18, min: 116, max: 120 }, { p: 7, min: 121, max: 122 }] },
  { id: 'legend', n: 'Legenden-Draft', d: 'Nur Icon- und Hero-Legenden.', filter: ['icon', 'hero'], bands: [{ p: 40, min: 90, max: 109 }, { p: 40, min: 110, max: 115 }, { p: 15, min: 116, max: 120 }, { p: 5, min: 121, max: 122 }] },
  { id: 'event', n: 'Event-Draft', d: 'Limitierte Event- und animierte Spezialkarten.', filter: ['event', 'animiert'], bands: [{ p: 50, min: 90, max: 109 }, { p: 35, min: 110, max: 115 }, { p: 12, min: 116, max: 120 }, { p: 3, min: 121, max: 122 }] },
  { id: 'g122', n: '122-GES-Draft', d: 'Spezial-Draft: Top-Spieler bis GES 122.', bands: [{ p: 40, min: 105, max: 114 }, { p: 35, min: 115, max: 118 }, { p: 17, min: 119, max: 120 }, { p: 8, min: 121, max: 122 }] },
  { id: 'choice', n: 'Auswahl-Draft', d: '5 zufällige Spieler – du wählst einen. Jede Karte nach Premium-Chancen.', choice: 5, bandsFrom: 'premium' }
];
const DRAFT_BY_ID = Object.fromEntries(DRAFTS.map(d => [d.id, d]));
DRAFT_BY_ID.choice.bands = DRAFT_BY_ID.premium.bands;

function drawFromBands(bands, filter, rnd = secureRandom) {
  let r = rnd() * 100, band = bands[bands.length - 1];
  for (const b of bands) { if (r < b.p) { band = b; break; } r -= b.p; }
  let cand = POOL.filter(c => c.ges >= band.min && c.ges <= band.max && (!filter || filter.includes(c.rarity)));
  if (!cand.length) cand = POOL.filter(c => c.ges >= band.min && c.ges <= band.max);
  return cand[Math.floor(rnd() * cand.length)];
}
function drawDraft(draftId) {
  const d = DRAFT_BY_ID[draftId];
  const n = d.choice || 1, res = [];
  for (let i = 0; i < n; i++) res.push(drawFromBands(d.bands, d.filter));
  return res;
}

/* ---------------- Packs (optional, virtuelle Münzen) ---------------- */
const PACKS = [
  { id: 'bronze', n: 'Bronze-Pack', cost: 500, count: 3, min: 45, max: 75 },
  { id: 'gold', n: 'Gold-Pack', cost: 2000, count: 3, min: 70, max: 95 },
  { id: 'elite', n: 'Elite-Pack', cost: 6000, count: 3, min: 85, max: 110 },
  { id: 'special', n: 'Spezial-Pack', cost: 12000, count: 2, min: 95, max: 118 },
  { id: 'eventp', n: 'Event-Pack', cost: 20000, count: 1, min: 105, max: 122, filter: ['event', 'animiert'] }
];
function openPackCards(pack) {
  const res = [];
  for (let i = 0; i < pack.count; i++) {
    // innerhalb des Bereichs: niedrigere GES häufiger (Dreiecksverteilung)
    const r = Math.min(secureRandom(), secureRandom());
    const g = Math.round(pack.min + r * (pack.max - pack.min));
    let cand = POOL.filter(c => c.ges === g && (!pack.filter || pack.filter.includes(c.rarity)));
    if (!cand.length) cand = POOL.filter(c => c.ges >= pack.min && c.ges <= pack.max && (!pack.filter || pack.filter.includes(c.rarity)));
    res.push(cand[Math.floor(secureRandom() * cand.length)]);
  }
  return res;
}

const RARITY_PRICE = { basis: 1, selten: 1.1, gold: 1.2, elite: 1.35, hero: 1.6, icon: 2.2, tots: 1.7, toty: 2, animiert: 1.9, event: 1.8 };
function cardPrice(card, ges) {
  const g = ges || card.ges;
  return Math.round(50 * Math.pow(1.07, g - 45) * RARITY_PRICE[card.rarity] / 10) * 10;
}

/* ---------------- Portrait (eigene SVG-Grafik) ---------------- */
const SKIN = ['#f5d0b5', '#e8b796', '#d39b74', '#b97a55', '#8d5a3b', '#6b4029', '#4a2c1c'];
const HAIRC = ['#1b1209', '#3b2314', '#6b4423', '#a0703c', '#d8b36a', '#e6d7b0', '#8a2b12', '#222', '#555'];
const portraitCache = {};
function portraitSVG(card) {
  if (portraitCache[card.id]) return portraitCache[card.id];
  const r = mulberry32(card.look || 1);
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const hc = HAIRC[Math.floor(r() * HAIRC.length)];
  const style = Math.floor(r() * 7);
  const beard = r() < .35, club = CLUB_BY_ID[card.club] || CLUBS[0];
  let hair = '';
  if (style === 0) hair = `<path d="M30 40 Q30 18 50 17 Q70 18 70 40 Q66 28 50 27 Q34 28 30 40Z" fill="${hc}"/>`;
  else if (style === 1) hair = `<circle cx="50" cy="27" r="20" fill="${hc}"/><circle cx="33" cy="33" r="9" fill="${hc}"/><circle cx="67" cy="33" r="9" fill="${hc}"/>`;
  else if (style === 2) hair = `<path d="M44 12 H56 V30 H44Z" fill="${hc}"/><path d="M31 40 Q31 26 44 24 L44 30 Q36 32 34 40Z" fill="${hc}" opacity=".5"/><path d="M69 40 Q69 26 56 24 L56 30 Q64 32 66 40Z" fill="${hc}" opacity=".5"/>`;
  else if (style === 3) hair = `<path d="M28 60 Q24 20 50 16 Q76 20 72 60 L66 60 Q68 30 50 28 Q32 30 34 60Z" fill="${hc}"/>`;
  else if (style === 4) hair = '';
  else if (style === 5) hair = `<path d="M31 38 Q32 20 50 19 Q68 20 69 38 Q60 30 50 31 Q40 30 31 38Z" fill="${hc}" opacity=".85"/>`;
  else hair = `<path d="M30 42 Q26 14 52 15 Q76 16 70 40 Q64 22 40 30 Z" fill="${hc}"/>`;
  const svg = `<svg class="portrait" viewBox="0 0 100 100">
   <path d="M14 100 Q16 74 50 70 Q84 74 86 100Z" fill="${club.c1}" stroke="${club.c2}" stroke-width="2"/>
   <path d="M40 72 L50 82 L60 72" fill="none" stroke="${club.c2}" stroke-width="3"/>
   <rect x="43" y="56" width="14" height="16" rx="5" fill="${skin}"/>
   <ellipse cx="50" cy="42" rx="19" ry="23" fill="${skin}"/>
   <ellipse cx="31" cy="44" rx="3.5" ry="6" fill="${skin}"/><ellipse cx="69" cy="44" rx="3.5" ry="6" fill="${skin}"/>
   ${hair}
   <path d="M38 36 H46 M54 36 H62" stroke="${hc}" stroke-width="2.4" stroke-linecap="round"/>
   <ellipse cx="42.5" cy="42" rx="2.6" ry="2" fill="#1c1c1c"/><ellipse cx="57.5" cy="42" rx="2.6" ry="2" fill="#1c1c1c"/>
   <path d="M50 44 L48 52 H52" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
   <path d="M43 57 Q50 ${r() < .5 ? 61 : 59} 57 57" fill="none" stroke="#6b2d2d" stroke-width="2" stroke-linecap="round"/>
   ${beard ? `<path d="M32 46 Q34 66 50 66 Q66 66 68 46 Q66 58 50 60 Q34 58 32 46Z" fill="${hc}" opacity=".8"/>` : ''}
  </svg>`;
  portraitCache[card.id] = svg;
  return svg;
}

if (typeof module !== 'undefined') module.exports = { POOL, CARD_BY_ID, DRAFTS, DRAFT_BY_ID, drawFromBands, drawDraft, calcGES, CLUB_SQUADS, openPackCards, PACKS, cardPrice, mulberry32 };
