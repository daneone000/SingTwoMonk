/* =====================================================================
 * ai.js — Bộ NÃO máy (bot) DÙNG CHUNG cho:
 *   • Match (offline, js/match.js) — bot chạy trên máy người chơi
 *   • server.js (LAN) — bot chạy trên MÁY CHỦ (điền chỗ trống phòng 2v2)
 * Mọi hàm chỉ đụng tới `g` (một STM.Game) nên chạy được cả headless.
 * ===================================================================== */
(function (STM) {
  "use strict";
  const CFG = STM.CFG, TILE = CFG.TILE, dist = STM.util.dist;
  const DPS_RANK = { lua: 0, ten: 1, set: 1, doc: 2, bang: 3 };   // ưu tiên nâng tháp sát thương chính

  const AI = {
    // Bot CHỦ-BÀN (xây + nâng + học + phép): gọi mỗi khung, tự giãn nhịp theo VS_AI_PERIOD
    update(g, dt) {
      g._aiT = (g._aiT || 0) + dt;
      if (g._aiT < CFG.VS_AI_PERIOD) return;
      g._aiT = 0;
      this.learn(g); this.cast(g); this.spend(g);
    },

    // chọn tháp NÊN nâng: sẵn sàng, chưa max, không đang bận; cấp thấp trước, ưu tiên DPS chính, rẻ trước
    pickUpgrade(towers, affordable) {
      const cands = towers.filter((t) => t.ready && !t.action && !t.maxLevel && !t.support && affordable(t));
      if (!cands.length) return null;
      cands.sort((a, b) => a.level - b.level || (DPS_RANK[a.type] ?? 5) - (DPS_RANK[b.type] ?? 5) || a.upgradeCost - b.upgradeCost);
      return cands[0];
    },

    learn(g) {
      if (g.learned.size >= CFG.MAX_SKILLS) return;
      let best = null;
      for (const key in CFG.SKILLS) { const s = CFG.SKILLS[key]; if (g.canLearn(key) && g.sp >= s.learn && (!best || s.learn < best.learn)) best = s; }
      if (best) g.learnSkill(best.key);
    },

    cast(g) {
      // phép phòng thủ ưu tiên khi có cụm quái; rồi tới phép quấy rối đối thủ khi rảnh
      for (const key of ["kiemThan", "meTran", "dichChuyen"]) if (g.learned.has(key) && g.castable(key)) { g.castSkill(key); return; }
      if (g.learned.has("muaLua") && g.castable("muaLua")) { const c = this.biggestCluster(g, false); if (c && c.n >= 3) { g.castSkill("muaLua", c.x, c.y); return; } }
      if (g.learned.has("baoSet") && g.castable("baoSet")) { const c = this.biggestCluster(g, true); if (c && c.n >= 3) { g.castSkill("baoSet", c.x, c.y); return; } }
      for (const key of ["diaChan", "trieuHoi", "huyetQuy", "maGiap"]) if (g.learned.has(key) && g.castable(key)) { g.castSkill(key); return; }
    },

    biggestCluster(g, air) {
      const R = 1.6 * TILE; let best = null;
      for (const a of g.enemies) {
        if (a.dead || a.leaked || a.fly !== air) continue;
        let n = 0; for (const b of g.enemies) if (!b.dead && !b.leaked && b.fly === air && dist(a.x, a.y, b.x, b.y) <= R) n++;
        if (!best || n > best.n) best = { x: a.x, y: a.y, n };
      }
      return best;
    },

    // TIÊU VÀNG: xây ~10 tháp nền (+ đủ phòng không) rồi DỒN nâng cấp; hết chỗ nâng mới xây tới ~13
    spend(g) {
      const nonSup = g.towers.filter((t) => !t.support).length;
      const needAir = g.towers.filter((t) => t.def.target !== "ground" && !t.support).length < 2;
      if (nonSup < 10 || needAir) { this.build(g, needAir); return; }
      if (this.upgrade(g)) return;
      if (nonSup < 13 && g.gold >= 50) this.build(g, false);
    },

    upgrade(g) {
      const t = this.pickUpgrade(g.towers, (tw) => g.gold >= tw.upgradeCost);
      if (!t) return false;
      g.selected = t; g.upgradeSelected(); g.selected = null;
      return true;
    },

    build(g, wantAir) {
      const flySoon = wantAir || CFG.waveInfo(g.wave + 1).fly || g.enemies.some((e) => e.fly);
      const pref = wantAir ? ["set", "ten"] : flySoon ? ["ten", "lua", "set", "bang"] : ["lua", "ten", "bang", "doc"];
      let type = null;
      for (const p of pref) { const d = CFG.TOWERS[p]; if (d && g.gold >= d.cost) { type = p; break; } }
      if (!type) return;
      const cell = this.pickCell(g); if (!cell) return;
      g.buildType = type; g.placeSelected(cell.c, cell.r); g.buildType = null; g.selected = null;
    },

    // Chọn ô đặt tháp: xây MÊ CUNG — ưu tiên ô khiến đường quái DÀI nhất
    pickCell(g) {
      const entries = (g.openEntries && g.openEntries().length) ? g.openEntries() : g.map.entries;
      const pathLen = (blocks) => { const d = g.computeFlowWith(blocks); let mn = Infinity; for (const e of entries) mn = Math.min(mn, d[e.r][e.c]); return mn; };
      let best = null, bestScore = -1;
      for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
        if (!g.canPlaceTower(c, r)) continue;
        const tmp = new Set(g.blockSet); tmp.add(c + "," + r);
        const len = pathLen(tmp);
        if (!isFinite(len)) continue;
        const center = 6 - (Math.abs(c - 6) + Math.abs(r - 6)) * 0.15;
        const score = len * 3 + center + Math.random();
        if (score > bestScore) { bestScore = score; best = { c, r }; }
      }
      return best || null;
    },
  };

  STM.AI = AI;
})(typeof window !== "undefined" ? (window.STM = window.STM || {}) : (globalThis.STM = globalThis.STM || {}));
