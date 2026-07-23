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
    aiUpdate(g, dt) {
      g._aiT = (g._aiT || 0) + dt;
      if (g._aiT < CFG.VS_AI_PERIOD) return;
      g._aiT = 0;
      this.aiLearn(g);      // học phép rẻ nhất có thể
      this.aiCast(g);       // thi triển phép phòng thủ khi có cụm quái
      this.aiSpend(g);      // xây dàn nền rồi DỒN nâng cấp
    }

    aiLearn(g) {
      if (g.learned.size >= CFG.MAX_SKILLS) return;
      let best = null;
      for (const key in CFG.SKILLS) { const s = CFG.SKILLS[key]; if (g.canLearn(key) && g.sp >= s.learn && (!best || s.learn < best.learn)) best = s; }
      if (best) g.learnSkill(best.key);
    }

    aiCast(g) {
      // tìm cụm quái BỘ đông nhất -> mưa lửa/kiếm thần; ưu tiên phép global sẵn sàng
      for (const key of ["kiemThan", "meTran", "dichChuyen"]) if (g.learned.has(key) && g.castable(key)) { g.castSkill(key); return; }
      if (g.learned.has("muaLua") && g.castable("muaLua")) {
        const c = this.biggestCluster(g, false); if (c && c.n >= 3) { g.castSkill("muaLua", c.x, c.y); return; }
      }
      if (g.learned.has("baoSet") && g.castable("baoSet")) {
        const c = this.biggestCluster(g, true); if (c && c.n >= 3) { g.castSkill("baoSet", c.x, c.y); return; }
      }
      // phép quấy rối đối thủ khi rảnh
      for (const key of ["diaChan", "trieuHoi", "huyetQuy", "maGiap"]) if (g.learned.has(key) && g.castable(key)) { g.castSkill(key); return; }
    }

    biggestCluster(g, air) {
      const R = 1.6 * TILE; let best = null;
      for (const a of g.enemies) {
        if (a.dead || a.leaked || a.fly !== air) continue;
        let n = 0; for (const b of g.enemies) if (!b.dead && !b.leaked && b.fly === air && STM.util.dist(a.x, a.y, b.x, b.y) <= R) n++;
        if (!best || n > best.n) best = { x: a.x, y: a.y, n };
      }
      return best;
    }

    // Quyết định TIÊU VÀNG: xây dàn nền tới ngưỡng rồi DỒN nâng cấp (ít tháp mạnh > nhiều tháp cấp 1)
    aiSpend(g) {
      const nonSup = g.towers.filter((t) => !t.support).length;
      const needAir = g.towers.filter((t) => t.def.target !== "ground" && !t.support).length < 2; // luôn giữ ≥2 tháp đánh bay
      // Giai đoạn 1: dựng ~10 tháp nền (mê cung đủ dài) + đủ phòng không
      if (nonSup < 10 || needAir) { this.aiBuild(g, needAir); return; }
      // Giai đoạn 2: DỒN nâng cấp; hết chỗ nâng mới xây thêm tới ~13
      if (this.aiUpgrade(g)) return;
      if (nonSup < 13 && g.gold >= 50) this.aiBuild(g, false);
    }

    aiUpgrade(g) {
      const cands = g.towers.filter((t) => t.ready && !t.maxLevel && g.gold >= t.upgradeCost && !t.support);
      if (!cands.length) return false;
      // nâng tháp CẤP THẤP nhất trước (đồng đều), ưu tiên tháp sát thương chính (lua/ten/set), tie-break rẻ nhất
      const dpsRank = { lua: 0, ten: 1, set: 1, doc: 2, bang: 3 };
      cands.sort((a, b) => a.level - b.level || (dpsRank[a.type] ?? 5) - (dpsRank[b.type] ?? 5) || a.upgradeCost - b.upgradeCost);
      const t = cands[0];
      g.selected = t; g.upgradeSelected(); g.selected = null;
      return true;
    }

    aiBuild(g, wantAir) {
      // wantAir: cần tháp đánh bay. Nếu không, dựng dàn DPS bộ mạnh (lua) + tên (cả bay+bộ)
      const flySoon = wantAir || CFG.waveInfo(g.wave + 1).fly || g.enemies.some((e) => e.fly);
      const pref = wantAir ? ["set", "ten"] : flySoon ? ["ten", "lua", "set", "bang"] : ["lua", "ten", "bang", "doc"];
      let type = null;
      for (const p of pref) { const d = CFG.TOWERS[p]; if (d && g.gold >= d.cost) { type = p; break; } }
      if (!type) return;
      const cell = this.aiPickCell(g);
      if (!cell) return;
      g.buildType = type; g.placeSelected(cell.c, cell.r); g.buildType = null; g.selected = null;
    }

    // Chọn ô đặt tháp: xây MÊ CUNG — ưu tiên ô khiến đường quái DÀI nhất (quái đi lâu = ăn nhiều đạn)
    aiPickCell(g) {
      const entries = (g.openEntries && g.openEntries().length) ? g.openEntries() : g.map.entries;
      const pathLen = (blocks) => { const d = g.computeFlowWith(blocks); let mn = Infinity; for (const e of entries) mn = Math.min(mn, d[e.r][e.c]); return mn; };
      let best = null, bestScore = -1;
      for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
        if (!g.canPlaceTower(c, r)) continue;
        const key = c + "," + r;
        const tmp = new Set(g.blockSet); tmp.add(key);
        const len = pathLen(tmp);
        if (!isFinite(len)) continue;                 // an toàn: bỏ ô làm nghẽn
        const center = 6 - (Math.abs(c - 6) + Math.abs(r - 6)) * 0.15;   // hơi thiên tâm để tháp phủ nhau
        const score = len * 3 + center + Math.random();  // ƯU TIÊN kéo dài đường
        if (score > bestScore) { bestScore = score; best = { c, r }; }
      }
      return best || null;
    }
  }

  STM.Match = Match;
  STM.makeAIGame = makeAIGame;
})(window.STM = window.STM || {});
