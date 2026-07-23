/* =====================================================================
 * game.js — lưới, flow-field, luật không chặn kín, buff aura,
 *           CÂY PHÉP (học bằng Điểm KN), thi triển phép, vòng lặp, render, chuột
 * ===================================================================== */
(function (STM) {
  "use strict";
  const CFG = STM.CFG, TILE = CFG.TILE, CELL = CFG.CELL, INF = Infinity;

  class Game {
    constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.reset("endless"); this._bindInput(); this.lastTime = 0; this._raf = null; }

    reset(mode) {
      this.mode = mode; this.map = CFG.buildMap(); this.grid = this.map.grid;
      this.gold = CFG.START_GOLD; this.sp = CFG.START_SP; this.lives = CFG.START_LIVES;
      this.score = 0; this.wave = 0;
      this.enemies = []; this.towers = []; this.traps = []; this.projectiles = []; this.effects = [];
      this.blockSet = new Set(); this.occupied = new Set();
      this.spawnQueue = []; this.gameOver = false; this.victory = false;
      this.started = false; this.spawnClock = 0; this.waveTimer = 0;  // đợt quái ra ĐỊNH KỲ
      this.speed = 1; this.paused = false; this.autoNext = true;       // tự gọi đợt định kỳ
      this.buildType = null; this.selected = null; this.hover = null; this.pendingSkill = null;
      this.skillCd = {}; this.learned = new Set(["muaLua"]);   // Mưa Lửa học sẵn mặc định
      this.frameCount = 0;
      // ----- đối kháng -----
      this.versus = false; this.ai = false; this.name = "Người Chơi"; this.pid = 0; this.match = null; this.netMatch = null;
      this.enemyHaste = 1; this.hasteTime = 0; this._aiT = 0;
      this.computeFlow(); this.buildTerrain(); this.emit();
    }

    /* ------------------- flow-field ------------------- */
    inBounds(c, r) { return c >= 0 && c < CFG.COLS && r >= 0 && r < CFG.ROWS; }
    isExitCell(c, r) { return this.map.exits.some((e) => e.c === c && e.r === r); }
    walkable(c, r, blocks) { if (!this.inBounds(c, r)) return false; const t = this.grid[r][c]; if (t === CELL.WALL || t === CELL.WATER) return false; return !(blocks || this.blockSet).has(c + "," + r); }
    // ô rìa (cổng) đang mở = không bị tháp bịt
    openEntries(blocks) { return this.map.entries.filter((e) => !(blocks || this.blockSet).has(e.c + "," + e.r)); }
    openExits(blocks) { return this.map.exits.filter((e) => !(blocks || this.blockSet).has(e.c + "," + e.r)); }
    enemySpawnCell() { const o = this.openEntries(); const l = o.length ? o : this.map.entries; return l[(Math.random() * l.length) | 0]; }
    computeFlowWith(blocks) {
      const dist = Array.from({ length: CFG.ROWS }, () => new Array(CFG.COLS).fill(INF)); const q = [];
      for (const e of this.map.exits) { if (!this.walkable(e.c, e.r, blocks)) continue; dist[e.r][e.c] = 0; q.push(e); }
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]; let h = 0;
      while (h < q.length) { const { c, r } = q[h++]; for (const [dc, dr] of dirs) { const nc = c + dc, nr = r + dr; if (!this.walkable(nc, nr, blocks)) continue; if (dist[nr][nc] > dist[r][c] + 1) { dist[nr][nc] = dist[r][c] + 1; q.push({ c: nc, r: nr }); } } }
      return dist;
    }
    computeFlow() { this.dist = this.computeFlowWith(this.blockSet); }
    distAt(c, r) { return this.inBounds(c, r) ? this.dist[r][c] : INF; }
    nextCell(c, r) { const cur = this.distAt(c, r); if (cur === 0 || cur === INF) return null; let best = null, bd = cur; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (!this.walkable(nc, nr)) continue; const d = this.distAt(nc, nr); if (d < bd) { bd = d; best = { c: nc, r: nr }; } } return best; }
    // ô ngẫu nhiên xa đích hơn (đẩy lùi) cho Bẫy Hút
    randomBackCell(c, r, back) {
      const cur = this.distAt(c, r); if (cur === INF) return null; const cand = [];
      for (let rr = 0; rr < CFG.ROWS; rr++) for (let cc = 0; cc < CFG.COLS; cc++) { if (this.grid[rr][cc] !== CELL.LAND) continue; if (this.blockSet.has(cc + "," + rr)) continue; const d = this.dist[rr][cc]; if (d > cur && d <= cur + back) cand.push({ c: cc, r: rr }); }
      if (!cand.length) return null; return cand[(Math.random() * cand.length) | 0];
    }

    /* --------------------- buff aura (Tháp Năng Lượng) --------------------- */
    recomputeAuras() {
      const sups = this.towers.filter((t) => t.support && t.ready);   // chỉ tháp Năng Lượng đã xây xong
      for (const t of this.towers) {
        if (t.support) continue; let dmg = 0, rate = 0;
        for (const s of sups) { const st = s.stats; if (STM.util.dist(t.x, t.y, s.x, s.y) <= st.range * TILE) { dmg += st.dmgBonus; rate += st.rateBonus; } }
        t.auraDmg = 1 + Math.min(2, dmg); t.auraRate = 1 / (1 + Math.min(2, rate));
      }
    }

    /* --------------------- xây / nâng / bán --------------------- */
    tileType(c, r) { return this.inBounds(c, r) ? this.grid[r][c] : CELL.WALL; }
    isLandFree(c, r) { return this.tileType(c, r) === CELL.LAND && !this.occupied.has(c + "," + r); }
    enemyOnCell(c, r) { for (const e of this.enemies) if (!e.fly && Math.floor(e.x / TILE) === c && Math.floor(e.y / TILE) === r) return true; return false; }
    wouldBlockPath(c, r) {
      const test = new Set(this.blockSet); test.add(c + "," + r);
      const oExit = this.openExits(test); if (!oExit.length) return true;      // không bịt được cả 2 cổng Tử
      const oEntry = this.openEntries(test); if (!oEntry.length) return true;   // không bịt được cả 2 cổng Sinh
      const d = this.computeFlowWith(test);
      for (const e of oEntry) if (d[e.r][e.c] === INF) return true;            // mọi cổng Sinh mở phải còn đường
      for (const e of this.enemies) { if (e.fly) continue; const ec = Math.floor(e.x / TILE), er = Math.floor(e.y / TILE); if (this.inBounds(ec, er) && d[er][ec] === INF) return true; }
      return false;
    }
    canPlaceTower(c, r) { return this.isLandFree(c, r) && !this.enemyOnCell(c, r) && !this.wouldBlockPath(c, r); }
    placeSelected(c, r) {
      const type = this.buildType; if (!type) return;
      const isTrap = !!CFG.TRAPS[type], def = isTrap ? CFG.TRAPS[type] : CFG.TOWERS[type];
      if (this.gold < def.cost) return;
      if (isTrap) { if (!this.isLandFree(c, r)) return; const t = new STM.Trap(type, c, r); this.traps.push(t); this.occupied.add(c + "," + r); this.gold -= def.cost; this.selected = t; }
      else { if (!this.canPlaceTower(c, r)) return; const t = new STM.Tower(type, c, r); t.startWork("build", CFG.workTime(def.cost, this.wave)); this.towers.push(t); this.occupied.add(c + "," + r); this.blockSet.add(c + "," + r); this.gold -= def.cost; this.selected = t; this.computeFlow(); this.recomputeAuras(); }
      this.emit();
    }
    // Nâng cấp: trừ vàng ngay, tăng cấp, nhưng CHỜ (chưa hiệu lực) trong UP_TIME.
    upgradeSelected() { const t = this.selected; if (!t || t.trap || t.maxLevel || !t.ready || this.gold < t.upgradeCost) return; const cost = t.upgradeCost; this.gold -= cost; t.upgrade(); t.startWork("up", CFG.workTime(cost, this.wave)); this.recomputeAuras(); this.emit(); }
    // Bán/tháo dỡ: KHÔNG gỡ ngay — vào trạng thái "sell" chờ SELL_TIME rồi mới gỡ & hoàn vàng.
    sellSelected() {
      const t = this.selected; if (!t) return;
      if (t.trap) { this.gold += t.sellValue; this.occupied.delete(t.col + "," + t.row); this.traps.splice(this.traps.indexOf(t), 1); this.selected = null; this.emit(); return; }
      if (t.action === "sell") return;   // đang tháo rồi
      t.startWork("sell", CFG.workTime(t.sellValue, this.wave)); this.emit();
    }
    // Phép ĐỊA CHẤN (đối kháng) — ở chế độ 2+ người, thi triển sẽ gọi hàm này trên MỖI đối thủ
    // (chọn 1 tháp của họ): cấp1 -> phá hủy (chờ như bán), cấp2+ -> tụt 1 cấp (chờ như nâng).
    randomReadyTower() { const r = this.towers.filter((t) => t.ready); return r.length ? r[(Math.random() * r.length) | 0] : null; }
    applyEarthquake(t) {
      if (!t || t.trap) return;
      if (t.level <= 1) { t.noRefund = true; t.startWork("sell", CFG.workTime(t.sellValue, this.wave)); }   // phá hủy, không hoàn vàng
      else { t.level--; t.startWork("up", CFG.workTime(t.upgradeCost, this.wave)); this.recomputeAuras(); }
      this.emit();
    }

    /* ---------------- đợt quái (ĐỊNH KỲ, có thể chồng lấn) ---------------- */
    get campaignDone() { return this.mode === "campaign" && this.wave >= CFG.CAMPAIGN_WAVES; }
    // Gọi đợt kế: xếp quái vào hàng chờ theo thời gian tuyệt đối (spawnClock), KHÔNG xoá đợt cũ.
    launchWave() {
      if (this.gameOver || this.victory || this.campaignDone) return;
      this.wave++;
      const w = CFG.buildWave(this.wave); let t = this.spawnClock + 0.2;
      for (let i = 0; i < w.count; i++) { this.spawnQueue.push({ at: t, w }); t += w.gap; }
      this.spawnQueue.sort((a, b) => a.at - b.at);
      this.score += 50 * this.wave;
      this.waveTimer = this.wave >= CFG.LATE_WAVE ? CFG.WAVE_INTERVAL_LATE : CFG.WAVE_INTERVAL; this.started = true; this.emit();
    }
    startWave() { if (this.versus) return; this.launchWave(); }   // đối kháng: đợt do MATCH điều khiển
    // ĐỐI KHÁNG: nhận đợt n từ MATCH (đồng bộ mọi người chơi, không tự gọi trước)
    receiveWave(n) {
      if (this.gameOver) return;
      this.wave = n; const w = CFG.buildWave(n); let t = this.spawnClock + 0.2;
      for (let i = 0; i < w.count; i++) { this.spawnQueue.push({ at: t, w }); t += w.gap; }
      this.spawnQueue.sort((a, b) => a.at - b.at); this.started = true; this.emit();
    }
    /* ---------- phép PvP tác động lên chính sân này (do đối thủ thi triển) ---------- */
    // Ô LAND ngẫu nhiên CHƯA xây tháp/bẫy — KỂ CẢ ô bị quây kín không còn đường về đích
    // (quái rơi vào đó sẽ đứng im, buộc đối thủ phải tự dọn bằng tháp/phép)
    randomSpawnableCell() {
      const cand = [];
      for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
        if (this.grid[r][c] !== CELL.LAND || this.occupied.has(c + "," + r)) continue;
        cand.push({ c, r });
      }
      return cand.length ? cand[(Math.random() * cand.length) | 0] : this.enemySpawnCell();
    }
    // Triệu Hồi: THẢ 1 quái (chủng do caster chọn -> giống nhau mọi người), vị trí ngẫu nhiên, mạnh theo đợt hiện tại
    pvpSummon(type) {
      type = type || CFG.randomSummonType(); const d = CFG.ENEMIES[type]; if (!d) return;
      const w = Math.max(1, this.wave), hpMul = Math.pow(1.135, w - 1) * (1 + w * 0.03);   // = độ mạnh đợt hiện tại
      const cell = this.randomSpawnableCell();
      const e = new STM.Enemy(d, hpMul, 1, this, false);
      e.x = (cell.c + 0.5) * TILE; e.y = (cell.r + 0.5) * TILE; e.remain = 1e9;
      this.enemies.push(e);
      this.effects.push(new BlastRing(e.x, e.y, TILE, "#c56bff")); this.emit();
    }
    pvpHaste() { this.enemyHaste = 1.6; this.hasteTime = 8; this.effects.push(new BlastRing(CFG.GRID_W / 2, CFG.GRID_H / 2, CFG.GRID_W / 2, "#ff6b6b")); }
    pvpArmor() { for (const e of this.enemies) if (!e.dead && !e.leaked) { const add = e.maxHp * 0.6; e.maxHp += add; e.hp += add; } this.effects.push(new BlastRing(CFG.GRID_W / 2, CFG.GRID_H / 2, CFG.GRID_W / 2, "#78909c")); }
    pvpQuake() { const t = this.randomReadyTower(); if (t) this.applyEarthquake(t); }
    opponents() { return this.match ? this.match.games.filter((g) => g !== this && !g.gameOver) : []; }
    // Người chơi thi triển phép PvP: local -> áp lên các sân đối thủ; mạng LAN -> gửi lên server
    castPvp(key) {
      const map = { trieuHoi: "pvpSummon", huyetQuy: "pvpHaste", maGiap: "pvpArmor", diaChan: "pvpQuake" };
      // Triệu Hồi: caster chọn 1 chủng -> mọi đối thủ nhận CÙNG chủng (vị trí vẫn ngẫu nhiên trên từng sân)
      const data = key === "trieuHoi" ? { type: CFG.randomSummonType() } : null;
      if (this.netMatch) { this.netMatch.sendSpell(key, data); return; }
      this.opponents().forEach((g) => g[map[key]](data && data.type));
    }
    // Ảnh chụp gọn sân này để vẽ minimap cho đối thủ (qua mạng)
    snapshot() {
      return {
        w: this.wave, lv: this.lives, go: this.gameOver ? 1 : 0,
        t: this.towers.map((t) => [t.col, t.row, t.ready ? 1 : 0, t.trap ? 1 : 0]),
        e: this.enemies.filter((e) => !e.dead && !e.leaked).map((e) => [Math.round(e.x), Math.round(e.y), e.fly ? 1 : 0]),
      };
    }
    // Ảnh chụp ĐẦY ĐỦ sân để lưu phiên & khôi phục sau F5/mất mạng (đối kháng LAN)
    serialize() {
      return {
        mapId: this.map.id, wave: this.wave, gold: this.gold, sp: this.sp, lives: this.lives, score: this.score,
        learned: [...this.learned], skillCd: { ...this.skillCd },
        towers: this.towers.map((t) => ({ k: t.type, c: t.col, r: t.row, lv: t.level })),
        traps: this.traps.map((t) => ({ k: t.type, c: t.col, r: t.row })),
      };
    }
    // tổng vàng đã đổ vào 1 tháp tới cấp `lv` (để tính giá bán khi khôi phục)
    _spentFor(def, lv) { let s = def.cost; for (let i = 1; i < lv; i++) s += CFG.upgradeCost(def, i); return s; }
    restore(s) {
      if (s.mapId) CFG.setMap(s.mapId);
      this.reset("endless");
      this.gold = s.gold; this.sp = s.sp; this.lives = s.lives; this.score = s.score || 0; this.wave = s.wave || 0;
      this.learned = new Set(s.learned && s.learned.length ? s.learned : ["muaLua"]);
      this.skillCd = s.skillCd || {};
      for (const t of s.towers || []) {
        const tw = new STM.Tower(t.k, t.c, t.r); tw.level = t.lv || 1; tw.totalSpent = this._spentFor(tw.def, tw.level);
        tw.buildTimer = 0; tw.action = null;
        this.towers.push(tw); this.occupied.add(t.c + "," + t.r); this.blockSet.add(t.c + "," + t.r);
      }
      for (const t of s.traps || []) { const tr = new STM.Trap(t.k, t.c, t.r); this.traps.push(tr); this.occupied.add(t.c + "," + t.r); }
      this.started = this.wave > 0;
      this.computeFlow(); this.recomputeAuras(); this.emit();
    }
    nextWavePreview() { const w = CFG.buildWave(this.wave + 1); return { name: CFG.ENEMIES[w.type].name, fly: CFG.ENEMIES[w.type].fly, boss: !!w.boss, count: w.count }; }
    updateSpawns() {
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.spawnClock) { const s = this.spawnQueue.shift(), w = s.w; this.enemies.push(new STM.Enemy(CFG.ENEMIES[w.type], w.hpMul, w.rwMul, this, w.boss)); }
    }
    onEnemyKilled(e) {
      this.gold += e.reward; this.sp += e.boss ? CFG.SP_PER_BOSS : CFG.SP_PER_KILL; this.score += e.reward * 2 + (e.boss ? 500 : 0);
      const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1);
      // Yêu Sên: chết đẻ ra con nhỏ hơn (boss snail đẻ ra sên thường, rồi mới ra sên nhỏ)
      if (e.split && !e.leaked) {
        const ct = e.isBoss ? e.def.key : e.splitInto, cdef = CFG.ENEMIES[ct];
        if (cdef) for (let k = 0; k < e.split; k++) { const c = new STM.Enemy(cdef, e.hpMul, e.rwMul, this, false); c.x = e.x + (Math.random() - .5) * 16; c.y = e.y + (Math.random() - .5) * 16; this.enemies.push(c); }
      }
      this.emit();
    }
    onEnemyLeak(e) { this.lives -= 1; const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1); if (this.lives <= 0) { this.lives = 0; this.gameOver = true; } this.emit(); }

    /* ------------------------- CÂY PHÉP ------------------------- */
    canLearn(key) { if (this.learned.has(key)) return false; if (this.learned.size >= CFG.MAX_SKILLS) return false; const s = CFG.SKILLS[key]; if (!s.parents.length) return true; return s.parents.some((p) => this.learned.has(p)); }
    learnSkill(key) { const s = CFG.SKILLS[key]; if (!this.canLearn(key) || this.sp < s.learn) return false; this.sp -= s.learn; this.learned.add(key); this.emit(); return true; }
    castable(key) { const s = CFG.SKILLS[key]; if (!this.learned.has(key)) return false; if (s.aim === "pvp" && !this.versus) return false; return (this.skillCd[key] || 0) <= 0; }
    armSkill(key) { const s = CFG.SKILLS[key]; if (!this.castable(key)) return; if (s.aim === "global" || s.aim === "pvp") { this.castSkill(key); return; } this.pendingSkill = key; this.buildType = null; this.selected = null; this.emit(); }
    castSkill(key, x, y, target) {
      const s = CFG.SKILLS[key]; if (!this.castable(key)) return; const D = STM.util.dist;
      switch (key) {
        case "muaLua": case "baoSet": {
          const r = s.radius * TILE, air = s.hits === "air";
          for (const e of this.enemies) if (!e.dead && !e.leaked && e.fly === air && D(e.x, e.y, x, y) <= r) e.applyDamage(s.dmg + s.pct * (e.maxHp - e.hp), true);   // % theo máu ĐÃ MẤT
          this.effects.push(new BlastRing(x, y, r, air ? "#fff3b0" : "#ffb057"));
          for (let i = 0; i < 7; i++) { const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r * .9, px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr, delay = Math.random() * .35; this.effects.push(air ? new BoltFx(px, py, delay) : new MeteorFx(px, py, delay)); }
          break;
        }
        case "khoiDoc": this.effects.push(new STM.PoisonCloud(x, y, s.radius * TILE, s.dps, s.dur, s.pctps)); break;
        case "phongAn": { const r = s.radius * TILE; for (const e of this.enemies) if (D(e.x, e.y, x, y) <= r) e.freeze(s.dur); this.effects.push(new BlastRing(x, y, r, "#bdeaff")); break; }
        case "nhatDuong": if (target && !target.dead) { if (target.boss) target.applyDamage(target.maxHp * .25, true); else target.applyDamage(target.hp + 1, true); this.effects.push(new StrikeFx(target.x, target.y, "#fff2a0")); } break;
        case "tangLuc": if (target && target instanceof STM.Tower && !target.support) { target.buff(s.mult, s.dur); this.effects.push(new PowerUpFx(target.x, target.y)); } break;
        case "kiemThan": { for (const e of this.enemies) if (!e.dead && !e.leaked) { e.applyDamage(s.dmg + s.pct * e.maxHp, true); this.effects.push(new SlashFx(e.x, e.y, "#fff0b0")); } this.effects.push(new FieldFlash("#ffe082", .45)); break; }
        case "meTran": for (const e of this.enemies) e.slow(s.slow, s.dur); this.effects.push(new FieldFlash("#88b8ff", .7)); break;
        case "dichChuyen": for (const e of this.enemies) { this.effects.push(new TeleFx(e.x, e.y)); if (e.fly) { e.x = this.map.sinhPix.x; e.y = this.map.sinhPix.y; } else { const sp = this.enemySpawnCell(); e.x = (sp.c + .5) * TILE; e.y = (sp.r + .5) * TILE; } this.effects.push(new TeleFx(e.x, e.y)); e.remain = 1e9; } this.effects.push(new FieldFlash("#b79cff", .5)); break;
        // ---- phép PvP: tác động lên TẤT CẢ đối thủ (local qua Match / mạng qua server) ----
        case "trieuHoi": this.castPvp("trieuHoi"); this.effects.push(new FieldFlash("#c56bff", .4)); break;
        case "huyetQuy": this.castPvp("huyetQuy"); this.effects.push(new FieldFlash("#ff6b6b", .4)); break;
        case "maGiap": this.castPvp("maGiap"); this.effects.push(new FieldFlash("#90a4ae", .4)); break;
        case "diaChan": this.castPvp("diaChan"); this.effects.push(new FieldFlash("#ffcc66", .4)); break;
        default: return;
      }
      this.skillCd[key] = s.cd; this.pendingSkill = null; this.emit();
    }

    /* --------------------------- vòng lặp --------------------------- */
    step(dt) {
      if (this.paused || this.gameOver || this.victory) return;
      dt *= this.speed;                          // nút tua x1/x2/x3
      // ĐỒNG HỒ ĐỢT: đối kháng do MATCH điều khiển (đồng bộ); solo thì tự định kỳ
      if (!this.versus && this.started && this.autoNext && !this.campaignDone) { this.waveTimer -= dt; if (this.waveTimer <= 0) this.launchWave(); }
      if (this.hasteTime > 0) { this.hasteTime -= dt; if (this.hasteTime <= 0) this.enemyHaste = 1; }
      // hồi chiêu phép & thời gian xây/nâng/tháp tính theo GIÂY THỰC
      for (const k in this.skillCd) if (this.skillCd[k] > 0) this.skillCd[k] = Math.max(0, this.skillCd[k] - dt);
      for (const t of this.towers) if (t.buildTimer > 0) { t.buildTimer -= dt; if (t.buildTimer <= 0 && t.action !== "sell") { t.action = null; this._towerDone = true; } }
      const pdt = dt * CFG.GAME_PACE;            // nhịp gameplay chậm hơn cho dễ theo dõi
      if (this.started) this.spawnClock += pdt;
      this.updateSpawns();
      if (this.started && this.campaignDone && !this.spawnQueue.length && !this.enemies.length) { this.victory = true; this.emit(); }
      for (const e of this.enemies.slice()) e.update(pdt, this);
      for (const t of this.traps) t.update(pdt, this);
      if (this.traps.some((t) => t.dead)) { for (const t of this.traps) if (t.dead) { this.occupied.delete(t.col + "," + t.row); if (this.selected === t) this.selected = null; } this.traps = this.traps.filter((t) => !t.dead); this.emit(); }
      for (const t of this.towers) t.update(pdt, this);
      // tháp đang "bán/phá" hết giờ -> gỡ khỏi sân (+ hoàn vàng nếu do người chơi bán)
      const doneSell = this.towers.filter((t) => t.action === "sell" && t.buildTimer <= 0);
      if (doneSell.length) { for (const t of doneSell) { if (!t.noRefund) this.gold += t.sellValue; this.occupied.delete(t.col + "," + t.row); this.blockSet.delete(t.col + "," + t.row); this.towers.splice(this.towers.indexOf(t), 1); if (this.selected === t) this.selected = null; } this.computeFlow(); this.recomputeAuras(); this.emit(); }
      if (this._towerDone) { this._towerDone = false; this.recomputeAuras(); this.emit(); }   // xây/nâng xong -> cập nhật aura
      for (const p of this.projectiles) p.update(pdt, this); this.projectiles = this.projectiles.filter((p) => !p.dead);
      for (const f of this.effects) f.update(pdt, this); this.effects = this.effects.filter((f) => !f.dead);
      // làm mới HUD định kỳ để đồng hồ đếm (xây/nâng/tháo, chờ đợt) chạy mượt
      this._uiT = (this._uiT || 0) + dt;
      if (this._uiT >= 0.2) { this._uiT = 0; if ((this.selected && !this.selected.trap && this.selected.buildTimer > 0) || (this.started && (this.versus || (this.autoNext && !this.campaignDone)))) this.emit(); }
    }

    /* ----------------------------- vẽ ----------------------------- */
    render() {
      const ctx = this.ctx; this.frameCount++;
      ctx.clearRect(0, 0, CFG.CANVAS_W, CFG.CANVAS_H);
      ctx.save(); ctx.translate(CFG.MARGIN, CFG.MARGIN);   // lề để cổng nằm NGOÀI lưới
      if (this.terrain) ctx.drawImage(this.terrain, 0, 0); else this.drawMapSimple(ctx);
      this.drawLavaGlow(ctx);
      this.drawGates(ctx);
      for (const t of this.traps) t.draw(ctx, t === this.selected);
      this.drawPreview(ctx);
      for (const t of this.towers) t.draw(ctx, t === this.selected);
      for (const e of this.enemies) e.draw(ctx);
      for (const p of this.projectiles) p.draw(ctx);
      for (const f of this.effects) f.draw(ctx);
      ctx.restore();
      if (this.paused) this.overlay(ctx, "TẠM DỪNG", "#fff");
      if (this.gameOver) this.overlay(ctx, "THẤT THỦ!", "#ff6b6b", `Trụ được đợt ${this.wave} · ${this.score.toLocaleString()} điểm`);
      if (this.victory) this.overlay(ctx, "CHIẾN THẮNG!", "#8bff9c", `${this.score.toLocaleString()} điểm`);
    }
    // Minimap đối thủ — vẽ thu nhỏ sân này vào (ctx) tại ô [x,y] cạnh size px
    renderMini(ctx, x, y, size) {
      const s = size / CFG.COLS;
      ctx.save(); ctx.translate(x, y);
      // nền + nham
      ctx.fillStyle = "#4a5238"; ctx.fillRect(0, 0, size, size);
      for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) if (this.grid[r][c] === CELL.WATER) { ctx.fillStyle = "#7a2410"; ctx.fillRect(c * s, r * s, s + .5, s + .5); }
      // cổng
      ctx.fillStyle = "#2ec76b"; ctx.fillRect(0, 0, s * 2, s * .9);
      ctx.fillStyle = "#e0503a"; ctx.fillRect(size - s * 2, size - s * .9, s * 2, s * .9);
      // tháp
      for (const t of this.towers) { ctx.fillStyle = t.ready ? "#ffe08a" : "#9a8a55"; ctx.fillRect(t.col * s + s * .2, t.row * s + s * .2, s * .6, s * .6); }
      for (const t of this.traps) { ctx.fillStyle = "#c56bff"; ctx.fillRect(t.col * s + s * .3, t.row * s + s * .3, s * .4, s * .4); }
      // quái
      for (const e of this.enemies) { if (e.dead || e.leaked) continue; ctx.fillStyle = e.fly ? "#ff9de0" : "#ff5a5a"; const ex = e.x / TILE * s, ey = e.y / TILE * s; ctx.fillRect(ex - 1, ey - 1, 2.4, 2.4); }
      ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, size - 1, size - 1);
      if (this.gameOver) { ctx.fillStyle = "rgba(20,0,0,.55)"; ctx.fillRect(0, 0, size, size); ctx.fillStyle = "#ff8a8a"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("THẤT THỦ", size / 2, size / 2 + 4); ctx.textAlign = "left"; }
      ctx.restore();
    }
    // Nền đơn giản (fallback headless / khi chưa dựng được cache)
    drawMapSimple(ctx) {
      for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
        const t = this.grid[r][c], x = c * TILE, y = r * TILE;
        if (t === CELL.WATER) ctx.fillStyle = "#3a1408";
        else if (t === CELL.WALL) ctx.fillStyle = "#2a2a1e";
        else if (t === CELL.SPAWN) ctx.fillStyle = "#1d5e3a";
        else if (t === CELL.EXIT) ctx.fillStyle = "#6e1d1d";
        else ctx.fillStyle = (c + r) % 2 ? "#5f6b47" : "#586340";
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
    // Gom ô nham thành các rãnh ngang liền mạch
    computeLavaRuns() {
      const runs = [];
      for (let r = 0; r < CFG.ROWS; r++) { let c = 0; while (c < CFG.COLS) { if (this.grid[r][c] === CELL.WATER) { let c1 = c; while (c1 + 1 < CFG.COLS && this.grid[r][c1 + 1] === CELL.WATER) c1++; runs.push({ r, c0: c, c1 }); c = c1 + 1; } else c++; } }
      return runs;
    }
    // Dựng cache nền đá lốm đốm + rãnh nham liền + tường (chỉ khi có DOM)
    buildTerrain() {
      this.lavaCells = []; for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) if (this.grid[r][c] === CELL.WATER) this.lavaCells.push({ c, r });
      this.lavaRuns = this.computeLavaRuns();
      if (typeof document === "undefined") { this.terrain = null; return; }
      const cv = document.createElement("canvas"); cv.width = CFG.GRID_W; cv.height = CFG.GRID_H;
      const x = cv.getContext("2d");
      const seeded = (s) => { let v = s >>> 0; return () => { v = (v * 1664525 + 1013904223) >>> 0; return v / 4294967296; }; };
      // 1) các ô KHÔNG phải nham
      for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
        const t = this.grid[r][c]; if (t === CELL.WATER) continue;
        const px = c * TILE, py = r * TILE, rnd = seeded(c * 911 + r * 7919 + 13);
        if (t === CELL.WALL) {
          x.fillStyle = "#33362a"; x.fillRect(px, py, TILE, TILE);
          x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(px, py + TILE - 5, TILE, 5); x.fillStyle = "rgba(255,255,255,.05)"; x.fillRect(px, py, TILE, 3);
          x.fillStyle = "rgba(0,0,0,.22)"; for (let i = 0; i < 3; i++) x.fillRect(px + rnd() * TILE, py + rnd() * TILE, 4, 4);
        } else if (t === CELL.SPAWN || t === CELL.EXIT) {
          const g2 = x.createRadialGradient(px + TILE / 2, py + TILE / 2, 2, px + TILE / 2, py + TILE / 2, TILE * .7);
          const green = t === CELL.SPAWN; g2.addColorStop(0, green ? "#8effb0" : "#ff8a6a"); g2.addColorStop(.5, green ? "#1d5e3a" : "#7a1d1d"); g2.addColorStop(1, "#12160c");
          x.fillStyle = g2; x.fillRect(px, py, TILE, TILE);
        } else { // ĐẤT: đá rêu olive lốm đốm (nhẹ, tự nhiên)
          x.fillStyle = "#5e6a46"; x.fillRect(px, py, TILE, TILE);
          for (let i = 0; i < 4; i++) { x.fillStyle = rnd() < .5 ? "rgba(42,50,30,.4)" : "rgba(115,128,90,.24)"; const bw = 7 + rnd() * 13; x.beginPath(); x.ellipse(px + rnd() * TILE, py + rnd() * TILE, bw / 2, (5 + rnd() * 9) / 2, rnd() * 3, 0, 7); x.fill(); }
          x.strokeStyle = "rgba(0,0,0,.12)"; x.strokeRect(px + .5, py + .5, TILE, TILE);
        }
      }
      // 2) rãnh nham liền + mép đá lởm chởm
      for (const run of this.lavaRuns) {
        const x0 = run.c0 * TILE, x1 = (run.c1 + 1) * TILE, yTop = run.r * TILE, h = TILE, rnd = seeded(run.r * 2731 + run.c0 * 97 + 5);
        x.fillStyle = "#180b05"; x.fillRect(x0, yTop, x1 - x0, h);          // đáy cháy đen
        x.fillStyle = "#0c0502"; x.beginPath(); x.moveTo(x0, yTop + h * .5); // vệt nứt sâu giữa
        for (let px = x0; px <= x1; px += 8) x.lineTo(px, yTop + h * (.42 + rnd() * .16)); x.lineTo(x1, yTop + h * .5); x.stroke();
        // mép đá lởm chởm trên & dưới
        x.fillStyle = "#3b3524";
        for (let px = x0; px < x1; px += 6) { const w = 4 + rnd() * 6; x.beginPath(); x.moveTo(px, yTop); x.lineTo(px + w / 2, yTop + 4 + rnd() * 5); x.lineTo(px + w, yTop); x.fill(); x.beginPath(); x.moveTo(px, yTop + h); x.lineTo(px + w / 2, yTop + h - 4 - rnd() * 5); x.lineTo(px + w, yTop + h); x.fill(); }
      }
      this.terrain = cv;
    }
    // Lõi nham chảy sáng động (vẽ mỗi khung hình lên trên cache)
    drawLavaGlow(ctx) {
      if (!this.lavaRuns || !this.lavaRuns.length) return;
      const pulse = 0.5 + 0.5 * Math.sin(this.frameCount * 0.07);
      ctx.save();
      for (const run of this.lavaRuns) {
        const x0 = run.c0 * TILE + 3, x1 = (run.c1 + 1) * TILE - 3, cy = (run.r + .5) * TILE, half = TILE * (.30 + .05 * pulse);
        const g2 = ctx.createLinearGradient(0, cy - half, 0, cy + half);
        g2.addColorStop(0, "rgba(150,30,0,0)"); g2.addColorStop(.5, `rgba(255,${150 + pulse * 60 | 0},40,.92)`); g2.addColorStop(1, "rgba(150,30,0,0)");
        ctx.fillStyle = g2; ctx.fillRect(x0, cy - half, x1 - x0, half * 2);
        // đốm nóng sáng chạy dọc sông
        for (let px = x0 + 6; px < x1; px += TILE) { const ph = 0.5 + 0.5 * Math.sin(this.frameCount * 0.12 + px * 0.05); ctx.fillStyle = `rgba(255,${210 + ph * 45 | 0},${120 * ph | 0},${.5 * ph + .25})`; ctx.beginPath(); ctx.ellipse(px, cy, 7, 4 + ph * 2, 0, 0, 7); ctx.fill(); }
      }
      // toả sáng nhẹ hắt lên (glow)
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = .12 + .05 * pulse;
      for (const run of this.lavaRuns) { const x0 = run.c0 * TILE, x1 = (run.c1 + 1) * TILE, cy = (run.r + .5) * TILE; const g3 = ctx.createLinearGradient(0, cy - TILE, 0, cy + TILE); g3.addColorStop(0, "rgba(255,120,30,0)"); g3.addColorStop(.5, "rgba(255,120,30,1)"); g3.addColorStop(1, "rgba(255,120,30,0)"); ctx.fillStyle = g3; ctx.fillRect(x0, cy - TILE, x1 - x0, TILE * 2); }
      ctx.restore();
    }
    drawGates(ctx) {
      const portal = (px, py, col, label, blocked) => {
        ctx.save();
        const g = ctx.createRadialGradient(px, py, 2, px, py, TILE * .55);
        g.addColorStop(0, col); g.addColorStop(.55, "rgba(0,0,0,.2)"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, TILE * .55, 0, 7); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px, py, TILE * .42, 0, 7); ctx.stroke();
        ctx.fillStyle = col; ctx.font = "bold 12px system-ui"; ctx.textAlign = "center"; ctx.fillText(label, px, py - TILE * .5);
        ctx.restore();
      };
      // đánh dấu 2 ô rìa mỗi cổng (viền nhấp nháy) — ô bị tháp bịt thì không tô
      const mark = (cells, col) => { ctx.save(); ctx.globalAlpha = .35 + .2 * Math.sin(this.frameCount * .08); ctx.strokeStyle = col; ctx.lineWidth = 2; for (const e of cells) if (!this.blockSet.has(e.c + "," + e.r)) ctx.strokeRect(e.c * TILE + 3, e.r * TILE + 3, TILE - 6, TILE - 6); ctx.restore(); };
      mark(this.map.entries, "#8effb0"); mark(this.map.exits, "#ff9b9b");
      portal(this.map.sinhPix.x, this.map.sinhPix.y, "#8effb0", "SINH", false);
      portal(this.map.tuPix.x, this.map.tuPix.y, "#ff9b9b", "TỬ", false);
      this.drawWaveCountdown(ctx);
    }
    // Đếm ngược tới đợt kế (đối kháng/mạng do Match phát; solo theo waveTimer)
    waveCountdown() {
      if (this.netMatch) return (this.netMatch.started && !this.netMatch.over) ? { sec: this.netMatch.waveTimer, n: this.netMatch.wave + 1 } : null;
      if (this.match) return this.match.over ? null : { sec: this.match.waveTimer, n: this.match.wave + 1 };
      if (this.started && this.autoNext && !this.campaignDone && !this.gameOver && !this.victory) return { sec: this.waveTimer, n: this.wave + 1 };
      return null;
    }
    drawWaveCountdown(ctx) {
      const cd = this.waveCountdown(); if (!cd) return;
      const sec = Math.max(0, Math.ceil(cd.sec)), urgent = sec <= 3;
      const px = this.map.sinhPix.x + TILE * 1.15, py = this.map.sinhPix.y;
      ctx.save();
      ctx.font = "bold 13px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const txt = "⏳ Đợt " + cd.n + ": " + sec + "s", w = ctx.measureText(txt).width + 16, h = 21;
      const pulse = urgent ? .5 + .5 * Math.sin(this.frameCount * .25) : 1;
      ctx.globalAlpha = urgent ? .7 + .3 * pulse : .95;
      ctx.fillStyle = "rgba(16,26,14,.9)"; ctx.strokeStyle = urgent ? "#ffd24a" : "#8effb0"; ctx.lineWidth = 1.6;
      const x = px - 5, y = py - h / 2, r = 7;
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = urgent ? "#ffe08a" : "#d3f2d0"; ctx.fillText(txt, px + 4, py + 1);
      ctx.restore();
    }
    drawPreview(ctx) {
      if (this.buildType && this.hover) {
        const { c, r } = this.hover, isTrap = !!CFG.TRAPS[this.buildType], def = isTrap ? CFG.TRAPS[this.buildType] : CFG.TOWERS[this.buildType];
        const ok = this.gold >= def.cost && (isTrap ? this.isLandFree(c, r) : this.canPlaceTower(c, r));
        ctx.fillStyle = ok ? "rgba(120,255,120,.28)" : "rgba(255,60,60,.30)"; ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        const rng = (isTrap ? def.radius : CFG.statAt(def, 1).range) * TILE;
        ctx.strokeStyle = ok ? "rgba(255,255,255,.4)" : "rgba(255,120,120,.4)"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc((c + .5) * TILE, (r + .5) * TILE, rng, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      }
      if (this.pendingSkill && this.hover) { const s = CFG.SKILLS[this.pendingSkill]; if (s.aim === "area") { ctx.fillStyle = "rgba(255,220,120,.20)"; ctx.beginPath(); ctx.arc(this.hover.x, this.hover.y, s.radius * TILE, 0, 7); ctx.fill(); } }
    }
    overlay(ctx, title, color, sub) { ctx.fillStyle = "rgba(0,0,0,.62)"; ctx.fillRect(0, 0, CFG.CANVAS_W, CFG.CANVAS_H); ctx.textAlign = "center"; ctx.fillStyle = color; ctx.font = "bold 44px system-ui"; ctx.fillText(title, CFG.CANVAS_W / 2, CFG.CANVAS_H / 2 - 6); if (sub) { ctx.fillStyle = "#ddd"; ctx.font = "16px system-ui"; ctx.fillText(sub, CFG.CANVAS_W / 2, CFG.CANVAS_H / 2 + 26); } }

    /* ---------------------------- chuột ---------------------------- */
    _bindInput() {
      const cv = this.canvas;
      const toXY = (ev) => { const b = cv.getBoundingClientRect(); const x = (ev.clientX - b.left) * (cv.width / b.width) - CFG.MARGIN, y = (ev.clientY - b.top) * (cv.height / b.height) - CFG.MARGIN; return { x, y, c: Math.floor(x / TILE), r: Math.floor(y / TILE) }; };
      cv.addEventListener("mousemove", (ev) => { this.hover = toXY(ev); });
      cv.addEventListener("mouseleave", () => { this.hover = null; });
      cv.addEventListener("click", (ev) => { const p = toXY(ev); if (this.pendingSkill) { this.handleSkillClick(p); return; } if (this.buildType) { this.placeSelected(p.c, p.r); return; } const o = this.towers.find((t) => t.col === p.c && t.row === p.r) || this.traps.find((t) => t.col === p.c && t.row === p.r); this.selected = o || null; this.emit(); });
      cv.addEventListener("contextmenu", (ev) => { ev.preventDefault(); this.buildType = null; this.selected = null; this.pendingSkill = null; this.emit(); });
    }
    handleSkillClick(p) {
      const s = CFG.SKILLS[this.pendingSkill];
      if (s.aim === "enemy") { let hit = null, hd = 1e9; for (const e of this.enemies) { const d = STM.util.dist(e.x, e.y, p.x, p.y); if (d < hd && d <= e.radius + 8) { hd = d; hit = e; } } if (hit) this.castSkill(this.pendingSkill, p.x, p.y, hit); }
      else if (s.aim === "tower") { const t = this.towers.find((t) => t.col === p.c && t.row === p.r); if (t) this.castSkill(this.pendingSkill, p.x, p.y, t); }
      else this.castSkill(this.pendingSkill, p.x, p.y);
    }
    setBuild(type) { this.buildType = this.buildType === type ? null : type; this.selected = null; this.pendingSkill = null; this.emit(); }
    emit() { if (this.onChange) this.onChange(this); }
    loop(ts) { if (!this.lastTime) this.lastTime = ts; let dt = (ts - this.lastTime) / 1000; this.lastTime = ts; if (dt > .05) dt = .05; this.step(dt); if (this.match && this.match.host === this) this.match.tick(dt); this.render(); this._raf = requestAnimationFrame((t) => this.loop(t)); }
    start() { if (!this._raf) this._raf = requestAnimationFrame((t) => this.loop(t)); }
  }

  class BlastRing { constructor(x, y, r, c) { this.x = x; this.y = y; this.r = r; this.color = c; this.t = 0; this.dur = .4; this.dead = false; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { const f = this.t / this.dur; ctx.globalAlpha = 1 - f; ctx.strokeStyle = this.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(this.x, this.y, this.r * (.4 + .6 * f), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; } }
  // Loé sáng toàn sân (phép global: Kiếm Thần / Mê Trận / Dịch Chuyển)
  class FieldFlash { constructor(color, dur) { this.color = color; this.t = 0; this.dur = dur || .5; this.dead = false; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { const f = this.t / this.dur; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - f * 1.2) * .5; ctx.fillStyle = this.color; ctx.fillRect(0, 0, CFG.GRID_W, CFG.GRID_H); ctx.restore(); } }
  // Vệt chém (Kiếm Thần) trên từng quái — lõi trắng + viền màu, đậm & to
  class SlashFx { constructor(x, y, color) { this.x = x; this.y = y; this.color = color; this.t = 0; this.dur = .32; this.dead = false; this.a = Math.random() * 2 - 1; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { const f = this.t / this.dur, L = 22 * (.5 + f * .6); const dx = Math.cos(this.a), dy = Math.sin(this.a) + .6, n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n; ctx.save(); ctx.globalAlpha = 1 - f; ctx.lineCap = "round"; ctx.strokeStyle = this.color; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(this.x - ux * L, this.y - uy * L); ctx.lineTo(this.x + ux * L, this.y + uy * L); ctx.stroke(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(this.x - ux * L, this.y - uy * L); ctx.lineTo(this.x + ux * L, this.y + uy * L); ctx.stroke(); ctx.restore(); } }
  // Đòn điểm huyệt (Nhất Dương Chỉ): tia từ trên + toé sao
  class StrikeFx { constructor(x, y, color) { this.x = x; this.y = y; this.color = color; this.t = 0; this.dur = .45; this.dead = false; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { const f = this.t / this.dur; ctx.save(); ctx.globalAlpha = 1 - f; ctx.strokeStyle = this.color; ctx.lineWidth = 5 * (1 - f) + 1; ctx.beginPath(); ctx.moveTo(this.x, this.y - 70 * (1 - f)); ctx.lineTo(this.x, this.y); ctx.stroke(); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.x, this.y, 5 + 26 * f, 0, 7); ctx.stroke(); for (let i = 0; i < 8; i++) { const an = i * .785; ctx.beginPath(); ctx.moveTo(this.x + Math.cos(an) * (6 + 8 * f), this.y + Math.sin(an) * (6 + 8 * f)); ctx.lineTo(this.x + Math.cos(an) * (14 + 22 * f), this.y + Math.sin(an) * (14 + 22 * f)); ctx.stroke(); } ctx.restore(); } }
  // Tăng Lực: vòng vàng + mũi tên bốc lên
  class PowerUpFx { constructor(x, y) { this.x = x; this.y = y; this.t = 0; this.dur = .6; this.dead = false; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { const f = this.t / this.dur; ctx.save(); ctx.globalAlpha = 1 - f; ctx.strokeStyle = "#ffe082"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.x, this.y, TILE * (.35 + .5 * f), 0, 7); ctx.stroke(); for (const s of [-1, 0, 1]) { const ax = this.x + s * TILE * .28, ay = this.y - TILE * (.2 + f * .8); ctx.beginPath(); ctx.moveTo(ax, ay + 8); ctx.lineTo(ax, ay - 6); ctx.moveTo(ax - 4, ay - 1); ctx.lineTo(ax, ay - 6); ctx.lineTo(ax + 4, ay - 1); ctx.stroke(); } ctx.restore(); } }
  // Mưa Lửa: thiên thạch rơi (đuôi lửa) rồi nổ
  class MeteorFx { constructor(tx, ty, delay) { this.tx = tx; this.ty = ty; this.t = -(delay || 0); this.fall = .35; this.dur = .6; this.dead = false; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { if (this.t < 0) return; const f = Math.min(1, this.t / this.fall); ctx.save(); if (f < 1) { const sx = this.tx + 55, sy = this.ty - 88, x = sx + (this.tx - sx) * f, y = sy + (this.ty - sy) * f; const g = ctx.createLinearGradient(x + 22, y - 34, x, y); g.addColorStop(0, "rgba(255,140,40,0)"); g.addColorStop(1, "rgba(255,185,70,.95)"); ctx.strokeStyle = g; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x + 22, y - 34); ctx.lineTo(x, y); ctx.stroke(); ctx.fillStyle = "#ffcf6a"; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.fillStyle = "#7a3a12"; ctx.beginPath(); ctx.arc(x - 1, y + 1, 2.4, 0, 7); ctx.fill(); } else { const gg = (this.t - this.fall) / (this.dur - this.fall); ctx.globalAlpha = 1 - gg; ctx.strokeStyle = "#ff8a2a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.tx, this.ty, 4 + 20 * gg, 0, 7); ctx.stroke(); ctx.fillStyle = "rgba(255,150,40,.5)"; ctx.beginPath(); ctx.arc(this.tx, this.ty, 6 * (1 - gg), 0, 7); ctx.fill(); } ctx.restore(); } }
  // Bão Sét: tia sét zigzag đánh xuống trong vùng
  class BoltFx { constructor(tx, ty, delay) { this.tx = tx; this.ty = ty; this.t = -(delay || 0); this.dur = .22; this.dead = false; this.seed = Math.random() * 100; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { if (this.t < 0) return; const f = this.t / this.dur, top = this.ty - 90, seg = 7, pts = [[this.tx, top]]; for (let i = 1; i <= seg; i++) { const yy = top + 90 * (i / seg), xx = this.tx + Math.sin(this.seed + i * 1.9) * 11 * (1 - i / seg); pts.push([xx, yy]); } ctx.save(); ctx.globalAlpha = 1 - f; ctx.lineCap = "round"; const path = () => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }; ctx.strokeStyle = "rgba(150,200,255,.5)"; ctx.lineWidth = 6; path(); ctx.strokeStyle = "#fff7c0"; ctx.lineWidth = 2.2; path(); ctx.strokeStyle = "#fff3b0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.tx, this.ty, 4 + 14 * f, 0, 7); ctx.stroke(); ctx.restore(); } }
  // Dịch Chuyển: xoáy dịch chuyển
  class TeleFx { constructor(x, y) { this.x = x; this.y = y; this.t = 0; this.dur = .35; this.dead = false; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { const f = this.t / this.dur; ctx.save(); ctx.globalAlpha = 1 - f; ctx.strokeStyle = "#c9b8ff"; ctx.lineWidth = 2.5; ctx.beginPath(); for (let a = 0; a < 14; a++) { const ang = a * .6 + f * 8, rr = a * 1.3 * (1 - f * .4); const px = this.x + Math.cos(ang) * rr, py = this.y + Math.sin(ang) * rr; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); ctx.restore(); } }
  STM.Game = Game;
})(window.STM || (window.STM = {}));
