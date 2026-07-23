/* =====================================================================
 * main.js — đối thủ, cửa hàng Tháp, thanh Phép, cây kỹ năng, bảng tháp đáy, HUD
 * ===================================================================== */
(function (STM) {
  "use strict";
  const CFG = STM.CFG, $ = (id) => document.getElementById(id);
  const canvas = $("game"); canvas.width = CFG.CANVAS_W; canvas.height = CFG.CANVAS_H;
  const game = new STM.Game(canvas);
  // con trỏ "vòng ngắm" khi đang chờ chọn mục tiêu cho phép
  const AIM_CURSOR = "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='34'%20height='34'%3E%3Ccircle%20cx='17'%20cy='17'%20r='12'%20fill='none'%20stroke='%23ffd24a'%20stroke-width='2.5'/%3E%3Ccircle%20cx='17'%20cy='17'%20r='2.5'%20fill='%23ff5a3c'/%3E%3Cg%20stroke='%23ffd24a'%20stroke-width='2.5'%3E%3Cline%20x1='17'%20y1='1'%20x2='17'%20y2='8'/%3E%3Cline%20x1='17'%20y1='26'%20x2='17'%20y2='33'/%3E%3Cline%20x1='1'%20y1='17'%20x2='8'%20y2='17'/%3E%3Cline%20x1='26'%20y1='17'%20x2='33'%20y2='17'/%3E%3C/g%3E%3C/svg%3E\") 17 17, crosshair";
  const PLAYER = "kvandiep";
  $("pName").textContent = PLAYER;

  /* ---------- đối thủ (giấy da, chế độ đối kháng sắp có) ---------- */
  const OPP = ["anhcong", "vuivuibip", "Chú Phòng", "Snake_B"];
  $("oppList").innerHTML = OPP.map((n) =>
    `<div class="opp"><div class="oface">?</div><div class="omap"><span class="oname">${n}</span><small>Đối kháng<br>(sắp có)</small></div></div>`).join("");

  /* ---------- nhật ký ---------- */
  const logBox = $("logBox");
  function log(msg, cls) { const d = document.createElement("div"); d.className = cls || "ev"; d.textContent = "» " + msg; logBox.appendChild(d); logBox.scrollTop = logBox.scrollHeight; while (logBox.children.length > 40) logBox.removeChild(logBox.firstChild); }

  /* ---------- cửa hàng Tháp + Bẫy ---------- */
  const grid = $("towerGrid"), shopBtns = {};
  function addTower(key, def, isTrap) {
    const b = document.createElement("button"); b.className = "tw-btn"; b.dataset.key = key;
    const tag = isTrap ? "BẪY" : def.support ? "HỖ TRỢ" : def.target === "both" ? "BAY+BỘ" : def.target === "air" ? "BAY" : "BỘ";
    b.innerHTML = `<span class="tw-ic" style="background:${def.color}">${def.glyph}</span><span class="tw-nm">${def.name.replace("Tháp ", "").replace("Bẫy ", "B.")}</span><span class="tw-tg">${tag}</span><span class="tw-cost">💰${def.cost}</span>`;
    b.title = def.name + " — " + def.desc; b.onclick = () => game.setBuild(key); grid.appendChild(b); shopBtns[key] = b;
  }
  for (const k of CFG.TOWER_ORDER) addTower(k, CFG.TOWERS[k], false);
  for (const k of CFG.TRAP_ORDER) addTower(k, CFG.TRAPS[k], true);

  /* ---------- CÂY KỸ NĂNG (modal) ---------- */
  const modal = $("treeModal"), nodesEl = $("treeNodes"), edgesEl = $("treeEdges"), tipEl = $("treeTip");
  const COLOR = { red: "#e0592f", blue: "#4a9fe0", green: "#5ab54a", gold: "#ffd24a" };
  const pos = {};
  for (const k of CFG.SKILL_TREE_ORDER) { const s = CFG.SKILLS[k]; pos[k] = { x: (s.col + 0.5) / 5 * 100, y: (s.tier + 0.5) / 5 * 100 }; }
  // cạnh có mũi tên (line + tam giác đầu; bidir = mũi tên 2 đầu)
  function arrowHead(tipx, tipy, bx, by, px, py, t, color) { return `<polygon points="${tipx},${tipy} ${bx - px * t},${by - py * t} ${bx + px * t},${by + py * t}" fill="${color}"/>`; }
  function edgeSvg(a, b, color, bidir) {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, R = 6.4, hd = R - 2.4;
    const ax = a.x + ux * (bidir ? R : 5), ay = a.y + uy * (bidir ? R : 5), bx = b.x - ux * R, by = b.y - uy * R;
    const px = -uy, py = ux, t = 2.0;
    let s = `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${color}" stroke-width="1.5" opacity=".9"/>`;
    s += arrowHead(b.x - ux * hd, b.y - uy * hd, bx, by, px, py, t, color);
    if (bidir) s += arrowHead(a.x + ux * hd, a.y + uy * hd, ax, ay, px, py, t, color);
    return s;
  }
  let edgeSVG = "";
  for (const [f, tt, color, bidir] of CFG.SKILL_EDGES) edgeSVG += edgeSvg(pos[f], pos[tt], COLOR[color], bidir);
  edgesEl.innerHTML = edgeSVG;

  let treeSel = null;
  function tipFor(k) {
    const s = CFG.SKILLS[k];
    if (!game.learned.has(k) && game.learned.size >= CFG.MAX_SKILLS) return `<b>${s.name}</b> — ${s.desc}<br><span style="color:#ff9b9b">Đã học tối đa ${CFG.MAX_SKILLS} phép — không thể học thêm.</span>`;
    return `<b>${s.name}</b> — ${s.desc}<br>Giá học: <b>${s.learn}</b> Điểm KN` + (s.aim === "pvp" ? ` · <span style="color:#ff9b9b">chỉ dùng ở Đối kháng</span>` : ``) + (game.learned.has(k) ? ` · <span style="color:#7ee0a8">đã học</span>` : !game.canLearn(k) ? ` · <span style="color:#ff9b9b">cần học phép nhánh trước</span>` : ``);
  }
  const nodeBtns = {};
  for (const k of CFG.SKILL_TREE_ORDER) {
    const s = CFG.SKILLS[k], p = pos[k];
    const el = document.createElement("div"); el.className = `tnode ${s.branch}${s.aim === "pvp" ? " pvp" : ""}`;
    el.style.left = p.x + "%"; el.style.top = p.y + "%";
    el.innerHTML = `<span class="tg">${s.glyph}</span><span class="tc">${s.learn}</span>`;
    el.onmouseenter = () => { tipEl.innerHTML = tipFor(k); };
    el.onclick = () => { treeSel = k; tipEl.innerHTML = tipFor(k); renderTree(); };
    el.ondblclick = () => { if (game.learnSkill(k)) { log("Đã học phép: " + s.name, "good"); treeSel = k; renderTree(); } };
    nodesEl.appendChild(el); nodeBtns[k] = el;
  }
  function renderTree() {
    $("treeSP").textContent = game.sp; $("treeCount").textContent = game.learned.size;
    const maxed = game.learned.size >= CFG.MAX_SKILLS;
    for (const k of CFG.SKILL_TREE_ORDER) { const el = nodeBtns[k], learned = game.learned.has(k), canL = game.canLearn(k), afford = game.sp >= CFG.SKILLS[k].learn; el.classList.toggle("learned", learned); el.classList.toggle("learnable", !learned && canL && afford); el.classList.toggle("locked", !learned && !canL); el.classList.toggle("selected", treeSel === k); }
    const ch = $("treeChoose"), canPick = treeSel && game.canLearn(treeSel) && game.sp >= CFG.SKILLS[treeSel].learn;
    ch.disabled = !canPick; ch.textContent = maxed ? `Đủ ${CFG.MAX_SKILLS} phép` : "Chọn";
  }
  const openTree = () => { modal.classList.remove("hidden"); renderTree(); };
  const closeTree = () => modal.classList.add("hidden");
  $("btnTree").onclick = openTree; $("btnTree2").onclick = openTree; $("treeClose").onclick = closeTree;
  $("treeChoose").onclick = () => { if (treeSel && game.learnSkill(treeSel)) { log("Đã học phép: " + CFG.SKILLS[treeSel].name, "good"); renderTree(); } };
  modal.onclick = (e) => { if (e.target === modal) closeTree(); };

  /* ---------- Luật chơi + Cấu hình ---------- */
  const rules = $("rulesModal");
  $("btnRules").onclick = () => rules.classList.remove("hidden");
  $("rulesClose").onclick = () => rules.classList.add("hidden");
  rules.onclick = (e) => { if (e.target === rules) rules.classList.add("hidden"); };
  $("btnCfg").onclick = () => { game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 3 : 1; log("Cấu hình tốc độ: x" + game.speed); game.emit(); };

  /* ---------- thanh Phép (đã học) ---------- */
  const skillGrid = $("skillGrid");
  function renderSkills(g) {
    const learned = CFG.SKILL_TREE_ORDER.filter((k) => g.learned.has(k));
    if (!learned.length) { skillGrid.innerHTML = `<div class="empty">Chưa học phép.<br>Mở cây kỹ năng (F2).</div>`; return; }
    skillGrid.innerHTML = "";
    for (const k of learned) {
      const s = CFG.SKILLS[k], b = document.createElement("button"); b.className = "sk-btn"; b.dataset.key = k;
      const pvpLock = s.aim === "pvp" && !g.versus; b.title = s.name + " — " + s.desc + (pvpLock ? " (chỉ Đối kháng)" : "");
      b.innerHTML = `<span class="g">${s.glyph}</span><span class="n">${s.name}</span><span class="cd"></span>`;
      b.onclick = () => game.armSkill(k); skillGrid.appendChild(b);
    }
  }
  let lastLearned = -1;

  /* ---------- bảng chi tiết tháp (đáy) ---------- */
  const tp = $("towerPanel");
  function targetText(def) { return def.trap ? def.desc : def.support ? "Hỗ trợ — không bắn" : def.target === "both" ? "Bắn cả Bay & Bộ" : def.target === "air" ? "Chỉ bắn Quái bay" : "Chỉ bắn Quái bộ"; }
  function statsHTML(t) {
    if (t.trap) return `<div>Loại: <b>Dùng 1 lần</b> (kích hoạt là biến mất)</div><div>Bán kính: <b>${t.def.radius}</b></div>`;
    if (t.support) { const s = t.stats; return `<div>Buff ST: <b class="plus">+${Math.round(s.dmgBonus * 100)}%</b></div><div>Buff Tốc: <b class="plus">+${Math.round(s.rateBonus * 100)}%</b></div><div>Tầm Xa: <b>${s.range.toFixed(1)}</b></div>`; }
    const s = t.stats, base = Math.round(s.dmg), bonus = Math.round(t.effDmg() - s.dmg), sps = 1 / t.effRate(), spsBonus = sps - 1 / s.rate;
    const eff = s.slowPct != null ? `<div>Làm chậm: <b class="plus">${Math.round(s.slowPct * 100)}%</b></div>`
      : s.poisonPct != null ? `<div>Độc: <b class="plus">${Math.round(s.poisonPct * 100)}% máu hiện tại/5s</b></div>` : "";
    return `<div>Sức Mạnh: <b>${base}</b>${bonus > 0 ? ` <span class="plus">+${bonus}</span>` : ``}</div>` +
      `<div>Tầm Xa: <b>${s.range.toFixed(1)}</b></div>` +
      `<div>Tốc độ bắn: <b>${sps.toFixed(2)}</b>/s${spsBonus > 0.01 ? ` <span class="plus">+${spsBonus.toFixed(2)}</span>` : ``}</div>` +
      (s.splash ? `<div>Bắn Loang: <b>${s.splash.toFixed(1)}</b></div>` : `<div>Cấp: <b>${t.level}/5</b></div>`) + eff;
  }
  // Xem trước nâng cấp: cấp kế sẽ +chỉ số gì (để cân nhắc)
  function upgradePreviewHTML(t) {
    if (t.trap || t.maxLevel) return "";
    const c = t.stats, n = t.def.lv[t.level], p = [];   // c=cấp hiện tại, n=cấp kế
    if (n.dmg != null && n.dmg !== c.dmg) p.push(`ST ${Math.round(c.dmg)}→<b>${Math.round(n.dmg)}</b>`);
    if (n.range != null && n.range !== c.range) p.push(`Tầm ${c.range.toFixed(1)}→<b>${n.range.toFixed(1)}</b>`);
    if (n.rate != null && n.rate !== c.rate) p.push(`Tốc ${(1 / c.rate).toFixed(1)}→<b>${(1 / n.rate).toFixed(1)}</b>/s`);
    if (n.splash != null && n.splash !== c.splash) p.push(`Nổ ${c.splash.toFixed(1)}→<b>${n.splash.toFixed(1)}</b>`);
    if (n.slowPct != null && n.slowPct !== c.slowPct) p.push(`Chậm ${Math.round(c.slowPct * 100)}→<b>${Math.round(n.slowPct * 100)}%</b>`);
    if (n.poisonPct != null && n.poisonPct !== c.poisonPct) p.push(`Độc ${Math.round(c.poisonPct * 100)}→<b>${Math.round(n.poisonPct * 100)}%</b>`);
    if (n.dmgBonus != null && n.dmgBonus !== c.dmgBonus) p.push(`Buff ST ${Math.round(c.dmgBonus * 100)}→<b>${Math.round(n.dmgBonus * 100)}%</b>`);
    if (n.rateBonus != null && n.rateBonus !== c.rateBonus) p.push(`Buff Tốc ${Math.round(c.rateBonus * 100)}→<b>${Math.round(n.rateBonus * 100)}%</b>`);
    return p.length ? `⬆ Lên cấp ${t.level + 1}: ${p.join(" · ")}` : "";
  }
  // CHỈ dựng lại khung khi ĐỔI tháp chọn; còn lại chỉ cập nhật chữ/nút (KHÔNG thay phần tử nút)
  // -> tránh nút bị thay giữa mousedown/mouseup làm mất cú click (lỗi trên Edge).
  let tpTower = undefined;
  function renderTowerPanel(g) {
    const t = g.selected; tp.classList.remove("hidden");
    if (t !== tpTower) {
      tpTower = t;
      if (!t) { const nx = g.nextWavePreview(); tp.innerHTML = `<div class="tp-empty">🏰 Chọn tháp/bẫy trên bản đồ để xem chi tiết &amp; nâng cấp/bán. &nbsp;•&nbsp; Đợt sau: <b>${nx.name}</b> ×${nx.count}${nx.boss ? " (BOSS)" : nx.fly ? " (bay)" : ""}</div>`; return; }
      tp.innerHTML = `<div class="tp-icon" style="background:${t.def.color}">${t.def.glyph}</div>` +
        `<div class="tp-main"><div class="tp-title">${t.def.name}: ${targetText(t.def)} <span class="lv" id="tpLv"></span></div><div class="tp-stats" id="tpStats"></div><div class="tp-prev" id="tpPrev"></div></div>` +
        `<div class="tp-actions"><button class="tp-up" id="tpUp"></button><button class="tp-sell" id="tpSell"></button></div>`;
      // pointerdown: kích hoạt NGAY lúc nhấn (tránh emit làm nút disabled giữa mousedown→mouseup nuốt click, hay gặp ở PvP/Edge)
      $("tpUp").onpointerdown = (e) => { if (e.button !== 0) return; e.preventDefault(); game.upgradeSelected(); };
      $("tpSell").onpointerdown = (e) => { if (e.button !== 0) return; e.preventDefault(); game.sellSelected(); };
    }
    if (!t) return;
    // cập nhật phần ĐỘNG tại chỗ (đổi text/disabled, không thay nút)
    $("tpLv").textContent = t.trap ? "Dùng 1 lần" : `Cấp Độ: ${t.level}/${t.def.lv.length}`;
    $("tpStats").innerHTML = statsHTML(t);
    $("tpPrev").innerHTML = (t.ready && !t.trap && !t.maxLevel) ? upgradePreviewHTML(t) : "";
    const bu = $("tpUp");
    if (t.trap) { bu.textContent = "Không nâng cấp"; bu.disabled = true; bu.className = "tp-up"; }
    else if (!t.ready) { const lab = t.action === "sell" ? "Đang tháo dỡ" : t.action === "up" ? "Đang nâng cấp" : "Đang xây"; bu.textContent = `⏳ ${lab}… ${Math.ceil(t.buildTimer)}s`; bu.disabled = true; bu.className = "tp-up poor"; }
    else if (t.maxLevel) { bu.textContent = t.def.lv.length === 1 ? "Không nâng cấp" : `Đã tối đa (${t.def.lv.length})`; bu.disabled = true; bu.className = "tp-up"; }
    // KHÔNG disable theo vàng (tránh chớp nháy disabled nuốt click); chỉ tô mờ, upgradeSelected tự chặn nếu thiếu vàng
    else { const afford = g.gold >= t.upgradeCost; bu.textContent = `Nâng Cấp −${t.upgradeCost}💰`; bu.disabled = false; bu.className = "tp-up" + (afford ? "" : " poor"); }
    const sb = $("tpSell");
    if (!t.trap && t.action === "sell") { sb.textContent = "Đang tháo dỡ…"; sb.disabled = true; }
    else { sb.textContent = `Bán +${t.sellValue}💰`; sb.disabled = false; }
  }

  /* ---------- HUD ---------- */
  // có ít nhất 1 phép ĐỦ điều kiện học (mở nhánh + đủ Điểm KN)?
  function hasLearnable(g) { for (const k in CFG.SKILLS) if (g.canLearn(k) && g.sp >= CFG.SKILLS[k].learn) return true; return false; }
  function rankOf(s) { return s >= 1e6 ? "Hiệp Sĩ" : s >= 1e5 ? "Chiến Thần" : s >= 1e4 ? "Chiến Binh" : s >= 1e3 ? "Cảnh Binh" : "Sĩ Phu"; }
  let prevWave = 0, prevLives = CFG.START_LIVES, prevEnd = false;
  function updateHUD(g) {
    $("wave").textContent = g.wave; $("gold").textContent = g.gold.toLocaleString(); $("sp").textContent = g.sp; $("lives").textContent = g.lives; $("pRank").textContent = rankOf(g.score);
    // banner chủng quái (đợt này + Tiếp)
    const cur = g.wave >= 1 ? CFG.waveInfo(g.wave) : null;
    const wn = $("wbName"); wn.textContent = cur ? cur.name + (cur.boss ? " 👑" : "") : "Chuẩn bị"; wn.className = "wb-name" + (cur && cur.boss ? " boss" : "");
    $("wbNext").innerHTML = [1, 2, 3].map((k) => { const w = CFG.waveInfo(g.wave + k); return `<span class="wb-chip ${w.boss ? "boss" : w.fly ? "air" : "grd"}" title="Đợt ${g.wave + k}">${w.name}${w.boss ? " 👑" : ""}</span>`; }).join("");
    { const nw = CFG.waveInfo(g.wave + 1); $("nextWave").innerHTML = nw.boss ? "⚠ Đợt sau là BOSS!" : nw.fly ? "⚠ Đợt sau có quái BAY — cần tháp đánh Bay!" : ""; }
    const sw = $("startWave");
    if (g.versus) {
      // đối kháng: KHÔNG gọi đợt thủ công — chỉ hiện đồng hồ đợt đồng bộ + số người trụ
      const alive = match ? match.aliveN() : 1;
      sw.disabled = true;
      sw.textContent = g.gameOver ? "☠ Bạn đã thất thủ" : match && match.over ? "— Trận kết thúc —"
        : `⏱ Đợt ${match ? match.wave + 1 : 1} sau ${Math.ceil(match ? match.waveTimer : 0)}s · còn ${alive} người`;
    }
    else if (g.gameOver || g.victory) { sw.textContent = "— Kết thúc —"; sw.disabled = true; }
    else if (!g.started) { sw.textContent = "▶ Bắt đầu"; sw.disabled = false; }
    else if (g.campaignDone) { sw.textContent = "— Hết đợt —"; sw.disabled = true; }
    else { sw.textContent = `⏭ Gọi đợt ${g.wave + 1}` + (g.autoNext ? ` (còn ${Math.ceil(g.waveTimer)}s)` : ""); sw.disabled = false; }
    if (match) renderOpp();
    for (const k of [...CFG.TOWER_ORDER, ...CFG.TRAP_ORDER]) { const def = CFG.TOWERS[k] || CFG.TRAPS[k], b = shopBtns[k]; b.classList.toggle("active", g.buildType === k); b.classList.toggle("cant", g.gold < def.cost); }
    if (g.learned.size !== lastLearned) { renderSkills(g); lastLearned = g.learned.size; }
    for (const b of skillGrid.querySelectorAll(".sk-btn")) { const k = b.dataset.key, s = CFG.SKILLS[k], cd = g.skillCd[k] || 0, pvpLock = s.aim === "pvp" && !g.versus; b.classList.toggle("active", g.pendingSkill === k); b.classList.toggle("cant", pvpLock || cd > 0); b.querySelector(".cd").textContent = cd > 0 ? cd.toFixed(0) : ""; }
    if (!modal.classList.contains("hidden")) renderTree();
    { const can = hasLearnable(g); $("btnTree").classList.toggle("can-learn", can); $("btnTree2").classList.toggle("can-learn", can); }
    $("btnPause").textContent = g.paused ? "▶ Tiếp" : "⏸ Dừng"; $("btnSpeed").textContent = "⏩ x" + g.speed;
    canvas.style.cursor = g.pendingSkill ? AIM_CURSOR : g.buildType ? "cell" : "crosshair";  // con trỏ đổi khi chờ chọn mục tiêu phép / khi xây
    renderTowerPanel(g);
    if (g.wave !== prevWave && g.wave > 0) { log("Đợt " + g.wave + " bắt đầu", "ev"); prevWave = g.wave; }
    if (g.lives < prevLives) { log("Quái lọt cửa Tử! Còn " + g.lives + " mạng", "warn"); prevLives = g.lives; }
    if ((g.gameOver || g.victory) && !prevEnd) { log(g.victory ? "CHIẾN THẮNG!" : "THẤT THỦ!", g.victory ? "good" : "warn"); prevEnd = true; }
  }
  game.onChange = updateHUD;

  /* ---------- điều khiển ---------- */
  $("startWave").onclick = () => game.startWave();
  $("btnPause").onclick = () => { if (net) return; game.paused = !game.paused; game.emit(); };
  $("btnSpeed").onclick = () => { game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 3 : 1; game.emit(); };
  function syncAuto() { $("btnAuto").classList.toggle("on", game.autoNext); $("btnAuto").textContent = "Tự động: " + (game.autoNext ? "BẬT" : "TẮT"); }
  $("btnAuto").onclick = () => { game.autoNext = !game.autoNext; syncAuto(); };
  function newGame(mode) { endVersus(); game.reset(mode); syncAuto(); lastLearned = -1; treeSel = null; prevWave = 0; prevLives = CFG.START_LIVES; prevEnd = false; logBox.innerHTML = ""; log("Ván mới: " + (mode === "campaign" ? "Chiến Dịch" : "Hố Tử Thần") + " — bản đồ " + CFG.curMap().name, "good"); }
  $("modeEndless").onclick = () => newGame("endless");
  $("modeCampaign").onclick = () => newGame("campaign");
  $("btnRestart").onclick = () => { if (match && !match.net) startVersus(vsPlayers()); else newGame("endless"); };

  window.addEventListener("keydown", (e) => {
    if (e.key === "F2") { e.preventDefault(); modal.classList.contains("hidden") ? openTree() : closeTree(); return; }
    if (e.key === "Escape") { if (!modal.classList.contains("hidden")) return closeTree(); if (!rules.classList.contains("hidden")) return rules.classList.add("hidden"); if (!mainMenu.classList.contains("hidden")) return closeMenu(); game.buildType = null; game.selected = null; game.pendingSkill = null; game.emit(); return; }
    if (e.key === " ") { e.preventDefault(); if (!net) { game.paused = !game.paused; game.emit(); } }
    else if (e.key === "Enter") game.startWave();
    else { const i = parseInt(e.key, 10) - 1, all = [...CFG.TOWER_ORDER, ...CFG.TRAP_ORDER]; if (i >= 0 && i < all.length) game.setBuild(all[i]); }
  });

  /* ==================== ĐỐI KHÁNG (versus) ==================== */
  let match = null;
  const AI_NAMES = ["Hắc Long", "Thiết Diện", "Cuồng Phong", "Bạch Hổ", "U Minh", "Phong Vân"];
  const vsModal = $("vsModal"), vsResult = $("vsResult");
  let vsN = 3;

  function buildNameInputs() {
    const wrap = $("vsNames"); wrap.innerHTML = "";
    for (let i = 0; i < vsN; i++) {
      const row = document.createElement("div"); row.className = "vs-name-row";
      const isMe = i === 0;
      const def = isMe ? PLAYER : AI_NAMES[(i - 1) % AI_NAMES.length];
      row.innerHTML = `<span class="vs-tag ${isMe ? "me" : "ai"}">${isMe ? "Bạn" : "AI " + i}</span>` +
        `<input class="vs-inp" data-i="${i}" maxlength="14" value="${def}">`;
      wrap.appendChild(row);
    }
  }
  function vsPlayers() {
    const inps = $("vsNames").querySelectorAll(".vs-inp"), players = [];
    inps.forEach((inp, i) => { players.push({ name: (inp.value || "").trim() || (i === 0 ? PLAYER : "AI " + i), ai: i !== 0 }); });
    return players;
  }
  $("modeVersus").onclick = () => { buildNameInputs(); showTab("AI"); refreshLanAddr(); vsModal.classList.remove("hidden"); };
  $("vsClose").onclick = () => vsModal.classList.add("hidden");
  vsModal.onclick = (e) => { if (e.target === vsModal) vsModal.classList.add("hidden"); };
  $("vsCount").querySelectorAll("button").forEach((b) => {
    b.onclick = () => { vsN = +b.dataset.n; $("vsCount").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); buildNameInputs(); };
  });
  $("vsStart").onclick = () => { vsModal.classList.add("hidden"); startVersus(vsPlayers()); };
  $("vsResultClose").onclick = () => vsResult.classList.add("hidden");
  $("vsAgain").onclick = () => { vsResult.classList.add("hidden"); if (net) net.playAgain(); else { buildNameInputs(); showTab("AI"); vsModal.classList.remove("hidden"); } };

  /* ---------- chuyển tab AI / LAN + luồng mạng ---------- */
  let curTab = "AI";
  function showTab(tab) {
    curTab = tab; const lan = tab === "LAN", conn = !!(net && net.myPid != null);
    $("vsTabAI").classList.toggle("on", !lan); $("vsTabLAN").classList.toggle("on", lan);
    $("vsPanelAI").classList.toggle("hidden", lan); $("vsPanelLAN").classList.toggle("hidden", !lan);
    $("vsStart").classList.toggle("hidden", lan);
    $("vsLanConnect").classList.toggle("hidden", !lan || conn);
    $("vsLanLobby").classList.toggle("hidden", !lan || !conn);
    $("vsLanJoin").classList.toggle("hidden", !lan || conn);
    $("vsLanStart").classList.toggle("hidden", !lan || !conn || !(net && net.isHost));
    $("vsLanLeave").classList.toggle("hidden", !lan || !conn);
    // trong phòng LAN: chỉ CHỦ PHÒNG được chọn bản đồ (bản đồ theo chủ phòng)
    $("vsMaps").classList.toggle("locked", lan && conn && !(net && net.isHost));
  }
  $("vsTabAI").onclick = () => showTab("AI");
  $("vsTabLAN").onclick = () => showTab("LAN");
  function refreshLanAddr() {
    const el = $("vsLanAddr");
    if (location.protocol === "file:") { el.innerHTML = `⚠ Bạn đang mở bằng <b>file://</b> (double-click) — chế độ LAN KHÔNG chạy được kiểu này. Trên máy chủ chạy <code>node server.js</code> (hoặc <code>./run.sh</code>) rồi mở địa chỉ <b>http://&lt;IP&gt;:8090/</b> hiện ở cửa sổ máy chủ.`; $("vsLanJoin").disabled = true; return; }
    el.innerHTML = `Đang kiểm tra máy chủ tại <b>${location.host}</b>…`; $("vsLanJoin").disabled = true;
    // xác nhận trang này DO máy chủ LAN (server.js) phục vụ, không phải file:// hay server tĩnh khác
    fetch("/_stm", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j && j.stm) { el.innerHTML = `✅ Máy chủ LAN sẵn sàng tại <b>${location.host}</b>. Các máy khác trong LAN mở đúng địa chỉ này để vào cùng phòng.`; $("vsLanJoin").disabled = false; }
      else throw 0;
    }).catch(() => {
      el.innerHTML = `⚠ Trang này KHÔNG do máy chủ LAN phục vụ (có thể đang mở bằng server tĩnh như <code>python -m http.server</code>). Hãy dừng nó và chạy <code>node server.js</code> (hoặc <code>./run.sh</code>), rồi mở lại địa chỉ máy chủ.`;
      $("vsLanJoin").disabled = true;
    });
  }

  // hộp minimap đối thủ (chung cho local & mạng qua match.opponentViews())
  const oppCanvas = {};
  let oppKey = "";
  function buildOppList() {
    const box = $("oppList"); box.innerHTML = ""; for (const k in oppCanvas) delete oppCanvas[k];
    for (const v of match.opponentViews()) {
      const el = document.createElement("div"); el.className = "opp vs";
      el.innerHTML = `<canvas class="omini" width="118" height="118"></canvas>` +
        `<div class="omap"><span class="oname">${v.name}</span><small class="ostat">Đợt ${v.wave} · 💀${v.lives}</small></div>`;
      box.appendChild(el); oppCanvas[v.pid] = { cv: el.querySelector(".omini"), stat: el.querySelector(".ostat"), el };
    }
    oppKey = match.opponentViews().map((v) => v.pid).join(",");
  }
  function renderOpp() {
    if (!match) return;
    const views = match.opponentViews();
    if (views.map((v) => v.pid).join(",") !== oppKey) buildOppList();   // danh sách đổi (mạng: người vào/ra) -> dựng lại
    for (const v of views) {
      const o = oppCanvas[v.pid]; if (!o) continue;
      const cx = o.cv.getContext("2d"); cx.clearRect(0, 0, o.cv.width, o.cv.height); v.draw(cx, o.cv.width);
      o.stat.textContent = `Đợt ${v.wave} · 💀${v.lives}`;
      o.el.classList.toggle("dead", v.dead);
    }
  }

  function startVersus(players) {
    endVersus();
    match = new STM.Match(game, players);
    match.onEnd = (m) => showResult(m);
    document.body.classList.add("versus");
    syncAuto(); lastLearned = -1; treeSel = null; prevWave = 0; prevLives = CFG.START_LIVES; prevEnd = false; logBox.innerHTML = "";
    buildOppList();
    log("Trận đối kháng bắt đầu! " + players.length + " người chơi.", "good");
    log("Đợt đầu sau " + CFG.VS_START_DELAY + "s — các đợt đồng bộ, không gọi trước được.", "ev");
    match.begin(); game.emit();
  }
  function endVersus() {
    if (net) { net.leave(); net = null; }
    if (!match) return; match = null;
    document.body.classList.remove("versus", "netplay");
    $("oppList").innerHTML = OPP.map((n) => `<div class="opp"><div class="oface">?</div><div class="omap"><span class="oname">${n}</span><small>Đối kháng<br>(chọn ⚔ để chơi)</small></div></div>`).join("");
  }

  /* ---------- MẠNG LAN ---------- */
  let net = null;
  function renderLobby(m) {
    $("vsLobbyCount").textContent = `(${m.players.length}/5)`;
    $("vsLobbyList").innerHTML = m.players.map((p) =>
      `<div class="vs-lobby-row${p.pid === m.myPid ? " me" : ""}"><span class="vs-tag ${p.pid === m.myPid ? "me" : "ai"}">${p.host ? "👑 Chủ" : "P" + p.pid}</span> <b>${p.name}</b>${p.pid === m.myPid ? " (bạn)" : ""}</div>`).join("");
    $("vsLanStart").classList.toggle("hidden", !m.isHost);
    $("vsLanStart").disabled = !m.canStart;
    $("vsLanMsg").textContent = m.isHost ? (m.canStart ? "Đủ người — bấm Bắt đầu khi sẵn sàng." : "Cần ít nhất 2 người để bắt đầu.") : "Chờ chủ phòng bắt đầu…";
  }
  $("vsLanJoin").onclick = () => {
    if (location.protocol === "file:") { $("vsLanAddr").innerHTML = `⚠ Bạn đang mở bằng <b>file://</b> (double-click). Chế độ LAN CẦN máy chủ: chạy <code>node server.js</code> (hoặc <code>./run.sh</code>) rồi mở <b>http://&lt;IP&gt;:8090/</b> hiện ở cửa sổ máy chủ.`; return; }
    const name = ($("vsLanName").value || "").trim() || PLAYER;
    const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/";
    let opened = false;
    // hiện ngay trạng thái "đang kết nối" ở khu lobby
    $("vsLanConnect").classList.add("hidden"); $("vsLanLobby").classList.remove("hidden");
    $("vsLobbyCount").textContent = ""; $("vsLobbyList").innerHTML = "";
    $("vsLanMsg").innerHTML = `⏳ Đang kết nối tới <b>${location.host}</b>…`;
    $("vsLanStart").classList.add("hidden"); $("vsLanLeave").classList.remove("hidden");
    const failHint = () => {
      $("vsLanConnect").classList.remove("hidden"); $("vsLanLobby").classList.add("hidden");
      $("vsLanAddr").innerHTML = `❌ <b>Không kết nối được máy chủ</b> tại <b>${location.host}</b>.<br>Kiểm tra: ① máy chủ đã chạy <code>node server.js</code> chưa · ② bạn mở ĐÚNG địa chỉ đó chưa (không phải <code>file://</code> hay server tĩnh khác) · ③ tường lửa/khác mạng LAN.`;
      $("vsLanJoin").classList.remove("hidden"); $("vsLanLeave").classList.add("hidden");
      if (net) { net.leave(); net = null; }
    };
    const client = new STM.NetClient(url,
      (o) => net && net.handle(o),
      () => { opened = true; net.join(); },
      () => { if (!opened) failHint(); else { $("vsLanMsg").textContent = "Mất kết nối máy chủ."; } });
    net = new STM.NetMatch(game, client, name);
    net.onReject = (why) => { $("vsLanMsg").textContent = "Bị từ chối: " + why; if (net) { net.leave(); net = null; } showTab("LAN"); };
    net.onLobby = (m) => { renderLobby(m); showTab("LAN"); };
    net.onStart = (m) => startVersusNet(m);
    net.onEnd = (m) => showResult(m);
    net.onChange = () => game.emit();
    // quá 4s chưa mở được -> báo lỗi
    setTimeout(() => { if (net && !opened) { try { net.client.close(); } catch (e) {} failHint(); } }, 4000);
  };
  $("vsLanStart").onclick = () => { if (net) net.startMatch(); };
  $("vsLanLeave").onclick = () => { endVersus(); showTab("LAN"); };

  function startVersusNet(m) {
    vsModal.classList.add("hidden");
    match = m;                       // NetMatch cũng có opponentViews/aliveN/resultRows/wave/waveTimer/over
    document.body.classList.add("versus", "netplay");
    lastLearned = -1; treeSel = null; prevWave = 0; prevLives = CFG.START_LIVES; prevEnd = false; logBox.innerHTML = "";
    buildOppList();
    log("Trận LAN bắt đầu! " + m.players.length + " người chơi.", "good");
    log("Đợt đồng bộ do máy chủ phát — không gọi trước được.", "ev");
    game.emit();
  }
  function showResult(m) {
    const rows = m.resultRows();
    $("vsRank").innerHTML = rows.map((r) => {
      const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`;
      return `<div class="vs-rk ${r.win ? "win" : ""}${r.me ? " me" : ""}">${medal} <b>${r.name}</b>${r.me ? " (bạn)" : ""} <span>${r.win ? "Người trụ cuối cùng!" : "Thất thủ" + (r.fellWave ? " đợt " + r.fellWave : "")}</span></div>`;
    }).join("");
    const winName = rows[0] ? rows[0].name : "";
    log("🏆 " + winName + " chiến thắng!", "good");
    $("vsAgain").style.display = (m.net && !m.isHost) ? "none" : "";
    vsResult.classList.remove("hidden");
  }

  /* ---------- chọn BẢN ĐỒ (dùng chung menu chính & hộp đối kháng) ---------- */
  function drawMapPreview(cv, m) {
    const n = CFG.COLS, px = 3; cv.width = n * px; cv.height = n * px;
    const grid = CFG.buildMap(m.id).grid, x = cv.getContext("2d");
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { x.fillStyle = grid[r][c] === CFG.CELL.WATER ? "#c9451f" : "#5b6b3e"; x.fillRect(c * px, r * px, px, px); }
    x.fillStyle = "#8effb0"; x.fillRect(0, 0, px * 2, px);                    // cửa Sinh
    x.fillStyle = "#ff9b9b"; x.fillRect((n - 2) * px, (n - 1) * px, px * 2, px); // cửa Tử
  }
  const mapPickers = [$("menuMaps"), $("vsMaps")];
  function renderMapPick() {
    for (const wrap of mapPickers) {
      wrap.innerHTML = "";
      for (const m of CFG.MAPS) {
        const b = document.createElement("button");
        b.className = "map-btn" + (CFG.getMapId() === m.id ? " on" : ""); b.title = m.desc;
        const cv = document.createElement("canvas"); drawMapPreview(cv, m);
        const tx = document.createElement("span"); tx.className = "map-tx";
        tx.innerHTML = `<span class="map-nm">${m.icon} ${m.name}</span><span class="map-ds">${m.desc}</span>`;
        b.appendChild(cv); b.appendChild(tx);
        // đổi bản đồ chỉ dựng lại sân khi ván CHƯA bắt đầu — không xoá tiến độ đang chơi
        b.onclick = () => { CFG.setMap(m.id); renderMapPick(); if (!match && !net && !game.started) newGame(game.mode); };
        wrap.appendChild(b);
      }
    }
  }
  renderMapPick();

  /* ==================== MENU CHÍNH (bật lên khi mới vào game) ==================== */
  const mainMenu = $("mainMenu");
  const openMenu = () => mainMenu.classList.remove("hidden");
  const closeMenu = () => mainMenu.classList.add("hidden");
  function openVsTab(tab) { closeMenu(); buildNameInputs(); refreshLanAddr(); showTab(tab); vsModal.classList.remove("hidden"); }
  $("btnMenu").onclick = openMenu;
  $("mmEndless").onclick = () => { closeMenu(); newGame("endless"); };
  $("mmCampaign").onclick = () => { closeMenu(); newGame("campaign"); };
  $("mmAI").onclick = () => openVsTab("AI");
  $("mmLan").onclick = () => openVsTab("LAN");
  $("mmRules").onclick = () => rules.classList.remove("hidden");   // đọc luật xong vẫn quay lại menu
  $("mmClose").onclick = closeMenu;
  mainMenu.onclick = (e) => { if (e.target === mainMenu) closeMenu(); };

  newGame("endless"); game.start();
  if (!location.hash) openMenu();   // người chơi mới thấy ngay các chế độ, khỏi phải mò nút nhỏ

  // demo dựng sẵn để tự chụp màn hình (chỉ khi #demo)
  if (location.hash === "#demo") {
    game.gold = 100000; const T = CFG.TILE;
    const put = (t, c, r) => { game.buildType = t; game.placeSelected(c, r); };
    for (let r = 3; r <= 5; r++) put("ten", 3, r);
    for (let r = 7; r <= 9; r++) put("ten", 9, r);
    put("lua", 2, 4); put("bang", 4, 8); put("nangluong", 3, 4); put("doc", 8, 8); put("dinh", 2, 3); put("hut", 10, 11);
    game.sp = 200; ["muaLua", "baoSet", "tangLuc", "khoiDoc", "nhatDuong"].forEach((k) => game.learnSkill(k));
    game.towers.forEach((t) => { t.buildTimer = 0; t.action = null; });   // demo: coi như đã xây xong
    game.selected = game.towers.find((t) => t.type === "lua"); if (game.selected) game.selected.level = 4; game.buildType = null;
    // đàn quái hỗn hợp + banner đợt để chụp
    game.wave = 5;
    const mix = ["bo_ngua", "hai_cot", "trau_dien", "yeu_sen", "rong_tinh", "nguoi_khong_lo", "ac_dieu"];
    mix.forEach((k, i) => { const e = new STM.Enemy(CFG.ENEMIES[k], 1.3, 1, game, false); e.x = (0.5 + i * 0.55) * T; e.y = (0.5 + i * 0.45) * T; e.wingPhase = i; game.enemies.push(e); });
    const boss = new STM.Enemy(CFG.ENEMIES.trau_dien, 1.3, 1, game, true); boss.x = 4 * T; boss.y = 8 * T; game.enemies.push(boss);
    game.emit();
  }
  if (location.hash === "#tree") { game.sp = 120; ["muaLua", "baoSet", "tangLuc", "khoiDoc"].forEach((k) => game.learnSkill(k)); treeSel = "nhatDuong"; openTree(); }
  if (location.hash === "#vssetup") { buildNameInputs(); showTab("AI"); refreshLanAddr(); vsModal.classList.remove("hidden"); }
  if (location.hash === "#vslan") { buildNameInputs(); refreshLanAddr(); showTab("LAN"); vsModal.classList.remove("hidden"); }
  if (location.hash === "#vs") {
    startVersus([{ name: "kvandiep", ai: false }, { name: "Hắc Long", ai: true }, { name: "Thiết Diện", ai: true }, { name: "Bạch Hổ", ai: true }]);
    game.gold = 300;
    // đẩy nhanh vài giây để có tháp + quái trên các sân (chỉ để chụp)
    let acc = 0; const fast = () => { if (acc > 40) return; for (let i = 0; i < 6; i++) { game.step(1 / 30); match.tick(1 / 30); } acc++; requestAnimationFrame(fast); }; fast();
  }
})(window.STM || (window.STM = {}));
