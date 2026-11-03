'use strict';
/* ============ UI: Transfermarkt, Packs, Aufgaben, Turnier ============ */
const TASKS = [
  { id: 'w1', n: 'Gewinne 1 Spiel', p: s => s.wins, g: 1, r: 500 },
  { id: 'w5', n: 'Gewinne 5 Spiele', p: s => s.wins, g: 5, r: 2500 },
  { id: 'w20', n: 'Gewinne 20 Spiele', p: s => s.wins, g: 20, r: 8000 },
  { id: 'g10', n: 'Erziele 10 Tore', p: s => s.goals, g: 10, r: 1500 },
  { id: 'g50', n: 'Erziele 50 Tore', p: s => s.goals, g: 50, r: 5000 },
  { id: 'd10', n: 'Öffne 10 Drafts', p: s => s.drafts, g: 10, r: 1000 },
  { id: 'd100', n: 'Öffne 100 Drafts', p: s => s.drafts, g: 100, r: 5000 },
  { id: 'c115', n: 'Ziehe eine Karte mit GES 115+', p: s => s.has115 ? 1 : 0, g: 1, r: 2000 },
  { id: 'c121', n: 'Ziehe eine Karte mit GES 121+', p: s => s.has121 ? 1 : 0, g: 1, r: 5000 },
  { id: 'p5', n: 'Verwandle 5 Elfmeter', p: s => s.pens, g: 5, r: 1000 },
  { id: 'r1', n: 'Führe einen Rangaufstieg durch', p: s => s.rankups, g: 1, r: 1000 },
  { id: 't1', n: 'Spiele ein Turnier zu Ende', p: s => s.tourPlayed, g: 1, r: 2000 },
  { id: 'tw', n: 'Gewinne ein Turnier', p: s => s.tourWon, g: 1, r: 10000 }
];

UI.mkTab = 'market';
function genMarket() {
  const offers = [];
  for (let i = 0; i < 12; i++) {
    const g = Math.round(55 + Math.min(secureRandom(), secureRandom()) * 67);
    const cand = POOL.filter(c => c.ges === g); const c = cand[Math.floor(secureRandom() * cand.length)];
    offers.push({ cid: c.id, price: Math.round(cardPrice(c) * (1 + secureRandom() * .35) / 10) * 10 });
  }
  Store.d.market = { offers }; Store.save();
}
UI.pages.market = function () {
  const d = Store.d, tab = this.mkTab;
  const tabs = `<div class="tabs">${[['market', 'Transfermarkt'], ['sell', 'Verkaufen'], ['packs', 'Packs'], ['tasks', 'Aufgaben']].map(t => `<button class="tab ${tab === t[0] ? 'sel' : ''}" data-tab="${t[0]}">${t[1]}</button>`).join('')}</div>
    <p class="muted small">Münzen verdienst du durch Siege, Turniere und Aufgaben. Packs und Markt sind optional – <b>Drafts bleiben immer kostenlos und unbegrenzt.</b> Keine Echtgeldkäufe.</p>`;
  let body = '';
  if (tab === 'market') {
    if (!d.market || !d.market.offers) genMarket();
    body = `<div class="btnrow"><button class="btn" id="mkRef">🔄 Angebote aktualisieren (kostenlos)</button></div>
      <div class="cardgrid">${d.market.offers.map((o, i) => { const c = CARD_BY_ID[o.cid]; return `<div class="offer">${cardHTML(c, { size: 'sm' })}<div class="price">🪙 ${o.price.toLocaleString('de-DE')}</div><button class="btn sm primary" data-buy="${i}" ${d.coins < o.price ? 'disabled' : ''}>Kaufen</button></div>`; }).join('')}</div>`;
  } else if (tab === 'sell') {
    const used = new Set(d.lineup.slots.filter(Boolean));
    const list = d.collection.filter(i => !used.has(i.u)).map(effCard).sort((a, b) => b.ges - a.ges).slice(0, 80);
    body = `<p class="muted">Computergesteuerte Käufer kaufen deine Karten sofort zum Marktpreis. Spieler aus der Startelf sind ausgeblendet.</p>
      <div class="cardgrid">${list.map(c => `<div class="offer">${cardHTML(c, { size: 'sm' })}<div class="price">🪙 ${cardPrice(c, c.ges).toLocaleString('de-DE')}</div><button class="btn sm" data-sell="${c.inst.u}">Verkaufen</button></div>`).join('') || '<p>Keine verkaufbaren Karten.</p>'}</div>`;
  } else if (tab === 'packs') {
    body = `<div class="draftgrid">${PACKS.map(p => `<div class="draft pack p-${p.id}"><div class="d-head"><b>${p.n}</b><span>🪙 ${p.cost.toLocaleString('de-DE')}</span></div>
      <p>${p.count} Karte${p.count > 1 ? 'n' : ''} · GES ${p.min}–${p.max}${p.filter ? ' · nur Event/Animiert' : ''}<br><small class="muted">Niedrigere GES im Bereich sind häufiger.</small></p>
      <button class="btn primary" data-pack="${p.id}" ${d.coins < p.cost ? 'disabled' : ''}>Öffnen</button></div>`).join('')}</div>`;
  } else {
    body = `<div class="tasks">${TASKS.map(t => {
      const v = Math.min(t.g, t.p(d.stats)), done = v >= t.g, claimed = d.claimed.includes(t.id);
      return `<div class="task ${claimed ? 'claimed' : ''}"><div><b>${t.n}</b><div class="prog"><i style="width:${v / t.g * 100}%"></i></div><small>${v}/${t.g}</small></div>
        <div>🪙 ${t.r.toLocaleString('de-DE')}</div>${claimed ? '<span class="ok">✔</span>' : `<button class="btn sm primary" data-claim="${t.id}" ${done ? '' : 'disabled'}>Abholen</button>`}</div>`;
    }).join('')}</div>`;
  }
  this.page('TRANSFERMARKT', tabs + body);
  const rr = () => this.render('market');
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { Sound.click(); this.mkTab = b.dataset.tab; rr(); });
  if ($('#mkRef')) $('#mkRef').onclick = () => { genMarket(); Sound.click(); rr(); };
  document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
    const o = d.market.offers[+b.dataset.buy]; if (!o || d.coins < o.price) return;
    d.coins -= o.price; Store.addCard(o.cid); d.market.offers.splice(+b.dataset.buy, 1); Store.save(); Sound.reveal(1); this.toast('Gekauft: ' + CARD_BY_ID[o.cid].name); rr();
  });
  document.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => {
    const inst = Store.inst(+b.dataset.sell); if (!inst) return; const c = effCard(inst), pr = cardPrice(c, c.ges);
    Store.removeInst(inst.u); d.coins += pr; Store.save(); Sound.click(); this.toast(`Verkauft: ${c.name} für 🪙 ${pr}`); rr();
  });
  document.querySelectorAll('[data-pack]').forEach(b => b.onclick = () => {
    const p = PACKS.find(x => x.id === b.dataset.pack); if (d.coins < p.cost) return;
    d.coins -= p.cost; const cards = openPackCards(p); cards.forEach(c => Store.addCard(c.id)); Store.save();
    this.revealCards(cards, p.n, rr);
  });
  document.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => {
    const t = TASKS.find(x => x.id === b.dataset.claim); if (d.claimed.includes(t.id)) return;
    d.claimed.push(t.id); d.coins += t.r; Store.save(); Sound.reveal(2); this.toast(`+🪙 ${t.r}`); rr();
  });
};
UI.revealCards = function (cards, title, after) {
  const st = $('#draftStage'), el = $('#stageCards');
  st.className = ''; el.className = 'multi'; $('#stageInfo').innerHTML = `<div class="d-name">${esc(title)}</div>`;
  el.innerHTML = cards.map(c => `<div class="flip small"><div class="flip-inner"><div class="face fback">${cardBackHTML(rarityTier(c))}</div><div class="face ffront">${cardHTML(c, { size: 'sm' })}</div></div></div>`).join('');
  const els = [...el.querySelectorAll('.flip')];
  const timers = els.map((e, i) => setTimeout(() => { e.classList.add('open'); Sound.flip(); Sound.reveal(rarityTier(cards[i]) - 1); }, 400 + i * 450));
  const skip = $('#stageSkip'); skip.classList.remove('hidden');
  skip.onclick = () => { timers.forEach(clearTimeout); els.forEach(e => e.classList.add('open')); };
  $('#stageBtns').innerHTML = `<button class="btn primary" id="rvOk">Weiter</button>`;
  $('#rvOk').onclick = () => { timers.forEach(clearTimeout); st.classList.add('hidden'); skip.classList.add('hidden'); if (after) after(); };
};

/* ---------- Turnier ---------- */
const teamName = id => id === 'MY' ? Store.d.settings.teamName : CLUB_BY_ID[id].name;
const teamOvr = id => TeamFactory.ovr(TeamFactory.get(id));
function poisson(l) { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }
const Tournament = {
  create(user) {
    const others = CLUBS.filter(c => !c.boss && c.id !== user).map(c => c.id).sort(() => Math.random() - .5).slice(0, 7);
    const all = [user, ...others];
    Store.d.tournament = { user, groups: { A: all.slice(0, 4), B: all.slice(4, 8) }, md: 0, results: [], phase: 'group', semis: null, semiRes: [], final: null, finalRes: null, champion: null, stadium: UI.quick.stadium, log: [] };
    Store.save();
  },
  sim(a, b, ko) {
    const oa = teamOvr(a), ob = teamOvr(b);
    const ga = poisson(1.35 * Math.exp((oa - ob) / 14)), gb = poisson(1.35 * Math.exp((ob - oa) / 14));
    const r = { a, b, ga, gb };
    if (ko && ga === gb) { const pa = 3 + Math.floor(Math.random() * 3); r.pa = pa; r.pb = Math.random() < .5 ? pa - 1 : pa + 1; }
    return r;
  },
  winner(r) { return r.ga > r.gb ? r.a : r.gb > r.ga ? r.b : (r.pa > r.pb ? r.a : r.b); },
  pairs: [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]],
  table(g) {
    const T = Store.d.tournament, rows = {};
    T.groups[g].forEach(id => rows[id] = { id, sp: 0, s: 0, u: 0, n: 0, tf: 0, tg: 0, pts: 0 });
    T.results.filter(r => r.g === g).forEach(r => {
      const A = rows[r.a], B = rows[r.b]; A.sp++; B.sp++; A.tf += r.ga; A.tg += r.gb; B.tf += r.gb; B.tg += r.ga;
      if (r.ga > r.gb) { A.s++; B.n++; A.pts += 3; } else if (r.ga < r.gb) { B.s++; A.n++; B.pts += 3; } else { A.u++; B.u++; A.pts++; B.pts++; }
    });
    return Object.values(rows).sort((x, y) => y.pts - x.pts || (y.tf - y.tg) - (x.tf - x.tg) || y.tf - x.tf || teamOvr(y.id) - teamOvr(x.id));
  },
  next() {
    const T = Store.d.tournament; if (!T || T.phase === 'done') return null;
    if (T.phase === 'group') {
      for (const g of ['A', 'B']) for (const [i, j] of this.pairs[T.md]) {
        const a = T.groups[g][i], b = T.groups[g][j];
        if (a === T.user) return { opp: b, ko: false, label: `Gruppe ${g} · Spieltag ${T.md + 1}` };
        if (b === T.user) return { opp: a, ko: false, label: `Gruppe ${g} · Spieltag ${T.md + 1}` };
      }
    }
    if (T.phase === 'semi') { const s = T.semis.find(p => p.includes(T.user)); return { opp: s[0] === T.user ? s[1] : s[0], ko: true, label: 'Halbfinale' }; }
    if (T.phase === 'final') return { opp: T.final[0] === T.user ? T.final[1] : T.final[0], ko: true, label: 'FINALE' };
    return null;
  },
  record(res, outcome) {
    const T = Store.d.tournament; if (!T) return '';
    const u = res.userSide, nx = this.next(); if (!nx) return '';
    const ur = { a: T.user, b: nx.opp, ga: res.teams[u].score, gb: res.teams[u ^ 1].score };
    if (res.pens) { ur.pa = res.pens[u]; ur.pb = res.pens[u ^ 1]; }
    let msg = '';
    if (T.phase === 'group') {
      const g = T.groups.A.includes(T.user) ? 'A' : 'B'; ur.g = g; T.results.push(ur);
      for (const gg of ['A', 'B']) for (const [i, j] of this.pairs[T.md]) {
        const a = T.groups[gg][i], b = T.groups[gg][j]; if (a === T.user || b === T.user) continue;
        const r = this.sim(a, b, false); r.g = gg; T.results.push(r);
      }
      T.md++;
      if (T.md >= 3) {
        const A = this.table('A'), B = this.table('B');
        T.semis = [[A[0].id, B[1].id], [B[0].id, A[1].id]]; T.phase = 'semi';
        if (!T.semis.flat().includes(T.user)) { msg = 'Leider in der Gruppenphase ausgeschieden.'; this.autoFinish(); }
        else msg = 'Gruppenphase überstanden – weiter im Halbfinale!';
      } else msg = `Spieltag ${T.md} abgeschlossen.`;
    } else if (T.phase === 'semi') {
      T.semiRes = T.semis.map(s => s.includes(T.user) ? ur : this.sim(s[0], s[1], true));
      const winners = T.semiRes.map(r => this.winner(r));
      T.final = winners; T.phase = 'final';
      if (!winners.includes(T.user)) { msg = 'Im Halbfinale ausgeschieden.'; this.autoFinish(); } else msg = 'Ab ins FINALE!';
    } else if (T.phase === 'final') {
      T.finalRes = ur; T.champion = this.winner(ur); this.done();
      msg = T.champion === T.user ? '🏆 TURNIERSIEG! +5.000 Münzen' : 'Finale verloren – starke Leistung!';
    }
    return msg;
  },
  autoFinish() {
    const T = Store.d.tournament;
    if (T.phase === 'semi') { T.semiRes = T.semis.map(s => this.sim(s[0], s[1], true)); T.final = T.semiRes.map(r => this.winner(r)); T.phase = 'final'; }
    if (T.phase === 'final') { T.finalRes = this.sim(T.final[0], T.final[1], true); T.champion = this.winner(T.finalRes); }
    this.done();
  },
  done() {
    const T = Store.d.tournament, d = Store.d; T.phase = 'done'; d.stats.tourPlayed++;
    if (T.champion === T.user) { d.stats.tourWon++; d.coins += 5000; d.xp += 100; }
    d.tournamentHistory.push({ user: T.user, champion: T.champion, date: Date.now() });
    Store.save();
  }
};
UI.pages.tournament = function () {
  const d = Store.d, T = d.tournament, q = this.quick;
  if (!T) {
    const ids = ['MY', ...CLUBS.filter(c => !c.boss).map(c => c.id)];
    this.page('TURNIER', `<div class="setup">
      <p>8 Teams · 2 Gruppen à 4 (jeder gegen jeden) · die besten 2 jeder Gruppe erreichen das Halbfinale · K.-o.-Spiele mit Verlängerung und Elfmeterschießen. Fortschritt wird automatisch gespeichert. Siegprämie: 🪙 5.000.</p>
      <h3>Mit welchem Team?</h3><div class="teamrow">${ids.map(id => this.teamChip(id, id === q.home, 'home')).join('')}</div>
      <div class="row"><label>Stadion</label><div class="chips">${this.stadiumChips(q.stadium)}</div></div>
      ${this.settingsChips()}
      <button class="btn huge primary" id="tStart">🏆 TURNIER STARTEN</button>
      ${d.tournamentHistory.length ? `<h3>Bisherige Turniere</h3><ul>${d.tournamentHistory.slice(-5).reverse().map(h => `<li>${new Date(h.date).toLocaleDateString('de-DE')}: ${esc(teamName(h.user))} – Sieger: <b>${esc(teamName(h.champion))}</b></li>`).join('')}</ul>` : ''}
    </div>`);
    const rr = () => this.render('tournament');
    this.bindChips('home', v => { q.home = v; rr(); });
    this.bindChips('stad', v => { q.stadium = v; rr(); });
    this.bindSettingsChips(rr);
    $('#tStart').onclick = () => { Sound.click(); Tournament.create(q.home === 'GAL' ? 'MY' : q.home); rr(); };
    return;
  }
  const tbl = g => `<div class="box"><h3>Gruppe ${g}</h3><table class="tbl"><tr><th>#</th><th>Team</th><th>Sp</th><th>S</th><th>U</th><th>N</th><th>Tore</th><th>Pkt</th></tr>${Tournament.table(g).map((r, i) => `<tr class="${r.id === T.user ? 'me' : ''} ${i < 2 ? 'q' : ''}"><td>${i + 1}</td><td>${esc(teamName(r.id))}</td><td>${r.sp}</td><td>${r.s}</td><td>${r.u}</td><td>${r.n}</td><td>${r.tf}:${r.tg}</td><td><b>${r.pts}</b></td></tr>`).join('')}</table></div>`;
  const res = r => `${esc(teamName(r.a))} <b>${r.ga}:${r.gb}</b>${r.pa !== undefined ? ` (${r.pa}:${r.pb} n.E.)` : ''} ${esc(teamName(r.b))}`;
  const nx = Tournament.next();
  const ko = T.semis ? `<div class="box"><h3>K.-o.-Runde</h3>
    <p>Halbfinale 1: ${T.semiRes[0] ? res(T.semiRes[0]) : esc(teamName(T.semis[0][0])) + ' – ' + esc(teamName(T.semis[0][1]))}</p>
    <p>Halbfinale 2: ${T.semiRes[1] ? res(T.semiRes[1]) : esc(teamName(T.semis[1][0])) + ' – ' + esc(teamName(T.semis[1][1]))}</p>
    <p><b>Finale:</b> ${T.finalRes ? res(T.finalRes) : T.final ? esc(teamName(T.final[0])) + ' – ' + esc(teamName(T.final[1])) : 'offen'}</p></div>` : '';
  this.page('TURNIER', `<div class="setup">
    ${T.phase === 'done' ? `<div class="champ">🏆 Turniersieger: <b>${esc(teamName(T.champion))}</b></div>` : ''}
    ${nx ? `<div class="nextm"><div>${nx.label}</div><div class="vs">${esc(teamName(T.user))} <span>vs</span> ${esc(teamName(nx.opp))}</div><button class="btn huge primary" id="tPlay">▶ SPIELEN</button></div>` : ''}
    <div class="two">${tbl('A')}${tbl('B')}</div>
    ${ko}
    <div class="box"><h3>Ergebnisse</h3>${T.results.map(r => `<div>${res(r)}</div>`).join('') || '<p class="muted">Noch keine Spiele.</p>'}</div>
    <div class="btnrow">${T.phase === 'done' ? '<button class="btn primary" id="tNew">Neues Turnier</button>' : '<button class="btn danger" id="tAbort">Turnier abbrechen</button>'}</div>
  </div>`);
  const rr = () => this.render('tournament');
  if ($('#tPlay')) $('#tPlay').onclick = () => {
    Sound.click();
    this.startMatch({ mode: 'tournament', tournamentMatch: true, ko: nx.ko, homeId: T.user, awayId: nx.opp, teams: [TeamFactory.get(T.user), TeamFactory.get(nx.opp)], stadium: T.stadium || 'nordlicht' });
  };
  if ($('#tNew')) $('#tNew').onclick = () => { d.tournament = null; Store.save(); rr(); };
  if ($('#tAbort')) $('#tAbort').onclick = () => { d.tournament = null; Store.save(); this.toast('Turnier abgebrochen'); rr(); };
};
