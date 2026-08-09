/* =====================================================================
 * entities.js — Enemy (bộ/bay), Tower (có tháp support), Trap, Projectile, FX
 * ===================================================================== */
(function (STM) {
  "use strict";
  const CFG = STM.CFG, TILE = CFG.TILE;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  /* ------------------------------ QUÁI ------------------------------ */
  class Enemy {
    constructor(def, hpMul, rwMul, game, isBoss) {
      this.def = def; this.shape = def.shape || "mantis"; this.fly = !!def.fly; this.isBoss = !!isBoss; this.boss = !!isBoss;
      this.hpMul = hpMul; this.rwMul = rwMul;
      const B = STM.CFG;
      this.maxHp = Math.round(def.hp * hpMul * (isBoss ? B.BOSS_HP : 1)); this.hp = this.maxHp;
      this.baseSpeed = def.speed * (isBoss ? B.BOSS_SPEED : 1);
      this.reward = Math.round(def.reward * rwMul * (isBoss ? B.BOSS_REWARD : 1));
      this.armor = def.armor || 0; this.radius = def.radius * (isBoss ? B.BOSS_RADIUS : 1);
      this.split = def.split || 0; this.splitInto = def.splitInto;
      if (this.fly) { this.x = game.map.sinhPix.x; this.y = game.map.sinhPix.y; }
      else { const sp = game.enemySpawnCell(); this.x = (sp.c + 0.5) * TILE; this.y = (sp.r + 0.5) * TILE; }
      this.dead = false; this.leaked = false;
      this.slowMult = 1; this.slowTime = 0; this.freezeTime = 0;
      this.burnDps = 0; this.burnTime = 0; this.burnMissPct = 0; this.burnMissTime = 0; this.poison = []; this.pullCd = 0; this.remain = 1e9;
      this.wingPhase = Math.random() * 6; this.animT = Math.random() * 3;
      this.slowResist = def.slowResist || 0;   // kháng làm chậm (0..1)
      this.pRes = def.poisonResist || null;    // kháng độc: {dmg, dur} — giảm ST độc & thời gian nhiễm
    }
    get speed() { return this.freezeTime > 0 ? 0 : this.baseSpeed * this.slowMult; }
    applyDamage(d, ig) { const e = ig ? d : Math.max(1, d - this.armor); this.hp -= e; if (this.hp <= 0) this.dead = true; }
    slow(m, d) { const eff = 1 - (1 - m) * (1 - this.slowResist); if (eff < this.slowMult || this.slowTime <= 0) this.slowMult = eff; this.slowTime = Math.max(this.slowTime, d * (1 - this.slowResist * 0.5)); }
    freeze(d) { this.freezeTime = Math.max(this.freezeTime, d); }
    burn(dps, d) { this.burnDps = Math.max(this.burnDps, dps); this.burnTime = Math.max(this.burnTime, d); }
    burnMiss(pct, d) { this.burnMissPct = Math.max(this.burnMissPct, pct); this.burnMissTime = Math.max(this.burnMissTime, d); }   // Lửa boon: đốt = %/s MÁU ĐÃ MẤT
    addPoison(pct, d, mx, useMax) { if (this.pRes) { pct *= (1 - this.pRes.dmg); d *= (1 - this.pRes.dur); } const ent = { pct, time: d, max: !!useMax }; if (this.poison.length < mx) this.poison.push(ent); else this.poison[0] = ent; }  // pct = %/giây máu (HIỆN TẠI, hoặc TỐI ĐA nếu max); kháng độc giảm cả ST & thời gian
    teleportTo(cx, cy) { this.x = cx; this.y = cy; }

    update(dt, game) {
      if (this.burnTime > 0) { this.applyDamage(this.burnDps * dt, true); this.burnTime -= dt; }
      if (this.burnMissTime > 0) { this.applyDamage((this.maxHp - this.hp) * this.burnMissPct * dt, true); this.burnMissTime -= dt; }   // Lửa boon: đốt theo máu ĐÃ MẤT
      if (this.poison.length) { let dmg = 0; for (const p of this.poison) { dmg += (p.max ? this.maxHp : this.hp) * p.pct; p.time -= dt; } if (dmg > 0) this.applyDamage(dmg * dt, true); this.poison = this.poison.filter((p) => p.time > 0); }  // độc: % máu hiện tại (hoặc TỐI ĐA nếu boon Độc)
      if (this.slowTime > 0) { this.slowTime -= dt; if (this.slowTime <= 0) this.slowMult = 1; }
      if (this.freezeTime > 0) this.freezeTime -= dt;
      if (this.critFx > 0) this.critFx -= dt;   // GEM Kim: nháy chí mạng
      if (this.pullCd > 0) this.pullCd -= dt;
      this.animT += dt;
      if (this.fly) this.wingPhase += dt * 9;
      if (this.dead) { game.onEnemyKilled(this); return; }
      let mv = this.speed * dt * (game.enemyHaste || 1);
      if (this.fly) {
        if (game.raised && game.raised.size) {   // có ô NÂNG -> bay theo lưới né ô nâng (Trùm Bản Đồ)
          const c = Math.floor(this.x / TILE), r = Math.floor(this.y / TILE);
          if (!game.inBounds(c, r)) {             // còn ngoài lưới (mới sinh phía trên) -> bay vào cổng Sinh
            const e = game.map.entries[0], tx = (e.c + .5) * TILE, ty = (e.r + .5) * TILE, dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
            this.remain = Math.min(game.distAirAt(e.c, e.r), 9999) + d / TILE;
            if (d <= mv) { this.x = tx; this.y = ty; } else { this.x += (dx / d) * mv; this.y += (dy / d) * mv; } return;
          }
          if (game.isExitCell(c, r)) { this.leaked = true; game.onEnemyLeak(this); return; }
          const nxt = game.nextAirCell(c, r); this.remain = Math.min(game.distAirAt(c, r), 9999);   // kẹp hữu hạn -> tháp vẫn nhắm được quái bay bị kẹt
          if (!nxt) return;                       // bị chặn kín bởi ô nâng -> đứng im (chờ tháp diệt)
          const tx = (nxt.c + .5) * TILE, ty = (nxt.r + .5) * TILE, dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
          if (d <= mv) { this.x = tx; this.y = ty; } else { this.x += (dx / d) * mv; this.y += (dy / d) * mv; } return;
        }
        // mặc định: bay THẲNG tới cổng Tử
        const ex = game.map.tuPix.x, ey = game.map.tuPix.y, dx = ex - this.x, dy = ey - this.y, d = Math.hypot(dx, dy);
        this.remain = d;
        if (d <= mv) { this.leaked = true; game.onEnemyLeak(this); return; }
        this.x += (dx / d) * mv; this.y += (dy / d) * mv; return;
      }
      while (mv > 0) {
        const c = Math.floor(this.x / TILE), r = Math.floor(this.y / TILE);
        if (game.isExitCell(c, r)) { this.leaked = true; game.onEnemyLeak(this); return; }
        const nxt = game.nextCell(c, r); this.remain = game.distAt(c, r);
        if (!nxt) break;
        const tx = (nxt.c + 0.5) * TILE, ty = (nxt.r + 0.5) * TILE, dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        if (d <= mv) { this.x = tx; this.y = ty; mv -= d; } else { this.x += (dx / d) * mv; this.y += (dy / d) * mv; mv = 0; }
      }
    }
    draw(ctx) {
      const r = this.radius, x = this.x; let y = this.y;
      // vòng AURA cho BOSS (dễ nhận biết)
      if (this.boss) {
        const p = this.animT; ctx.save();
        const g = ctx.createRadialGradient(x, this.y, r * .7, x, this.y, r * 2.0);
        g.addColorStop(0, "rgba(255,210,80,0)"); g.addColorStop(.72, `rgba(255,190,60,${.2 + .1 * Math.sin(p * 4)})`); g.addColorStop(1, "rgba(255,110,20,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, this.y, r * 2.0, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(255,228,130,.9)"; ctx.lineWidth = 2.5; ctx.setLineDash([7, 6]); ctx.lineDashOffset = -p * 22;
        ctx.beginPath(); ctx.arc(x, this.y, r * 1.6, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      }
      if (this.fly) {
        ctx.save(); ctx.globalAlpha = .22; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(x, this.y + r + 10, r * .95, r * .32, 0, 0, 7); ctx.fill(); ctx.restore();
        y = this.y - 6 + Math.sin(this.wingPhase) * 1.6;
        const flap = Math.sin(this.wingPhase) * .5, wcol = shade(this.def.color, 60);
        ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 1.3;
        for (const s of [-1, 1]) {
          ctx.fillStyle = wcol; ctx.beginPath(); ctx.moveTo(x + s * r * .35, y - 1);
          ctx.quadraticCurveTo(x + s * r * 1.5, y - r * 1.15 - flap * r, x + s * r * 2.05, y - r * .25 - flap * r * .7);
          ctx.quadraticCurveTo(x + s * r * 1.55, y - r * .05, x + s * r * 1.75, y + r * .55 + flap * r * .3);
          ctx.quadraticCurveTo(x + s * r * 1.0, y + r * .25, x + s * r * .35, y + r * .35);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.moveTo(x + s * r * .5, y); ctx.lineTo(x + s * r * 1.75, y - r * .35 - flap * r * .6); ctx.stroke(); ctx.strokeStyle = "rgba(0,0,0,.5)";
        }
      }
      this.drawCreature(ctx, x, y, r);
      if (this.freezeTime > 0) { ctx.fillStyle = "rgba(120,200,255,.4)"; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.fill(); }
      else if (this.slowTime > 0) { ctx.strokeStyle = "#7fdfff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.stroke(); }
      if (this.poison.length) { ctx.fillStyle = "rgba(156,39,176,.4)"; ctx.beginPath(); ctx.arc(x, y, r + 6, 0, 7); ctx.fill(); }
      if (this.critFx > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, this.critFx * 4); ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 2.5; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3)); ctx.lineTo(x + Math.cos(a) * (r + 9), y + Math.sin(a) * (r + 9)); ctx.stroke(); } ctx.restore(); }   // GEM Kim: tia chí mạng
      const w = r * 2.3, f = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(x - w / 2, y - r - 11, w, 4);
      ctx.fillStyle = f > .5 ? "#4caf50" : f > .25 ? "#ffc107" : "#f44336"; ctx.fillRect(x - w / 2, y - r - 11, w * f, 4);
    }
    drawCreature(ctx, x, y, r) {
      const col = this.def.color, dk = shade(col, -42), lt = shade(col, 34);
      const body = () => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.02, 0, 0, 7); ctx.fill(); ctx.lineWidth = this.boss ? 2.4 : 1.4; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.beginPath(); ctx.ellipse(x - r * .3, y - r * .35, r * .35, r * .25, -.5, 0, 7); ctx.fill(); };
      const feet = () => { ctx.fillStyle = dk; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * r * .45, y + r * .85, r * .26, r * .3, 0, 0, 7); ctx.fill(); } };
      const eyes = (ex = .3, ey = -.12, er = .17, white = true) => {
        if (white) { ctx.fillStyle = "#fff"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * r * ex, y + r * ey, r * er, 0, 7); ctx.fill(); } ctx.fillStyle = "#1a0000"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * r * ex + s * r * .04, y + r * ey + r * .03, r * er * .55, 0, 7); ctx.fill(); } }
        else { ctx.fillStyle = "#ff5252"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * r * ex, y + r * ey, r * er, 0, 7); ctx.fill(); } }
      };
      const brows = () => { ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * .12, y - r * .38); ctx.lineTo(x + s * r * .5, y - r * .22); ctx.stroke(); } };
      const fangs = (yy = .42) => { ctx.fillStyle = "#fff"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * .18, y + r * yy); ctx.lineTo(x + s * r * .3, y + r * yy); ctx.lineTo(x + s * r * .24, y + r * (yy + .28)); ctx.closePath(); ctx.fill(); } };

      switch (this.shape) {
        case "skeleton": { // Hài Cốt: sọ trắng, hốc mắt đen, răng
          ctx.fillStyle = "#eceff1"; ctx.beginPath(); ctx.ellipse(x, y - r * .1, r * .95, r, 0, 0, 7); ctx.fill();
          ctx.fillStyle = "#cfd8dc"; ctx.fillRect(x - r * .5, y + r * .55, r, r * .45);
          ctx.strokeStyle = "#78909c"; ctx.lineWidth = 1; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * .3, y + r * .55); ctx.lineTo(x + i * r * .3, y + r); ctx.stroke(); }
          ctx.fillStyle = "#263238"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * r * .32, y - r * .1, r * .24, r * .28, 0, 0, 7); ctx.fill(); }
          ctx.fillStyle = "#263238"; ctx.beginPath(); ctx.moveTo(x, y + r * .12); ctx.lineTo(x - r * .12, y + r * .4); ctx.lineTo(x + r * .12, y + r * .4); ctx.closePath(); ctx.fill();
          ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y - r * .1, r * .95, r, 0, 0, 7); ctx.stroke(); break;
        }
        case "buffalo": { // Trâu Điên: thân to nâu, sừng cong lớn, mũi
          feet(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r * 1.18, r * .95, 0, 0, 7); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke();
          ctx.fillStyle = "#efe0c8"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * .55, y - r * .35); ctx.quadraticCurveTo(x + s * r * 1.35, y - r * .55, x + s * r * 1.4, y - r * 1.15); ctx.quadraticCurveTo(x + s * r * 1.05, y - r * .55, x + s * r * .55, y - r * .55); ctx.closePath(); ctx.fill(); }
          ctx.fillStyle = lt; ctx.beginPath(); ctx.ellipse(x, y + r * .3, r * .62, r * .42, 0, 0, 7); ctx.fill();
          ctx.fillStyle = "#000"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * r * .22, y + r * .32, r * .09, r * .13, 0, 0, 7); ctx.fill(); }
          brows(); eyes(.4, -.28, .13); break;
        }
        case "giant": { // Người Khổng Lồ: thân to, đầu nhỏ, tay to, trâu bò
          ctx.fillStyle = dk; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * r * .5, y + r * .95, r * .32, r * .32, 0, 0, 7); ctx.fill(); }
          ctx.fillStyle = dk; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * r * .95, y + r * .15, r * .3, r * .6, 0, 0, 7); ctx.fill(); }
          ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y + r * .1, r * 1.05, r * 1.0, 0, 0, 7); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke();
          ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.fillRect(x - r * .9, y + r * .5, r * 1.8, r * .18);
          ctx.fillStyle = lt; ctx.beginPath(); ctx.arc(x, y - r * .75, r * .42, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.stroke();
          ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1.6; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * .1, y - r * .9); ctx.lineTo(x + s * r * .32, y - r * .82); ctx.stroke(); }
          ctx.fillStyle = "#1a0000"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * r * .18, y - r * .72, r * .08, 0, 7); ctx.fill(); } break;
        }
        case "snail": { // Yêu Sên: thân + vỏ xoắn + râu mắt
          ctx.fillStyle = lt; ctx.beginPath(); ctx.ellipse(x, y + r * .38, r * 1.15, r * .5, 0, 0, 7); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.stroke();
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x - r * .12, y - r * .12, r * .85, 0, 7); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = dk; ctx.lineWidth = 2; ctx.beginPath(); for (let a = 0; a < 10; a++) { const an = a * .7, rr = r * .8 * (1 - a / 12); const px = x - r * .12 + Math.cos(an) * rr, py = y - r * .12 + Math.sin(an) * rr; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke();
          ctx.strokeStyle = lt; ctx.lineWidth = 2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + r * .55, y + r * .15); ctx.quadraticCurveTo(x + r * (.85 + s * .05), y - r * .3, x + r * (.75 + s * .18), y - r * .75); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + r * (.75 + s * .18), y - r * .78, r * .12, 0, 7); ctx.fill(); ctx.fillStyle = "#1a0000"; ctx.beginPath(); ctx.arc(x + r * (.75 + s * .18), y - r * .78, r * .06, 0, 7); ctx.fill(); } break;
        }
        case "dragon": { // Rồng Tinh (bay): đầu rồng + sừng + râu (cánh do phần bay vẽ)
          ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r * .9, r, 0, 0, 7); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke();
          ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + r * .55, y + r * .15, r * .55, r * .4, 0, 0, 7); ctx.fill(); ctx.stroke();
          ctx.fillStyle = dk; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * .35, y - r * .7); ctx.lineTo(x + s * r * .1, y - r * 1.3); ctx.lineTo(x + s * r * .6, y - r * .7); ctx.closePath(); ctx.fill(); }
          ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x + r * .95, y + r * .1, r * .07, 0, 7); ctx.fill();
          ctx.strokeStyle = lt; ctx.lineWidth = 1.5; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + r * .8, y + r * (.25 + s * .1)); ctx.quadraticCurveTo(x + r * 1.3, y + r * (.4 + s * .3), x + r * 1.1, y + r * (.7 + s * .3)); ctx.stroke(); }
          eyes(.35, -.2, .14); break;
        }
        case "bird": { // Ác Điểu (bay): thân + mỏ + mào (cánh do phần bay vẽ)
          ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r * .9, r, 0, 0, 7); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke();
          ctx.fillStyle = shade(col, -30); ctx.beginPath(); ctx.moveTo(x - r * .1, y - r * .9); ctx.lineTo(x + r * .1, y - r * 1.35); ctx.lineTo(x + r * .35, y - r * .8); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#ffb300"; ctx.beginPath(); ctx.moveTo(x + r * .6, y + r * .05); ctx.lineTo(x + r * 1.3, y + r * .2); ctx.lineTo(x + r * .6, y + r * .4); ctx.closePath(); ctx.fill();
          eyes(.35, -.18, .15); break;
        }
        case "fox": { // Cáo Tinh: thân cam thon, tai nhọn, đuôi xù đốm trắng, mõm nhọn
          feet();
          // đuôi xù (sau-trái) + chóp trắng
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - r * .5, y + r * .1); ctx.quadraticCurveTo(x - r * 1.7, y - r * .2, x - r * 1.45, y - r * 1.0); ctx.quadraticCurveTo(x - r * 1.05, y - r * .35, x - r * .45, y - r * .15); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - r * 1.42, y - r * .92, r * .3, 0, 7); ctx.fill();
          // thân thon
          ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r * 1.05, r * .82, 0, 0, 7); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke();
          ctx.fillStyle = "#ffe0b2"; ctx.beginPath(); ctx.ellipse(x + r * .2, y + r * .3, r * .5, r * .38, 0, 0, 7); ctx.fill();
          // tai nhọn
          ctx.fillStyle = shade(col, -18); for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * .3, y - r * .55); ctx.lineTo(x + s * r * .58, y - r * 1.25); ctx.lineTo(x + s * r * .72, y - r * .5); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#3a1a08"; ctx.beginPath(); ctx.moveTo(x + s * r * .42, y - r * .7); ctx.lineTo(x + s * r * .56, y - r * 1.05); ctx.lineTo(x + s * r * .62, y - r * .68); ctx.closePath(); ctx.fill(); ctx.fillStyle = shade(col, -18); }
          // mõm nhọn (trước-phải) + mũi đen
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + r * .5, y - r * .12); ctx.lineTo(x + r * 1.2, y + r * .08); ctx.lineTo(x + r * .5, y + r * .32); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#1a0a00"; ctx.beginPath(); ctx.arc(x + r * 1.12, y + r * .08, r * .11, 0, 7); ctx.fill();
          // mắt ranh mãnh
          ctx.fillStyle = "#1a0a00"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + r * (.3 + (s > 0 ? .12 : 0)), y - r * .22, r * .1, r * .14, 0, 0, 7); ctx.fill(); }
          break;
        }
        case "toad": { // Cóc Độc: thân bè, mắt lồi trên đỉnh, nốt sần độc, miệng rộng
          feet();
          ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y + r * .1, r * 1.15, r * .82, 0, 0, 7); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke();
          ctx.fillStyle = lt; ctx.beginPath(); ctx.ellipse(x, y + r * .38, r * .68, r * .42, 0, 0, 7); ctx.fill();   // bụng sáng
          ctx.fillStyle = shade(col, -34); for (let i = 0; i < 6; i++) { const a = i * 1.15 + 0.6; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * .62, y + Math.sin(a) * r * .38, r * .1, 0, 7); ctx.fill(); }   // nốt sần độc
          ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y + r * .12, r * .58, 0.12, Math.PI - 0.12); ctx.stroke();   // miệng rộng
          for (const s of [-1, 1]) {   // mắt lồi trên đỉnh
            ctx.fillStyle = lt; ctx.beginPath(); ctx.arc(x + s * r * .42, y - r * .58, r * .28, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 1.4; ctx.stroke();
            ctx.fillStyle = "#1a2a00"; ctx.beginPath(); ctx.arc(x + s * r * .42, y - r * .52, r * .13, 0, 7); ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(x + s * r * .38, y - r * .58, r * .05, 0, 7); ctx.fill();
          }
          break;
        }
        case "mantis": { // Bọ Ngựa: thân xanh + hai càng liềm giơ + râu + mắt to
          feet(); body();
          ctx.strokeStyle = dk; ctx.lineWidth = 1.5; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * .2, y - r * .7); ctx.quadraticCurveTo(x + s * r * .45, y - r * 1.25, x + s * r * .3, y - r * 1.5); ctx.stroke(); }
          ctx.fillStyle = shade(col, -12); for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * .55, y + r * .15); ctx.lineTo(x + s * r * 1.05, y - r * .5); ctx.lineTo(x + s * r * 1.35, y - r * 1.05); ctx.lineTo(x + s * r * 1.02, y - r * .5); ctx.lineTo(x + s * r * .78, y - r * .05); ctx.closePath(); ctx.fill(); }
          eyes(.34, -.22, .2); break;
        }
        default: { // Bọ Ngựa dự phòng / chủng chưa định: sinh vật có sừng + nanh
          feet();
          ctx.fillStyle = dk; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * r * .42, y - r * .72); ctx.lineTo(x + s * r * .78, y - r * 1.4); ctx.lineTo(x + s * r * .62, y - r * .62); ctx.closePath(); ctx.fill(); }
          body(); ctx.fillStyle = lt; ctx.beginPath(); ctx.ellipse(x, y + r * .32, r * .55, r * .5, 0, 0, 7); ctx.fill();
          brows(); eyes(.3, -.1, .17); fangs(.38);
        }
      }
    }
  }

  /* ------------------------------ THÁP ------------------------------ */
  class Tower {
    constructor(type, col, row) {
      this.def = CFG.TOWERS[type]; this.type = type; this.col = col; this.row = row;
      this.x = (col + .5) * TILE; this.y = (row + .5) * TILE;
      this.level = 1; this.cooldown = 0; this.angle = -Math.PI / 2; this.totalSpent = this.def.cost;
      this.support = !!this.def.support;
      this.buffMult = 1; this.buffTime = 0;       // phép Tăng Lực
      this.auraDmg = 1; this.auraRate = 1;         // buff từ Tháp Năng Lượng
      this.buildTimer = 0; this.buildDur = 0; this.action = null;   // xây/nâng/bán cần thời gian
      this.reinforce = 0;   // Gia Cố: +% chỉ số (cộng dồn theo cấp)
      this.origMul = 1;     // Nguyên Bản: ×N khi tháp đã max cấp
      this.fused = false; this.fuseType = null; this.fuseDef = null;   // Dung Hợp
      this.gems = [];   // gem đã gắn (tối đa 3); chỉ số gộp cache: gemDmgMul/gemRateMul/gemCrit/gemSlow/gemStun (game.recomputeGems)
    }
    get ready() { return this.buildTimer <= 0; }
    coreMul() { return (1 + (this.reinforce || 0)) * (this.origMul || 1); }   // hệ số lõi lên chỉ số
    /* ---------- DUNG HỢP ---------- */
    fuse(type) { const d = CFG.TOWERS[type]; if (!d) return; this.fused = true; this.fuseType = type; this.fuseDef = d; }
    // mục tiêu bắn hiệu lực: giữ target tháp GỐC; nếu gốc là Năng Lượng thì bắn theo tháp dung hợp
    get fireTarget() { if (!this.fused) return this.def.target; if (this.def.support) return this.fuseDef.support ? "none" : this.fuseDef.target; return this.def.target; }
    get firesFused() { return this.fireTarget !== "none"; }                    // có bắn không (Năng Lượng thuần thì không)
    get emitsAura() { return !!(this.def.support || (this.fused && this.fuseDef && this.fuseDef.support)); }   // phát aura buff (Năng Lượng, kể cả sau dung hợp)
    get auraStats() { const ed = this.def.support ? this.def : (this.emitsAura ? this.fuseDef : null); return ed ? CFG.statAt(ed, this.level) : { range: 0, dmgBonus: 0, rateBonus: 0 }; }
    // tháp cầm nòng (Năng Lượng gốc thì tháp dung hợp cầm nòng) + chỉ số GỐC của nó
    get shooter() { return this.fused && this.def.support ? this.fuseDef : this.def; }
    get shooterStats() { return CFG.statAt(this.shooter, this.level); }
    // chỉ số BẮN hiệu lực sau dung hợp — ĐỐI XỨNG theo 2 tháp: CỘNG THÊM chỉ số tháp kia (ST/tầm/loang), tốc lấy nhanh hơn
    get fstats() {
      const s = this.stats; if (!this.fused) return s;
      const other = this.def.support ? this.def : this.fuseDef;                  // tháp còn lại
      const ss = this.shooterStats; if (!ss.dmg) return s;                       // cả hai là Năng Lượng -> không bắn
      const os = other.support ? null : CFG.statAt(other, this.level);           // cộng chỉ số nếu tháp kia cũng bắn
      return {
        dmg: ss.dmg + (os ? os.dmg : 0), rate: os ? Math.min(ss.rate, os.rate) : ss.rate,
        range: ss.range + (os ? os.range : 0), splash: (ss.splash || 0) + (os ? (os.splash || 0) : 0),   // CỘNG tầm xa & bắn loang
        slowPct: Math.max(ss.slowPct || 0, os ? (os.slowPct || 0) : 0), poisonPct: Math.max(ss.poisonPct || 0, os ? (os.poisonPct || 0) : 0),
      };
    }
    startWork(action, t) { this.action = action; this.buildTimer = t; this.buildDur = t; }
    get stats() { return CFG.statAt(this.def, this.level); }
    get range() { return this.fstats.range * TILE * this.coreMul(); }
    get maxLevel() { return this.level >= this.def.lv.length; }
    get upgradeCost() { return this.maxLevel ? 0 : CFG.upgradeCost(this.def, this.level); }
    get sellValue() { return Math.floor(this.totalSpent * CFG.SELL_RATE); }
    upgrade() { if (this.maxLevel) return false; this.totalSpent += this.upgradeCost; this.level++; return true; }
    buff(m, d) { this.buffMult = m; this.buffTime = d; }
    comboBuffMul() { return this.comboBuff ? 1 + CFG.TOWER_COMBO_BONUS : 1; }   // 2x Tháp: +10% cho loại xây nhiều nhất
    effDmg() { return this.fstats.dmg * this.auraDmg * (this.buffTime > 0 ? this.buffMult : 1) * this.coreMul() * (this.gemDmgMul || 1) * this.comboBuffMul(); }
    effRate() { return this.fstats.rate * this.auraRate / this.coreMul() / (this.gemRateMul || 1) / this.comboBuffMul(); }   // chia -> bắn nhanh hơn (lõi + gem Mộc + combo 2x tháp)
    canHit(e) { const t = this.fireTarget; return t === "both" || (t === "ground" && !e.fly) || (t === "air" && e.fly); }
    findTarget(en) {
      let best = null, br = 1e18; const rng = this.range;
      for (const e of en) { if (e.dead || e.leaked || !this.canHit(e)) continue; if (dist(this.x, this.y, e.x, e.y) <= rng + e.radius && e.remain < br) { br = e.remain; best = e; } }
      return best;
    }
    update(dt, game) {
      this.glowT = (this.glowT || 0) + dt;   // nhịp sáng cho hiệu ứng Gia Cố (luôn chạy)
      if (this.buildTimer > 0 || this.action === "sell") return;  // đang xây/nâng/tháo -> chưa bắn
      if (!this.firesFused) return;   // Năng Lượng thuần (chưa dung hợp tháp bắn) -> không bắn
      if (this.cooldown > 0) this.cooldown -= dt;
      if (this.buffTime > 0) this.buffTime -= dt;
      const t = this.findTarget(game.enemies); if (!t) return;
      this.angle = Math.atan2(t.y - this.y, t.x - this.x);
      if (this.cooldown <= 0) {
        // Multishot: boon Tên (=cấp) và/hoặc L6 Tên (=cấp); có CẢ hai -> cấp + 3
        const bTen = this.boon === "ten", l6Ten = this.level >= 6 && this.type === "ten";
        const nShots = (bTen && l6Ten) ? this.level + CFG.TEN_L6_BONUS : (bTen || l6Ten) ? this.level : 1;
        if (nShots > 1) { for (const tg of this.findTargets(game.enemies, nShots)) game.projectiles.push(new Projectile(this, tg)); }
        else game.projectiles.push(new Projectile(this, t));
        this.cooldown = this.effRate();
      }
    }
    // n mục tiêu gần đích nhất trong tầm (Tên boon: bắn đa mục tiêu)
    findTargets(en, n) {
      const rng = this.range, arr = [];
      for (const e of en) { if (e.dead || e.leaked || !this.canHit(e)) continue; if (dist(this.x, this.y, e.x, e.y) <= rng + e.radius) arr.push(e); }
      arr.sort((a, b) => a.remain - b.remain);
      return arr.slice(0, Math.max(1, n));
    }
    draw(ctx, sel) {
      const x = this.x, y = this.y, working = !this.ready;
      ctx.save();
      if (working) ctx.globalAlpha = .5;   // mờ khi đang xây/nâng/bán
      if (this.support && !working) { ctx.save(); ctx.globalAlpha = .1; ctx.fillStyle = this.def.color2 || this.def.color; ctx.beginPath(); ctx.arc(x, y, this.range, 0, 7); ctx.fill(); ctx.restore(); }
      const isMax = !working && this.maxLevel && !this.trap && this.def.lv.length > 1;
      stoneBase(ctx, x, y);
      if (!working && (this.buffTime > 0 || this.auraDmg > 1)) { ctx.save(); ctx.globalAlpha = .5; ctx.strokeStyle = this.buffTime > 0 ? "#ffe082" : "#7bf4ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, TILE * .46, 0, 7); ctx.stroke(); ctx.restore(); }
      if (!working && this.fused) this.drawFused(ctx, x, y);   // Dung Hợp: vầng sáng + vòng đôi 2 màu
      if (!working && this.reinforce > 0) this.drawReinforce(ctx, x, y);   // Gia Cố: vòng đồng nhận biết
      this.drawTurret(ctx, x, y, isMax);   // cấp tối đa (lv 5): HÌNH DẠNG tiến hóa của cùng loại tháp
      if (isMax) maxBadge(ctx, x + TILE * .3, y + TILE * .3); else levelBadge(ctx, x + TILE * .3, y + TILE * .3, this.level);
      if (!working && this.reinforce > 0) reinforceBadge(ctx, x - TILE * .3, y - TILE * .32, Math.round(this.reinforce * 100));   // huy hiệu +%
      if (!working && this.gems && this.gems.length) {   // GEM: chấm màu ngũ hành ở CẠNH DƯỚI
        const n = this.gems.length, gx = x - (n - 1) * 4, gy = y + TILE * .42;
        for (let i = 0; i < n; i++) { const gd = CFG.GEMS[this.gems[i]]; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.beginPath(); ctx.arc(gx + i * 8, gy, 3.6, 0, 7); ctx.fill(); ctx.fillStyle = gd ? gd.color : "#fff"; ctx.beginPath(); ctx.arc(gx + i * 8, gy, 2.4, 0, 7); ctx.fill(); }
      }
      if (!working && this.nguHanh) nguHanhBadge(ctx, x, y - TILE * .34, this.glowT || 0);   // NGŨ HÀNH: đủ 5 loại gem -> ×2
      if (!working && this.fused) {   // chấm màu = tháp đã dung hợp vào (góc dưới-trái)
        const bx = x - TILE * .3, by = y + TILE * .3;
        ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.beginPath(); ctx.arc(bx, by, 7.5, 0, 7); ctx.fill();
        ctx.fillStyle = this.fuseDef.color; ctx.beginPath(); ctx.arc(bx, by, 4.2, 0, 7); ctx.fill();
        ctx.strokeStyle = "#e6d4ff"; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
      if (working) {  // vòng tiến độ + đếm giây (đỏ=bán, lục=nâng, vàng=xây)
        const p = 1 - this.buildTimer / this.buildDur, col = this.action === "sell" ? "#ff8a5a" : this.action === "up" ? "#8bff9c" : "#ffe082";
        ctx.save(); ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, TILE * .5, 0, 7); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, TILE * .5, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
        ctx.fillStyle = col; ctx.font = "bold 15px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(Math.ceil(this.buildTimer), x, y); ctx.restore();
      }
      if (sel) selectHighlight(ctx, x, y, this.range, this.glowT || 0);
    }
    // Vòng đồng gia cố (quay + nhấp nháy) quanh chân tháp — dấu hiệu tháp đã Gia Cố
    drawReinforce(ctx, x, y) {
      const t = this.glowT || 0, p = 0.5 + 0.5 * Math.sin(t * 3), R = TILE * .44;
      ctx.save();
      ctx.globalAlpha = .5 + .4 * p; ctx.strokeStyle = "#e8a13a"; ctx.lineWidth = 2.4;
      ctx.setLineDash([5, 3.5]); ctx.lineDashOffset = -t * 10;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 1; ctx.fillStyle = "#ffcf6a";
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t * .5; ctx.beginPath(); ctx.arc(x + Math.cos(a) * R, y + Math.sin(a) * R, 1.7, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    // Hiệu ứng tháp DUNG HỢP: vầng sáng tím + vòng đôi 2 màu quay ngược nhau
    drawFused(ctx, x, y) {
      const t = this.glowT || 0, p = 0.5 + 0.5 * Math.sin(t * 4), R = TILE * .5;
      ctx.save();
      const g = ctx.createRadialGradient(x, y, R * .3, x, y, R);
      g.addColorStop(0, "rgba(190,120,255,0)"); g.addColorStop(1, `rgba(190,120,255,${.16 + .12 * p})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
      ctx.lineWidth = 2.6; ctx.setLineDash([R * .9, R * .7]);
      ctx.strokeStyle = this.def.color; ctx.lineDashOffset = t * 20; ctx.beginPath(); ctx.arc(x, y, R * .92, 0, 7); ctx.stroke();
      ctx.strokeStyle = this.fuseDef.color2 || this.fuseDef.color; ctx.lineDashOffset = -t * 20; ctx.beginPath(); ctx.arc(x, y, R * .74, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    drawTurret(ctx, x, y, isMax) {
      const d = this.def, col = d.color, a = this.angle, top = y - TILE * .1;
      switch (this.type) {
        case "ten": { // Tháp Tên: cột gỗ + nỏ xoay
          if (isMax) {   // NỎ MÁY (ballista): cột bọc kim loại + cánh nỏ đôi + mũi tên lớn
            ctx.fillStyle = "#5b4426"; roundRect(ctx, x - 7, top - 14, 14, 19, 3); ctx.fill();
            ctx.fillStyle = "#caa46a"; roundRect(ctx, x - 8, top - 16, 16, 4, 2); ctx.fill();
            ctx.save(); ctx.translate(x, top - 12); ctx.rotate(a);
            ctx.strokeStyle = "#3a2a14"; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(3, 0, 11, -1.25, 1.25); ctx.stroke();
            ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(6, 0, 8, -1.1, 1.1); ctx.stroke();
            ctx.strokeStyle = "#e8d9a0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(18, 0); ctx.stroke();
            ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(12, -3.5); ctx.lineTo(12, 3.5); ctx.fill(); ctx.restore(); break;
          }
          ctx.fillStyle = "#6e4f2a"; roundRect(ctx, x - 5, top - 12, 10, 16, 2); ctx.fill();
          ctx.fillStyle = "#8a6636"; roundRect(ctx, x - 6, top - 14, 12, 4, 2); ctx.fill();
          ctx.save(); ctx.translate(x, top - 11); ctx.rotate(a);
          ctx.strokeStyle = "#4a3418"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(4, 0, 8, -1.15, 1.15); ctx.stroke();
          ctx.strokeStyle = "#e8d9a0"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(13, 0); ctx.stroke();
          ctx.fillStyle = "#caa46a"; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(9, -2.5); ctx.lineTo(9, 2.5); ctx.fill(); ctx.restore(); break;
        }
        case "lua": { // Tháp Lửa: lô cốt đá + nòng pháo xoay + lửa
          if (isMax) {   // ĐẠI PHÁO ĐÔI: lô cốt lớn hơn + vành vàng + 2 nòng phun lửa
            ctx.fillStyle = shade(col, -35); roundRect(ctx, x - 12, top - 17, 24, 18, 3); ctx.fill();
            ctx.fillStyle = col; roundRect(ctx, x - 12, top - 19, 24, 6, 3); ctx.fill();
            ctx.fillStyle = "#ffd24a"; roundRect(ctx, x - 12, top - 21, 24, 3, 2); ctx.fill();
            for (let i = -1; i <= 1; i++) { ctx.fillStyle = shade(col, -20); roundRect(ctx, x - 10 + (i + 1) * 7, top - 24, 5, 5, 1); ctx.fill(); }
            ctx.save(); ctx.translate(x, top - 9); ctx.rotate(a);
            for (const oy of [-4, 4]) { ctx.fillStyle = "#2e2016"; roundRect(ctx, 0, oy - 3, 20, 6, 2); ctx.fill(); const g = ctx.createRadialGradient(20, oy, 1, 20, oy, 6); g.addColorStop(0, "#fff2c0"); g.addColorStop(.5, "#ff8a2a"); g.addColorStop(1, "rgba(255,90,20,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(20, oy, 6, 0, 7); ctx.fill(); }
            ctx.restore(); break;
          }
          ctx.fillStyle = shade(col, -35); roundRect(ctx, x - 10, top - 15, 20, 16, 3); ctx.fill();
          ctx.fillStyle = col; roundRect(ctx, x - 10, top - 17, 20, 6, 3); ctx.fill();
          for (let i = -1; i <= 1; i++) { ctx.fillStyle = shade(col, -20); roundRect(ctx, x - 9 + (i + 1) * 6, top - 20, 4, 4, 1); ctx.fill(); }
          ctx.save(); ctx.translate(x, top - 8); ctx.rotate(a);
          ctx.fillStyle = "#2e2016"; roundRect(ctx, 0, -4, 17, 8, 2); ctx.fill();
          const g = ctx.createRadialGradient(17, 0, 1, 17, 0, 6); g.addColorStop(0, "#fff2c0"); g.addColorStop(.5, "#ff8a2a"); g.addColorStop(1, "rgba(255,90,20,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(17, 0, 6, 0, 7); ctx.fill(); ctx.restore(); break;
        }
        case "bang": { // Tháp Băng: cụm pha lê
          if (isMax) {   // ĐÀI PHA LÊ: trụ trung tâm cao + cụm 5 tinh thể
            diamond(ctx, x, top - 16, 10, 28, col, "#eaffff");
            diamond(ctx, x - 10, top - 6, 6, 15, shade(col, -20), "#cdf3ff");
            diamond(ctx, x + 10, top - 7, 6, 16, shade(col, -20), "#cdf3ff");
            diamond(ctx, x - 5, top - 2, 4, 10, shade(col, -8), "#dff7ff");
            diamond(ctx, x + 5, top - 3, 4, 11, shade(col, -8), "#dff7ff"); break;
          }
          diamond(ctx, x, top - 12, 8, 20, col, "#eaffff");
          diamond(ctx, x - 8, top - 4, 5, 12, shade(col, -20), "#cdf3ff");
          diamond(ctx, x + 8, top - 5, 5, 13, shade(col, -20), "#cdf3ff"); break;
        }
        case "set": { // Tháp Sét: trụ kim loại + cầu điện + tia
          if (isMax) {   // THÁP TESLA: trụ to hơn + cầu điện lớn + vành tia dày (5 tia)
            ctx.fillStyle = "#8a8a6a"; roundRect(ctx, x - 4, top - 16, 8, 18, 1); ctx.fill();
            ctx.fillStyle = "#6a6a4a"; roundRect(ctx, x - 9, top + 2, 18, 5, 2); ctx.fill();
            ctx.fillStyle = "#ffd24a"; roundRect(ctx, x - 5, top - 5, 10, 2, 1); ctx.fill();
            const g = ctx.createRadialGradient(x, top - 20, 1, x, top - 20, 10); g.addColorStop(0, "#fffbe0"); g.addColorStop(.6, col); g.addColorStop(1, shade(col, -50)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, top - 20, 9, 0, 7); ctx.fill();
            ctx.strokeStyle = "#fff7c0"; ctx.lineWidth = 1.5; for (let i = 0; i < 5; i++) { const an = a + i * 1.257; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * 9, top - 20 + Math.sin(an) * 9); ctx.lineTo(x + Math.cos(an) * 16, top - 20 + Math.sin(an) * 16); ctx.stroke(); } break;
          }
          ctx.fillStyle = "#8a8a6a"; roundRect(ctx, x - 3, top - 14, 6, 16, 1); ctx.fill();
          ctx.fillStyle = "#6a6a4a"; roundRect(ctx, x - 7, top + 1, 14, 4, 2); ctx.fill();
          const g = ctx.createRadialGradient(x, top - 17, 1, x, top - 17, 8); g.addColorStop(0, "#fffbe0"); g.addColorStop(.6, col); g.addColorStop(1, shade(col, -50)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, top - 17, 7, 0, 7); ctx.fill();
          ctx.strokeStyle = "#fff7c0"; ctx.lineWidth = 1.3; for (let i = 0; i < 3; i++) { const an = a + i * 2.1; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * 7, top - 17 + Math.sin(an) * 7); ctx.lineTo(x + Math.cos(an) * 13, top - 17 + Math.sin(an) * 13); ctx.stroke(); } break;
        }
        case "doc": { // Tháp Độc: vạc độc sủi bọt
          if (isMax) {   // ĐẠI VẠC ĐỘC: vạc to hơn + vành vàng + nhiều bọt hơn
            ctx.fillStyle = "#33263a"; ctx.beginPath(); ctx.arc(x, top - 5, 13, Math.PI * .08, Math.PI * .92, false); ctx.lineTo(x - 11, top - 13); ctx.lineTo(x + 11, top - 13); ctx.fill();
            ctx.fillStyle = "#241a2b"; roundRect(ctx, x - 14, top - 14, 28, 5, 2); ctx.fill();
            ctx.fillStyle = "#ffd24a"; roundRect(ctx, x - 14, top - 15, 28, 2, 1); ctx.fill();
            const g = ctx.createRadialGradient(x, top - 12, 1, x, top - 12, 12); g.addColorStop(0, "#e29bff"); g.addColorStop(1, col); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, top - 12, 11, 4.2, 0, 0, 7); ctx.fill();
            ctx.fillStyle = "rgba(220,150,255,.85)"; ctx.beginPath(); ctx.arc(x - 4, top - 16, 2.2, 0, 7); ctx.arc(x + 4, top - 18, 1.8, 0, 7); ctx.arc(x + 1, top - 20, 1.4, 0, 7); ctx.fill(); break;
          }
          ctx.fillStyle = "#33263a"; ctx.beginPath(); ctx.arc(x, top - 6, 11, Math.PI * .1, Math.PI * .9, false); ctx.lineTo(x - 9, top - 12); ctx.lineTo(x + 9, top - 12); ctx.fill();
          ctx.fillStyle = "#241a2b"; roundRect(ctx, x - 12, top - 13, 24, 4, 2); ctx.fill();
          const g = ctx.createRadialGradient(x, top - 11, 1, x, top - 11, 10); g.addColorStop(0, "#e29bff"); g.addColorStop(1, col); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, top - 11, 9, 3.5, 0, 0, 7); ctx.fill();
          ctx.fillStyle = "rgba(220,150,255,.85)"; ctx.beginPath(); ctx.arc(x - 3, top - 14, 1.8, 0, 7); ctx.arc(x + 4, top - 16, 1.4, 0, 7); ctx.fill(); break;
        }
        case "nangluong": { // Tháp Năng Lượng: bệ + quả cầu năng lượng lơ lửng
          if (isMax) {   // LÒ PHẢN ỨNG: bệ lớn + cầu năng lượng to + 2 vành quỹ đạo chéo
            ctx.fillStyle = "#243842"; roundRect(ctx, x - 8, top - 5, 16, 11, 2); ctx.fill();
            ctx.fillStyle = "#33525e"; roundRect(ctx, x - 10, top - 8, 20, 5, 2); ctx.fill();
            const g = ctx.createRadialGradient(x - 2, top - 19, 1, x, top - 17, 11); g.addColorStop(0, "#fff"); g.addColorStop(.4, d.color2 || col); g.addColorStop(1, shade(col, -40)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, top - 17, 10, 0, 7); ctx.fill();
            ctx.strokeStyle = "rgba(180,250,255,.7)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(x, top - 17, 14, 5, .6, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, top - 17, 14, 5, -.6, 0, 7); ctx.stroke(); break;
          }
          ctx.fillStyle = "#243842"; roundRect(ctx, x - 7, top - 6, 14, 10, 2); ctx.fill();
          ctx.fillStyle = "#33525e"; roundRect(ctx, x - 9, top - 8, 18, 4, 2); ctx.fill();
          const g = ctx.createRadialGradient(x - 2, top - 18, 1, x, top - 16, 9); g.addColorStop(0, "#fff"); g.addColorStop(.4, d.color2 || col); g.addColorStop(1, shade(col, -40)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, top - 16, 8, 0, 7); ctx.fill();
          ctx.strokeStyle = "rgba(180,250,255,.6)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, top - 16, 11, 4, .6, 0, 7); ctx.stroke(); break;
        }
        default: { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, top - 8, 10, 0, 7); ctx.fill(); }
      }
    }
  }

  /* ------------------------------ BẪY ------------------------------ */
  class Trap {
    constructor(type, col, row) {
      this.def = CFG.TRAPS[type]; this.type = type; this.col = col; this.row = row;
      this.x = (col + .5) * TILE; this.y = (row + .5) * TILE;
      this.totalSpent = this.def.cost; this.trap = true; this.once = true; this.dead = false; this.pulse = 0;
    }
    get sellValue() { return Math.floor(this.totalSpent * CFG.SELL_RATE); }
    get range() { return this.def.radius * TILE; }
    update(dt, game) {
      this.pulse += dt; if (this.dead) return;
      const b = this.def.base;
      // chỉ tác dụng lên 1 con quái BỘ đang ĐỨNG TRÊN đúng ô đặt bẫy
      let hit = null;
      for (const e of game.enemies) {
        if (e.dead || e.leaked || e.fly || (this.type === "hut" && e.boss)) continue;
        if (Math.floor(e.x / TILE) === this.col && Math.floor(e.y / TILE) === this.row) { hit = e; break; }
      }
      if (!hit) return;
      if (this.type === "dinh") hit.freeze(b.freeze);
      else {   // Bẫy Hút
        // [Đối kháng] hút sang sân đối thủ ngẫu nhiên; nếu không có đối thủ -> đẩy về ô cũ trên sân mình
        if (game.versus && game.pvpVacuum(hit)) { game.effects.push(new SwirlFx(this.x, this.y)); }
        else { const cell = game.randomBackCell(this.col, this.row, b.back); if (cell) { game.effects.push(new SwirlFx(hit.x, hit.y)); hit.teleportTo((cell.c + .5) * TILE, (cell.r + .5) * TILE); hit.pullCd = 0; } }
      }
      game.effects.push(new BlastFx(this.x, this.y, this.range, this.type === "dinh" ? "#bdeaff" : "#9fa8ff"));
      this.dead = true;
    }
    draw(ctx, sel) {
      const x = this.x, y = this.y, col = this.def.color, ph = this.pulse;
      ctx.save(); ctx.globalAlpha = .22 + .12 * Math.sin(ph * 4); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, this.range, 0, 7); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(x, y); ctx.scale(1, .58);
      ctx.fillStyle = shade(col, -25); ctx.beginPath(); ctx.arc(0, 0, TILE * .38, 0, 7); ctx.fill();
      ctx.fillStyle = shade(col, 5); ctx.beginPath(); ctx.arc(0, 0, TILE * .3, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, TILE * .38, 0, 7); ctx.stroke();
      if (this.type === "dinh") {
        ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(an) * TILE * .3, Math.sin(an) * TILE * .3); ctx.stroke(); }
        for (let rr = .12; rr <= .3; rr += .09) { ctx.beginPath(); ctx.arc(0, 0, TILE * rr, 0, 7); ctx.stroke(); }
      } else {
        ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2; ctx.beginPath();
        for (let t = 0; t < 12; t++) { const an = t * .7 + ph * 2, rr = t * 1.1; const px = Math.cos(an) * rr, py = Math.sin(an) * rr; t ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke();
      }
      ctx.restore();
      // dấu "1×" báo dùng một lần
      ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.beginPath(); ctx.arc(x + TILE * .28, y + TILE * .1, 7.5, 0, 7); ctx.fill();
      ctx.strokeStyle = "#b9862b"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#ffd24a"; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("1×", x + TILE * .28, y + TILE * .1 + .5);
      if (sel) selectHighlight(ctx, x, y, this.range, this.pulse || 0);
    }
  }

  /* --------------------------- ĐẠN & FX --------------------------- */
  class Projectile {
    constructor(tower, target) {
      this.def = tower.def; this.st = tower.fstats; this.dmg = tower.effDmg();
      this.tgt = tower.fireTarget;
      this.effects = tower.fused ? [tower.def.effect, tower.fuseDef.effect].filter(Boolean) : (tower.def.effect ? [tower.def.effect] : []);   // dung hợp: gộp hiệu ứng 2 tháp
      this.splash = (this.st.splash || 0) * (1 + (tower.reinforce || 0)) * (tower.origMul || 1);   // Gia Cố/Nguyên Bản: nới bán kính loang
      this.effMul = tower.origMul || 1;   // Nguyên Bản: nhân đôi hiệu ứng (làm chậm/độc)
      const shooter = (tower.fused && tower.def.support) ? tower.fuseDef : tower.def;   // Năng Lượng gốc -> đạn theo tháp dung hợp
      this.projColor = shooter.projColor || "#ffe8b0"; this.speed = shooter.projSpeed || tower.def.projSpeed || 400;
      this.x = tower.x; this.y = tower.y; this.target = target; this.tx = target.x; this.ty = target.y; this.dead = false;
      // GEM: mang theo chỉ số gem của tháp lúc bắn
      this.gemCrit = tower.gemCrit || 0; this.gemSlow = tower.gemSlow || 0; this.gemStun = tower.gemStun || 0;
      // BOON (combo 3x Tháp): loại tháp được cường hóa
      this.boon = tower.boon || null;
      this.boonDistMul = (this.boon === "set") ? 1 + CFG.SET_DIST_PER * (dist(tower.x, tower.y, target.x, target.y) / TILE) : 1;   // Sét: +10%/ô, không cap
      // CẤP 6: dấu ấn theo LOẠI tháp nền
      this.l6 = tower.level >= 6; this.ttype = tower.def.key;
    }
    canHit(e) { return this.tgt === "both" || (this.tgt === "ground" && !e.fly) || (this.tgt === "air" && e.fly); }
    applyTo(e, primary) {
      let dmg = this.dmg * this.boonDistMul;   // Sét boon: +dmg theo khoảng cách
      if (this.l6 && this.ttype === "set") dmg += CFG.SET_L6_HP * e.hp;   // Sét L6: +0.1% máu HIỆN TẠI/đòn (bỏ giáp)
      if (this.gemCrit > 0 && Math.random() < this.gemCrit) { dmg *= CFG.CRIT_MULT; e.critFx = 0.25; }   // GEM Kim: chí mạng
      e.applyDamage(dmg);
      if (this.gemSlow > 0) e.slow(1 - Math.min(0.9, this.gemSlow), 1.2);                 // GEM Thuỷ: làm chậm
      if (primary && this.gemStun > 0 && Math.random() < this.gemStun) e.freeze(CFG.FREEZE_DUR);   // GEM Thổ: choáng 1s — CHỈ mục tiêu chính (không loang)
      if (primary && this.boon === "bang" && Math.random() < CFG.FREEZE_CHANCE) e.freeze(CFG.FREEZE_DUR);   // Băng boon: đóng băng 1s — CHỈ mục tiêu chính
      if (this.l6 && this.ttype === "bang" && Math.random() < CFG.BANG_L6_CHANCE) e.freeze(CFG.BANG_L6_DUR);   // Băng L6: mini-stun 0.4s — CÓ loang
      if (this.ttype === "lua") {   // Lửa: 1 cơ chế đốt %máu đã mất — L6 đốt LUÔN (×1.5 nếu có boon); chỉ boon (không L6) = 15% cơ hội
        if (this.l6) e.burnMiss(CFG.BURN_MISS_PCT * (this.boon === "lua" ? CFG.LUA_L6_MUL : 1), CFG.BURN_DUR);
        else if (this.boon === "lua" && Math.random() < CFG.BURN_CHANCE) e.burnMiss(CFG.BURN_MISS_PCT, CFG.BURN_DUR);
      }
      for (const fx of this.effects) {   // dung hợp có thể có nhiều hiệu ứng (làm chậm + độc...)
        if (fx === "slow") e.slow(1 - Math.min(0.95, (this.st.slowPct || 0) * this.effMul), 1.2);
        else if (fx === "poison") e.addPoison((this.st.poisonPct || 0) * this.effMul / 5, 5, 4, this.boon === "doc");  // độc: %máu HIỆN TẠI (hoặc TỐI ĐA nếu boon Độc), 5s
      }
    }
    update(dt, game) {
      if (this.target && !this.target.dead && !this.target.leaked) { this.tx = this.target.x; this.ty = this.target.y; }
      const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy), s = this.speed * dt;
      if (d <= s || d < 4) { this.hit(game); this.dead = true; return; }
      this.x += (dx / d) * s; this.y += (dy / d) * s;
    }
    hit(game) {
      if (game.mirror) { if (this.splash > 0) game.effects.push(new BlastFx(this.tx, this.ty, this.splash * TILE, this.projColor)); return; }   // đồng đội: đạn chỉ để NHÌN, không trừ máu (máu do chủ-bàn áp qua board)
      if (this.splash > 0) {   // NỔ LAN: trúng mọi quái đúng loại trong bán kính
        const r = this.splash * TILE;
        for (const e of game.enemies) { if (e.dead || e.leaked || !this.canHit(e)) continue; if (dist(e.x, e.y, this.tx, this.ty) <= r + e.radius) this.applyTo(e, e === this.target); }   // stun (Thổ) chỉ mục tiêu chính
        game.effects.push(new BlastFx(this.tx, this.ty, r, this.projColor));
      } else if (this.target && !this.target.dead && !this.target.leaked) this.applyTo(this.target, true);
    }
    draw(ctx) { ctx.fillStyle = this.projColor; ctx.beginPath(); ctx.arc(this.x, this.y, this.splash > 0 ? 6 : 4, 0, 7); ctx.fill(); }
  }
  class BlastFx { constructor(x, y, r, c) { this.x = x; this.y = y; this.r = r; this.color = c; this.t = 0; this.dur = .3; this.dead = false; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { const f = this.t / this.dur; ctx.globalAlpha = 1 - f; ctx.strokeStyle = this.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.x, this.y, this.r * f, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; } }
  class SwirlFx { constructor(x, y) { this.x = x; this.y = y; this.t = 0; this.dur = .35; this.dead = false; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { const f = this.t / this.dur; ctx.globalAlpha = 1 - f; ctx.strokeStyle = "#9fa8ff"; ctx.lineWidth = 2.5; ctx.beginPath(); for (let a = 0; a < 12; a++) { const ang = a * .6 + f * 6, rr = a * 1.6 * (1 - f * .3); const px = this.x + Math.cos(ang) * rr, py = this.y + Math.sin(ang) * rr; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); ctx.globalAlpha = 1; } }
  class PoisonCloud { constructor(x, y, r, dps, dur, pctps) { this.x = x; this.y = y; this.r = r; this.dps = dps; this.pctps = pctps || 0; this.dur = dur; this.t = 0; this.dead = false; } update(dt, game) { this.t += dt; if (this.t >= this.dur) { this.dead = true; return; } for (const e of game.enemies) if (!e.dead && !e.leaked && dist(e.x, e.y, this.x, this.y) <= this.r + e.radius) { e.applyDamage((this.dps + this.pctps * e.maxHp) * dt, true); e._spellHit = true; } } draw(ctx) { ctx.save(); ctx.globalAlpha = .3 * (1 - this.t / this.dur) + .15; ctx.fillStyle = "#8e24aa"; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, 7); ctx.fill(); ctx.restore(); } }

  function shade(hex, amt) { const n = parseInt(hex.slice(1), 16), cl = (v) => Math.max(0, Math.min(255, v)); return `rgb(${cl((n >> 16) + amt)},${cl(((n >> 8) & 255) + amt)},${cl((n & 255) + amt)})`; }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // đế đá bát giác 3D (dùng cho mọi tháp)
  function stoneBase(ctx, x, y) {
    const R = TILE * .44;
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y + R * .5, R * 1.02, R * .46, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#463b28"; ctx.beginPath(); ctx.ellipse(x, y + 4, R, R * .56, 0, 0, 7); ctx.fill();
    const g = ctx.createLinearGradient(x, y - R * .5, x, y + R * .5); g.addColorStop(0, "#82744f"); g.addColorStop(1, "#544829");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, R * .9, R * .5, 0, 0, 7); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1; for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * R * .55, y + Math.sin(an) * R * .3); ctx.lineTo(x + Math.cos(an) * R * .9, y + Math.sin(an) * R * .5); ctx.stroke(); }
  }
  // pha lê (rhombus) có viền sáng
  function diamond(ctx, cx, cy, hw, h, fill, hi) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + h / 2); ctx.lineTo(cx - hw, cy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = hi; ctx.beginPath(); ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx - hw * .5, cy); ctx.lineTo(cx, cy + h / 2 * .2); ctx.lineTo(cx - hw * .15, cy - h * .1); ctx.closePath(); ctx.fill();
  }
  // huy hiệu cấp (số vàng trên nền tối)
  // Dấu chọn: vòng sáng vàng nhấp nháy quanh chân + vòng tầm nét đứt (phân biệt rõ tháp đang chọn)
  function selectHighlight(ctx, x, y, range, t) {
    const p = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.save();
    ctx.shadowColor = "rgba(255,214,80,.9)"; ctx.shadowBlur = 10 + 6 * p;
    ctx.strokeStyle = "rgba(255,224,130," + (0.7 + 0.3 * p) + ")"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, TILE * (0.5 + 0.03 * p), 0, 7); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, range, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }
  // Huy hiệu NGŨ HÀNH: ngũ giác 5 màu ngũ hành xoay + toả sáng (đủ 5 loại gem -> ×2)
  function nguHanhBadge(ctx, x, y, t) {
    const cols = CFG.GEM_ORDER.map((k) => CFG.GEMS[k].color), p = 0.5 + 0.5 * Math.sin(t * 3), R = 7.5;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * .5);
    ctx.shadowColor = "rgba(255,255,255,.85)"; ctx.shadowBlur = 5 + 4 * p;
    ctx.fillStyle = "rgba(20,16,8,.92)"; ctx.beginPath(); ctx.arc(0, 0, R + 1.5, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    for (let i = 0; i < 5; i++) { const a0 = -Math.PI / 2 + i * 2 * Math.PI / 5, a1 = a0 + 2 * Math.PI / 5;
      ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  // Huy hiệu cấp tối đa: ngôi sao vàng thay số cấp (tháp đã max)
  function maxBadge(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = "rgba(60,36,4,.92)"; ctx.beginPath(); ctx.arc(x, y, 8.5, 0, 7); ctx.fill();
    ctx.strokeStyle = "#ffdf7a"; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = "#ffd24a"; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.6 : 6; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function levelBadge(ctx, x, y, lv) {
    ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = "#b9862b"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#ffd24a"; ctx.font = "bold 10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(lv, x, y + .5);
  }
  // huy hiệu Gia Cố: "+N%" nền đồng ở góc trên-trái tháp
  function reinforceBadge(ctx, x, y, pct) {
    ctx.fillStyle = "rgba(34,20,6,.85)"; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
    ctx.strokeStyle = "#e8a13a"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = "#ffcf6a"; ctx.font = "bold 8px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("+" + pct + "%", x, y + .5);
  }

  STM.Enemy = Enemy; STM.Tower = Tower; STM.Trap = Trap;
  STM.Projectile = Projectile; STM.PoisonCloud = PoisonCloud; STM.util = { dist };
})(window.STM || (window.STM = {}));
