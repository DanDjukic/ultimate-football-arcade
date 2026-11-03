'use strict';
/* ============ Engine: Spielschleife, HUD, Pause, Halbzeit/Abpfiff ============ */
const Engine = {
  canvas: null, game: null, raf: 0, last: 0, paused: false, ending: false,
  init() {
    this.canvas = document.getElementById('game');
    R.ctx = this.canvas.getContext('2d');
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    this.resize();
    Input.bind();
    this.canvas.addEventListener('pointerdown', () => { if (this.game) this.game.skipReplay(); });
    document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
    document.getElementById('btnResume').addEventListener('click', () => this.togglePause(false));
    document.getElementById('btnQuit').addEventListener('click', () => this.quit());
    document.getElementById('btnBreak').addEventListener('click', () => {
      document.getElementById('breakOverlay').classList.add('hidden');
      if (this.game && this.game.nextPeriod) this.game.nextPeriod();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.game && !this.paused) this.togglePause(true); });
  },
  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const q = Store.d ? Store.d.settings.quality : 'hoch';
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'hoch' ? 2 : q === 'mittel' ? 1.5 : 1);
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    R.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); R.W = W; R.H = H;
  },
  focal() { return R.H < 500 ? R.W * .95 : Math.max(R.W * .78, R.H * 1.3); },
  start(game) {
    this.stop();
    this.game = game; this.paused = false; this.ending = false;
    UI.show('match');
    document.body.classList.toggle('pen-mode', game.mode === 'penalties');
    document.body.classList.toggle('train-mode', !!game.training);
    document.getElementById('pauseOverlay').classList.add('hidden');
    document.getElementById('breakOverlay').classList.add('hidden');
    document.getElementById('shootLbl').textContent = 'SCHUSS';
    this.resize();
    R.buildCrowd(game.st, Store.d.settings.quality);
    Input.reset(); Input.active = true;
    Sound.init(); Sound.crowd(true); Sound.crowdLevel(.3);
    this.setupHUD();
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { }); } catch (e) { }
    this.last = performance.now();
    const loop = ts => {
      const dt = Math.min(.05, (ts - this.last) / 1000); this.last = ts;
      if (!this.paused && this.game) this.game.update(dt);
      Input.consume();
      if (this.game) { this.game.render(); this.updateHUD(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },
  stop() {
    cancelAnimationFrame(this.raf); this.raf = 0; this.game = null; Input.active = false; Input.reset();
    Sound.crowd(false);
    document.body.classList.remove('pen-mode', 'train-mode');
  },
  setupHUD() {
    const g = this.game, [a, b] = g.teams;
    const sb = document.getElementById('scoreboard');
    sb.classList.toggle('hidden', !!g.training);
    document.getElementById('sbHome').textContent = a.short; document.getElementById('sbAway').textContent = b.short;
    document.getElementById('sbHomeC').style.background = a.c1; document.getElementById('sbAwayC').style.background = b.c1;
    document.getElementById('trainPanel').classList.toggle('hidden', !g.training);
    document.getElementById('ticker').textContent = '';
  },
  updateHUD() {
    const g = this.game; if (!g) return;
    if (g.mode === 'penalties') {
      document.getElementById('sbScore').textContent = `${g.teams[0].score} : ${g.teams[1].score}`;
      document.getElementById('sbTime').textContent = 'ELF';
      const lbl = g.turn === 1 ? 'HECHTEN' : 'SCHUSS';
      const el = document.getElementById('shootLbl'); if (el.textContent !== lbl) el.textContent = lbl;
      return;
    }
    if (g.training) {
      const tr = g.tr;
      document.getElementById('trainPanel').innerHTML = `<b>TRAININGSPLATZ</b><span>⚽ Tore: ${tr.goals}</span><span>🎯 Pässe angekommen: ${tr.passes}</span><span>🚩 Slalom: ${tr.timer !== null ? tr.timer.toFixed(1) + ' s' : tr.best !== null ? 'Bestzeit ' + tr.best.toFixed(2) + ' s' : 'Start bei den Hütchen links'}</span><span>⭐ Trainings-XP: +${tr.xp}</span>`;
      return;
    }
    document.getElementById('sbScore').textContent = `${g.teams[0].score} : ${g.teams[1].score}`;
    document.getElementById('sbTime').textContent = g.minute().txt;
    const cards = t => '🟥'.repeat(t.stats.red);
    document.getElementById('sbCards').textContent = (cards(g.teams[0]) + ' ' + cards(g.teams[1])).trim();
  },
  togglePause(force) {
    if (!this.game || this.ending) return;
    this.paused = force === undefined ? !this.paused : force;
    document.getElementById('pauseOverlay').classList.toggle('hidden', !this.paused);
    Input.reset();
    if (this.paused && window.speechSynthesis) speechSynthesis.cancel();
    const g = this.game;
    document.getElementById('btnQuit').textContent = g.training ? 'Training beenden' : 'Spiel aufgeben';
  },
  showBreak(title, btn) {
    const g = this.game;
    document.getElementById('breakTitle').textContent = title;
    document.getElementById('breakScore').textContent = `${g.teams[0].name}  ${g.teams[0].score} : ${g.teams[1].score}  ${g.teams[1].name}`;
    document.getElementById('btnBreak').textContent = btn;
    document.getElementById('breakOverlay').classList.remove('hidden');
    Input.reset();
  },
  finish(res) {
    if (this.ending) return; this.ending = true;
    setTimeout(() => { this.stop(); UI.onMatchEnd(res); }, 1800);
  },
  quit() {
    const g = this.game; this.paused = false;
    document.getElementById('pauseOverlay').classList.add('hidden');
    if (!g) return;
    if (g.training) { const xp = g.tr.xp; this.stop(); UI.onTrainingEnd(xp); return; }
    if (g.mode === 'penalties') { this.stop(); UI.show('menu'); return; }
    // Aufgeben = 0:3-Wertung im Turnier, sonst einfach Ende
    const res = g.result(false); res.forfeit = true;
    if (g.user >= 0 && g.mode === 'tournament') { res.teams[g.user].score = 0; res.teams[g.user ^ 1].score = Math.max(3, res.teams[g.user ^ 1].score); }
    this.stop(); UI.onMatchEnd(res);
  }
};
