/* =====================================================================
 * match.js — Chế độ ĐỐI KHÁNG (tối đa 5 người: 1 người + tối đa 4 AI)
 *   • Mọi sân đối mặt CÙNG một chuỗi đợt quái (đồng bộ, không tự gọi trước)
 *   • host (sân người chơi) điều phối: bước các sân AI + đồng hồ đợt chung
 *   • AI tự xây/nâng tháp và thi triển phép
 *   • Ai để 10 quái về đích trước thì THẤT THỦ; còn 1 người trụ lại = THẮNG
 * ===================================================================== */
(function (STM) {
  "use strict";
  const CFG = STM.CFG, TILE = CFG.TILE;

  // Tạo một sân AI headless (canvas ẩn, không gắn vào DOM hiển thị)
  function makeAIGame(name) {
    const cv = (typeof document !== "undefined") ? document.createElement("canvas") : { getContext: () => ({}), addEventListener: () => {}, width: CFG.CANVAS_W, height: CFG.CANVAS_H };
    cv.width = CFG.CANVAS_W; cv.height = CFG.CANVAS_H;
    const g = new STM.Game(cv);
    g.name = name; g.ai = true; g.onChange = null;
    return g;
  }

  class Match {
    // players: [{name, ai:false}, {name, ai:true}, ...] — phần tử [0] là người chơi thật (host, dùng canvas chính)
    constructor(hostGame, players) {
      this.games = [];
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        const g = (i === 0) ? hostGame : makeAIGame(p.name);
        g.reset("endless");
        g.versus = true; g.match = this; g.pid = i; g.name = p.name; g.ai = !!p.ai && i !== 0;
        g._ranked = false; g._fellWave = 0;   // XÓA cờ xếp hạng sót từ ván trước (host tái dùng qua các ván)
        this.games.push(g);
      }
      this.host = this.games[0];
      this.wave = 0;
      this.waveTimer = CFG.VS_START_DELAY;                // đếm ngược tới đợt 1
      this.over = false; this.winner = null; this.ranking = [];
      this.onWave = null; this.onEnd = null;              // callback UI
    }

    interval() { return this.wave >= CFG.LATE_WAVE ? CFG.WAVE_INTERVAL_LATE : CFG.WAVE_INTERVAL; }

    launchWave() {
      this.wave++;
      for (const g of this.games) if (!g.gameOver) g.receiveWave(this.wave);
      this.waveTimer = this.interval();
      if (this.onWave) this.onWave(this.wave);
    }

    tick(dt) {
      if (this.over) return;
      if (this.host.paused) return;   // Dừng: đóng băng cả trận (đồng hồ đợt + sân AI)
      // bước các sân AI (host đã tự bước trong step của chính nó)
      for (const g of this.games) if (g !== this.host && !g.gameOver) { g.step(dt); if (g.ai) this.aiUpdate(g, dt); }
      // đồng hồ đợt CHUNG (chỉ chạy sau khi trận bắt đầu)
      if (this.started && !this.allCampaignDone()) { this.waveTimer -= dt; if (this.waveTimer <= 0) this.launchWave(); }
      this.checkElimination();
    }

    get started() { return this._started; }
    begin() { this._started = true; this.waveTimer = CFG.VS_START_DELAY; }
    allCampaignDone() { return false; }   // đối kháng chơi vô tận cho tới khi chỉ còn 1 người
    // ---- giao diện chung với NetMatch (để main.js vẽ đối thủ đồng nhất) ----
    net = false;
    aliveN() { return this.games.filter((g) => !g.gameOver).length; }
    opponentViews() {
      return this.games.filter((g) => g !== this.host).map((g) => ({
        pid: g.pid, name: g.name + (g.ai ? " 🤖" : ""), wave: g.wave, lives: g.lives, dead: g.gameOver,
        cores: g.cores.map((c) => ({ id: c.id, tier: c.tier })),   // lõi đối thủ đã chọn (để hiện ở ô đối thủ)
        draw: (cx, sz) => g.renderMini(cx, 0, 0, sz),
      }));
    }
    resultRows() { return this.ranking.map((g, i) => ({ name: g.name + (g.ai ? " 🤖" : " 👤"), win: i === 0, me: g === this.host, rank: i + 1, fellWave: g._fellWave || g.wave })); }

    checkElimination() {
      const alive = this.games.filter((g) => !g.gameOver);
      // ghi nhận thứ hạng cho những sân vừa gục
      for (const g of this.games) if (g.gameOver && !g._ranked) { g._ranked = true; g._fellWave = this.wave; this.ranking.unshift(g); }
      if (alive.length <= 1 && this.games.length > 1) {
        this.over = true;
        this.winner = alive[0] || null;
        if (this.winner && !this.winner._ranked) { this.winner._ranked = true; this.ranking.unshift(this.winner); }
        if (this.onEnd) this.onEnd(this);
      }
    }

    /* ------------------------------ AI ------------------------------ */
    // Bộ não bot ở js/ai.js (STM.AI) — dùng chung với server (bot LAN).
    aiUpdate(g, dt) { STM.AI.update(g, dt); }
  }

  STM.Match = Match;
  STM.makeAIGame = makeAIGame;
})(window.STM = window.STM || {});
