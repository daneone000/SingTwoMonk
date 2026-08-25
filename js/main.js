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
    const abBadge = def.ability ? `<span class="tw-ab" title="${def.ability.name}">${def.ability.key}</span>` : "";   // TƯỚNG: huy hiệu phím kỹ năng
    b.innerHTML = `<span class="hk" data-act="${key}"></span><span class="tw-ic" style="background:${def.color}">${def.glyph}${abBadge}</span><span class="tw-nm">${def.name.replace("Tháp ", "").replace("Bẫy ", "B.")}</span><span class="tw-tg">${tag}</span><span class="tw-cost">💰${def.cost}</span>`;
    if (def.champion) b.classList.add("champion");   // CHIẾN DỊCH × LMHT: viền phân biệt tướng
    b.title = def.name + " — " + def.desc; b.onclick = () => game.setBuild(key); grid.appendChild(b); shopBtns[key] = b;
  }
  for (const k of CFG.TOWER_ORDER) addTower(k, CFG.TOWERS[k], false);
  for (const k of CFG.TRAP_ORDER) addTower(k, CFG.TRAPS[k], true);
  for (const k of CFG.CHAMPION_ORDER) addTower(k, CFG.TOWERS[k], false);   // CHIẾN DỊCH × LMHT: nút tướng (ẩn/hiện theo chế độ)
  // CHIẾN DỊCH: thử nạp ẢNH tướng ở img/champ/<key>.png (người dùng tự bỏ vào — ảnh mình có quyền). Không có -> tự dùng dáng chibi vẽ sẵn.
  STM.champSprites = {};
  for (const k of CFG.CHAMPION_ORDER) { const img = new Image(); img.onload = () => { STM.champSprites[k] = img; }; img.onerror = () => {}; img.src = "img/champ/" + k + ".png"; }

  /* ---------- PHÍM TẮT (người chơi cấu hình được, lưu localStorage) ---------- */
  //  • Tháp/bẫy: gán theo từng loại (KEYS)
  //  • Phép: gán theo 6 Ô (SLOT_KEYS). Phép học được xếp vào ô theo thứ tự cây kỹ năng;
  //    nhấn phím của ô -> thi triển phép đang nằm ở ô đó.
  const KB_LS = "stm.keys", SLOT_LS = "stm.skillslots", GACT_LS = "stm.gactionkeys";
  const RESERVED = new Set(["escape", "enter", "f2", " ", "tab"]);   // phím dành riêng, không gán được
  const GACT_DEF = { upgrade: "n", sell: "b" }, GACT_NAME = { upgrade: "Nâng cấp tháp", sell: "Bán / tháo tháp" }, GACT_GLYPH = { upgrade: "⬆", sell: "✖" };
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
  function loadGActKeys() {
    let s = {}; try { s = JSON.parse(localStorage.getItem(GACT_LS) || "{}"); } catch (e) {}
    const out = {}; for (const k in GACT_DEF) out[k] = (s && s[k] != null) ? s[k] : GACT_DEF[k];
    return out;
  }
  let KEYS = loadKeys(), SLOT_KEYS = loadSlotKeys(), GKEYS = loadGActKeys();
  const keyGlyph = (k) => !k ? "·" : k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k;
  let keyMap = {}, slotKeyMap = {}, gActKeyMap = {};
  function rebuildKeyMap() {
    keyMap = {}; for (const a in KEYS) if (KEYS[a]) keyMap[KEYS[a].toLowerCase()] = a;
    slotKeyMap = {}; SLOT_KEYS.forEach((k, i) => { if (k) slotKeyMap[k.toLowerCase()] = i; });
    gActKeyMap = {}; for (const a in GKEYS) if (GKEYS[a]) gActKeyMap[GKEYS[a].toLowerCase()] = a;
  }
  function persistKeys() { try { localStorage.setItem(KB_LS, JSON.stringify(KEYS)); localStorage.setItem(SLOT_LS, JSON.stringify(SLOT_KEYS)); localStorage.setItem(GACT_LS, JSON.stringify(GKEYS)); } catch (e) {} rebuildKeyMap(); refreshHotkeyBadges(); }
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
    const attr = kind === "slot" ? `data-slot="${id}"` : kind === "gact" ? `data-gact="${id}"` : `data-act="${id}"`;
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
    h += `</div><div class="kb-sec">Thao tác tháp (áp lên tháp đang chọn)</div><div class="kb-grid">`;
    for (const a in GACT_DEF) h += keyRow("gact", a, GACT_NAME[a], GACT_GLYPH[a], GKEYS[a]);
    h += `</div>`;
    $("keysBody").innerHTML = h;
    $("keysBody").querySelectorAll(".kb-key").forEach((btn) => {
      btn.onclick = () => {
        renderKeysModal();   // dọn trạng thái "đang chờ" cũ
        const cur = btn.dataset.gact != null ? { kind: "gact", id: btn.dataset.gact } : btn.dataset.slot != null ? { kind: "slot", id: +btn.dataset.slot } : { kind: "act", id: btn.dataset.act };
        kbCapture = cur;
        const sel = cur.kind === "slot" ? `.kb-key[data-slot="${cur.id}"]` : cur.kind === "gact" ? `.kb-key[data-gact="${cur.id}"]` : `.kb-key[data-act="${cur.id}"]`;
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
    // gỡ phím này khỏi mọi nơi khác (tháp/bẫy & ô phép & thao tác) để không trùng
    for (const a in KEYS) if ((KEYS[a] || "").toLowerCase() === norm) KEYS[a] = "";
    SLOT_KEYS.forEach((sk, i) => { if ((sk || "").toLowerCase() === norm) SLOT_KEYS[i] = ""; });
    for (const a in GKEYS) if ((GKEYS[a] || "").toLowerCase() === norm) GKEYS[a] = "";
    if (cap.kind === "slot") SLOT_KEYS[cap.id] = val; else if (cap.kind === "gact") GKEYS[cap.id] = val; else KEYS[cap.id] = val;
    kbCapture = null; persistKeys(); renderKeysModal();
    $("keysTip").textContent = "Đã lưu. Bấm ô khác để đổi tiếp, hoặc Xong.";
  }, true);
  $("btnCfg").onclick = () => { renderKeysModal(); $("keysTip").textContent = "Bấm ô phím của một tháp hoặc một Ô phép rồi nhấn phím mới để gán."; keysModal.classList.remove("hidden"); };
  $("keysClose").onclick = () => { kbCapture = null; keysModal.classList.add("hidden"); };
  $("keysReset").onclick = () => { KEYS = Object.assign({}, CFG.DEFAULT_KEYS); SLOT_KEYS = CFG.DEFAULT_SLOT_KEYS.slice(); GKEYS = Object.assign({}, GACT_DEF); persistKeys(); renderKeysModal(); $("keysTip").textContent = "Đã khôi phục phím mặc định (tháp 1–8, phép Q W E A S D, nâng N, bán B)."; };
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
  function afkText(g) {   // dòng mô tả AFK sống động: bậc hiện tại, còn mấy đợt sạch, vàng chờ, tổng đã nhận
    const i = g.afkInfo();
    const earned = `Tổng đã nhận: <b style="color:var(--gold)">${i.earned}</b>💰`;
    if (i.disabled) return `💤 Lõi AFK đã cạn (đã thưởng ${i.total}/${i.total} lần) — không còn thưởng nữa. ${earned}`;
    const tierTx = `lần ${i.stage + 1}/${i.total}: cần <b>${i.threshold}</b> đợt sạch`;
    if (i.acted) return `💤 Đã động tháp đợt này → chuỗi về 0 (${tierTx}). ${earned}`;
    return `💤 Còn <b>${i.need}</b> đợt sạch → thưởng <b style="color:var(--gold)">${i.pending}</b>💰 (${tierTx}, đã sạch ${i.clean}/${i.threshold}). ${earned}`;
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
  // COMBO LÕI: dải hiện các combo đang bật (2×/3×)
  let comboSig = "";
  function renderCombos(g) {
    const active = CFG.COMBO_GROUPS.filter((grp) => g.comboLevel(grp) >= 2);
    const sig = active.map((grp) => grp + g.comboLevel(grp)).join(",");
    if (sig === comboSig) return; comboSig = sig;
    const bar = $("comboBar");
    if (!active.length) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
    bar.classList.remove("hidden");
    bar.innerHTML = active.map((grp) => {
      const lvl = g.comboLevel(grp), c = CFG.COMBOS[grp];
      const lines = [`<b>2×</b> ${c.x2}`].concat(lvl >= 3 ? [`<b>3×</b> ${c.x3}`] : []);
      return `<div class="combo-item"><span class="combo-ic">${c.icon}</span><span class="combo-tx"><b>Combo ${grp} ${lvl}×</b>${lines.map((l) => `<small>${l}</small>`).join("")}</span></div>`;
    }).join("");
  }
  // TÚI GEM + nút đổi KN→vàng (combo 3× Kinh tế)
  let gemSig = "";
  function renderGemBar(g) {
    const total = Object.values(g.gemBag).reduce((a, b) => a + b, 0), eco3 = g.hasCombo("Kinh tế", 3);
    const sig = CFG.GEM_ORDER.map((k) => g.gemBag[k]).join(",") + "|" + (g.pendingGem || "") + "|" + (eco3 ? 1 : 0) + "|" + g.sp + "|" + g.gemMul();
    if (sig === gemSig) return; gemSig = sig;
    const bar = $("gemBar");
    if (total === 0 && !eco3) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
    bar.classList.remove("hidden");
    let html = "";
    if (total > 0) {
      html += `<div class="gem-title">💎 Túi gem <small>(chọn loại → bấm tháp để gắn · tối đa ${CFG.MAX_GEMS}/tháp · đủ 5 loại → ☯ Ngũ Hành ×${CFG.NGUHANH_MUL})</small></div><div class="gem-chips">`;
      for (const k of CFG.GEM_ORDER) { const n = g.gemBag[k]; if (!n) continue; const gd = CFG.GEMS[k]; html += `<button class="gem-chip${g.pendingGem === k ? " on" : ""}" data-gem="${k}" style="--gc:${gd.color}" title="${gd.name} — ${gd.desc(Math.round(gd.per * 100 * g.gemMul()))}">${gd.icon} ${gd.name} ×${n}</button>`; }
      html += `</div>`;
    }
    if (eco3) html += `<button id="spGoldBtn" class="sp-gold-btn"${g.sp >= CFG.SP_TO_GOLD_SP ? "" : " disabled"}>💱 Đổi ${CFG.SP_TO_GOLD_SP} KN → ${CFG.SP_TO_GOLD_GOLD}💰</button>`;
    bar.innerHTML = html;
    bar.querySelectorAll(".gem-chip").forEach((b) => { b.onclick = () => game.armGem(b.dataset.gem); });
    const sg = $("spGoldBtn"); if (sg) sg.onclick = () => { if (game.exchangeSpForGold()) log("💱 Đổi " + CFG.SP_TO_GOLD_SP + " KN → +" + CFG.SP_TO_GOLD_GOLD + " vàng.", "good"); };
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
      card.onclick = () => { if (game.pickCore(it.id)) { coreModal.classList.add("hidden"); log("Đã chọn lõi: " + def.name + " (" + c.name + ")", "good"); if (it.id === "dungHop") log("⚗ Dung Hợp: chọn 1 loại tháp ở cửa hàng rồi bấm XÂY ĐÈ lên 1 tháp đã có (1 lần/ván).", "ev"); if (net) { net.sendPCores(); net.sendCores(); }   /* khoe lõi vừa chọn cho đối thủ (ffa) / đồng đội (2v2) ngay */ game.emit(); } };
      coreCardsEl.appendChild(card);
    });
    coreModal.classList.remove("hidden");
  }
  $("coreCancel").onclick = () => { game.cancelCoreOffer(); coreModal.classList.add("hidden"); };
  coreModal.onclick = (e) => { if (e.target === coreModal) { game.cancelCoreOffer(); coreModal.classList.add("hidden"); } };
  // ===== COMBO 3× THÁP: chọn 1 loại tháp để cường hóa =====
  const BOON_DESC = {
    doc: "Độc trừ theo % MÁU TỐI ĐA (thay vì máu hiện tại) — xé boss/quái trâu mạnh hơn nhiều.",
    bang: "10% mỗi đòn → ĐÓNG BĂNG mục tiêu 1s.",
    lua: "15% mỗi đòn → THIÊU ĐỐT: 2%/giây MÁU ĐÃ MẤT trong 3s (càng bị đánh càng cháy mạnh).",
    ten: "Bắn ĐA MỤC TIÊU — số mục tiêu = cấp tháp (tối đa 5).",
    set: "Gây thêm sát thương theo KHOẢNG CÁCH tới mục tiêu (+10%/ô, không giới hạn).",
    nangluong: "Nhân đôi TẦM PHỦ buff (1.5 → 3.0 ô).",
  };
  const boonModal = $("boonModal"), boonCards = $("boonCards");
  game.onBoonOffer = () => renderBoonModal();
  function renderBoonModal() {
    boonCards.innerHTML = "";
    for (const type of CFG.TOWER_ORDER) {
      const def = CFG.TOWERS[type], card = document.createElement("button");
      card.className = "core-card"; card.style.setProperty("--tc", def.color);
      card.innerHTML = `<span class="cc-badge" style="background:${def.color}">Tháp</span><span class="cc-ic">${def.glyph}</span><span class="cc-name">${def.name}</span><span class="cc-group">Cường hóa</span><span class="cc-desc">${BOON_DESC[type]}</span>`;
      card.onclick = () => { if (game.pickTowerBoon(type)) { boonModal.classList.add("hidden"); log("🏰 Cường hóa " + def.name + " (combo 3× Tháp).", "good"); } };
      boonCards.appendChild(card);
    }
    boonModal.classList.remove("hidden");
  }

  /* ---------- WIKI tra cứu lõi ---------- */
  const coreWiki = $("coreWiki"), wikiBody = $("wikiBody");
  function renderWiki() {
    const TI = CFG.CORE_TIER_INFO;
    let html = `<p class="wiki-intro">Mỗi ván chọn tối đa <b>${CFG.MAX_CORES}</b> lõi — <b>ô 1 miễn phí</b>, ô 2/3 mở bằng <b>${CFG.CORE_UNLOCK_SP[1]}</b>/<b>${CFG.CORE_UNLOCK_SP[2]}</b> Điểm KN. Cấp bậc <b style="color:${TI.bac.color}">Bạc</b> &lt; <b style="color:${TI.vang.color}">Vàng</b> &lt; <b style="color:${TI.kimcuong.color}">Kim Cương</b> (mạnh dần), <b>ngẫu nhiên mỗi ván</b> nhưng <b>giống nhau giữa mọi người chơi</b>. Mở 1 ô → hiện 3 lõi cùng cấp bậc để chọn (riêng mỗi người).</p>`;
    for (const grp of ["Kinh tế", "Tháp", "Phòng thủ", "Phép", "Bản đồ"]) {
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
    // ===== COMBO LÕI =====
    html += `<div class="wiki-group">⚡ Combo Lõi (chọn 2/3 lõi CÙNG nhóm)</div>`;
    html += `<p class="wiki-intro">Chọn <b>2</b> hoặc <b>3</b> lõi cùng một nhóm sẽ mở khóa thưởng cộng thêm (cộng dồn: 3 lõi hưởng cả 2× lẫn 3×).</p>`;
    for (const grp of CFG.COMBO_GROUPS) {
      const c = CFG.COMBOS[grp];
      html += `<div class="wiki-core"><span class="wiki-ic">${c.icon}</span><div class="wiki-tx"><div class="wiki-nm">${grp}</div><div class="wiki-desc"><b>2×</b> ${c.x2}<br><b>3×</b> ${c.x3}</div></div></div>`;
    }
    // ===== GEM =====
    const gm = Math.round(CFG.GEM_PER * 100), gmHoa = Math.round(CFG.GEMS.hoa.per * 100);
    html += `<div class="wiki-group">💎 Gem (gắn vào tháp, tối đa ${CFG.MAX_GEMS}/tháp)</div>`;
    html += `<p class="wiki-intro">Nguồn gem DUY NHẤT: combo <b>2× Phòng thủ</b> (mỗi 2 quái lọt = 1 gem ngẫu nhiên). Combo <b>3× Phòng thủ</b> gấp đôi chỉ số gem. Mỗi gem +${gm}% (riêng Hoả +${gmHoa}%; gem cùng loại cộng dồn). Tối đa <b>${CFG.MAX_GEMS}</b> gem/tháp — ghép đủ <b>5 loại khác nhau</b> → <b>☯ Ngũ Hành</b>: ×${CFG.NGUHANH_MUL} hiệu quả mọi gem trên tháp đó.</p>`;
    for (const k of CFG.GEM_ORDER) {
      const gd = CFG.GEMS[k];
      html += `<div class="wiki-core"><span class="wiki-ic" style="color:${gd.color}">${gd.icon}</span><div class="wiki-tx"><div class="wiki-nm">Gem ${gd.name}</div><div class="wiki-desc">${gd.desc(Math.round(gd.per * 100))}</div></div></div>`;
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
    if (t.support && !t.fused) {   // Tháp Năng Lượng: BẢNG buff đầy đủ lv1→5 (tô đậm cấp hiện tại)
      const s = t.stats;
      const rows = t.def.lv.map((l, i) => `<div class="tp-lvrow${i + 1 === t.level ? " cur" : ""}"><span class="lc">Lv${i + 1}</span><span>ST <b class="plus">+${Math.round(l.dmgBonus * 100)}%</b></span><span>Tốc <b class="plus">+${Math.round(l.rateBonus * 100)}%</b></span></div>`).join("");
      return `<div class="tp-lvtable"><div class="tp-lvhead">Buff tháp bắn quanh · Tầm phủ <b>${s.range.toFixed(1)}</b> ô</div>${rows}</div>`;
    }
    // base = chỉ số GỐC tháp cầm nòng; "+bonus" gộp cả dung hợp (tháp kia) lẫn lõi (cm)
    const s = t.fused ? t.fstats : t.stats, raw = t.fused ? t.shooterStats : s, cm = t.coreMul(), om = t.origMul || 1, rm = 1 + (t.reinforce || 0);
    const base = Math.round(raw.dmg), bonus = Math.round(t.effDmg() - raw.dmg), sps = 1 / t.effRate(), spsBonus = sps - 1 / (raw.rate || 1);
    const rngBonus = s.range * rm - raw.range, splBonus = (s.splash || 0) * cm - (raw.splash || 0);   // tầm chỉ theo Gia Cố (Nguyên Bản không buff tầm)
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
  // Dòng gem của tháp đang chọn (ô trống + gem đã gắn)
  // Dòng dấu ấn Cấp 6 (siêu cấp)
  const L6_TEXT = {
    ten: "🏹 bắn ĐA MỤC TIÊU (= cấp tháp; +3 nếu có cường hóa Tên)",
    lua: "🔥 THIÊU ĐỐT: 2%/giây máu ĐÃ MẤT ×3s (×1.5 nếu có cường hóa Lửa)",
    bang: "❄ 1% mỗi đòn mini-stun 0.3s (CÓ loang)",
    set: "⚡ +0.1% máu HIỆN TẠI mỗi đòn (xé quái trâu/bay)",
    doc: "☠ độc 30% máu hiện tại (cường hóa Độc → %máu TỐI ĐA)",
    nangluong: "✦ buff mạnh hơn (×1.5)",
  };
  function l6LineHTML(t) { if (t.trap || t.level < 6) return ""; return `<div class="tp-l6">⭐ Cấp 6: ${L6_TEXT[t.type] || ""}</div>`; }
  // CHIẾN DỊCH × LMHT: khối kỹ năng tướng (mô tả + chỉ số theo CẤP + hồi chiêu còn lại)
  function abilityLineHTML(t) {
    const ab = t.def && t.def.ability; if (!ab) return "";
    const passive = ab.kind === "onhit_pct";
    const cd = Math.max(0, t.abilityCd || 0);
    const cdTxt = passive ? `NỘI TẠI (${(t._atk || 0) % ab.n}/${ab.n})` : cd > 0.05 ? `⏳ ${cd.toFixed(1)}s` : "✔ sẵn sàng";
    const cdMax = t.abVal(ab.cd);   // hồi chiêu theo cấp hiện tại
    const ad = ab.adMul ? ` +${Math.round(ab.adMul * 100)}% đòn đánh` : "";
    let stat = passive ? "nội tại" : `hồi chiêu <b>${cdMax}s</b>`;
    if (ab.kind === "multishot") stat += ` · <b>${t.abVal(ab.shots)}</b> mũi · ST nền <b>${t.abVal(ab.dmg)}</b>${ad}`;
    else if (ab.kind === "steroid_bounce") stat += ` · <b>${ab.dur}s</b> ×tốc <b>${t.abVal(ab.rateMul).toFixed(2)}</b> · nảy tối đa <b>${t.abVal(ab.bounces)}</b> (mỗi lần ${Math.round(t.abVal(ab.bouncePct) * 100)}% ST)`;
    else if (ab.kind === "steroid_pctdmg") stat += ` · <b>${ab.dur}s</b> · +<b>${(t.abVal(ab.pct) * 100).toFixed(0)}%</b> máu tối đa/đòn · +tầm <b>${t.abVal(ab.range)}</b>`;
    else if (ab.kind === "root_shot") stat += ` · trói <b>${t.abVal(ab.targets)}</b> mục tiêu <b>${t.abVal(ab.rootDur).toFixed(1)}s</b> · ST nền <b>${t.abVal(ab.dmg)}</b>${ad}`;
    else if (ab.kind === "area_nuke") stat += ` · nổ vùng <b>${t.abVal(ab.radius)}</b> ô${ab.atSelf ? " (quanh mình)" : ""} · ST nền <b>${t.abVal(ab.dmg)}</b>${ad}${ab.burn ? " · đốt" : ""}${ab.stun ? ` · choáng ${t.abVal(ab.stun)}s` : ""}`;
    else if (ab.kind === "spin") stat += ` · xoay kiếm vùng <b>${t.abVal(ab.radius)}</b> ô ×${ab.dur}s · <b>${t.abVal(ab.dps)}</b> ST/giây${ad} (DUY TRÌ)`;
    else if (ab.kind === "dot_field") stat += ` · vùng <b>${t.abVal(ab.radius)}</b> ô ×${ab.dur}s · <b>${t.abVal(ab.dps)}</b> ST/giây${ad}${ab.slowPct ? ` · chậm ${Math.round(t.abVal(ab.slowPct) * 100)}%` : ""}`;
    else if (ab.kind === "empower_next") stat += ` · đòn kế +ST nền <b>${t.abVal(ab.dmg)}</b>${ad}${ab.stack ? ` · cộng dồn <b>${t.qStacks || 0}</b> (+ST)` : ""}${ab.crit ? " · CHÍ MẠNG ×2" : ""}${ab.stun ? ` · choáng ${t.abVal(ab.stun)}s` : ""}`;
    else if (ab.kind === "pierce_line") stat += ` · xuyên hàng · ST nền <b>${t.abVal(ab.dmg)}</b>${ad}`;
    else if (ab.kind === "strike") stat += ` · ${ab.true ? "ST CHUẨN " : ""}1 mục tiêu${ab.dmg ? ` <b>${t.abVal(ab.dmg)}</b>` : ""}${ad}${ab.pctMax ? ` · +${Math.round(t.abVal(ab.pctMax) * 100)}% máu tối đa` : ""}${ab.stack ? ` · cộng dồn <b>${t.qStacks || 0}</b> (+ST)` : ""}${ab.execute ? " · hành quyết ×2" : ""}${ab.resetOnKill ? " · kết liễu reset" : ""}${ab.stun ? ` · choáng ${t.abVal(ab.stun)}s` : ""}`;
    else if (ab.kind === "pull") stat += ` · GIẬT NGƯỢC quái ĐÃ QUA (trong <b>${ab.grabRange}</b> ô) về · choáng <b>${t.abVal(ab.stun)}s</b> · ST <b>${t.abVal(ab.dmg)}</b>${ad}`;
    else if (ab.kind === "knockback") stat += ` · hất lùi <b>${t.abVal(ab.pushTiles)}</b> ô về cổng sinh · ST <b>${t.abVal(ab.dmg)}</b>${ad}`;
    else if (ab.kind === "onhit_pct") stat += ` · mỗi đòn thứ <b>${ab.n}</b>: +ST CHUẨN max(<b>${t.abVal(ab.flat)}</b>, ${Math.round(t.abVal(ab.pctMax) * 100)}% máu tối đa)`;
    else if (ab.kind === "place_trap") { const tr = ab.trap; stat += ` · tối đa <b>${t.abVal(ab.maxTraps)}</b> bẫy`; stat += tr.kind === "root" ? ` · trói <b>${t.abVal(tr.rootDur).toFixed(1)}s</b> + ST nền <b>${t.abVal(tr.dmg)}</b>${ad}` : ` · nổ vùng <b>${tr.radius}</b> ô · độc tổng <b>${t.abVal(tr.burnTotal)}</b>/${tr.burnDur}s + chậm ${Math.round(t.abVal(tr.slowPct) * 100)}%`; }
    return `<div class="tp-ability"><div class="ab-head"><span class="ab-key">${ab.key}</span> ${ab.name}<span class="ab-cd">${cdTxt}</span></div><div class="ab-desc">${ab.desc || ""}</div><div class="ab-desc">▸ Cấp ${t.level}: ${stat}</div></div>`;
  }
  function gemLineHTML(t) {
    if (t.trap || (t.def && t.def.champion)) return "";   // tướng (chiến dịch) không dùng hệ gem
    const gems = t.gems || [], slots = [];
    for (let i = 0; i < CFG.MAX_GEMS; i++) { const k = gems[i]; if (k) { const gd = CFG.GEMS[k]; slots.push(`<span class="tp-gem" style="--gc:${gd.color}" title="${gd.name}">${gd.icon}</span>`); } else slots.push(`<span class="tp-gem empty">◦</span>`); }
    const nh = t.nguHanh ? ` <span class="tp-nguhanh">☯ NGŨ HÀNH ×2</span>` : "";
    return `<div class="tp-gemline">💎 Gem: ${slots.join("")}${nh}</div>`;
  }
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
      if (!t) { const nx = g.nextWavePreview(); tp.innerHTML = `<div class="tp-empty">🏰 Chọn tháp/bẫy để xem chi tiết &amp; nâng cấp/bán (phím <b>H</b>: nút nâng/bán nhanh cạnh tháp). &nbsp;•&nbsp; Đợt sau: <b>${nx.name}</b> ×${nx.count}${nx.boss ? " (BOSS)" : nx.fly ? " (bay)" : ""}</div>`; return; }
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
    $("tpStats").innerHTML = statsHTML(t) + l6LineHTML(t) + abilityLineHTML(t) + gemLineHTML(t);
    $("tpPrev").innerHTML = (t.ready && !t.trap && !t.maxLevel) ? upgradePreviewHTML(t) : "";
    const bu = $("tpUp");
    if (t.trap) { bu.textContent = "Không nâng cấp"; bu.disabled = true; bu.className = "tp-up"; }
    else if (!t.ready) { const lab = t.action === "sell" ? "Đang tháo dỡ" : t.action === "up" ? "Đang nâng cấp" : "Đang xây"; bu.textContent = `⏳ ${lab}… ${Math.ceil(t.buildTimer)}s`; bu.disabled = true; bu.className = "tp-up poor"; }
    else if (t.maxLevel) { bu.textContent = t.def.lv.length === 1 ? "Không nâng cấp" : `Đã tối đa (${t.def.lv.length})`; bu.disabled = true; bu.className = "tp-up"; }
    // KHÔNG disable theo vàng (tránh chớp nháy disabled nuốt click); chỉ tô mờ, upgradeSelected tự chặn nếu thiếu vàng
    else { const uc = g.buyCost(t.upgradeCost), afford = g.gold >= uc; bu.textContent = `Nâng Cấp −${uc}💰`; bu.disabled = false; bu.className = "tp-up" + (afford ? "" : " poor"); }
    const sb = $("tpSell");
    if (!t.trap && t.action === "sell") { sb.textContent = "Đang tháo dỡ…"; sb.disabled = true; }
    else { sb.textContent = `Bán +${g.sellRefund(t)}💰`; sb.disabled = false; }
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
    else { sw.textContent = `⏭ Gọi đợt ${g.wave + 1}` + (g.autoNext ? ` (còn ${Math.ceil(g.waveTimer)}s)` : ""); sw.disabled = false; }
    if (match) renderOpp();
    if (match && match.mode === "2v2") renderMateSkills();
    const activeShop = g.campaign ? CFG.CHAMPION_ORDER.filter((k) => !g.campaignUnlocked || g.campaignUnlocked.includes(k)) : [...CFG.TOWER_ORDER, ...CFG.TRAP_ORDER];   // chiến dịch: chỉ TƯỚNG đã mở khóa; còn lại: THÁP + BẪY
    const activeSet = new Set(activeShop);
    for (const k in shopBtns) { const b = shopBtns[k]; const on = activeSet.has(k); b.classList.toggle("hidden", !on); if (!on) continue;
      const def = CFG.TOWERS[k] || CFG.TRAPS[k], cost = g.buyCost(def.cost);
      b.classList.toggle("active", g.buildType === k); b.classList.toggle("cant", g.gold < cost);
      const sale = cost < def.cost; b.classList.toggle("sale", sale);   // Black Friday: giá giảm
      const cs = b.querySelector(".tw-cost"); const txt = "💰" + cost; if (cs.textContent !== txt) cs.textContent = txt;
    }
    maybeRenderCores(g); updateAfkLive(g); renderCombos(g); renderGemBar(g);
    if (g.boonPending && !g.towerBoon && boonModal.classList.contains("hidden")) renderBoonModal();   // 3x Tháp: đảm bảo modal chọn cường hóa hiện
    { const sig = g.learned.size + ":" + [...g.learned].sort().join(","); if (sig !== lastLearned) { renderSkills(g); lastLearned = sig; } }   // render lại khi TẬP phép đổi (kể cả đổi phép giữ nguyên số lượng)
    for (const b of skillGrid.querySelectorAll(".sk-btn")) { const k = b.dataset.key, s = CFG.SKILLS[k], cd = g.skillCd[k] || 0, pvpLock = s.aim === "pvp" && !g.versus; b.classList.toggle("active", g.pendingSkill === k); b.classList.toggle("cant", pvpLock || cd > 0); b.querySelector(".cd").textContent = cd > 0 ? cd.toFixed(0) : "";
      const swappable = g.canSwap() && cd > 0; b.classList.toggle("swappable", swappable); if (swappable) b.title = s.name + " — 🎩 đang hồi chiêu: bấm để ĐỔI sang phép khác"; }
    if (!modal.classList.contains("hidden")) renderTree();
    { const can = hasLearnable(g); $("btnTree").classList.toggle("can-learn", can); $("btnTree2").classList.toggle("can-learn", can); }
    $("btnPause").textContent = g.paused ? "▶ Tiếp" : "⏸ Dừng"; $("btnSpeed").textContent = "⏩ x" + g.speed;
    canvas.style.cursor = g.pendingGem ? CORE_CURSOR : g.pendingPing ? "crosshair" : g.pendingMove ? "move" : g.pendingCore ? CORE_CURSOR : g.pendingSkill ? AIM_CURSOR : g.buildType ? "cell" : "crosshair";  // con trỏ đổi: gắn gem / chờ ping / dời tháp / chờ Gia Cố / chờ mục tiêu phép / khi xây
    for (const b of coopPingBtns) b.classList.toggle("on", g.pendingPing === b.dataset.kind);
    renderTowerPanel(g); positionTowerQuick(g);
    if (g.wave !== prevWave && g.wave > 0) { log("Đợt " + g.wave + " bắt đầu", "ev"); prevWave = g.wave; }
    if (g.lives < prevLives) { log("Quái lọt cửa Tử! Còn " + g.lives + " mạng", "warn"); prevLives = g.lives; }
    if ((g.gameOver || g.victory) && !prevEnd) { log(g.victory ? "CHIẾN THẮNG!" : "THẤT THỦ!", g.victory ? "good" : "warn"); prevEnd = true; }
  }
  game.onChange = updateHUD;
  game.onCoreLog = (m) => log(m, "good");   // lõi AFK báo thưởng vàng

  /* ---------- nút NÂNG/BÁN nhanh nổi cạnh tháp đang chọn ---------- */
  const towerQuick = $("towerQuick"), tqUp = $("tqUp"), tqSell = $("tqSell");
  let showQuick = false;   // nút nâng/bán nổi cạnh tháp: mặc định ẩn, bật/tắt bằng phím H
  tqUp.onpointerdown = (e) => { if (e.button !== 0) return; e.preventDefault(); game.upgradeSelected(); };
  tqSell.onpointerdown = (e) => { if (e.button !== 0) return; e.preventDefault(); game.sellSelected(); };
  function positionTowerQuick(g) {
    const t = g.selected;
    const show = showQuick && t && t.col != null && !g.buildType && !g.pendingSkill && !g.pendingCore && !g.pendingMove && !g.pendingPing && !g.gameOver && !g.victory;
    towerQuick.classList.toggle("hidden", !show);
    if (!show) return;
    // định vị theo canvas THẬT (bù padding/border của .canvas-wrap + tỉ lệ co giãn)
    // đặt BÊN PHẢI tháp (dịch mốc sang phải ~nửa ô), căn giữa theo chiều dọc (CSS translateY -50%)
    const scale = canvas.clientWidth / CFG.CANVAS_W;
    towerQuick.style.left = (canvas.offsetLeft + canvas.clientLeft + (t.x + CFG.MARGIN + CFG.TILE * 0.6) * scale) + "px";
    towerQuick.style.top = (canvas.offsetTop + canvas.clientTop + (t.y + CFG.MARGIN) * scale) + "px";
    const canUp = !t.trap && !t.maxLevel && t.ready;
    tqUp.classList.toggle("hidden", !!t.trap);   // bẫy không nâng cấp -> ẩn nút nâng
    tqUp.disabled = !canUp;
    tqUp.title = t.trap ? "" : canUp ? ("Nâng cấp (phím " + keyGlyph(GKEYS.upgrade) + ") −" + g.buyCost(t.upgradeCost) + "💰") : t.maxLevel ? "Đã tối đa cấp" : "Đang bận";
    tqSell.title = (t.action === "sell" ? "Đang tháo dỡ" : "Bán (phím " + keyGlyph(GKEYS.sell) + ") +" + g.sellRefund(t) + "💰");
  }

  /* ---------- 2v2: PHỐI HỢP — Ping (đánh dấu ô) + Chat ---------- */
  const coopPingBtns = [...document.querySelectorAll(".cb-ping")];
  coopPingBtns.forEach((b) => { b.onclick = () => game.setPing(b.dataset.kind); });
  game.onPing = (kind, mine) => { const p = CFG.PINGS[kind]; log((mine ? "📍 Bạn đánh dấu: " : "📍 Đồng đội: ") + (p ? p.icon + " " + p.label : kind), mine ? "ev" : "good"); };
  game.onGem = (kind) => { const gd = CFG.GEMS[kind]; log("💎 Nhận gem " + (gd ? gd.icon + " " + gd.name : kind) + " — chọn tháp để gắn.", "good"); };
  game.onSpellRefund = (key, amt) => { const s = CFG.SKILLS[key]; if (s) log("🎩 Combo Phép: hồi " + amt.toFixed(0) + "s hồi chiêu " + s.name + ".", "ev"); };
  const coopChat = $("coopChat"), ccText = $("ccText"), ccQuick = $("ccQuick"), bubbleBox = $("coopBubbles");
  CFG.QUICKCHAT.forEach((m, i) => { const b = document.createElement("button"); b.textContent = m; b.onclick = () => sendChat(i, null); ccQuick.appendChild(b); });
  $("cbChatToggle").onclick = () => { const nowHidden = coopChat.classList.toggle("hidden"); $("cbChatToggle").classList.toggle("on", !nowHidden); if (!nowHidden) ccText.focus(); };
  $("ccSend").onclick = () => { const t = ccText.value.trim(); if (t) { sendChat(null, t); ccText.value = ""; } };
  ccText.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const t = ccText.value.trim(); if (t) { sendChat(null, t); ccText.value = ""; } } });
  function mateNameOf() { return (match && match.teammate && match.teammate.name) || "Đồng đội"; }
  function sendChat(i, text) { const msg = text != null ? text : CFG.QUICKCHAT[i]; if (!msg || !net) return; net.sendChat(text != null ? undefined : i, text != null ? text : undefined); showBubble(PLAYER, msg, true); log("💬 Bạn: " + msg, "ev"); }
  function onChatIn(i, text) { const msg = text != null && text !== "" ? text : CFG.QUICKCHAT[i]; if (!msg) return; showBubble(mateNameOf(), msg, false); log("💬 " + mateNameOf() + ": " + msg, "good"); }
  function showBubble(name, msg, mine) {
    if (!bubbleBox) return;
    const d = document.createElement("div"); d.className = "coop-bubble" + (mine ? " me" : "");
    d.innerHTML = "<b>" + esc(name) + ":</b> " + esc(msg); bubbleBox.appendChild(d);
    while (bubbleBox.children.length > 4) bubbleBox.removeChild(bubbleBox.firstChild);
    setTimeout(() => { d.classList.add("fade"); setTimeout(() => { if (d.parentNode) d.remove(); }, 500); }, 4500);
  }

  /* ========== CHIẾN DỊCH × LMHT: trạng thái + ladder + bộ sưu tập ========== */
  const CAMPAIGN_LS = "stm.campaign";
  function loadCampaign() {
    let s = null; try { s = JSON.parse(localStorage.getItem(CAMPAIGN_LS) || "null"); } catch (e) {}
    if (!s || typeof s !== "object") s = {};
    return {
      unlocked: Array.isArray(s.unlocked) && s.unlocked.length ? s.unlocked.slice() : CFG.CAMPAIGN_START.slice(),
      cleared: Array.isArray(s.cleared) ? s.cleared.slice() : [],
      points: s.points | 0,
      mastery: (s.mastery && typeof s.mastery === "object") ? Object.assign({}, s.mastery) : {},
    };
  }
  let campaign = loadCampaign();
  function saveCampaign() { try { localStorage.setItem(CAMPAIGN_LS, JSON.stringify(campaign)); } catch (e) {} }
  const stageAvailable = (st) => st.id === 1 || campaign.cleared.includes(st.id - 1);
  const stageCleared = (st) => campaign.cleared.includes(st.id);

  const campaignModal = $("campaignModal");
  function openCampaign() { closeMenu(); renderCampaign(); campaignModal.classList.remove("hidden"); }
  function closeCampaign() { campaignModal.classList.add("hidden"); }
  $("campClose").onclick = closeCampaign;

  // Tóm tắt kỹ năng (kiêm tra cứu) theo loại — số liệu gốc LMHT
  function champAbilitySummary(c) {
    const ab = c.ability, v = (x) => Array.isArray(x) ? `${x[0]}→${x[x.length - 1]}` : x;
    const cd = !ab.cd ? "nội tại" : Array.isArray(ab.cd) ? (ab.cd[0] === ab.cd[ab.cd.length - 1] ? `${ab.cd[0]}s` : `${ab.cd[0]}→${ab.cd[ab.cd.length - 1]}s`) : `${ab.cd}s`;
    let eff = "";
    if (ab.kind === "multishot") eff = `${ab.shots} mũi đa mục tiêu, ST ${v(ab.dmg)} (+${Math.round(ab.adMul * 100)}% đòn đánh) + làm chậm`;
    else if (ab.kind === "steroid_bounce") eff = `${ab.dur}s: +tốc ${Math.round((ab.rateMul[0] - 1) * 100)}→${Math.round((ab.rateMul[4] - 1) * 100)}%, nảy tối đa ${ab.bounces} (mỗi lần ${Math.round(ab.bouncePct[0] * 100)}→${Math.round(ab.bouncePct[4] * 100)}% ST)`;
    else if (ab.kind === "steroid_pctdmg") eff = `${ab.dur}s: +tầm, mỗi đòn +${Math.round(ab.pct[0] * 100)}→${Math.round(ab.pct[4] * 100)}% máu tối đa (xé trâu/bay)`;
    else if (ab.kind === "root_shot") eff = `trói ${ab.targets} mục tiêu ${v(ab.rootDur)}s, ST ${v(ab.dmg)}`;
    else if (ab.kind === "area_nuke") eff = `nổ vùng ${ab.radius} ô${ab.atSelf ? " quanh mình" : ""}, ST ${v(ab.dmg)}${ab.burn ? " + thiêu đốt" : ""}${ab.stun ? ` + choáng ${v(ab.stun)}s` : ""}`;
    else if (ab.kind === "spin") eff = `XOAY KIẾM quanh mình ${ab.radius} ô trong ${ab.dur}s, mỗi giây ${v(ab.dps)} ST${ab.adMul ? ` (+${Math.round(ab.adMul * 100)}% đòn đánh)` : ""}`;
    else if (ab.kind === "dot_field") eff = `vùng ${ab.radius} ô ×${ab.dur}s: ${v(ab.dps)} ST/giây${Array.isArray(ab.slowPct) ? ` + làm chậm ${Math.round(ab.slowPct[0] * 100)}→${Math.round(ab.slowPct[4] * 100)}%` : ""}`;
    else if (ab.kind === "pierce_line") eff = `xuyên cả hàng, ST ${v(ab.dmg)} (+${Math.round(ab.adMul * 100)}% đòn đánh)`;
    else if (ab.kind === "strike") eff = `đòn ${ab.true ? "CHUẨN " : ""}1 mục tiêu${ab.dmg ? ` ST ${v(ab.dmg)}` : ""}${ab.adMul ? ` (+${Math.round(ab.adMul * 100)}% đòn đánh)` : ""}${ab.pctMax ? ` +${Math.round(v(ab.pctMax) * 100)}% máu tối đa` : ""}${ab.stack ? ` · KẾT LIỄU +cộng dồn ST vĩnh viễn` : ""}${ab.execute ? " · máu thấp ×2" : ""}${ab.resetOnKill ? " · kết liễu → reset hồi chiêu" : ""}${ab.stun ? ` · choáng ${v(ab.stun)}s` : ""}`;
    else if (ab.kind === "empower_next") eff = `cường hóa đòn đánh kế +ST ${v(ab.dmg)}${ab.adMul ? ` (+${Math.round(ab.adMul * 100)}% đòn đánh)` : ""}${ab.stack ? " · KẾT LIỄU +cộng dồn ST vĩnh viễn" : ""}${ab.crit ? " chí mạng ×2" : ""}${ab.stun ? ` + choáng ${v(ab.stun)}s` : ""}`;
    else if (ab.kind === "pull") eff = `GIẬT NGƯỢC quái đã đi qua (trong ${ab.grabRange} ô) về sau + choáng ${v(ab.stun)}s, ST ${v(ab.dmg)}`;
    else if (ab.kind === "knockback") eff = `hất quái LÙI ${v(ab.pushTiles)} ô về phía cổng sinh + ST ${v(ab.dmg)}`;
    else if (ab.kind === "onhit_pct") eff = `NỘI TẠI: mỗi đòn thứ ${ab.n} +ST CHUẨN max(${v(ab.flat)}, ${Math.round(ab.pctMax[0] * 100)}→${Math.round(ab.pctMax[4] * 100)}% máu tối đa)`;
    else if (ab.kind === "place_trap") eff = ab.trap.kind === "root" ? `đặt bẫy TRÓI ${v(ab.trap.rootDur)}s (tối đa ${v(ab.maxTraps)} bẫy)` : `đặt nấm NỔ VÙNG độc + chậm (tối đa ${v(ab.maxTraps)})`;
    return `⏱ hồi ${cd} · ${eff}`;
  }

  function renderCampaign() {
    $("campPoints").textContent = "★ Điểm nội tại: " + campaign.points;
    // --- ladder ---
    const sh = CFG.CAMPAIGN.map((st) => {
      const cleared = stageCleared(st), avail = stageAvailable(st);
      const rw = st.reward ? CFG.CHAMPIONS[st.reward] : null;
      const status = cleared ? `<span class="camp-ok">✔ Đã qua</span>` : avail ? `<span class="camp-go">▶ Sẵn sàng</span>` : `<span class="camp-lock">🔒 Khóa</span>`;
      const rwHtml = rw ? `<span class="camp-reward" title="Mở khóa ${rw.name}"><span class="tw-ic" style="background:${rw.color}">${rw.glyph}</span></span>` : `<span class="camp-reward camp-final">🏁</span>`;
      const btn = (cleared || avail) ? `<button class="camp-play" data-stage="${st.id}">${cleared ? "Chơi lại" : "Chơi"}</button>` : "";
      return `<div class="camp-stage${avail && !cleared ? " next" : ""}${cleared ? " done" : ""}"><div class="camp-stage-main"><div class="camp-stage-name">Màn ${st.id}: ${st.name}</div><div class="camp-stage-desc">${st.desc} · mục tiêu đợt <b>${st.target}</b></div></div>${rwHtml}<div class="camp-stage-act">${status}${btn}</div></div>`;
    }).join("");
    $("campStages").innerHTML = sh;
    for (const b of $("campStages").querySelectorAll(".camp-play")) b.onclick = () => { const st = CFG.CAMPAIGN.find((s) => s.id === +b.dataset.stage); if (st) startStage(st); };
    // --- collection / mastery (kiêm tra cứu kỹ năng), chia nhóm Tay dài / Cận chiến ---
    const champCard = (k) => {
      const c = CFG.CHAMPIONS[k], on = campaign.unlocked.includes(k), lv = campaign.mastery[k] | 0;
      const stars = Array.from({ length: CFG.MASTERY_MAX }, (_, i) => `<span class="ms-dot${i < lv ? " on" : ""}">●</span>`).join("");
      const unlockAt = CFG.CAMPAIGN.find((s) => s.reward === k);
      const upBtn = (on && lv < CFG.MASTERY_MAX && campaign.points > 0) ? `<button class="camp-up" data-champ="${k}">Nâng ▲ (1 điểm)</button>` : "";
      const lock = on ? "" : `<div class="camp-champ-lock">🔒 Mở ở màn ${unlockAt ? unlockAt.id : "?"}</div>`;
      const tgt = c.target === "both" ? "Bay+Bộ" : c.target === "air" ? "Bay" : "Bộ";
      return `<div class="camp-champ${on ? "" : " locked"}"><div class="camp-champ-head"><span class="tw-ic" style="background:${c.color}">${c.glyph}</span><div><div class="camp-champ-nm">${c.name} <span class="camp-champ-tg">${tgt}</span></div><div class="camp-champ-ab">[${c.ability.key}] ${c.ability.name}</div></div></div><div class="camp-champ-sum">${champAbilitySummary(c)}</div><div class="camp-stars">${stars} <span class="ms-buff">+${Math.round(lv * CFG.MASTERY_PER * 100)}% ST/tốc</span></div>${upBtn}${lock}</div>`;
    };
    const grp = (label, order) => `<div class="camp-grp">${label}</div>` + order.map(champCard).join("");
    $("campChamps").innerHTML = grp(`🏹 Tay dài (${CFG.RANGED_ORDER.length})`, CFG.RANGED_ORDER) + grp(`⚔ Cận chiến — chỉ đánh Bộ (${CFG.MELEE_ORDER.length})`, CFG.MELEE_ORDER);
    for (const b of $("campChamps").querySelectorAll(".camp-up")) b.onclick = () => { const k = b.dataset.champ; if (campaign.points > 0 && (campaign.mastery[k] | 0) < CFG.MASTERY_MAX) { campaign.mastery[k] = (campaign.mastery[k] | 0) + 1; campaign.points--; saveCampaign(); renderCampaign(); } };
  }

  function startStage(st) {
    closeCampaign(); CFG.setMap(st.map);
    newGame("campaign");
    game.campaignStageId = st.id; game.campaignTarget = st.target;
    game.campaignUnlocked = campaign.unlocked.slice(); game.champMastery = Object.assign({}, campaign.mastery);
    game.onCampaignWin = onCampaignWin;
    log(`⚔ Màn ${st.id}: ${st.name} — trụ tới hết đợt ${st.target}. Tướng mở khóa: ${game.campaignUnlocked.length}.`, "good");
    game.emit();
  }

  function onCampaignWin(stageId) {
    const st = CFG.CAMPAIGN.find((s) => s.id === stageId); if (!st) return;
    const first = !campaign.cleared.includes(stageId);
    if (first) {
      campaign.cleared.push(stageId); campaign.points += CFG.MASTERY_REWARD;
      if (st.reward && !campaign.unlocked.includes(st.reward)) { campaign.unlocked.push(st.reward); log(`🎉 Mở khóa tướng mới: ${CFG.CHAMPIONS[st.reward].name}!`, "good"); }
      log(`🏆 Qua màn ${st.id}! +${CFG.MASTERY_REWARD} điểm nội tại.`, "good");
      saveCampaign();
    } else log(`🏆 Qua lại màn ${st.id}.`, "good");
    setTimeout(() => openCampaign(), 900);   // mở lại màn chọn để chơi tiếp / nâng nội tại
  }

  /* ---------- điều khiển ---------- */
  $("startWave").onclick = () => game.startWave();
  $("btnPause").onclick = () => { if (net) return; game.paused = !game.paused; game.emit(); };
  $("btnSpeed").onclick = () => { game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 3 : 1; game.emit(); };
  function syncAuto() { $("btnAuto").classList.toggle("on", game.autoNext); $("btnAuto").textContent = "Tự động: " + (game.autoNext ? "BẬT" : "TẮT"); syncDbAuto(); }
  $("btnAuto").onclick = () => { game.autoNext = !game.autoNext; syncAuto(); };

  /* ---------- SÂN THỬ (design): thả/xóa quái & tháp tự do ---------- */
  function dbWaveVal() { const v = parseInt($("dbWave").value, 10); return Math.max(1, Math.min(60, isNaN(v) ? 1 : v)); }
  $("dbSpawn").onclick = () => { const n = dbWaveVal(); game.spawnWaveAt(n); log("🐾 Thả đợt " + n + " để thử.", "ev"); };
  $("dbAuto").onclick = () => { game.autoNext = !game.autoNext; if (game.autoNext && !game.started) game.spawnWaveAt(dbWaveVal()); syncAuto(); };
  $("dbClearMobs").onclick = () => { game.clearEnemies(); log("🧹 Đã xóa hết quái.", "ev"); };
  $("dbClearTowers").onclick = () => { game.clearBoard(); log("💣 Đã xóa hết tháp — vẽ lại mê cung.", "ev"); };
  function syncDbAuto() { const b = $("dbAuto"); if (!b) return; b.classList.toggle("on", game.autoNext); b.textContent = game.autoNext ? "⏸ Dừng thả" : "▶ Thả liên tục"; }
  const MODE_NAME = { design: "Sân Thử Nghiệm", endless: "Sinh Tồn Vô Tận", campaign: "Chiến Dịch × LMHT" };
  function newGame(mode) { endVersus(); game.reset(mode); syncAuto(); lastLearned = -1; treeSel = null; prevWave = 0; prevLives = CFG.START_LIVES; prevEnd = false; coreSig = ""; comboSig = ""; gemSig = ""; coreModal.classList.add("hidden"); boonModal.classList.add("hidden"); logBox.innerHTML = ""; document.body.classList.toggle("design", mode === "design"); document.body.classList.toggle("campaign", mode === "campaign"); log("Ván mới: " + (MODE_NAME[mode] || MODE_NAME.endless) + " — bản đồ " + CFG.curMap().name, "good"); if (mode === "campaign") log("⚔ Chiến Dịch × LMHT: chọn TƯỚNG thay cho tháp. Kỹ năng tự thi triển khi hết hồi chiêu.", "ev"); if (mode === "design") { $("dbWave").value = 1; log("🧪 Sân thử: vàng & KN vô hạn. Bấm 🐾 Thả đợt để thử, 💣 Xóa hết tháp để vẽ lại mê cung.", "ev"); } }
  $("modeEndless").onclick = () => newGame("endless");
  $("modeCampaign").onclick = () => openCampaign();
  $("modeDesign").onclick = () => newGame("design");
  $("btnRestart").onclick = () => { if (match && !match.net) startVersus(vsPlayers()); else newGame(game.mode || "endless"); };

  window.addEventListener("keydown", (e) => {
    if (e.key === "F2") { e.preventDefault(); modal.classList.contains("hidden") ? openTree() : closeTree(); return; }
    if (e.key === "Escape") { if (!campaignModal.classList.contains("hidden")) return closeCampaign(); if (!modal.classList.contains("hidden")) return closeTree(); if (!rules.classList.contains("hidden")) return rules.classList.add("hidden"); if (!mainMenu.classList.contains("hidden")) return closeMenu(); if (!coreWiki.classList.contains("hidden")) return coreWiki.classList.add("hidden"); if (!coreModal.classList.contains("hidden")) { game.cancelCoreOffer(); return coreModal.classList.add("hidden"); } game.buildType = null; game.selected = null; game.pendingSkill = null; game.pendingCore = null; game.pendingMove = null; game.pendingPing = null; game.pendingGem = null; game.emit(); return; }
    if (kbCapture) return;                                   // đang chờ gán phím -> modal xử lý
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;   // đang gõ chữ -> bỏ qua
    if (e.key === " ") { e.preventDefault(); if (!net) { game.paused = !game.paused; game.emit(); } }
    else if (e.key === "Enter") game.startWave();
    else {
      const kk = e.key.toLowerCase();
      const ga = gActKeyMap[kk];
      if (ga) { if (ga === "upgrade") game.upgradeSelected(); else if (ga === "sell") game.sellSelected(); return; }   // phím nâng cấp / bán tháp đang chọn
      const a = keyMap[kk];
      if (a) { game.setBuild(a); return; }                  // phím tháp/bẫy
      const si = slotKeyMap[kk];
      if (si != null) { const k = skillInSlot(game, si); if (k) game.armSkill(k); return; }   // phím ô phép
      if (kk === "h") { showQuick = !showQuick; log(showQuick ? "🔘 Hiện nút nâng/bán cạnh tháp (H để ẩn)." : "🔘 Ẩn nút nâng/bán cạnh tháp (H để hiện).", "ev"); game.emit(); return; }
      if (kk === "v" && game.t2) game.setPing("build");     // 2v2: phím V đánh dấu "Xây đây"
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
  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])));
  let curTab = "AI";
  // 3 trạng thái của tab Mạng LAN: "connect" (nhập tên/kiểm tra máy chủ) | "rooms" (duyệt phòng) | "lobby" (đã trong 1 phòng)
  let lanState = "connect";
  function setLanView(state) {
    lanState = state;
    $("vsLanConnect").classList.toggle("hidden", state !== "connect");
    $("vsLanRooms").classList.toggle("hidden", state !== "rooms");
    $("vsLanLobby").classList.toggle("hidden", state !== "lobby");
    $("vsLanJoin").classList.toggle("hidden", state !== "connect");
    $("vsLanStart").classList.toggle("hidden", state !== "lobby" || !(net && net.isHost));
    $("vsLanLeave").classList.toggle("hidden", state === "connect");
    $("vsLanLeave").textContent = state === "rooms" ? "Ngắt kết nối" : "Rời phòng";
    // trong phòng LAN: chỉ CHỦ PHÒNG được chọn bản đồ (bản đồ theo chủ phòng)
    $("vsMaps").classList.toggle("locked", state === "lobby" && !(net && net.isHost));
  }
  function showTab(tab) {
    curTab = tab; const lan = tab === "LAN";
    $("vsTabAI").classList.toggle("on", !lan); $("vsTabLAN").classList.toggle("on", lan);
    $("vsPanelAI").classList.toggle("hidden", lan); $("vsPanelLAN").classList.toggle("hidden", !lan);
    $("vsStart").classList.toggle("hidden", lan);
    if (lan) setLanView(lanState);
    else { $("vsLanJoin").classList.add("hidden"); $("vsLanStart").classList.add("hidden"); $("vsLanLeave").classList.add("hidden"); }
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
        `<div class="omap"><span class="oname">${v.name}</span><small class="ostat">Đợt ${v.wave} · 💀${v.lives}</small><div class="opp-cores"></div></div>`;
      box.appendChild(el); oppCanvas[v.pid] = { cv: el.querySelector(".omini"), stat: el.querySelector(".ostat"), cores: el.querySelector(".opp-cores"), coreSig: "", el };
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
      if (o.cores) { const sig = (v.cores || []).map((c) => c.id + c.tier).join(","); if (sig !== o.coreSig) { o.coreSig = sig; o.cores.innerHTML = coreChips(v.cores); } }   // lõi đối thủ (chỉ vẽ lại khi đổi)
    }
  }
  // dãy icon lõi (dùng chung: ô đối thủ + panel đồng đội). empty = chữ khi chưa chọn lõi nào.
  function coreChips(cores, empty) {
    if (!cores || !cores.length) return empty ? `<span class="mate-empty">${empty}</span>` : "";
    return cores.map((c) => { const d = CFG.CORES[c.id]; if (!d) return ""; const ti = CFG.CORE_TIER_INFO[c.tier] || CFG.CORE_TIER_INFO.bac;
      return `<span class="core-chip" style="border-color:${ti.color};color:${ti.color}" title="${d.name} · ${ti.name}">${d.icon}</span>`; }).join("");
  }

  function startVersus(players) {
    endVersus();
    match = new STM.Match(game, players);
    match.onEnd = (m) => showResult(m);
    document.body.classList.remove("design"); document.body.classList.add("versus");
    syncAuto(); lastLearned = -1; treeSel = null; prevWave = 0; prevLives = CFG.START_LIVES; prevEnd = false; logBox.innerHTML = "";
    buildOppList();
    log("Trận đối kháng bắt đầu! " + players.length + " người chơi.", "good");
    log("Đợt đầu sau " + CFG.VS_START_DELAY + "s — các đợt đồng bộ, không gọi trước được.", "ev");
    match.begin(); game.emit();
  }
  function endVersus() {
    reconnecting = false; reconnBanner(false); if (reconnTimer) clearTimeout(reconnTimer);
    if (net) { net.leave(); net = null; }
    lanState = "connect";
    if (!match) return; match = null;
    document.body.classList.remove("versus", "netplay", "team2v2", "design");
    $("mateSkills").classList.add("hidden");
    $("oppList").innerHTML = OPP.map((n) => `<div class="opp"><div class="oface">?</div><div class="omap"><span class="oname">${n}</span><small>Đối kháng<br>(chọn ⚔ để chơi)</small></div></div>`).join("");
  }

  /* ---------- MẠNG LAN ---------- */
  let net = null;
  // Danh sách phòng (nhiều phòng cùng lúc) — hiện tên người đã join sẵn mỗi phòng.
  function renderRooms(m) {
    const rs = m.rooms || [];
    $("vsRoomsCount").textContent = `(${rs.length})`;
    if (!rs.length) {
      $("vsRoomsList").innerHTML = `<div class="vs-empty-team">Chưa có phòng nào — bấm “＋ Tạo phòng mới” để mở phòng.</div>`;
      $("vsRoomsMsg").textContent = "Chưa có phòng nào đang mở. Tạo phòng mới để bắt đầu.";
      return;
    }
    $("vsRoomsList").innerHTML = rs.map((r) => {
      const names = r.players.length
        ? r.players.map((p) => `<b>${esc(p.name)}</b>${p.host ? " 👑" : ""}`).join(", ")
        : "— chưa có ai —";
      const badge = r.mode === "2v2" ? "2v2" : "Cá nhân";
      const full = r.count >= r.max, playing = r.started && !r.over;
      const right = playing ? `<span class="vs-room-state playing">Đang chơi</span>`
        : full ? `<span class="vs-room-state full">Đủ người</span>`
          : `<button class="vs-room-join" data-room="${r.id}">Vào</button>`;
      return `<div class="vs-room-row"><div class="vs-room-main"><span class="vs-room-name">${esc(r.name)}</span> <span class="vs-room-badge">${badge}</span> <span class="vs-room-ct">${r.count}/${r.max}</span></div>` +
        `<div class="vs-room-players">${names}</div>${right}</div>`;
    }).join("");
    $("vsRoomsList").querySelectorAll(".vs-room-join").forEach((b) => {
      b.onclick = () => { if (net) { net.joinRoom(+b.dataset.room); $("vsRoomsMsg").innerHTML = "⏳ Đang vào phòng…"; } };
    });
    $("vsRoomsMsg").textContent = "Chọn một phòng để vào, hoặc tạo phòng mới.";
  }
  $("vsRoomCreate").onclick = () => { if (net) { net.createRoom(); $("vsRoomsMsg").innerHTML = "⏳ Đang tạo phòng…"; } };
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
        html += mem.length ? mem.map((p, j) => {
          const rm = (m.isHost && p.bot) ? ` <button class="vs-del-bot" data-sid="${esc(p.sid)}" title="Bỏ máy">✕</button>` : "";
          return `<div class="vs-lobby-row team${tm}${p.pid === m.myPid ? " me" : ""}"><span class="vs-tag ${p.pid === m.myPid ? "me" : "ai"}">${j === 0 ? "🛠 Chủ-bàn" : "🤝 Đồng đội"}</span> <b>${esc(p.name)}</b>${p.bot ? " 🤖" : ""}${p.pid === m.myPid ? " (bạn)" : ""}${p.host ? " 👑" : ""}${rm}</div>`;
        }).join("") : `<div class="vs-empty-team">— trống —</div>`;
      });
      if (m.isHost && m.players.length < 4) html += `<button class="vs-add-bot" id="vsAddBot">＋ Thêm máy (bot)</button>`;
      $("vsLobbyList").innerHTML = html;
      $("vsLobbyList").querySelectorAll(".vs-join-team").forEach((b) => { b.onclick = () => { if (net) net.client.send({ t: "setteam", team: +b.dataset.team }); }; });
      const ab = $("vsAddBot"); if (ab) ab.onclick = () => { if (net) net.addBot(); };
      $("vsLobbyList").querySelectorAll(".vs-del-bot").forEach((b) => { b.onclick = () => { if (net) net.delBot(b.dataset.sid); }; });
    } else {
      $("vsLobbyList").innerHTML = m.players.map((p, i) =>
        `<div class="vs-lobby-row${p.pid === m.myPid ? " me" : ""}"><span class="vs-tag ${p.pid === m.myPid ? "me" : "ai"}">${p.host ? "👑 Chủ" : "Người " + (i + 1)}</span> <b>${p.name}</b>${p.pid === m.myPid ? " (bạn)" : ""}</div>`).join("");
    }
    $("vsLanStart").classList.toggle("hidden", !m.isHost);
    $("vsLanStart").disabled = !m.canStart;
    const need = mode === "2v2" ? "Cần ĐÚNG 4 (2 đội × 2). Thiếu người? Bấm ＋ Thêm máy (bot) để điền chỗ." : "Cần ít nhất 2 người để bắt đầu.";
    $("vsLanMsg").textContent = m.isHost ? (m.canStart ? "Đủ người — bấm Bắt đầu khi sẵn sàng." : need) : "Chờ chủ phòng bắt đầu…";
  }
  // chủ phòng đổi kiểu trận
  $("vsModeRow").querySelectorAll(".vs-mode-btn").forEach((b) => {
    b.onclick = () => { if (net && net.isHost) net.client.send({ t: "setmode", mode: b.dataset.mode }); };
  });
  let reconnecting = false, reconnTries = 0, reconnTimer = null;
  const lanUrl = () => (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/";
  function lanFailHint() {
    if (net) { net.leave(); net = null; }
    setLanView("connect");
    $("vsLanAddr").innerHTML = `❌ <b>Không kết nối được máy chủ</b> tại <b>${location.host}</b>.<br>Kiểm tra: ① máy chủ đã chạy <code>node server.js</code> chưa · ② bạn mở ĐÚNG địa chỉ đó chưa (không phải <code>file://</code> hay server tĩnh khác) · ③ tường lửa/khác mạng LAN.`;
  }
  function reconnBanner(on, txt) { const b = $("netReconnect"); b.classList.toggle("hidden", !on); if (on && txt) b.querySelector("span").textContent = txt; }

  // Mở kết nối LAN. opts: {sid, silent, reconnect}
  function openLan(name, opts) {
    opts = opts || {};
    let opened = false;
    const client = new STM.NetClient(lanUrl(),
      (o) => net && net.handle(o),
      () => { opened = true; if (net.sid) net.join(); else net.requestRooms(); },   // có sid -> KẾT NỐI LẠI; không -> duyệt danh sách phòng
      () => onLanClose(opened, opts));
    net = new STM.NetMatch(game, client, name);
    net.sid = opts.sid || (STM.loadSession() && STM.loadSession().sid) || null;
    net.onReject = (why) => { reconnecting = false; reconnBanner(false); if (!opts.silent) { $("vsRoomsMsg").textContent = "Bị từ chối: " + why; if (net) net.requestRooms(); setLanView("rooms"); showTab("LAN"); } else { STM.clearSession(); if (net) { net.leave(); net = null; } endVersus(); openMenu(); } };
    net.onKick = (why) => { reconnecting = false; reconnBanner(false); if (net) { net.leave(); net = null; } endVersus(); log(why || "Phiên đã mở ở nơi khác.", "warn"); openMenu(); };
    net.onRooms = (m) => { reconnecting = false; reconnBanner(false); renderRooms(m); if (lanState !== "lobby") { setLanView("rooms"); if (curTab === "LAN") showTab("LAN"); } };
    net.onLobby = (m) => { reconnecting = false; reconnBanner(false); renderLobby(m); if (!opts.silent && !m.started) { setLanView("lobby"); showTab("LAN"); } if (opts.silent && !m.started) { vsModal.classList.remove("hidden"); document.body.classList.remove("versus", "netplay"); setLanView("lobby"); } };
    net.onStart = (m) => startVersusNet(m);
    net.onResume = (m) => resumeVersusNet(m);
    net.onEnd = (m) => showResult(m);
    net.onChange = () => game.emit();
    net.onChat = (i, text) => onChatIn(i, text);   // 2v2: nhận chat của đồng đội
    if (!opts.silent) setTimeout(() => { if (net && !opened) { try { net.client.close(); } catch (e) {} lanFailHint(); } }, 4000);
    return () => opened;
  }
  function onLanClose(wasOpened, opts) {
    if (!net) return;
    const sess = STM.loadSession();
    if (net.started && !net.over && sess && sess.active) { scheduleReconnect(sess); }   // rớt giữa trận -> tự nối lại
    else if (!wasOpened && !opts.silent) { lanFailHint(); }
    else if (!opts.silent) { $(lanState === "rooms" ? "vsRoomsMsg" : "vsLanMsg").textContent = "Mất kết nối máy chủ."; }
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
    STM.clearSession();                          // kết nối mới -> bỏ phiên cũ, duyệt danh sách phòng
    // hiện ngay trạng thái "đang kết nối" ở khu duyệt phòng
    $("vsRoomsCount").textContent = ""; $("vsRoomsList").innerHTML = "";
    $("vsRoomsMsg").innerHTML = `⏳ Đang kết nối tới <b>${location.host}</b>…`;
    setLanView("rooms");
    openLan(name, {});                           // onOpen (không sid) -> tự requestRooms()
  };
  $("vsLanStart").onclick = () => { if (net) net.startMatch(net.lobbyMode || "ffa"); };
  $("vsLanLeave").onclick = () => {
    reconnecting = false; reconnBanner(false);
    if (lanState === "lobby" && net) {                            // rời phòng -> quay về danh sách (VẪN kết nối)
      net.leaveRoom();
      $("vsRoomsList").innerHTML = ""; $("vsRoomsMsg").textContent = "Đang tải danh sách phòng…";
      setLanView("rooms");                                        // chuyển màn NGAY; gói "rooms" trả về sẽ đổ danh sách (onRooms không còn bị chặn vì lanState≠"lobby")
    } else { STM.clearSession(); endVersus(); setLanView("connect"); showTab("LAN"); }   // ở danh sách -> ngắt hẳn
  };

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
    $("mateCoresEl").innerHTML = coreChips(match.mateCores, "Đồng đội chưa chọn lõi nào.");   // lõi đồng đội đã chọn (chỉ xem)
  }

  function resumeVersusNet(m) {
    reconnecting = false; reconnBanner(false); if (reconnTimer) clearTimeout(reconnTimer);
    vsModal.classList.add("hidden");
    match = m;
    document.body.classList.remove("design"); document.body.classList.add("versus", "netplay");
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
    document.body.classList.remove("design"); document.body.classList.add("versus", "netplay");
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
  $("mmCampaign").onclick = () => { closeMenu(); openCampaign(); };
  $("mmDesign").onclick = () => { closeMenu(); newGame("design"); };
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
