'use strict';
/* ============ UI: Navigation, Schnelles Spiel, Ergebnis, Einstellungen, Training ============ */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const UI = {
  cur: 'menu', pages: {}, quick: { home: 'MY', away: 'RSR', stadium: 'nordlicht' },
  init() {
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { Sound.init(); Sound.click(); this.go(b.dataset.go); }));
    $('#backBtn').addEventListener('click', () => { Sound.click(); this.go(this.backTo || 'menu'); });
    $('#modalX').addEventListener('click', () => this.closeModal());
    $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') this.closeModal(); });
    document.body.addEventListener('touchmove', e => { if (this.cur === 'match') e.preventDefault(); }, { passive: false });
    this.refreshMenu();
  },
  show(name) {
    this.cur = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (name === 'menu') { $('#scr-menu').classList.add('active'); this.refreshMenu(); }
    else if (name === 'match') $('#scr-match').classList.add('active');
    else $('#scr-page').classList.add('active');
  },
  go(name, arg) {
    if (name === 'menu') { this.show('menu'); return; }
    const p = this.pages[name]; if (!p) return;
    this.backTo = 'menu';
    this.show(name);
    this.render(name, arg);
  },
  render(name, arg) { this.curPage = name; this.pages[name].call(this, arg); this.refreshWallet(); $('#pageBody').scrollTop = 0; },
  page(title, html) { $('#pageTitle').textContent = title; $('#pageBody').innerHTML = html; },
  refreshWallet() {
    const d = Store.d;
    document.querySelectorAll('.coinsTxt').forEach(e => e.textContent = `🪙 ${d.coins.toLocaleString('de-DE')}  ⭐ ${d.xp} XP`);
    $('#coins').textContent = `🪙 ${d.coins.toLocaleString('de-DE')}`; $('#xp').textContent = `⭐ ${d.xp} XP`;
  },
  refreshMenu() {
    this.refreshWallet();
    const d = Store.d;
    $('#menuColl').textContent = `${d.collection.length} Karten · Beste GES ${d.collection.reduce((m, i) => Math.max(m, effCard(i).ges), 0)}`;
    const def = TeamFactory.mine();
    $('#menuTeam').textContent = `${d.lineup.formation} · Team-GES ${TeamFactory.ovr(def)}`;
    const best = d.collection.map(effCard).sort((a, b) => b.ges - a.ges).slice(0, 3);
    $('#menuCards').innerHTML = best.map(c => cardHTML(c, { size: 'xs' })).join('');
  },
  toast(msg, ms = 2200) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('show'), ms);
  },
  modal(html, cls = '') { $('#modalBody').innerHTML = html; $('#modal').className = cls; $('#modal').classList.remove('hidden'); },
  closeModal() { $('#modal').classList.add('hidden'); if (this.onModalClose) { const f = this.onModalClose; this.onModalClose = null; f(); } },
  chips(items, sel, attr) {
    return items.map(i => `<button class="chip ${i.v === sel ? 'sel' : ''}" data-${attr}="${i.v}">${i.l}</button>`).join('');
  },
  bindChips(attr, fn) { document.querySelectorAll(`[data-${attr}]`).forEach(b => b.addEventListener('click', () => { Sound.click(); fn(b.dataset[attr]); })); },
  teamChip(id, sel, attr) {
    const def = TeamFactory.get(id), club = id === 'MY' ? { id: 'MY', short: 'MEIN', name: def.name, c1: def.c1, c2: def.c2 } : CLUB_BY_ID[id];
    return `<button class="teamchip ${sel ? 'sel' : ''}" data-${attr}="${id}">${badgeSVG(club, 30)}<b>${esc(def.name)}</b><small>GES ${TeamFactory.ovr(def)}${club.boss ? ' · BOSS' : ''}</small></button>`;
  },
  settingsChips() {
    const s = Store.d.settings;
    return `<div class="row"><label>Schwierigkeit</label><div class="chips">${this.chips(Object.keys(DIFF).map(k => ({ v: k, l: DIFF[k].n })), s.difficulty, 'diff')}</div></div>
      <div class="row"><label>Halbzeitlänge</label><div class="chips">${this.chips([2, 3, 4, 6].map(v => ({ v: String(v), l: v + ' Min' })), String(s.halfMin), 'half')}</div></div>`;
  },
  bindSettingsChips(rerender) {
    this.bindChips('diff', v => { Store.d.settings.difficulty = v; Store.save(); rerender(); });
    this.bindChips('half', v => { Store.d.settings.halfMin = +v; Store.save(); rerender(); });
  },
  stadiumChips(sel) { return this.chips(Object.keys(STADIUMS).map(k => ({ v: k, l: STADIUMS[k].n })), sel, 'stad'); },
  startMatch(cfg) {
    cfg.halfMin = cfg.halfMin || Store.d.settings.halfMin;
    if (cfg.userSide === undefined) cfg.userSide = 0;
    this.lastCfg = cfg;
    Engine.start(new Game(cfg));
  },
  /* ---------- Ergebnis ---------- */
  onMatchEnd(res) {
    if (res.mode === 'penalties' && res.cfg.after) {
      const m = res.cfg.after; m.pens = res.pens; m.needPens = false; return this.onMatchEnd(m);
    }
    if (res.needPens && !res.forfeit) {
      this.toast('Unentschieden – Elfmeterschießen!');
      Engine.start(new PenaltyGame({ teams: res.cfg.teams, stadium: res.cfg.stadium, after: res }));
      return;
    }
    const d = Store.d, u = res.userSide, st = d.stats;
    let outcome = 'draw', coins = 0, xp = 0;
    if (res.mode === 'penalties') {
      outcome = res.pens[0] > res.pens[1] ? 'win' : 'loss';
      coins = outcome === 'win' ? 300 : 80; xp = 10;
    } else {
      const a = res.teams[u].score, b = res.teams[u ^ 1].score;
      outcome = a > b ? 'win' : a < b ? 'loss' : 'draw';
      if (res.pens) outcome = res.pens[u] > res.pens[u ^ 1] ? 'win' : 'loss';
      coins = (outcome === 'win' ? 400 : outcome === 'draw' ? 200 : 100) + a * 50;
      xp = outcome === 'win' ? 25 : 12;
      if (res.forfeit) { coins = 0; xp = 0; outcome = 'loss'; }
      st.matches++; st.goals += a;
      if (outcome === 'win') st.wins++; else if (outcome === 'draw') st.draws++; else st.losses++;
    }
    d.coins += coins; d.xp += xp;
    let tourMsg = '';
    if (res.cfg.tournamentMatch) tourMsg = Tournament.record(res, outcome) || '';
    Store.save();
    this.lastResult = { res, outcome, coins, xp, tourMsg };
    this.go('result');
  },
  onTrainingEnd(xp) {
    Store.d.xp += xp; Store.save();
    this.toast(`Training beendet: +${xp} Trainings-XP`);
    this.go('training');
  }
};

UI.pages.result = function () {
  const { res, outcome, coins, xp, tourMsg } = this.lastResult;
  const [a, b] = res.teams;
  const label = { win: 'SIEG!', draw: 'UNENTSCHIEDEN', loss: 'NIEDERLAGE' }[outcome];
  let score = res.mode === 'penalties' ? `${res.pens[0]} : ${res.pens[1]}` : `${a.score} : ${b.score}`;
  const penTxt = res.pens && res.mode !== 'penalties' ? `<div class="pens">n.E. ${res.pens[0]} : ${res.pens[1]}</div>` : res.mode === 'penalties' ? '<div class="pens">Elfmeterschießen</div>' : '';
  const sc = i => (res.scorers || []).filter(s => s.team === i).map(s => `<div>⚽ ${esc(s.name)} ${s.min}${s.og ? ' (ET)' : ''}</div>`).join('') || '<div class="muted">–</div>';
  const poss = a.stats ? Math.round(a.stats.poss / Math.max(1, a.stats.poss + b.stats.poss) * 100) : 50;
  const row = (l, x, y) => `<tr><td>${x}</td><th>${l}</th><td>${y}</td></tr>`;
  const stats = a.stats ? `<table class="stats">${row('Ballbesitz', poss + '%', (100 - poss) + '%')}${row('Schüsse', a.stats.shots, b.stats.shots)}${row('Aufs Tor', a.stats.onT, b.stats.onT)}${row('Pässe (angek.)', `${a.stats.passes} (${a.stats.passOk})`, `${b.stats.passes} (${b.stats.passOk})`)}${row('Tacklings', a.stats.tackles, b.stats.tackles)}${row('Paraden', a.stats.saves, b.stats.saves)}${row('Fouls', a.stats.fouls, b.stats.fouls)}${row('Gelb / Rot', a.stats.yellow + ' / ' + a.stats.red, b.stats.yellow + ' / ' + b.stats.red)}</table>` : '';
  this.page('ERGEBNIS', `
    <div class="result ${outcome}">
      <div class="res-label">${label}</div>
      <div class="res-score"><div class="rs-team"><i style="background:${a.c1}"></i>${esc(a.name)}</div><div class="rs-num">${score}</div><div class="rs-team">${esc(b.name)}<i style="background:${b.c1}"></i></div></div>
      ${penTxt}
      <div class="scorers"><div>${sc(0)}</div><div>${sc(1)}</div></div>
      ${stats}
      <div class="rewards">Belohnung: <b>🪙 +${coins}</b> · <b>⭐ +${xp} XP</b></div>
      ${tourMsg ? `<div class="tourmsg">${tourMsg}</div>` : ''}
      <div class="btnrow">
        ${res.cfg.tournamentMatch ? '<button class="btn primary" id="rTour">Weiter zum Turnier</button>' : `<button class="btn primary" id="rAgain">Revanche</button><button class="btn" id="rNew">Neues Match</button>`}
        <button class="btn ghost" id="rMenu">Hauptmenü</button>
      </div>
    </div>`);
  const bind = (id, f) => { const e = $(id); if (e) e.addEventListener('click', () => { Sound.click(); f(); }); };
  bind('#rTour', () => this.go('tournament'));
  bind('#rMenu', () => this.go('menu'));
  bind('#rNew', () => this.go(res.mode === 'penalties' ? 'penalty' : 'quick'));
  bind('#rAgain', () => {
    const c = this.lastCfg;
    if (res.mode === 'penalties') Engine.start(new PenaltyGame(Object.assign({}, res.cfg, { after: null })));
    else this.startMatch(Object.assign({}, c, { teams: [TeamFactory.get(c.homeId), TeamFactory.get(c.awayId)] }));
  });
};

UI.pages.quick = function () {
  const q = this.quick, ids = ['MY', ...CLUBS.map(c => c.id)];
  this.page('SCHNELLES SPIEL', `
    <div class="setup">
      <h3>Dein Team (Heim, du steuerst)</h3><div class="teamrow">${ids.map(id => this.teamChip(id, id === q.home, 'home')).join('')}</div>
      <h3>Gegner (Computer-KI)</h3><div class="teamrow">${ids.filter(i => i !== q.home).map(id => this.teamChip(id, id === q.away, 'away')).join('')}</div>
      <div class="row"><label>Stadion</label><div class="chips">${this.stadiumChips(q.stadium)}</div></div>
      ${this.settingsChips()}
      <button class="btn huge primary" id="kickoff">⚽ ANSTOSS</button>
    </div>`);
  const rr = () => this.render('quick');
  this.bindChips('home', v => { q.home = v; if (q.away === v) q.away = ids.find(i => i !== v); rr(); });
  this.bindChips('away', v => { q.away = v; rr(); });
  this.bindChips('stad', v => { q.stadium = v; rr(); });
  this.bindSettingsChips(rr);
  $('#kickoff').addEventListener('click', () => {
    Sound.click();
    this.startMatch({ mode: 'quick', homeId: q.home, awayId: q.away, teams: [TeamFactory.get(q.home), TeamFactory.get(q.away)], stadium: q.stadium });
  });
};

UI.pages.penalty = function () {
  const q = this.quick, ids = ['MY', ...CLUBS.map(c => c.id)];
  this.page('ELFMETERSCHIESSEN', `
    <div class="setup">
      <p class="muted">Schütze: Ziel mit dem Joystick bewegen, <b>SCHUSS</b> gedrückt halten (Kraft) und loslassen. Zu viel Kraft = Gefahr über das Tor.<br>
      Torwart: Richtung (links/rechts, oben = hoch) halten und <b>HECHTEN</b> drücken – vor oder kurz nach dem Schuss.</p>
      <h3>Dein Team</h3><div class="teamrow">${ids.map(id => this.teamChip(id, id === q.home, 'home')).join('')}</div>
      <h3>Gegner</h3><div class="teamrow">${ids.filter(i => i !== q.home).map(id => this.teamChip(id, id === q.away, 'away')).join('')}</div>
      <div class="row"><label>Stadion</label><div class="chips">${this.stadiumChips(q.stadium)}</div></div>
      <button class="btn huge primary" id="penGo">🥅 START</button>
      <p class="muted">Bisher verwandelte Elfmeter: ${Store.d.stats.pens}</p>
    </div>`);
  const rr = () => this.render('penalty');
  this.bindChips('home', v => { q.home = v; if (q.away === v) q.away = ids.find(i => i !== v); rr(); });
  this.bindChips('away', v => { q.away = v; rr(); });
  this.bindChips('stad', v => { q.stadium = v; rr(); });
  $('#penGo').addEventListener('click', () => {
    Sound.click();
    Engine.start(new PenaltyGame({ teams: [TeamFactory.get(q.home), TeamFactory.get(q.away)], stadium: q.stadium }));
  });
};

UI.pages.training = function () {
  const d = Store.d, lu = d.lineup.slots.map(u => u && Store.inst(u)).filter(Boolean);
  this.page('TRAINING', `
    <div class="setup">
      <div class="two">
        <div class="box">
          <h3>⚽ Trainingsplatz</h3>
          <p>Frei zugängliches Trainingsfeld: Torschüsse gegen einen Torwart, Doppelpässe mit 4 Mitspielern und ein Dribbel-Slalom (Hütchen auf der linken Seite). Jede Übung bringt Trainings-XP.</p>
          <button class="btn primary" id="trGo">Trainingsplatz betreten</button>
        </div>
        <div class="box">
          <h3>📈 Spielerentwicklung</h3>
          <p>Verbessere Einzelwerte mit Trainings-XP (⭐ ${d.xp}) und führe Rangaufstiege durch (+${RANK_BONUS} auf alle Werte je Rang, bis Rang ${MAX_RANK}; neue PlayStyles bei Rang 2 & 4, PlayStyle+ bei Rang 5). Doppelte Karten oder Münzen werden für Rangaufstiege genutzt.</p>
          <button class="btn" id="trColl">Alle Spieler ansehen</button>
        </div>
      </div>
      <h3>Deine Startelf – zum Entwickeln antippen</h3>
      <div class="cardgrid">${lu.map(i => cardHTML(effCard(i), { size: 'sm', uid: i.u })).join('')}</div>
    </div>`);
  $('#trGo').addEventListener('click', () => { Sound.click(); this.startTraining(); });
  $('#trColl').addEventListener('click', () => this.go('collection'));
  document.querySelectorAll('#pageBody .card[data-uid]').forEach(c => c.addEventListener('click', () => this.openUpgrade(+c.dataset.uid, () => this.render('training'))));
};
UI.startTraining = function () {
  const my = TeamFactory.mine();
  const field = my.entries.filter(e => e.slot !== 'GK');
  field.sort((a, b) => b.fx - a.fx);
  const ent = field.slice(0, 5);
  const gk = TeamFactory.club('BFC').entries[0];
  Engine.start(new Game({ mode: 'training', userSide: 0, stadium: 'sonnenpark', teams: [Object.assign({}, my, { entries: ent }), Object.assign({}, TeamFactory.club('BFC'), { entries: [gk] })] }));
};

UI.pages.settings = function () {
  const s = Store.d.settings;
  const tog = (k, l) => `<label class="tog"><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}><span>${l}</span></label>`;
  this.page('EINSTELLUNGEN', `
    <div class="setup">
      <h3>Spiel</h3>
      ${this.settingsChips()}
      <div class="row"><label>Grafikqualität</label><div class="chips">${this.chips(['hoch', 'mittel', 'niedrig'].map(v => ({ v, l: v[0].toUpperCase() + v.slice(1) })), s.quality, 'qual')}</div></div>
      <div class="row"><label>Tastengröße</label><div class="chips">${this.chips([['0.85', 'Klein'], ['1', 'Normal'], ['1.2', 'Groß']].map(v => ({ v: v[0], l: v[1] })), String(s.btnSize), 'bsz')}</div></div>
      ${tog('offside', 'Abseitsregel aktiv')}${tog('autoSwitch', 'Automatischer Spielerwechsel in der Defensive')}
      <h3>Sound</h3>
      ${tog('sound', 'Soundeffekte & Stadionatmosphäre')}${tog('voice', 'Kommentator-Stimme (Sprachausgabe des Geräts)')}
      <h3>Mein Team</h3>
      <div class="row"><label>Teamname</label><input id="tName" maxlength="24" value="${esc(s.teamName)}"></div>
      <div class="row"><label>Trikotfarben</label><input type="color" id="tC1" value="${s.c1}"><input type="color" id="tC2" value="${s.c2}"><span class="muted">Torwart</span><input type="color" id="tGK" value="${s.gk}"></div>
      <h3>Spielstand</h3>
      <p class="muted">Alles wird lokal im Browser gespeichert (LocalStorage) – ohne Anmeldung, ohne Server. Statistik: ${Store.d.stats.matches} Spiele · ${Store.d.stats.wins} Siege · ${Store.d.stats.goals} Tore · ${Store.d.stats.drafts} Drafts geöffnet · Beste gezogene GES ${Store.d.stats.best}</p>
      <button class="btn danger" id="resetAll">Spielstand zurücksetzen</button>
    </div>`);
  const rr = () => this.render('settings');
  this.bindSettingsChips(rr);
  this.bindChips('qual', v => { s.quality = v; Store.save(); rr(); });
  this.bindChips('bsz', v => { s.btnSize = +v; Store.save(); applyBtnSize(); rr(); });
  document.querySelectorAll('[data-set]').forEach(i => i.addEventListener('change', () => { s[i.dataset.set] = i.checked; Store.save(); if (i.dataset.set === 'sound' && !i.checked) Sound.crowd(false); }));
  $('#tName').addEventListener('change', e => { s.teamName = e.target.value.trim() || 'Mein Ultimate FC'; Store.save(); });
  ['C1', 'C2', 'GK'].forEach(k => $('#t' + k).addEventListener('change', e => { s[k === 'GK' ? 'gk' : k.toLowerCase()] = e.target.value; Store.save(); }));
  $('#resetAll').addEventListener('click', () => {
    this.modal(`<h2>Spielstand zurücksetzen?</h2><p>Alle Karten, Münzen und Fortschritte werden gelöscht.</p><div class="btnrow"><button class="btn danger" id="rsYes">Ja, löschen</button><button class="btn" id="rsNo">Abbrechen</button></div>`);
    $('#rsYes').addEventListener('click', () => { Store.reset(); this.closeModal(); this.toast('Spielstand zurückgesetzt'); this.go('menu'); });
    $('#rsNo').addEventListener('click', () => this.closeModal());
  });
};
function applyBtnSize() { document.documentElement.style.setProperty('--bs', Store.d.settings.btnSize || 1); }

window.addEventListener('DOMContentLoaded', () => {
  Store.load(); applyBtnSize();
  Engine.init(); UI.init();
  document.body.addEventListener('pointerdown', () => Sound.init(), { once: true });
});
