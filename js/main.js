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
  // con trỏ Gia Cố: vòng đồng + dấu cộng (nhận biết đang chờ chọn tháp để gia cố)
  const CORE_CURSOR = "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='34'%20height='34'%3E%3Ccircle%20cx='17'%20cy='17'%20r='12'%20fill='rgba(232,161,58,0.18)'%20stroke='%23e8a13a'%20stroke-width='3'/%3E%3Cg%20stroke='%23ffcf6a'%20stroke-width='3'%20stroke-linecap='round'%3E%3Cline%20x1='17'%20y1='10'%20x2='17'%20y2='24'/%3E%3Cline%20x1='10'%20y1='17'%20x2='24'%20y2='17'/%3E%3C/g%3E%3C/svg%3E\") 17 17, pointer";
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
    b.innerHTML = `<span class="hk" data-act="${key}"></span><span class="tw-ic" style="background:${def.color}">${def.glyph}</span><span class="tw-nm">${def.name.replace("Tháp ", "").replace("Bẫy ", "B.")}</span><span class="tw-tg">${tag}</span><span class="tw-cost">💰${def.cost}</span>`;
    b.title = def.name + " — " + def.desc; b.onclick = () => game.setBuild(key); grid.appendChild(b); shopBtns[key] = b;
  }
  for (const k of CFG.TOWER_ORDER) addTower(k, CFG.TOWERS[k], false);
  for (const k of CFG.TRAP_ORDER) addTower(k, CFG.TRAPS[k], true);

  /* ---------- PHÍM TẮT (người chơi cấu hình được, lưu localStorage) ---------- */
  //  • Tháp/bẫy: gán theo từng loại (KEYS)
  //  • Phép: gán theo 6 Ô (SLOT_KEYS). Phép học được xếp vào ô theo thứ tự cây kỹ năng;
  //    nhấn phím của ô -> thi triển phép đang nằm ở ô đó.
  const KB_LS = "stm.keys", SLOT_LS = "stm.skillslots";
  const RESERVED = new Set(["escape", "enter", "f2", " ", "tab"]);   // phím dành riêng, không gán được
  function loadKeys() {
    let s = {}; try { s = JSON.parse(localStorage.getItem(KB_LS) || "{}"); } catch (e) {}
    const out = {}; for (const k of [...CFG.TOWER_ORDER, ...CFG.TRAP_ORDER]) out[k] = (s && s[k]) || CFG.DEFAULT_KEYS[k];
    return out;
  }
  function loadSlotKeys() {
    let a = null; try { a = JSON.parse(localStorage.getItem(SLOT_LS)); } catch (e) {}
    if (!Array.isArray(a)) a = [];
    const out = []; for (let i = 0; i < CFG.DEFAULT_SLOT_KEYS.length; i++) out[i] = (a[i] != null ? a[i] : CFG.DEFAULT_SLOT_KEYS[i]);
    return out;
  }
  let KEYS = loadKeys(), SLOT_KEYS = loadSlotKeys();
  const keyGlyph = (k) => !k ? "·" : k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k;
  let keyMap = {}, slotKeyMap = {};
  function rebuildKeyMap() {
    keyMap = {}; for (const a in KEYS) if (KEYS[a]) keyMap[KEYS[a].toLowerCase()] = a;
    slotKeyMap = {}; SLOT_KEYS.forEach((k, i) => { if (k) slotKeyMap[k.toLowerCase()] = i; });
  }
  function persistKeys() { try { localStorage.setItem(KB_LS, JSON.stringify(KEYS)); localStorage.setItem(SLOT_LS, JSON.stringify(SLOT_KEYS)); } catch (e) {} rebuildKeyMap(); refreshHotkeyBadges(); }
  function refreshHotkeyBadges() {
    document.querySelectorAll(".hk[data-act]").forEach((el) => { el.textContent = keyGlyph(KEYS[el.dataset.act]); });
    document.querySelectorAll(".hk[data-slot]").forEach((el) => { el.textContent = keyGlyph(SLOT_KEYS[+el.dataset.slot]); });
  }
  const learnedSkills = (g) => CFG.SKILL_TREE_ORDER.filter((k) => g.learned.has(k)).slice(0, g.maxSkills());
  const skillInSlot = (g, i) => learnedSkills(g)[i] || null;
  rebuildKeyMap(); refreshHotkeyBadges();

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

  let treeSel = null, swapFrom = null;   // swapFrom: phép đang chờ ĐỔI (khởi từ việc bấm phép đang hồi chiêu)
  function tipFor(k) {
    const s = CFG.SKILLS[k];
    if (!game.learned.has(k) && game.learned.size >= game.maxSkills()) return `<b>${s.name}</b> — ${s.desc}<br><span style="color:#ff9b9b">Đã học tối đa ${game.maxSkills()} phép — không thể học thêm.</span>`;
    return `<b>${s.name}</b> — ${s.desc}<br>Giá học: <b>${s.learn}</b> Điểm KN` + (s.aim === "pvp" ? ` · <span style="color:#ff9b9b">chỉ dùng ở Đối kháng</span>` : ``) + (game.learned.has(k) ? ` · <span style="color:#7ee0a8">đã học</span>` : !game.canLearn(k) ? ` · <span style="color:#ff9b9b">cần học phép nhánh trước</span>` : ``);
  }
  const nodeBtns = {};
  for (const k of CFG.SKILL_TREE_ORDER) {
    const s = CFG.SKILLS[k], p = pos[k];
    const el = document.createElement("div"); el.className = `tnode ${s.branch}${s.aim === "pvp" ? " pvp" : ""}`;
    el.style.left = p.x + "%"; el.style.top = p.y + "%";
    el.innerHTML = `<span class="tg">${s.glyph}</span><span class="tc">${s.learn}</span>`;
    el.onmouseenter = () => { tipEl.innerHTML = tipFor(k); };
    el.onclick = () => {
      if (swapFrom && game.canSwap()) {   // đang ĐỔI phép (Vua Phép): swapFrom = phép nguồn
        if (k === swapFrom) { swapFrom = null; treeSel = k; }   // bấm lại nguồn -> hủy đổi
        else if (!game.learned.has(k) && game.swapSkill(swapFrom, k)) { log("Đổi phép: " + CFG.SKILLS[swapFrom].name + " → " + s.name, "good"); swapFrom = null; treeSel = k; }
        tipEl.innerHTML = tipFor(k); renderTree(); return;
      }
      treeSel = k; tipEl.innerHTML = tipFor(k); renderTree();
    };
    el.ondblclick = () => { if (!swapFrom && game.learnSkill(k)) { log("Đã học phép: " + s.name, "good"); treeSel = k; renderTree(); } };
    nodesEl.appendChild(el); nodeBtns[k] = el;
  }
  function renderTree() {
    $("treeSP").textContent = game.sp; $("treeCount").textContent = game.learned.size;
    { const tm = $("treeMax"); if (tm) tm.textContent = game.maxSkills(); }
    const maxed = game.learned.size >= game.maxSkills();
    if (!game.canSwap()) swapFrom = null;
    const swapping = !!swapFrom;
    for (const k of CFG.SKILL_TREE_ORDER) {
      const el = nodeBtns[k], learned = game.learned.has(k);
      // đang đổi: tô sáng phép nguồn + các mục tiêu đổi hợp lệ (phép chưa học)
      const canL = swapping ? game.canSwapTo(swapFrom, k) : game.canLearn(k), afford = swapping || game.sp >= CFG.SKILLS[k].learn;
      el.classList.toggle("learned", learned); el.classList.toggle("learnable", !learned && canL && afford);
      el.classList.toggle("locked", !learned && !canL && !(swapping && learned)); el.classList.toggle("selected", treeSel === k);
      el.classList.toggle("swapfrom", swapping && swapFrom === k);
    }
    const ch = $("treeChoose"), canPick = !swapping && treeSel && game.canLearn(treeSel) && game.sp >= CFG.SKILLS[treeSel].learn;
    ch.disabled = !canPick; ch.textContent = maxed ? `Đủ ${game.maxSkills()} phép` : "Chọn";
    { const tip = $("treeSwapTip"); if (tip) { tip.classList.toggle("hidden", !swapping); if (swapping) tip.innerHTML = `🎩 <b>Đổi ${CFG.SKILLS[swapFrom].name}</b> → bấm 1 phép <b>chưa học</b> (đang sáng) để đổi sang. Hồi chiêu vẫn chạy thực. Bấm lại phép nguồn để hủy.`; } }
  }
  const openTree = () => { swapFrom = null; modal.classList.remove("hidden"); renderTree(); };
  const closeTree = () => { swapFrom = null; modal.classList.add("hidden"); };
  // Bắt đầu ĐỔI phép (Vua Phép): mở cây, đặt phép nguồn, sáng các mục tiêu hợp lệ
  function startSwap(fromKey) { if (!game.canSwap() || !game.learned.has(fromKey)) return; swapFrom = fromKey; treeSel = fromKey; modal.classList.remove("hidden"); tipEl.innerHTML = tipFor(fromKey); renderTree(); }
  $("btnTree").onclick = openTree; $("btnTree2").onclick = openTree; $("treeClose").onclick = closeTree;
  $("treeChoose").onclick = () => { if (treeSel && game.learnSkill(treeSel)) { log("Đã học phép: " + CFG.SKILLS[treeSel].name, "good"); renderTree(); } };
  modal.onclick = (e) => { if (e.target === modal) closeTree(); };

  /* ---------- Luật chơi + Cấu hình ---------- */
  const rules = $("rulesModal");
  $("btnRules").onclick = () => rules.classList.remove("hidden");
  $("rulesClose").onclick = () => rules.classList.add("hidden");
  rules.onclick = (e) => { if (e.target === rules) rules.classList.add("hidden"); };

  /* ---------- Cấu hình PHÍM TẮT ---------- */
  const keysModal = $("keysModal");
  let kbCapture = null;   // {kind:'act'|'slot', id} đang chờ gán phím (null = không capture)
  function keyRow(kind, id, name, glyph, cur) {
    const attr = kind === "slot" ? `data-slot="${id}"` : `data-act="${id}"`;
    return `<div class="kb-row"><span class="kb-nm"><b class="kb-g">${glyph}</b>${name}</span>` +
      `<button class="kb-key" ${attr}>${keyGlyph(cur)}</button></div>`;
  }
  function renderKeysModal() {
    let h = `<div class="kb-sec">Tháp &amp; Bẫy</div><div class="kb-grid">`;
    for (const k of [...CFG.TOWER_ORDER, ...CFG.TRAP_ORDER]) { const d = CFG.TOWERS[k] || CFG.TRAPS[k]; h += keyRow("act", k, d.name, d.glyph, KEYS[k]); }
    h += `</div><div class="kb-sec">Phép — ${CFG.MAX_SKILLS} ô (phép học được xếp vào ô theo thứ tự)</div><div class="kb-grid">`;
    const learned = learnedSkills(game);
    for (let i = 0; i < CFG.MAX_SKILLS; i++) {
      const k = learned[i], nm = k ? CFG.SKILLS[k].name : "<i>Ô trống</i>", gl = k ? CFG.SKILLS[k].glyph : "◦";
      h += keyRow("slot", i, `Ô ${i + 1} · ${nm}`, gl, SLOT_KEYS[i]);
    }
    h += `</div>`;
    $("keysBody").innerHTML = h;
    $("keysBody").querySelectorAll(".kb-key").forEach((btn) => {
      btn.onclick = () => {
        renderKeysModal();   // dọn trạng thái "đang chờ" cũ
        const cur = btn.dataset.slot != null ? { kind: "slot", id: +btn.dataset.slot } : { kind: "act", id: btn.dataset.act };
        kbCapture = cur;
        const sel = cur.kind === "slot" ? `.kb-key[data-slot="${cur.id}"]` : `.kb-key[data-act="${cur.id}"]`;
        const el = $("keysBody").querySelector(sel); if (el) { el.classList.add("capturing"); el.textContent = "Nhấn phím…"; }
        $("keysTip").textContent = "Đang chờ… nhấn phím muốn gán (Esc để hủy). Trùng phím sẽ tự gỡ khỏi nơi cũ.";
      };
    });
  }
  // bắt phím KHI đang capture (ưu tiên trước handler game nhờ dùng capture-phase)
  window.addEventListener("keydown", (e) => {
    if (!kbCapture) return;
    e.preventDefault(); e.stopPropagation();
    const cap = kbCapture, key = e.key;
    if (key === "Escape") { kbCapture = null; renderKeysModal(); $("keysTip").textContent = "Đã hủy."; return; }
    const norm = key.toLowerCase();
    if (RESERVED.has(norm)) { $("keysTip").textContent = `Phím "${keyGlyph(key)}" dành riêng (Space/Enter/Esc/F2/Tab) — chọn phím khác.`; return; }
    const val = key.length === 1 ? norm : key;
    // gỡ phím này khỏi mọi nơi khác (tháp/bẫy & ô phép) để không trùng
    for (const a in KEYS) if ((KEYS[a] || "").toLowerCase() === norm) KEYS[a] = "";
    SLOT_KEYS.forEach((sk, i) => { if ((sk || "").toLowerCase() === norm) SLOT_KEYS[i] = ""; });
    if (cap.kind === "slot") SLOT_KEYS[cap.id] = val; else KEYS[cap.id] = val;
    kbCapture = null; persistKeys(); renderKeysModal();
    $("keysTip").textContent = "Đã lưu. Bấm ô khác để đổi tiếp, hoặc Xong.";
  }, true);
  $("btnCfg").onclick = () => { renderKeysModal(); $("keysTip").textContent = "Bấm ô phím của một tháp hoặc một Ô phép rồi nhấn phím mới để gán."; keysModal.classList.remove("hidden"); };
  $("keysClose").onclick = () => { kbCapture = null; keysModal.classList.add("hidden"); };
  $("keysReset").onclick = () => { KEYS = Object.assign({}, CFG.DEFAULT_KEYS); SLOT_KEYS = CFG.DEFAULT_SLOT_KEYS.slice(); persistKeys(); renderKeysModal(); $("keysTip").textContent = "Đã khôi phục phím mặc định (tháp 1–8, phép Q W E A S D)."; };
  keysModal.onclick = (e) => { if (e.target === keysModal) { kbCapture = null; keysModal.classList.add("hidden"); } };

  /* ---------- thanh Phép (đã học) ---------- */
  const skillGrid = $("skillGrid");
  function renderSkills(g) {
    const learned = CFG.SKILL_TREE_ORDER.filter((k) => g.learned.has(k));
    if (!learned.length) { skillGrid.innerHTML = `<div class="empty">Chưa học phép.<br>Mở cây kỹ năng (F2).</div>`; return; }
    skillGrid.innerHTML = "";
    learned.forEach((k, i) => {
      const s = CFG.SKILLS[k], b = document.createElement("button"); b.className = "sk-btn"; b.dataset.key = k;
      const pvpLock = s.aim === "pvp" && !g.versus; b.title = s.name + " — " + s.desc + (pvpLock ? " (chỉ Đối kháng)" : "");
      b.innerHTML = `<span class="hk" data-slot="${i}">${keyGlyph(SLOT_KEYS[i])}</span><span class="g">${s.glyph}</span><span class="n">${s.name}</span><span class="cd"></span>`;
      b.onclick = () => { if (game.canSwap() && (game.skillCd[k] || 0) > 0) startSwap(k); else game.armSkill(k); };   // Vua Phép: bấm phép đang hồi -> đổi phép
      skillGrid.appendChild(b);
    });
  }
  let lastLearned = -1;

  /* ---------- LÕI NÂNG CẤP (giống Augment TFT) ---------- */
  const coreSlotsEl = $("coreSlots"), coreModal = $("coreModal"), coreCardsEl = $("coreCards"), coreHeadEl = $("coreHead");
  const corePendingEl = $("corePending"), corePendingTx = $("corePendingTx"), TIER = CFG.CORE_TIER_INFO;
  let coreSig = "";
  function afkText(g) {   // dòng mô tả AFK sống động: còn mấy đợt sạch + vàng chờ + tổng đã nhận
    const i = g.afkInfo();
    const earned = `Tổng đã nhận: <b style="color:var(--gold)">${i.earned}</b>💰`;
    if (i.acted) return `💤 Đã động tháp đợt này → chuỗi về 0, cần <b>3</b> đợt sạch liền. ${earned}`;
    return `💤 Còn <b>${i.need}</b> đợt sạch → thưởng <b style="color:var(--gold)">${i.pending}</b>💰 (đợt sạch: ${i.clean}/3). ${earned}`;
  }
  function updateAfkLive(g) { if (!g.hasCore("afk")) return; const el = coreSlotsEl.querySelector(".core-afk"); if (el) el.innerHTML = afkText(g); }
  function maybeRenderCores(g) {
    const nx = g.cores.length, cost = g.coreUnlockSp(nx);
    const sig = nx + "|" + (g.sp >= cost ? 1 : 0) + "|" + (g.pendingCore ? g.pendingCore.id : "") + "|" + g.coreTiers.join(",") + "|" + g.cores.map((c) => c.id + c.tier).join(",") + "|" + (g.dungHopUsed ? 1 : 0);
    if (sig === coreSig) return; coreSig = sig; renderCores(g);
  }
  function renderCores(g) {
    coreSlotsEl.innerHTML = "";
    for (let i = 0; i < CFG.MAX_CORES; i++) {
      const core = g.cores[i], tier = g.coreTiers[i], ti = TIER[tier] || TIER.bac, el = document.createElement("div");
      if (core) {
        const def = CFG.CORES[core.id], cti = TIER[core.tier];
        el.className = "core-slot filled"; el.style.setProperty("--tc", cti.color);
        const extra = core.id === "dungHop" ? (g.dungHopUsed ? " · <span style='color:#ff9b9b'>đã dùng</span>" : " · <span style='color:#8bff9c'>sẵn sàng (xây đè lên tháp)</span>") : "";
        const small = core.id === "afk" ? `<small class="core-afk">${afkText(g)}</small>` : `<small>${def.desc(core.value)}${extra}</small>`;
        el.innerHTML = `<span class="core-ic">${def.icon}</span><span class="core-tx"><b>${def.name}</b>${small}</span><span class="core-badge" style="background:${cti.color}">${cti.name}</span>`;
      } else if (i === g.cores.length) {
        const cost = g.coreUnlockSp(i), canOpen = g.slotOpenable(i), label = i === 0 ? "Chọn lõi" : `Mở · ${cost} KN`;
        el.className = "core-slot open" + (canOpen ? " ready" : ""); el.style.setProperty("--tc", ti.color);
        el.innerHTML = `<span class="core-ic">➕</span><span class="core-tx"><b>Ô lõi ${i + 1}</b><small>Cấp bậc: <span style="color:${ti.color}">${ti.name}</span></small></span><button class="core-open-btn" ${canOpen ? "" : "disabled"}>${label}</button>`;
        el.querySelector(".core-open-btn").onclick = () => openCorePick(i);
      } else {
        el.className = "core-slot locked";
        el.innerHTML = `<span class="core-ic">🔒</span><span class="core-tx"><b>Ô lõi ${i + 1}</b><small>Mở ô ${i} trước (cần ${g.coreUnlockSp(i)} KN)</small></span>`;
      }
      coreSlotsEl.appendChild(el);
    }
    if (g.pendingCore) { corePendingEl.classList.remove("hidden"); corePendingTx.innerHTML = `🔧 <b>${CFG.CORES[g.pendingCore.id].name}</b>: bấm chọn 1 <b>tháp</b> trên bản đồ để gia cố (+${g.pendingCore.value}%).`; }
    else corePendingEl.classList.add("hidden");
  }
  function openCorePick(slot) {
    const off = game.openCore(slot); if (!off || !off.items.length) return;
    const cti = TIER[off.items[0].tier];
    coreHeadEl.innerHTML = `Ô lõi ${slot + 1} — cấp bậc <b style="color:${cti.color}">${cti.name}</b> · chọn 1 trong 3`;
    coreCardsEl.innerHTML = "";
    off.items.forEach((it) => {
      const def = CFG.CORES[it.id], c = TIER[it.tier], card = document.createElement("button");
      card.className = "core-card"; card.style.setProperty("--tc", c.color);
      card.innerHTML = `<span class="cc-badge" style="background:${c.color}">${c.name}</span><span class="cc-ic">${def.icon}</span><span class="cc-name">${def.name}</span><span class="cc-group">${def.group}</span><span class="cc-desc">${def.desc(it.value)}</span>`;
      card.onclick = () => { if (game.pickCore(it.id)) { coreModal.classList.add("hidden"); log("Đã chọn lõi: " + def.name + " (" + c.name + ")", "good"); if (it.id === "dungHop") log("⚗ Dung Hợp: chọn 1 loại tháp ở cửa hàng rồi bấm XÂY ĐÈ lên 1 tháp đã có (1 lần/ván).", "ev"); game.emit(); } };
      coreCardsEl.appendChild(card);
    });
    coreModal.classList.remove("hidden");
  }
  $("coreCancel").onclick = () => { game.cancelCoreOffer(); coreModal.classList.add("hidden"); };
  coreModal.onclick = (e) => { if (e.target === coreModal) { game.cancelCoreOffer(); coreModal.classList.add("hidden"); } };

  /* ---------- WIKI tra cứu lõi ---------- */
  const coreWiki = $("coreWiki"), wikiBody = $("wikiBody");
  function renderWiki() {
    const TI = CFG.CORE_TIER_INFO;
    let html = `<p class="wiki-intro">Mỗi ván chọn tối đa <b>${CFG.MAX_CORES}</b> lõi — <b>ô 1 miễn phí</b>, ô 2/3 mở bằng <b>${CFG.CORE_UNLOCK_SP[1]}</b>/<b>${CFG.CORE_UNLOCK_SP[2]}</b> Điểm KN. Cấp bậc <b style="color:${TI.bac.color}">Bạc</b> &lt; <b style="color:${TI.vang.color}">Vàng</b> &lt; <b style="color:${TI.kimcuong.color}">Kim Cương</b> (mạnh dần), <b>ngẫu nhiên mỗi ván</b> nhưng <b>giống nhau giữa mọi người chơi</b>. Mở 1 ô → hiện 3 lõi cùng cấp bậc để chọn (riêng mỗi người).</p>`;
    for (const grp of ["Kinh tế", "Tháp", "Phép", "Bản đồ"]) {
      const ids = CFG.CORE_ORDER.filter((id) => CFG.CORES[id].group === grp);
      if (!ids.length) continue;
      html += `<div class="wiki-group">${grp}</div>`;
      for (const id of ids) {
        const c = CFG.CORES[id], tiers = CFG.CORE_TIERS.filter((tk) => c.tiers[tk] != null);
        const chips = tiers.map((tk) => `<span class="wiki-tier" style="background:${TI[tk].color}">${TI[tk].name}</span>`).join(" ");
        const desc = c.desc(tiers.map((tk) => c.tiers[tk]).join("/"));
        html += `<div class="wiki-core"><span class="wiki-ic">${c.icon}</span><div class="wiki-tx"><div class="wiki-nm">${c.name} ${chips}</div><div class="wiki-desc">${desc}</div></div></div>`;
      }
    }
    wikiBody.innerHTML = html;
  }
  const openWiki = () => { renderWiki(); coreWiki.classList.remove("hidden"); };
  $("btnCoreWiki").onclick = openWiki;
  $("wikiClose").onclick = () => coreWiki.classList.add("hidden");
  coreWiki.onclick = (e) => { if (e.target === coreWiki) coreWiki.classList.add("hidden"); };

  /* ---------- bảng chi tiết tháp (đáy) ---------- */
  const tp = $("towerPanel");
  function targetText(def) { return def.trap ? def.desc : def.support ? "Hỗ trợ — không bắn" : def.target === "both" ? "Bắn cả Bay & Bộ" : def.target === "air" ? "Chỉ bắn Quái bay" : "Chỉ bắn Quái bộ"; }
  function targetLabel(tgt) { return tgt === "both" ? "cả Bay & Bộ" : tgt === "air" ? "chỉ Quái bay" : tgt === "ground" ? "chỉ Quái bộ" : "không bắn"; }
  const shortName = (n) => n.replace("Tháp ", "").replace("Bẫy ", "");
  function statsHTML(t) {
    if (t.trap) return `<div>Loại: <b>Dùng 1 lần</b> (kích hoạt là biến mất)</div><div>Bán kính: <b>${t.def.radius}</b></div>`;
    if (t.support && !t.fused) { const s = t.stats; return `<div>Buff ST: <b class="plus">+${Math.round(s.dmgBonus * 100)}%</b></div><div>Buff Tốc: <b class="plus">+${Math.round(s.rateBonus * 100)}%</b></div><div>Tầm Xa: <b>${s.range.toFixed(1)}</b></div>`; }
    // base = chỉ số GỐC tháp cầm nòng; "+bonus" gộp cả dung hợp (tháp kia) lẫn lõi (cm)
    const s = t.fused ? t.fstats : t.stats, raw = t.fused ? t.shooterStats : s, cm = t.coreMul(), om = t.origMul || 1;
    const base = Math.round(raw.dmg), bonus = Math.round(t.effDmg() - raw.dmg), sps = 1 / t.effRate(), spsBonus = sps - 1 / (raw.rate || 1);
    const rngBonus = s.range * cm - raw.range, splBonus = (s.splash || 0) * cm - (raw.splash || 0);
    const plus = (b) => b > 0.01 ? ` <span class="plus">+${b.toFixed(1)}</span>` : "";
    // hiệu ứng (chậm/độc) — Nguyên Bản (origMul) NHÂN đôi hiệu ứng; hiện giá trị đã nhân
    const effLine = (label, pct, suf) => `<div>${label}: <b class="plus">${Math.round(pct * om * 100)}%${suf || ""}</b>${om > 1 ? ` <span class="plus">(×${om})</span>` : ``}</div>`;
    let eff = "";
    if ((s.slowPct || 0) > 0) eff += effLine("Làm chậm", s.slowPct);
    if ((s.poisonPct || 0) > 0) eff += effLine("Độc", s.poisonPct, " máu hiện tại/5s");
    const fuseLine = t.fused ? `<div class="tp-fuse">⚗ Dung hợp <b>${shortName(t.def.name)}</b> + <b>${shortName(t.fuseDef.name)}</b> → bắn ${targetLabel(t.fireTarget)}${t.emitsAura ? " · tự buff + buff quanh" : ""}</div>` : "";
    return fuseLine +
      `<div>Sức Mạnh: <b>${base}</b>${bonus > 0 ? ` <span class="plus">+${bonus}</span>` : ``}</div>` +
      `<div>Tầm Xa: <b>${raw.range.toFixed(1)}</b>${plus(rngBonus)}</div>` +
      `<div>Tốc độ bắn: <b>${sps.toFixed(2)}</b>/s${spsBonus > 0.01 ? ` <span class="plus">+${spsBonus.toFixed(2)}</span>` : ``}</div>` +
      (s.splash ? `<div>Bắn Loang: <b>${(raw.splash || 0).toFixed(1)}</b>${plus(splBonus)}</div>` : `<div>Cấp: <b>${t.level}/${t.def.lv.length}</b></div>`) + eff;
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
  let tpTower = undefined, tpFused = false;
  function renderTowerPanel(g) {
    const t = g.selected; tp.classList.remove("hidden");
    if (t !== tpTower || !!(t && t.fused) !== tpFused) {   // dựng lại cả khi tháp vừa được DUNG HỢP
      tpTower = t; tpFused = !!(t && t.fused);
      if (!t) { const nx = g.nextWavePreview(); tp.innerHTML = `<div class="tp-empty">🏰 Chọn tháp/bẫy trên bản đồ để xem chi tiết &amp; nâng cấp/bán. &nbsp;•&nbsp; Đợt sau: <b>${nx.name}</b> ×${nx.count}${nx.boss ? " (BOSS)" : nx.fly ? " (bay)" : ""}</div>`; return; }
      const title = t.fused ? `${shortName(t.def.name)}+${shortName(t.fuseDef.name)} ⚗: ${targetLabel(t.fireTarget)}` : `${t.def.name}: ${targetText(t.def)}`;
      tp.innerHTML = `<div class="tp-icon" style="background:${t.def.color}">${t.def.glyph}</div>` +
        `<div class="tp-main"><div class="tp-title">${title} <span class="lv" id="tpLv"></span></div><div class="tp-stats" id="tpStats"></div><div class="tp-prev" id="tpPrev"></div></div>` +
        `<div class="tp-actions"><button class="tp-up" id="tpUp"></button><button class="tp-sell" id="tpSell"></button><button class="tp-move hidden" id="tpMove">↔ Dời</button><button class="tp-raise hidden" id="tpRaise">⛰ Nâng ô</button></div>`;
      // pointerdown: kích hoạt NGAY lúc nhấn (tránh emit làm nút disabled giữa mousedown→mouseup nuốt click, hay gặp ở PvP/Edge)
      $("tpUp").onpointerdown = (e) => { if (e.button !== 0) return; e.preventDefault(); game.upgradeSelected(); };
      $("tpSell").onpointerdown = (e) => { if (e.button !== 0) return; e.preventDefault(); game.sellSelected(); };
      $("tpMove").onpointerdown = (e) => { if (e.button !== 0) return; e.preventDefault(); game.startMoveTower(game.selected); };   // Back King Xây
      $("tpRaise").onpointerdown = (e) => { if (e.button !== 0) return; e.preventDefault(); game.raiseTile(game.selected); };   // Trùm Bản Đồ
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
    else { const uc = g.buyCost(t.upgradeCost), afford = g.gold >= uc; bu.textContent = `Nâng Cấp −${uc}💰`; bu.disabled = false; bu.className = "tp-up" + (afford ? "" : " poor"); }
    const sb = $("tpSell");
    if (!t.trap && t.action === "sell") { sb.textContent = "Đang tháo dỡ…"; sb.disabled = true; }
    else { sb.textContent = `Bán +${g.gainGold(t.sellValue)}💰`; sb.disabled = false; }
    { const mv = $("tpMove"); if (mv) { mv.classList.toggle("hidden", !g.hasCore("backKingXay")); mv.classList.toggle("on", g.pendingMove === t); mv.textContent = g.pendingMove === t ? "↔ Chọn ô…" : "↔ Dời"; } }
    { const rb = $("tpRaise"); if (rb) { const show = g.hasCore("trumBanDo") && !t.trap; rb.classList.toggle("hidden", !show); if (show) { const raised = g.raised.has(t.col + "," + t.row); rb.textContent = raised ? "⛰ Đã nâng" : `⛰ Nâng −${CFG.RAISE_SP}KN`; rb.disabled = raised || g.sp < CFG.RAISE_SP; rb.classList.toggle("on", raised); } } }
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
    if (match && match.mode === "2v2") renderMateSkills();
    for (const k of [...CFG.TOWER_ORDER, ...CFG.TRAP_ORDER]) {
      const def = CFG.TOWERS[k] || CFG.TRAPS[k], b = shopBtns[k], cost = g.buyCost(def.cost);
      b.classList.toggle("active", g.buildType === k); b.classList.toggle("cant", g.gold < cost);
      const sale = cost < def.cost; b.classList.toggle("sale", sale);   // Black Friday: giá giảm
      const cs = b.querySelector(".tw-cost"); const txt = "💰" + cost; if (cs.textContent !== txt) cs.textContent = txt;
    }
    maybeRenderCores(g); updateAfkLive(g);
    { const sig = g.learned.size + ":" + [...g.learned].sort().join(","); if (sig !== lastLearned) { renderSkills(g); lastLearned = sig; } }   // render lại khi TẬP phép đổi (kể cả đổi phép giữ nguyên số lượng)
    for (const b of skillGrid.querySelectorAll(".sk-btn")) { const k = b.dataset.key, s = CFG.SKILLS[k], cd = g.skillCd[k] || 0, pvpLock = s.aim === "pvp" && !g.versus; b.classList.toggle("active", g.pendingSkill === k); b.classList.toggle("cant", pvpLock || cd > 0); b.querySelector(".cd").textContent = cd > 0 ? cd.toFixed(0) : "";
      const swappable = g.canSwap() && cd > 0; b.classList.toggle("swappable", swappable); if (swappable) b.title = s.name + " — 🎩 đang hồi chiêu: bấm để ĐỔI sang phép khác"; }
    if (!modal.classList.contains("hidden")) renderTree();
    { const can = hasLearnable(g); $("btnTree").classList.toggle("can-learn", can); $("btnTree2").classList.toggle("can-learn", can); }
    $("btnPause").textContent = g.paused ? "▶ Tiếp" : "⏸ Dừng"; $("btnSpeed").textContent = "⏩ x" + g.speed;
    canvas.style.cursor = g.pendingMove ? "move" : g.pendingCore ? CORE_CURSOR : g.pendingSkill ? AIM_CURSOR : g.buildType ? "cell" : "crosshair";  // con trỏ đổi: dời tháp / chờ Gia Cố / chờ mục tiêu phép / khi xây
    renderTowerPanel(g);
    if (g.wave !== prevWave && g.wave > 0) { log("Đợt " + g.wave + " bắt đầu", "ev"); prevWave = g.wave; }
    if (g.lives < prevLives) { log("Quái lọt cửa Tử! Còn " + g.lives + " mạng", "warn"); prevLives = g.lives; }
    if ((g.gameOver || g.victory) && !prevEnd) { log(g.victory ? "CHIẾN THẮNG!" : "THẤT THỦ!", g.victory ? "good" : "warn"); prevEnd = true; }
  }
  game.onChange = updateHUD;
  game.onCoreLog = (m) => log(m, "good");   // lõi AFK báo thưởng vàng

  /* ---------- điều khiển ---------- */
  $("startWave").onclick = () => game.startWave();
  $("btnPause").onclick = () => { if (net) return; game.paused = !game.paused; game.emit(); };
  $("btnSpeed").onclick = () => { game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 3 : 1; game.emit(); };
  function syncAuto() { $("btnAuto").classList.toggle("on", game.autoNext); $("btnAuto").textContent = "Tự động: " + (game.autoNext ? "BẬT" : "TẮT"); }
  $("btnAuto").onclick = () => { game.autoNext = !game.autoNext; syncAuto(); };
  function newGame(mode) { endVersus(); game.reset(mode); syncAuto(); lastLearned = -1; treeSel = null; prevWave = 0; prevLives = CFG.START_LIVES; prevEnd = false; coreSig = ""; coreModal.classList.add("hidden"); logBox.innerHTML = ""; log("Ván mới: " + (mode === "campaign" ? "Chiến Dịch" : "Sinh Tồn Vô Tận") + " — bản đồ " + CFG.curMap().name, "good"); }
  $("modeEndless").onclick = () => newGame("endless");
  $("modeCampaign").onclick = () => newGame("campaign");
  $("btnRestart").onclick = () => { if (match && !match.net) startVersus(vsPlayers()); else newGame("endless"); };

  window.addEventListener("keydown", (e) => {
    if (e.key === "F2") { e.preventDefault(); modal.classList.contains("hidden") ? openTree() : closeTree(); return; }
    if (e.key === "Escape") { if (!modal.classList.contains("hidden")) return closeTree(); if (!rules.classList.contains("hidden")) return rules.classList.add("hidden"); if (!mainMenu.classList.contains("hidden")) return closeMenu(); if (!coreWiki.classList.contains("hidden")) return coreWiki.classList.add("hidden"); if (!coreModal.classList.contains("hidden")) { game.cancelCoreOffer(); return coreModal.classList.add("hidden"); } game.buildType = null; game.selected = null; game.pendingSkill = null; game.pendingCore = null; game.pendingMove = null; game.emit(); return; }
    if (kbCapture) return;                                   // đang chờ gán phím -> modal xử lý
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;   // đang gõ chữ -> bỏ qua
    if (e.key === " ") { e.preventDefault(); if (!net) { game.paused = !game.paused; game.emit(); } }
    else if (e.key === "Enter") game.startWave();
    else {
      const kk = e.key.toLowerCase();
      const a = keyMap[kk];
      if (a) { game.setBuild(a); return; }                  // phím tháp/bẫy
      const si = slotKeyMap[kk];
      if (si != null) { const k = skillInSlot(game, si); if (k) game.armSkill(k); }   // phím ô phép
    }
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
    reconnecting = false; reconnBanner(false); if (reconnTimer) clearTimeout(reconnTimer);
    if (net) { net.leave(); net = null; }
    if (!match) return; match = null;
    document.body.classList.remove("versus", "netplay", "team2v2");
    $("mateSkills").classList.add("hidden");
    $("oppList").innerHTML = OPP.map((n) => `<div class="opp"><div class="oface">?</div><div class="omap"><span class="oname">${n}</span><small>Đối kháng<br>(chọn ⚔ để chơi)</small></div></div>`).join("");
  }

  /* ---------- MẠNG LAN ---------- */
  let net = null;
  function renderLobby(m) {
    const mode = m.lobbyMode || "ffa";
    $("vsLobbyCount").textContent = `(${m.players.length}/${mode === "2v2" ? 4 : 5})`;
    // đồng bộ nút chọn kiểu trận (chỉ chủ phòng đổi được)
    $("vsModeRow").classList.toggle("locked", !m.isHost);
    $("vsModeRow").querySelectorAll(".vs-mode-btn").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    if (mode === "2v2") {
      // xếp theo ĐỘI do server gán (đổi được ở phòng chờ); chủ-bàn = người vào sớm nhất mỗi đội
      const myTeam = (m.players.find((p) => p.pid === m.myPid) || {}).team;
      let html = "";
      [0, 1].forEach((tm) => {
        const mem = m.players.filter((p) => p.team === tm);
        html += `<div class="vs-team-hd t${tm}">${tm === 0 ? "🔵 Đội A" : "🔴 Đội B"} <span class="vs-team-ct">(${mem.length}/2)</span>` +
          (myTeam === tm ? ` <span class="vs-you">— đội của bạn</span>` : ` <button class="vs-join-team" data-team="${tm}">Chuyển sang đây</button>`) + `</div>`;
        html += mem.length ? mem.map((p, j) => `<div class="vs-lobby-row team${tm}${p.pid === m.myPid ? " me" : ""}"><span class="vs-tag ${p.pid === m.myPid ? "me" : "ai"}">${j === 0 ? "🛠 Chủ-bàn" : "🤝 Đồng đội"}</span> <b>${p.name}</b>${p.pid === m.myPid ? " (bạn)" : ""}${p.host ? " 👑" : ""}</div>`).join("") : `<div class="vs-empty-team">— trống —</div>`;
      });
      $("vsLobbyList").innerHTML = html;
      $("vsLobbyList").querySelectorAll(".vs-join-team").forEach((b) => { b.onclick = () => { if (net) net.client.send({ t: "setteam", team: +b.dataset.team }); }; });
    } else {
      $("vsLobbyList").innerHTML = m.players.map((p) =>
        `<div class="vs-lobby-row${p.pid === m.myPid ? " me" : ""}"><span class="vs-tag ${p.pid === m.myPid ? "me" : "ai"}">${p.host ? "👑 Chủ" : "P" + p.pid}</span> <b>${p.name}</b>${p.pid === m.myPid ? " (bạn)" : ""}</div>`).join("");
    }
    $("vsLanStart").classList.toggle("hidden", !m.isHost);
    $("vsLanStart").disabled = !m.canStart;
    const need = mode === "2v2" ? "Cần ĐÚNG 4 người (2 đội × 2) để bắt đầu." : "Cần ít nhất 2 người để bắt đầu.";
    $("vsLanMsg").textContent = m.isHost ? (m.canStart ? "Đủ người — bấm Bắt đầu khi sẵn sàng." : need) : "Chờ chủ phòng bắt đầu…";
  }
  // chủ phòng đổi kiểu trận
  $("vsModeRow").querySelectorAll(".vs-mode-btn").forEach((b) => {
    b.onclick = () => { if (net && net.isHost) net.client.send({ t: "setmode", mode: b.dataset.mode }); };
  });
  let reconnecting = false, reconnTries = 0, reconnTimer = null;
  const lanUrl = () => (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/";
  function lanFailHint() {
    $("vsLanConnect").classList.remove("hidden"); $("vsLanLobby").classList.add("hidden");
    $("vsLanAddr").innerHTML = `❌ <b>Không kết nối được máy chủ</b> tại <b>${location.host}</b>.<br>Kiểm tra: ① máy chủ đã chạy <code>node server.js</code> chưa · ② bạn mở ĐÚNG địa chỉ đó chưa (không phải <code>file://</code> hay server tĩnh khác) · ③ tường lửa/khác mạng LAN.`;
    $("vsLanJoin").classList.remove("hidden"); $("vsLanLeave").classList.add("hidden");
    if (net) { net.leave(); net = null; }
  }
  function reconnBanner(on, txt) { const b = $("netReconnect"); b.classList.toggle("hidden", !on); if (on && txt) b.querySelector("span").textContent = txt; }

  // Mở kết nối LAN. opts: {sid, silent, reconnect}
  function openLan(name, opts) {
    opts = opts || {};
    let opened = false;
    const client = new STM.NetClient(lanUrl(),
      (o) => net && net.handle(o),
      () => { opened = true; net.join(); },
      () => onLanClose(opened, opts));
    net = new STM.NetMatch(game, client, name);
    net.sid = opts.sid || (STM.loadSession() && STM.loadSession().sid) || null;
    net.onReject = (why) => { STM.clearSession(); reconnecting = false; reconnBanner(false); $("vsLanMsg").textContent = "Bị từ chối: " + why; if (net) { net.leave(); net = null; } if (!opts.silent) showTab("LAN"); else { endVersus(); openMenu(); } };
    net.onKick = (why) => { reconnecting = false; reconnBanner(false); if (net) { net.leave(); net = null; } endVersus(); log(why || "Phiên đã mở ở nơi khác.", "warn"); openMenu(); };
    net.onLobby = (m) => { reconnecting = false; reconnBanner(false); renderLobby(m); if (!(opts.silent && !m.started)) showTab("LAN"); if (opts.silent && !m.started) { vsModal.classList.remove("hidden"); document.body.classList.remove("versus", "netplay"); } };
    net.onStart = (m) => startVersusNet(m);
    net.onResume = (m) => resumeVersusNet(m);
    net.onEnd = (m) => showResult(m);
    net.onChange = () => game.emit();
    if (!opts.silent) setTimeout(() => { if (net && !opened) { try { net.client.close(); } catch (e) {} lanFailHint(); } }, 4000);
    return () => opened;
  }
  function onLanClose(wasOpened, opts) {
    if (!net) return;
    const sess = STM.loadSession();
    if (net.started && !net.over && sess && sess.active) { scheduleReconnect(sess); }   // rớt giữa trận -> tự nối lại
    else if (!wasOpened && !opts.silent) { lanFailHint(); }
    else if (!opts.silent) { $("vsLanMsg").textContent = "Mất kết nối máy chủ."; }
  }
  function scheduleReconnect(sess) {
    if (reconnecting) return; reconnecting = true; reconnTries = 0;
    reconnBanner(true, "🔌 Mất kết nối — đang thử vào lại trận…");
    tryReconnect(sess);
  }
  function tryReconnect(sess) {
    if (!reconnecting) return;
    reconnTries++;
    if (reconnTries > 30) { reconnecting = false; reconnBanner(false); log("Không nối lại được — trận đã mất.", "warn"); STM.clearSession(); return; }
    reconnBanner(true, `🔌 Mất kết nối — đang thử vào lại (${reconnTries})…`);
    if (net) { try { net.client.close(); } catch (e) {} }
    net = null;
    openLan(sess.name, { sid: sess.sid, silent: true, reconnect: true });
    reconnTimer = setTimeout(() => { if (reconnecting && (!net || net.myPid == null)) tryReconnect(sess); }, 2500);
  }

  $("vsLanJoin").onclick = () => {
    if (location.protocol === "file:") { $("vsLanAddr").innerHTML = `⚠ Bạn đang mở bằng <b>file://</b> (double-click). Chế độ LAN CẦN máy chủ: chạy <code>node server.js</code> (hoặc <code>./run.sh</code>) rồi mở <b>http://&lt;IP&gt;:8090/</b> hiện ở cửa sổ máy chủ.`; return; }
    const name = ($("vsLanName").value || "").trim() || PLAYER;
    STM.clearSession();                          // vào phòng mới -> bỏ phiên cũ, xin sid mới
    // hiện ngay trạng thái "đang kết nối" ở khu lobby
    $("vsLanConnect").classList.add("hidden"); $("vsLanLobby").classList.remove("hidden");
    $("vsLobbyCount").textContent = ""; $("vsLobbyList").innerHTML = "";
    $("vsLanMsg").innerHTML = `⏳ Đang kết nối tới <b>${location.host}</b>…`;
    $("vsLanStart").classList.add("hidden"); $("vsLanLeave").classList.remove("hidden");
    openLan(name, {});
  };
  $("vsLanStart").onclick = () => { if (net) net.startMatch(net.lobbyMode || "ffa"); };
  $("vsLanLeave").onclick = () => { reconnecting = false; reconnBanner(false); STM.clearSession(); endVersus(); showTab("LAN"); };

  // 2v2: bật/tắt lớp thân + panel phép đồng đội
  function apply2v2Chrome(m) {
    const is2 = m && m.mode === "2v2";
    document.body.classList.toggle("team2v2", !!is2);
    $("mateSkills").classList.toggle("hidden", !is2);
    if (is2 && m.teammate) $("mateName").textContent = m.teammate.name;
    renderMateSkills();
  }
  function renderMateSkills() {
    if (!match || match.mode !== "2v2") return;
    const sk = (match.teammateSkills && match.teammateSkills.learned) || [];
    $("mateGrid").innerHTML = sk.length
      ? sk.map((k) => { const s = CFG.SKILLS[k]; return s ? `<div class="mate-sk" title="${s.name} — ${s.desc}">${s.glyph}</div>` : ""; }).join("")
      : `<span class="mate-empty">Đồng đội chưa học phép nào.</span>`;
  }

  function resumeVersusNet(m) {
    reconnecting = false; reconnBanner(false); if (reconnTimer) clearTimeout(reconnTimer);
    vsModal.classList.add("hidden");
    match = m;
    document.body.classList.add("versus", "netplay");
    apply2v2Chrome(m);
    lastLearned = -1; treeSel = null; prevWave = m.wave; prevLives = game.lives; prevEnd = false;
    buildOppList();
    log("✅ Đã kết nối lại! Tiếp tục trận ở đợt " + m.wave + (m.mode === "2v2" ? " (2v2, " + (m.isAuthority ? "chủ-bàn" : "đồng đội") + ")." : "."), "good");
    game.emit();
  }

  // Tự động nối lại sau F5/khởi động lại trình duyệt nếu còn phiên đang mở
  function tryResumeSession() {
    if (location.protocol === "file:") return;
    const sess = STM.loadSession();
    if (!sess || !sess.active || !sess.sid) return;
    if (sess.host && sess.host !== location.host) return;   // phiên thuộc máy chủ khác
    fetch("/_stm", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!(j && j.stm)) return;
      closeMenu(); document.body.classList.add("versus", "netplay");
      reconnBanner(true, "🔌 Đang kết nối lại trận LAN…");
      openLan(sess.name || PLAYER, { sid: sess.sid, silent: true, reconnect: true });
      reconnecting = true; reconnTries = 0;
      reconnTimer = setTimeout(() => { if (reconnecting && (!net || net.myPid == null)) tryReconnect(sess); }, 2500);
    }).catch(() => {});
  }

  function startVersusNet(m) {
    vsModal.classList.add("hidden");
    match = m;                       // NetMatch cũng có opponentViews/aliveN/resultRows/wave/waveTimer/over
    document.body.classList.add("versus", "netplay");
    apply2v2Chrome(m);
    lastLearned = -1; treeSel = null; prevWave = 0; prevLives = CFG.START_LIVES; prevEnd = false; logBox.innerHTML = "";
    buildOppList();
    if (m.mode === "2v2") {
      log("Trận 2v2 bắt đầu! Bạn ở " + (m.myTeam === 0 ? "Đội A" : "Đội B") + " — " + (m.isAuthority ? "CHỦ-BÀN (mô phỏng)" : "ĐỒNG ĐỘI (xem & cùng xây)") + ".", "good");
      if (m.teammate) log("Đồng đội: " + m.teammate.name + " — chung bàn, xây/nâng/bán chung.", "ev");
    } else {
      log("Trận LAN bắt đầu! " + m.players.length + " người chơi.", "good");
      log("Đợt đồng bộ do máy chủ phát — không gọi trước được.", "ev");
    }
    game.emit();
  }
  function showResult(m) {
    const rows = m.resultRows(), is2 = m.mode === "2v2";
    $("vsRank").innerHTML = rows.map((r) => {
      const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`;
      const tag = is2 ? `<span class="rk-team t${r.team}">${r.team === 0 ? "Đội A" : "Đội B"}</span> ` : "";
      const status = r.win ? (is2 ? "Đội chiến thắng!" : "Người trụ cuối cùng!") : "Thất thủ" + (r.fellWave ? " đợt " + r.fellWave : "");
      return `<div class="vs-rk ${r.win ? "win" : ""}${r.me ? " me" : ""}">${medal} ${tag}<b>${r.name}</b>${r.me ? " (bạn)" : ""} <span>${status}</span></div>`;
    }).join("");
    const winName = is2 ? (rows[0] ? (rows[0].team === 0 ? "Đội A" : "Đội B") : "") : (rows[0] ? rows[0].name : "");
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
  const resuming = (function () { const s = STM.loadSession(); return s && s.active && s.sid && (!s.host || s.host === location.host) && location.protocol !== "file:"; })();
  if (resuming) tryResumeSession();               // còn phiên LAN đang mở -> tự nối lại, khỏi hiện menu
  else if (!location.hash) openMenu();             // người chơi mới thấy ngay các chế độ, khỏi phải mò nút nhỏ

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
