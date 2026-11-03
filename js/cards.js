'use strict';
/* ============ Spielerkarten (HTML/CSS-Darstellung) ============ */
function shortName(n) { const p = n.split(' '); return p.length > 1 ? p[0][0] + '. ' + p.slice(1).join(' ') : n; }
function psHTML(ps, big) {
  return ps.map(p => {
    const d = PLAYSTYLES[p.id];
    return `<i class="ps ${p.plus ? 'plus' : ''} ${big ? 'big' : ''}" title="${d.n}${p.plus ? '+' : ''}: ${d.d}">${d.i}${p.plus ? '<em>+</em>' : ''}</i>`;
  }).join('');
}
function cardHTML(c, o = {}) {
  const club = CLUB_BY_ID[c.club];
  const keys = c.pos === 'GK' ? GK_STATS : FIELD_STATS;
  const stats = keys.map(k => `<div class="st"><b>${c.stats[k]}</b><span>${STAT_LABEL[k]}</span></div>`).join('');
  const inst = c.inst;
  const stars = inst && inst.r ? `<div class="c-rank">${'★'.repeat(inst.r)}</div>` : '';
  const dup = o.dup > 1 ? `<div class="c-dup">×${o.dup}</div>` : '';
  const boost = inst && c.ges > c.baseGes ? `<div class="c-boost">+${c.ges - c.baseGes}</div>` : '';
  return `<div class="card r-${c.rarity} ${o.size || 'md'} ${c.ges >= 121 ? 'ultra' : ''} ${o.cls || ''}" ${o.uid ? `data-uid="${o.uid}"` : ''} ${o.cid ? `data-cid="${o.cid}"` : ''}>
    <div class="c-bg"></div><div class="c-shine"></div>
    <div class="c-top"><div class="c-ges">${c.ges}</div><div class="c-pos">${c.pos}</div><div class="c-fl">${flagSVG(c.nat, 22, 15)}</div><div class="c-bd">${badgeSVG(club, 18)}</div></div>
    <div class="c-por">${portraitSVG(c)}</div>
    <div class="c-name">${shortName(c.name)}</div>
    <div class="c-stats">${stats}</div>
    <div class="c-ps">${psHTML(c.ps)}</div>
    <div class="c-rar">${RARITIES[c.rarity].n}${c.series ? ' · ' + c.series : ''}</div>
    ${stars}${dup}${boost}
  </div>`;
}
function cardBackHTML(tier) { return `<div class="card-back t${tier}"><div class="cb-logo">UFA<br><span>26</span></div></div>`; }
function rarityTier(c) {
  if (c.ges >= 121) return 5;
  if (c.ges >= 116) return 4;
  if (c.ges >= 110 || ['icon', 'toty', 'animiert', 'event'].includes(c.rarity)) return 3;
  if (c.ges >= 100) return 2;
  return 1;
}
