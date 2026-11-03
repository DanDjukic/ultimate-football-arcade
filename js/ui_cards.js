'use strict';
/* ============ UI: Drafts, Sammlung, Kartendetails, Entwicklung ============ */
const POS_GROUP_LABEL = { all: 'Alle', TW: 'Torwart', ABW: 'Abwehr', MIT: 'Mittelfeld', STU: 'Sturm' };

UI.pages.drafts = function () {
  const d = Store.d;
  const band = b => `<tr><td>${String(b.p).replace('.', ',')} %</td><td>GES ${b.min}–${b.max}</td></tr>`;
  this.page('DRAFTS', `
    <div class="freebar">✅ Alle Drafts sind <b>kostenlos</b> und <b>unbegrenzt</b> – keine Münzen, keine Tickets, keine Wartezeit, keine Limits, keine Werbung. Geöffnet: <b>${d.stats.drafts}</b></div>
    <div class="draftgrid">${DRAFTS.map(dr => `
      <div class="draft d-${dr.id}">
        <div class="d-head"><b>${dr.n}</b><span class="free">GRATIS</span></div>
        <p>${dr.d}</p>
        <table class="probs">${dr.bands.map(band).join('')}</table>
        ${dr.filter ? `<p class="muted small">Nur Seltenheiten: ${dr.filter.map(r => RARITIES[r].n).join(', ')}</p>` : ''}
        <div class="btnrow">
          <button class="btn primary" data-draft="${dr.id}" data-n="1">${dr.choice ? 'Auswahl öffnen' : 'Öffnen'}</button>
          ${dr.choice ? '' : `<button class="btn" data-draft="${dr.id}" data-n="10">10× öffnen</button>`}
        </div>
      </div>`).join('')}
    </div>
    <p class="muted small">Ziehungen nutzen den kryptografischen Zufallsgenerator des Browsers. Innerhalb einer GES-Stufe wird eine Karte gleichverteilt aus dem Pool (${POOL.length} Karten mit eindeutiger Karten-ID) gezogen. Doppelte Karten sind erlaubt, die Sammlung hat keine Obergrenze.</p>`);
  document.querySelectorAll('[data-draft]').forEach(b => b.addEventListener('click', () => { Sound.click(); this.runDraft(b.dataset.draft, +b.dataset.n); }));
};

UI.runDraft = function (id, n = 1) {
  const dr = DRAFT_BY_ID[id], st = $('#draftStage'), cards = $('#stageCards'), info = $('#stageInfo'), btns = $('#stageBtns'), skip = $('#stageSkip');
  Store.d.stats.drafts++;
  st.className = ''; cards.innerHTML = ''; info.innerHTML = ''; btns.innerHTML = '';
  let timers = [];
  const later = (f, ms) => timers.push(setTimeout(f, ms));
  const finish = () => { timers.forEach(clearTimeout); timers = []; };
  const after = (msg) => {
    skip.classList.add('hidden');
    info.innerHTML = msg;
    btns.innerHTML = `<button class="btn primary huge" id="dAgain">NOCHMAL – KOSTENLOS</button><button class="btn" id="dOther">Andere Drafts</button><button class="btn ghost" id="dColl">Zur Sammlung</button>`;
    $('#dAgain').onclick = () => { Sound.click(); this.runDraft(id, n); };
    $('#dOther').onclick = () => { Sound.click(); st.classList.add('hidden'); this.render('drafts'); };
    $('#dColl').onclick = () => { Sound.click(); st.classList.add('hidden'); this.go('collection'); };
    Store.save(); this.refreshWallet();
  };
  const flipHTML = (c, i, small) => `<div class="flip ${small ? 'small' : ''}" data-i="${i}"><div class="flip-inner"><div class="face fback">${cardBackHTML(rarityTier(c))}</div><div class="face ffront">${cardHTML(c, { size: small ? 'sm' : 'lg' })}</div></div></div>`;
  const reveal = (el, c) => {
    if (el.classList.contains('open')) return;
    el.classList.add('open'); Sound.flip();
    const tier = rarityTier(c);
    if (tier >= 3) { st.classList.add('rare', 't' + tier); Sound.reveal(tier); } else Sound.reveal(tier - 1);
  };
  const desc = c => `<div class="d-name">${esc(c.name)} · ${c.pos} · GES <b>${c.ges}</b></div><div class="d-sub">${RARITIES[c.rarity].n}${c.series ? ' – ' + c.series : ''} · ${NATION_BY_ID[c.nat].n} · ${CLUB_BY_ID[c.club].name}</div><div class="d-ps">${c.ps.map(p => `<span>${PLAYSTYLES[p.id].i} ${PLAYSTYLES[p.id].n}${p.plus ? '+' : ''}</span>`).join('')}</div>`;
  skip.classList.remove('hidden');

  if (dr.choice) {
    const pick = drawDraft(id);
    cards.className = 'choice';
    cards.innerHTML = pick.map((c, i) => flipHTML(c, i, true)).join('');
    const els = [...cards.querySelectorAll('.flip')];
    const openAll = () => { finish(); els.forEach((e, i) => reveal(e, pick[i])); info.innerHTML = '<div class="d-name">Wähle EINEN Spieler aus</div>'; skip.classList.add('hidden'); };
    els.forEach((e, i) => later(() => reveal(e, pick[i]), 500 + i * 380));
    later(openAll, 500 + 5 * 380);
    skip.onclick = openAll;
    els.forEach((e, i) => e.addEventListener('click', () => {
      if (!e.classList.contains('open') || cards.dataset.done) return;
      cards.dataset.done = '1';
      Store.addCard(pick[i].id);
      els.forEach((o, j) => { if (j !== i) o.classList.add('gone'); else o.classList.add('chosen'); });
      Sound.reveal(rarityTier(pick[i]));
      after(`<div class="added">✅ Zur Sammlung hinzugefügt</div>` + desc(pick[i]));
    }));
    delete cards.dataset.done;
    return;
  }
  if (n > 1) {
    const all = []; for (let i = 0; i < n; i++) { const c = drawDraft(id)[0]; all.push(c); Store.addCard(c.id); }
    if (n > 1) Store.d.stats.drafts += n - 1;
    Store.save();
    cards.className = 'multi';
    cards.innerHTML = all.map((c, i) => flipHTML(c, i, true)).join('');
    const els = [...cards.querySelectorAll('.flip')];
    const openAll = () => { finish(); els.forEach((e, i) => reveal(e, all[i])); const best = all.slice().sort((a, b) => b.ges - a.ges)[0]; after(`<div class="added">✅ ${n} Karten zur Sammlung hinzugefügt</div><div class="d-name">Beste Karte: ${esc(best.name)} · GES <b>${best.ges}</b></div>`); };
    els.forEach((e, i) => later(() => reveal(e, all[i]), 400 + i * 220));
    later(openAll, 400 + n * 220 + 300);
    skip.onclick = openAll;
    return;
  }
  const c = drawDraft(id)[0];
  Store.addCard(c.id); Store.save();
  const tier = rarityTier(c);
  cards.className = 'single';
  cards.innerHTML = flipHTML(c, 0, false);
  const el = cards.querySelector('.flip');
  st.classList.add('pre' + tier);
  const done = () => { finish(); reveal(el, c); after(`<div class="added">✅ Zur Sammlung hinzugefügt</div>` + desc(c)); };
  later(() => el.classList.add('shake'), 300);
  later(done, tier >= 3 ? 1900 : 900);
  skip.onclick = done;
  el.addEventListener('click', done);
};

/* ---------- Sammlung ---------- */
UI.coll = { sort: 'ges', pos: 'all', rar: 'all', dup: false, limit: 60, cmp: [] };
UI.pages.collection = function () {
  const f = this.coll, d = Store.d;
  const counts = {}; d.collection.forEach(i => counts[i.c] = (counts[i.c] || 0) + 1);
  let list = d.collection.map(i => effCard(i));
  if (f.pos !== 'all') list = list.filter(c => POS_GROUP[c.pos] === f.pos);
  if (f.rar !== 'all') list = list.filter(c => c.rarity === f.rar);
  if (f.dup) list = list.filter(c => counts[c.id] > 1);
  const sorters = { ges: (a, b) => b.ges - a.ges, gesAsc: (a, b) => a.ges - b.ges, new: (a, b) => b.inst.n - a.inst.n || b.inst.u - a.inst.u, name: (a, b) => a.name.localeCompare(b.name), rar: (a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order || b.ges - a.ges };
  list.sort(sorters[f.sort]);
  const inLineup = new Set(d.lineup.slots.filter(Boolean));
  this.page('MEINE SPIELER', `
    <div class="filters">
      <div class="chips">${this.chips([['ges', 'GES ↓'], ['gesAsc', 'GES ↑'], ['new', 'Neueste'], ['rar', 'Seltenheit'], ['name', 'Name']].map(v => ({ v: v[0], l: v[1] })), f.sort, 'csort')}</div>
      <div class="chips">${this.chips(Object.keys(POS_GROUP_LABEL).map(v => ({ v, l: POS_GROUP_LABEL[v] })), f.pos, 'cpos')}</div>
      <div class="chips">${this.chips([{ v: 'all', l: 'Alle Seltenheiten' }, ...Object.keys(RARITIES).map(v => ({ v, l: RARITIES[v].n }))], f.rar, 'crar')}</div>
      <label class="tog"><input type="checkbox" id="cDup" ${f.dup ? 'checked' : ''}><span>Nur doppelte Karten</span></label>
      ${f.cmp.length ? `<span class="cmpinfo">Vergleich: 1 Karte gewählt – wähle eine zweite und tippe „Vergleichen“.</span>` : ''}
    </div>
    <p class="muted">${list.length} von ${d.collection.length} Karten · Doppelte sind mit ×N markiert · ⚑ = in der Startelf</p>
    <div class="cardgrid">${list.slice(0, f.limit).map(c => `<div class="cwrap">${cardHTML(c, { size: 'sm', uid: c.inst.u, dup: counts[c.id] })}${inLineup.has(c.inst.u) ? '<span class="inlu">⚑</span>' : ''}</div>`).join('')}</div>
    ${list.length > f.limit ? '<button class="btn" id="cMore">Mehr laden</button>' : ''}`);
  const rr = () => this.render('collection');
  this.bindChips('csort', v => { f.sort = v; rr(); });
  this.bindChips('cpos', v => { f.pos = v; f.limit = 60; rr(); });
  this.bindChips('crar', v => { f.rar = v; f.limit = 60; rr(); });
  $('#cDup').addEventListener('change', e => { f.dup = e.target.checked; rr(); });
  if ($('#cMore')) $('#cMore').addEventListener('click', () => { f.limit += 60; const y = $('#pageBody').scrollTop; rr(); $('#pageBody').scrollTop = y; });
  document.querySelectorAll('#pageBody .card[data-uid]').forEach(c => c.addEventListener('click', () => { Sound.click(); this.cardDetail(+c.dataset.uid, rr); }));
};

UI.cardDetail = function (uid, after) {
  const inst = Store.inst(uid); if (!inst) return;
  const c = effCard(inst), keys = c.pos === 'GK' ? GK_STATS : FIELD_STATS, base = CARD_BY_ID[inst.c];
  const dup = Store.dupCount(inst.c), price = cardPrice(c, c.ges), xpVal = Math.round(c.ges * .6 + (RARITIES[c.rarity].order * 3));
  const bars = keys.map(k => `<div class="bar"><span>${STAT_NAME[k]}</span><div><i style="width:${c.stats[k] / 1.25}%"></i></div><b>${c.stats[k]}${c.stats[k] > base.stats[k] ? ` <em>+${c.stats[k] - base.stats[k]}</em>` : ''}</b></div>`).join('');
  const ps = c.ps.map(p => `<div class="psrow">${psHTML([p], true)}<div><b>${PLAYSTYLES[p.id].n}${p.plus ? '+' : ''}</b> <span class="muted">(${PLAYSTYLES[p.id].cat})</span><br><small>${PLAYSTYLES[p.id].d}${p.plus ? ' Verstärkte Plus-Wirkung.' : ''}</small></div></div>`).join('') || '<p class="muted">Keine PlayStyles</p>';
  this.modal(`
    <div class="detail">
      <div class="dl">${cardHTML(c, { size: 'lg' })}</div>
      <div class="dr">
        <h2>${esc(c.name)}</h2>
        <p>${c.pos} · ${NATION_BY_ID[c.nat].n} · ${CLUB_BY_ID[c.club].name} · Nr. ${c.num}<br>Karten-ID ${c.id} · ${RARITIES[c.rarity].n}${c.series ? ' · ' + c.series : ''}<br>
        GES <b>${c.ges}</b>${c.ges !== c.baseGes ? ` (Basis ${c.baseGes})` : ''} · Rang ${inst.r}/${MAX_RANK} · Training ${trainCount(inst)}/${MAX_TRAIN}<br>
        ${dup > 1 ? `<b class="dupl">Du besitzt ${dup}× diese Karte</b>` : 'Keine Duplikate'}</p>
        <div class="bars">${bars}</div>
        <h3>PlayStyles</h3>${ps}
        <div class="btnrow wrap">
          <button class="btn primary" id="mdLine">In Startelf</button>
          <button class="btn" id="mdUp">Entwickeln</button>
          <button class="btn" id="mdCmp">Vergleichen</button>
          <button class="btn" id="mdSell">Verkaufen 🪙 ${price}</button>
          <button class="btn ghost" id="mdXp">Verwerten ⭐ +${xpVal}</button>
        </div>
      </div>
    </div>`, 'wide');
  $('#mdLine').onclick = () => this.pickSlot(uid, after);
  $('#mdUp').onclick = () => this.openUpgrade(uid, after);
  $('#mdCmp').onclick = () => {
    const f = this.coll;
    if (f.cmp.length && f.cmp[0] !== uid) { const a = f.cmp[0]; f.cmp = []; this.compare(a, uid); }
    else { f.cmp = [uid]; this.closeModal(); this.toast('Wähle jetzt die zweite Karte'); if (after) after(); }
  };
  $('#mdSell').onclick = () => { Store.removeInst(uid); Store.d.coins += price; Store.save(); this.toast(`Verkauft für 🪙 ${price}`); this.closeModal(); if (after) after(); this.refreshWallet(); };
  $('#mdXp').onclick = () => { Store.removeInst(uid); Store.d.xp += xpVal; Store.save(); this.toast(`+${xpVal} Trainings-XP`); this.closeModal(); if (after) after(); this.refreshWallet(); };
};

UI.compare = function (u1, u2) {
  const a = effCard(Store.inst(u1)), b = effCard(Store.inst(u2));
  const keys = a.pos === 'GK' && b.pos === 'GK' ? GK_STATS : FIELD_STATS;
  const row = (l, x, y) => `<tr><td class="${x > y ? 'win' : ''}">${x}</td><th>${l}</th><td class="${y > x ? 'win' : ''}">${y}</td></tr>`;
  this.modal(`<h2>Kartenvergleich</h2>
    <div class="cmp"><div>${cardHTML(a, { size: 'md' })}</div>
    <table class="stats">${row('GES', a.ges, b.ges)}${keys.map(k => row(STAT_NAME[k], a.stats[k] || 0, b.stats[k] || 0)).join('')}${row('PlayStyles', a.ps.length, b.ps.length)}${row('PlayStyles+', a.ps.filter(p => p.plus).length, b.ps.filter(p => p.plus).length)}</table>
    <div>${cardHTML(b, { size: 'md' })}</div></div>`, 'wide');
};

UI.pickSlot = function (uid, after) {
  const lu = Store.d.lineup, slots = FORMATIONS[lu.formation], c = effCard(Store.inst(uid));
  this.modal(`<h2>Position für ${esc(c.name)} (${c.pos}) wählen</h2><div class="slotpick">${slots.map((s, i) => {
    const cur = lu.slots[i] && Store.inst(lu.slots[i]); const fit = posFit(c.pos, s.pos);
    return `<button class="btn slotbtn fit${fit === 1 ? 'g' : fit >= .95 ? 'y' : 'r'}" data-si="${i}"><b>${s.pos}</b><small>${cur ? esc(CARD_BY_ID[cur.c].name) + ' · ' + effCard(cur).ges : 'leer'}</small></button>`;
  }).join('')}</div><p class="muted">Grün = ideale Position, Gelb = passend, Rot = falsche Position (schwächere Werte im Spiel).</p>`);
  document.querySelectorAll('[data-si]').forEach(b => b.onclick = () => { assignSlot(+b.dataset.si, uid); Store.save(); this.closeModal(); this.toast('Startelf aktualisiert'); if (after) after(); });
};
function assignSlot(i, uid) {
  const sl = Store.d.lineup.slots, prev = sl[i], j = sl.indexOf(uid);
  if (j >= 0) sl[j] = prev; sl[i] = uid;
}

/* ---------- Entwicklung: Training & Rangaufstieg ---------- */
UI.openUpgrade = function (uid, after) {
  const inst = Store.inst(uid); if (!inst) return;
  inst.t = inst.t || {}; inst.x = inst.x || []; inst.p = inst.p || [];
  const c = effCard(inst), keys = c.pos === 'GK' ? GK_STATS : FIELD_STATS, tc = trainCount(inst), d = Store.d;
  const cost = 15 + tc * 5;
  const dupInst = d.collection.find(i => i.c === inst.c && i.u !== uid && !d.lineup.slots.includes(i.u));
  const coinCost = Math.round(800 * (inst.r + 1) * c.baseGes / 80 / 50) * 50;
  const next = inst.r + 1;
  const unlock = next === 2 || next === 4 ? 'Neuer PlayStyle' : next === 5 ? 'PlayStyle → PlayStyle+' : '';
  this.modal(`
    <div class="detail">
      <div class="dl">${cardHTML(c, { size: 'lg' })}</div>
      <div class="dr">
        <h2>Entwicklung: ${esc(c.name)}</h2>
        <p>Trainings-XP: <b>⭐ ${d.xp}</b> · Trainingspunkte ${tc}/${MAX_TRAIN} · Nächster Punkt kostet ⭐ ${cost}</p>
        <div class="trainrows">${keys.map(k => `<div class="trow"><span>${STAT_NAME[k]}</span><b>${c.stats[k]}</b><button class="btn sm" data-tr="${k}" ${tc >= MAX_TRAIN || d.xp < cost || c.stats[k] >= MAX_GES ? 'disabled' : ''}>+1</button></div>`).join('')}</div>
        <h3>Rangaufstieg ${'★'.repeat(inst.r)}${'☆'.repeat(MAX_RANK - inst.r)}</h3>
        ${inst.r >= MAX_RANK ? '<p>Maximaler Rang erreicht.</p>' : `<p>Rang ${next}: alle Werte +${RANK_BONUS}${unlock ? ' · ' + unlock : ''}</p>
        <div class="btnrow wrap">
          <button class="btn primary" id="rkDup" ${dupInst ? '' : 'disabled'}>Mit Duplikat ${dupInst ? '(vorhanden)' : '(keins frei)'}</button>
          <button class="btn" id="rkCoin" ${d.coins >= coinCost ? '' : 'disabled'}>Mit Münzen 🪙 ${coinCost}</button>
        </div>`}
        <p class="muted small">Verbesserungen wirken sich direkt auf das Spiel aus (Tempo, Schuss, Zweikämpfe …).</p>
      </div>
    </div>`, 'wide');
  const rr = () => { Store.save(); this.refreshWallet(); this.openUpgrade(uid, after); };
  document.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => { d.xp -= cost; inst.t[b.dataset.tr] = (inst.t[b.dataset.tr] || 0) + 1; Sound.click(); rr(); });
  const rank = () => {
    inst.r++; d.stats.rankups++;
    const have = new Set(effCard(inst).ps.map(p => p.id));
    if (inst.r === 2 || inst.r === 4) { const cand = PS_BY_POS[c.pos].filter(p => !have.has(p)); if (cand.length) { const n = cand[Math.floor(secureRandom() * cand.length)]; inst.x.push(n); this.toast('Neuer PlayStyle: ' + PLAYSTYLES[n].n); } }
    if (inst.r === 5) { const e = effCard(inst).ps.find(p => !p.plus); if (e) { inst.p.push(e.id); this.toast('PlayStyle+ freigeschaltet: ' + PLAYSTYLES[e.id].n + '+'); } }
    Sound.reveal(3);
  };
  if ($('#rkDup')) $('#rkDup').onclick = () => { if (!dupInst) return; Store.removeInst(dupInst.u); rank(); rr(); };
  if ($('#rkCoin')) $('#rkCoin').onclick = () => { if (d.coins < coinCost) return; d.coins -= coinCost; rank(); rr(); };
  this.onModalClose = after || null;
};

/* ---------- Teamaufstellung ---------- */
UI.lu = { sel: null };
UI.pages.lineup = function () {
  const d = Store.d, lu = d.lineup, slots = FORMATIONS[lu.formation], f = this.lu;
  const def = TeamFactory.mine(), ovr = TeamFactory.ovr(def);
  const chem = def.entries.reduce((a, e) => a + e.chem, 0);
  const used = new Set(lu.slots.filter(Boolean));
  const selPos = f.sel !== null ? slots[f.sel].pos : null;
  let bench = d.collection.filter(i => !used.has(i.u)).map(effCard);
  if (selPos) bench.sort((a, b) => (posFit(b.pos, selPos) - posFit(a.pos, selPos)) * 1000 + b.ges - a.ges); else bench.sort((a, b) => b.ges - a.ges);
  const wrong = def.entries.filter(e => e.fit < .95).length;
  this.page('TEAMAUFSTELLUNG', `
    <div class="lineup">
      <div class="lu-left">
        <div class="lu-head">
          <div class="chips">${this.chips(Object.keys(FORMATIONS).map(v => ({ v, l: v })), lu.formation, 'form')}</div>
          <div class="lu-ovr">Team-GES <b>${ovr}</b> · Chemie <b>${chem}/33</b>${wrong ? ` · <span class="bad">${wrong} falsche Position${wrong > 1 ? 'en' : ''}</span>` : ''}</div>
        </div>
        <div class="pitch" id="pitch">${slots.map((s, i) => {
          const inst = lu.slots[i] && Store.inst(lu.slots[i]);
          const c = inst ? effCard(inst) : null, fit = c ? posFit(c.pos, s.pos) : 1;
          const left = 50 + s.fy * 40, top = 90 - s.fx * 98;
          return `<div class="slot ${f.sel === i ? 'sel' : ''} fit${!c ? 'n' : fit === 1 ? 'g' : fit >= .95 ? 'y' : 'r'}" data-slot="${i}" style="left:${left}%;top:${top}%">
            ${c ? cardHTML(c, { size: 'xs', uid: inst.u }) : `<div class="empty">+</div>`}<span class="spos">${s.pos}${c && fit < 1 ? ' ⚠' : ''}</span></div>`;
        }).join('')}</div>
        <div class="btnrow"><button class="btn primary" id="luAuto">Auto-Aufstellung</button><button class="btn ghost" id="luClear">Leeren</button></div>
        <p class="muted small">Ziehe Karten per Drag-and-drop auf eine Position (auch zwischen Positionen zum Tauschen) – oder tippe erst eine Position, dann eine Karte. Rahmen: grün = ideal, gelb = passend, rot = falsche Position (−15 % Werte). Chemie (gleiche Nation/Verein) gibt nur +0 bis +3 auf Werte.</p>
      </div>
      <div class="lu-right">
        <h3>${selPos ? `Spieler für ${selPos}` : 'Ersatzbank / Sammlung'} (${bench.length})</h3>
        <div class="bench">${bench.slice(0, 80).map(c => cardHTML(c, { size: 'xs', uid: c.inst.u, cls: selPos ? 'fit' + (posFit(c.pos, selPos) === 1 ? 'g' : posFit(c.pos, selPos) >= .95 ? 'y' : 'r') : '' })).join('')}</div>
      </div>
    </div>`);
  const rr = () => this.render('lineup');
  this.bindChips('form', v => {
    const keep = lu.slots.filter(Boolean); lu.formation = v;
    const sl = FORMATIONS[v], cards = keep.map(u => effCard(Store.inst(u))), used = new Set(); lu.slots = Array(11).fill(null);
    sl.map((s, i) => i).sort((a, b) => (sl[a].pos === 'GK' ? -1 : 0) - (sl[b].pos === 'GK' ? -1 : 0)).forEach(i => {
      let best = null, bs = -1; for (const c of cards) { if (used.has(c.inst.u)) continue; const s = c.ges * posFit(c.pos, sl[i].pos); if (s > bs) { bs = s; best = c; } }
      if (best) { lu.slots[i] = best.inst.u; used.add(best.inst.u); }
    });
    Store.save(); rr();
  });
  $('#luAuto').onclick = () => { autoLineup(); Store.save(); f.sel = null; rr(); this.toast('Beste Aufstellung gesetzt'); };
  $('#luClear').onclick = () => { lu.slots = Array(11).fill(null); Store.save(); rr(); };
  // Drag & Drop + Tippen (Pointer Events, funktioniert auf Touch und Maus)
  const body = $('#pageBody');
  body.querySelectorAll('.lineup .card[data-uid], .slot').forEach(el => {
    el.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      const cardEl = el.classList.contains('slot') ? el.querySelector('.card') : el;
      const fromSlot = el.closest('.slot') ? +el.closest('.slot').dataset.slot : null;
      const uid = cardEl ? +cardEl.dataset.uid : null;
      const sx = e.clientX, sy = e.clientY; let ghost = null;
      const move = ev => {
        if (!ghost && uid && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
          ghost = cardEl.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost);
        }
        if (ghost) { ev.preventDefault(); ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
      };
      const up = ev => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        if (ghost) {
          ghost.remove();
          const t = document.elementFromPoint(ev.clientX, ev.clientY), slot = t && t.closest('.slot');
          if (slot) { const si = +slot.dataset.slot; if (fromSlot !== null) { const sl = lu.slots, tmp = sl[si]; sl[si] = sl[fromSlot]; sl[fromSlot] = tmp; } else assignSlot(si, uid); Store.save(); Sound.click(); f.sel = null; rr(); }
          else if (fromSlot !== null && t && t.closest('.lu-right')) { lu.slots[fromSlot] = null; Store.save(); rr(); }
          return;
        }
        // Tippen
        if (fromSlot !== null) { f.sel = f.sel === fromSlot ? null : fromSlot; Sound.click(); rr(); }
        else if (uid) {
          if (f.sel !== null) { assignSlot(f.sel, uid); Store.save(); f.sel = null; Sound.click(); rr(); }
          else this.cardDetail(uid, rr);
        }
      };
      window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
  });
};
function autoLineup() {
  const d = Store.d, lu = d.lineup, slots = FORMATIONS[lu.formation];
  const cards = d.collection.map(effCard), used = new Set(); lu.slots = Array(11).fill(null);
  const order = slots.map((s, i) => i).sort((a, b) => (slots[a].pos === 'GK' ? -1 : 0) - (slots[b].pos === 'GK' ? -1 : 0));
  for (const i of order) {
    const pos = slots[i].pos;
    let best = null, bs = -1;
    for (const c of cards) { if (used.has(c.inst.u) || used.has('c' + c.id)) continue; const s = c.ges * posFit(c.pos, pos); if (s > bs) { bs = s; best = c; } }
    if (best) { lu.slots[i] = best.inst.u; used.add(best.inst.u); used.add('c' + best.id); }
  }
}
