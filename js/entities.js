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
      this.burnDps = 0; this.burnTime = 0; this.poison = []; this.pullCd = 0; this.remain = 1e9;
      this.wingPhase = Math.random() * 6; this.animT = Math.random() * 3;
      this.slowResist = def.slowResist || 0;   // kháng làm chậm (0..1)
    }
    get speed() { return this.freezeTime > 0 ? 0 : this.baseSpeed * this.slowMult; }
    applyDamage(d, ig) { const e = ig ? d : Math.max(1, d - this.armor); this.hp -= e; if (this.hp <= 0) this.dead = true; }
    slow(m, d) { const eff = 1 - (1 - m) * (1 - this.slowResist); if (eff < this.slowMult || this.slowTime <= 0) this.slowMult = eff; this.slowTime = Math.max(this.slowTime, d * (1 - this.slowResist * 0.5)); }
    freeze(d) { this.freezeTime = Math.max(this.freezeTime, d); }
    burn(dps, d) { this.burnDps = Math.max(this.burnDps, dps); this.burnTime = Math.max(this.burnTime, d); }
    addPoison(pct, d, mx) { if (this.poison.length < mx) this.poison.push({ pct, time: d }); else this.poison[0] = { pct, time: d }; }  // pct = % máu HIỆN TẠI / giây
    teleportTo(cx, cy) { this.x = cx; this.y = cy; }

    update(dt, game) {
      if (this.burnTime > 0) { this.applyDamage(this.burnDps * dt, true); this.burnTime -= dt; }
      if (this.poison.length) { let f = 0; for (const p of this.poison) { f += p.pct; p.time -= dt; } if (f > 0) this.applyDamage(this.hp * f * dt, true); this.poison = this.poison.filter((p) => p.time > 0); }  // trừ theo % máu hiện tại
      if (this.slowTime > 0) { this.slowTime -= dt; if (this.slowTime <= 0) this.slowMult = 1; }
      if (this.freezeTime > 0) this.freezeTime -= dt;
      if (this.pullCd > 0) this.pullCd -= dt;
      this.animT += dt;
      if (this.fly) this.wingPhase += dt * 9;
      if (this.dead) { game.onEnemyKilled(this); return; }
      let mv = this.speed * dt * (game.enemyHaste || 1);
      if (this.fly) {
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
    }
    get ready() { return this.buildTimer <= 0; }
    startWork(action, t) { this.action = action; this.buildTimer = t; this.buildDur = t; }
    get stats() { return CFG.statAt(this.def, this.level); }
    get range() { return this.stats.range * TILE; }
    get maxLevel() { return this.level >= this.def.lv.length; }
    get upgradeCost() { return this.maxLevel ? 0 : CFG.upgradeCost(this.def, this.level); }
    get sellValue() { return Math.floor(this.totalSpent * CFG.SELL_RATE); }
    upgrade() { if (this.maxLevel) return false; this.totalSpent += this.upgradeCost; this.level++; return true; }
    buff(m, d) { this.buffMult = m; this.buffTime = d; }
    effDmg() { return this.stats.dmg * this.auraDmg * (this.buffTime > 0 ? this.buffMult : 1); }
    effRate() { return this.stats.rate * this.auraRate; }
    canHit(e) { const t = this.def.target; return t === "both" || (t === "ground" && !e.fly) || (t === "air" && e.fly); }
    findTarget(en) {
      let best = null, br = 1e18; const rng = this.range;
      for (const e of en) { if (e.dead || e.leaked || !this.canHit(e)) continue; if (dist(this.x, this.y, e.x, e.y) <= rng + e.radius && e.remain < br) { br = e.remain; best = e; } }
      return best;
    }
    update(dt, game) {
      if (this.buildTimer > 0 || this.action === "sell") return;  // đang xây/nâng/tháo -> chưa bắn
      if (this.support) return;   // tháp năng lượng không bắn
      if (this.cooldown > 0) this.cooldown -= dt;
      if (this.buffTime > 0) this.buffTime -= dt;
      const t = this.findTarget(game.enemies); if (!t) return;
      this.angle = Math.atan2(t.y - this.y, t.x - this.x);
      if (this.cooldown <= 0) { game.projectiles.push(new Projectile(this, t)); this.cooldown = this.effRate(); }
    }
    draw(ctx, sel) {
      const x = this.x, y = this.y, working = !this.ready;
      ctx.save();
      if (working) ctx.globalAlpha = .5;   // mờ khi đang xây/nâng/bán
      if (this.support && !working) { ctx.save(); ctx.globalAlpha = .1; ctx.fillStyle = this.def.color2 || this.def.color; ctx.beginPath(); ctx.arc(x, y, this.range, 0, 7); ctx.fill(); ctx.restore(); }
      stoneBase(ctx, x, y);
      if (!working && (this.buffTime > 0 || this.auraDmg > 1)) { ctx.save(); ctx.globalAlpha = .5; ctx.strokeStyle = this.buffTime > 0 ? "#ffe082" : "#7bf4ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, TILE * .46, 0, 7); ctx.stroke(); ctx.restore(); }
      this.drawTurret(ctx, x, y);
      levelBadge(ctx, x + TILE * .3, y + TILE * .3, this.level);
      ctx.restore();
      if (working) {  // vòng tiến độ + đếm giây (đỏ=bán, lục=nâng, vàng=xây)
        const p = 1 - this.buildTimer / this.buildDur, col = this.action === "sell" ? "#ff8a5a" : this.action === "up" ? "#8bff9c" : "#ffe082";
        ctx.save(); ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, TILE * .5, 0, 7); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, TILE * .5, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
        ctx.fillStyle = col; ctx.font = "bold 15px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(Math.ceil(this.buildTimer), x, y); ctx.restore();
      }
      if (sel) { ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, this.range, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    }
    drawTurret(ctx, x, y) {
      const d = this.def, col = d.color, a = this.angle, top = y - TILE * .1;
      switch (this.type) {
        case "ten": { // Tháp Tên: cột gỗ + nỏ xoay
          ctx.fillStyle = "#6e4f2a"; roundRect(ctx, x - 5, top - 12, 10, 16, 2); ctx.fill();
          ctx.fillStyle = "#8a6636"; roundRect(ctx, x - 6, top - 14, 12, 4, 2); ctx.fill();
          ctx.save(); ctx.translate(x, top - 11); ctx.rotate(a);
          ctx.strokeStyle = "#4a3418"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(4, 0, 8, -1.15, 1.15); ctx.stroke();
          ctx.strokeStyle = "#e8d9a0"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(13, 0); ctx.stroke();
          ctx.fillStyle = "#caa46a"; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(9, -2.5); ctx.lineTo(9, 2.5); ctx.fill(); ctx.restore(); break;
        }
        case "lua": { // Tháp Lửa: lô cốt đá + nòng pháo xoay + lửa
          ctx.fillStyle = shade(col, -35); roundRect(ctx, x - 10, top - 15, 20, 16, 3); ctx.fill();
          ctx.fillStyle = col; roundRect(ctx, x - 10, top - 17, 20, 6, 3); ctx.fill();
          for (let i = -1; i <= 1; i++) { ctx.fillStyle = shade(col, -20); roundRect(ctx, x - 9 + (i + 1) * 6, top - 20, 4, 4, 1); ctx.fill(); }
          ctx.save(); ctx.translate(x, top - 8); ctx.rotate(a);
          ctx.fillStyle = "#2e2016"; roundRect(ctx, 0, -4, 17, 8, 2); ctx.fill();
          const g = ctx.createRadialGradient(17, 0, 1, 17, 0, 6); g.addColorStop(0, "#fff2c0"); g.addColorStop(.5, "#ff8a2a"); g.addColorStop(1, "rgba(255,90,20,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(17, 0, 6, 0, 7); ctx.fill(); ctx.restore(); break;
        }
        case "bang": { // Tháp Băng: cụm pha lê
          diamond(ctx, x, top - 12, 8, 20, col, "#eaffff");
          diamond(ctx, x - 8, top - 4, 5, 12, shade(col, -20), "#cdf3ff");
          diamond(ctx, x + 8, top - 5, 5, 13, shade(col, -20), "#cdf3ff"); break;
        }
        case "set": { // Tháp Sét: trụ kim loại + cầu điện + tia
          ctx.fillStyle = "#8a8a6a"; roundRect(ctx, x - 3, top - 14, 6, 16, 1); ctx.fill();
          ctx.fillStyle = "#6a6a4a"; roundRect(ctx, x - 7, top + 1, 14, 4, 2); ctx.fill();
          const g = ctx.createRadialGradient(x, top - 17, 1, x, top - 17, 8); g.addColorStop(0, "#fffbe0"); g.addColorStop(.6, col); g.addColorStop(1, shade(col, -50)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, top - 17, 7, 0, 7); ctx.fill();
          ctx.strokeStyle = "#fff7c0"; ctx.lineWidth = 1.3; for (let i = 0; i < 3; i++) { const an = a + i * 2.1; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * 7, top - 17 + Math.sin(an) * 7); ctx.lineTo(x + Math.cos(an) * 13, top - 17 + Math.sin(an) * 13); ctx.stroke(); } break;
        }
        case "doc": { // Tháp Độc: vạc độc sủi bọt
          ctx.fillStyle = "#33263a"; ctx.beginPath(); ctx.arc(x, top - 6, 11, Math.PI * .1, Math.PI * .9, false); ctx.lineTo(x - 9, top - 12); ctx.lineTo(x + 9, top - 12); ctx.fill();
          ctx.fillStyle = "#241a2b"; roundRect(ctx, x - 12, top - 13, 24, 4, 2); ctx.fill();
          const g = ctx.createRadialGradient(x, top - 11, 1, x, top - 11, 10); g.addColorStop(0, "#e29bff"); g.addColorStop(1, col); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, top - 11, 9, 3.5, 0, 0, 7); ctx.fill();
          ctx.fillStyle = "rgba(220,150,255,.85)"; ctx.beginPath(); ctx.arc(x - 3, top - 14, 1.8, 0, 7); ctx.arc(x + 4, top - 16, 1.4, 0, 7); ctx.fill(); break;
        }
        case "nangluong": { // Tháp Năng Lượng: bệ + quả cầu năng lượng lơ lửng
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
      else { const cell = game.randomBackCell(this.col, this.row, b.back); if (cell) { game.effects.push(new SwirlFx(hit.x, hit.y)); hit.teleportTo((cell.c + .5) * TILE, (cell.r + .5) * TILE); hit.pullCd = 0; } }
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
      if (sel) { ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, this.range, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    }
  }

  /* --------------------------- ĐẠN & FX --------------------------- */
  class Projectile {
    constructor(tower, target) {
      this.def = tower.def; this.st = tower.stats; this.dmg = tower.effDmg();
      this.tgt = tower.def.target; this.effect = tower.def.effect; this.splash = this.st.splash || 0;
      this.x = tower.x; this.y = tower.y; this.target = target; this.tx = target.x; this.ty = target.y;
      this.speed = tower.def.projSpeed; this.dead = false;
    }
    canHit(e) { return this.tgt === "both" || (this.tgt === "ground" && !e.fly) || (this.tgt === "air" && e.fly); }
    applyTo(e) {
      e.applyDamage(this.dmg);
      if (this.effect === "slow") e.slow(1 - this.st.slowPct, 1.2);
      else if (this.effect === "poison") e.addPoison(this.st.poisonPct / 5, 5, 4);  // mỗi giây trừ (poisonPct/5) % máu HIỆN TẠI, trong 5s
    }
    update(dt, game) {
      if (this.target && !this.target.dead && !this.target.leaked) { this.tx = this.target.x; this.ty = this.target.y; }
      const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy), s = this.speed * dt;
      if (d <= s || d < 4) { this.hit(game); this.dead = true; return; }
      this.x += (dx / d) * s; this.y += (dy / d) * s;
    }
    hit(game) {
      if (this.splash > 0) {   // NỔ LAN: trúng mọi quái đúng loại trong bán kính
        const r = this.splash * TILE;
        for (const e of game.enemies) { if (e.dead || e.leaked || !this.canHit(e)) continue; if (dist(e.x, e.y, this.tx, this.ty) <= r + e.radius) this.applyTo(e); }
        game.effects.push(new BlastFx(this.tx, this.ty, r, this.def.projColor));
      } else if (this.target && !this.target.dead && !this.target.leaked) this.applyTo(this.target);
    }
    draw(ctx) { ctx.fillStyle = this.def.projColor; ctx.beginPath(); ctx.arc(this.x, this.y, this.splash > 0 ? 6 : 4, 0, 7); ctx.fill(); }
  }
  class BlastFx { constructor(x, y, r, c) { this.x = x; this.y = y; this.r = r; this.color = c; this.t = 0; this.dur = .3; this.dead = false; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { const f = this.t / this.dur; ctx.globalAlpha = 1 - f; ctx.strokeStyle = this.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.x, this.y, this.r * f, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; } }
  class SwirlFx { constructor(x, y) { this.x = x; this.y = y; this.t = 0; this.dur = .35; this.dead = false; } update(dt) { this.t += dt; if (this.t >= this.dur) this.dead = true; } draw(ctx) { const f = this.t / this.dur; ctx.globalAlpha = 1 - f; ctx.strokeStyle = "#9fa8ff"; ctx.lineWidth = 2.5; ctx.beginPath(); for (let a = 0; a < 12; a++) { const ang = a * .6 + f * 6, rr = a * 1.6 * (1 - f * .3); const px = this.x + Math.cos(ang) * rr, py = this.y + Math.sin(ang) * rr; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); ctx.globalAlpha = 1; } }
  class PoisonCloud { constructor(x, y, r, dps, dur, pctps) { this.x = x; this.y = y; this.r = r; this.dps = dps; this.pctps = pctps || 0; this.dur = dur; this.t = 0; this.dead = false; } update(dt, game) { this.t += dt; if (this.t >= this.dur) { this.dead = true; return; } for (const e of game.enemies) if (!e.dead && !e.leaked && dist(e.x, e.y, this.x, this.y) <= this.r + e.radius) e.applyDamage((this.dps + this.pctps * e.maxHp) * dt, true); } draw(ctx) { ctx.save(); ctx.globalAlpha = .3 * (1 - this.t / this.dur) + .15; ctx.fillStyle = "#8e24aa"; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, 7); ctx.fill(); ctx.restore(); } }

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
  function levelBadge(ctx, x, y, lv) {
    ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = "#b9862b"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#ffd24a"; ctx.font = "bold 10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(lv, x, y + .5);
  }

  STM.Enemy = Enemy; STM.Tower = Tower; STM.Trap = Trap;
  STM.Projectile = Projectile; STM.PoisonCloud = PoisonCloud; STM.util = { dist };
})(window.STM || (window.STM = {}));
