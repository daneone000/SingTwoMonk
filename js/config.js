/* =====================================================================
 * SINH TỬ MÔN - Local (tái tạo bản gốc ZingPlay - maze tower defense)
 * config.js — bản đồ, 6 THÁP + 2 BẪY (đúng forum gốc), quái, CÂY PHÉP 13 node
 * Nguồn: hướng dẫn play.zing.vn (Wayback) + forum thanhhuypro + ảnh cây kỹ năng.
 * ===================================================================== */
(function (STM) {
  "use strict";

  const TILE = 48, COLS = 13, ROWS = 13;
  const MARGIN = TILE;                 // lề để vẽ cổng Sinh/Tử NGOÀI lưới
  const CELL = { LAND: 0, WATER: 1, WALL: 2, SPAWN: 3, EXIT: 4 };

  // ----- BẢN ĐỒ -----
  // lava: danh sách hình chữ nhật [cột đầu, hàng đầu, cột cuối, hàng cuối] là SÔNG DUNG NHAM (cấm xây, cấm đi)
  const MAPS = [
    {
      id: "nham_ha", name: "Cổ Trận Nham Hà", icon: "🌋",
      desc: "Bản gốc: 3 sông dung nham chia cắt sân, mê cung ngắn hơn nhưng dễ chặn",
      // theo tọa độ Excel bản gốc (grid 0-index):
      //   F1:M3 -> cột 5-12, hàng 0-2 | A7:H7 -> cột 0-7, hàng 6 | F11:M11 -> cột 5-12, hàng 10
      lava: [[5, 0, 12, 2], [0, 6, 7, 6], [5, 10, 12, 10]],
    },
    {
      id: "dat_chet", name: "Miền Đất Chết", icon: "🏜",
      desc: "13×13 trống trải, không một dòng nham — tự do dựng mê cung dài nhất có thể",
      lava: [],
    },
  ];
  let mapId = MAPS[0].id;
  const curMap = () => MAPS.find((m) => m.id === mapId) || MAPS[0];
  const setMap = (id) => { if (MAPS.some((m) => m.id === id)) mapId = id; return mapId; };
  const getMapId = () => mapId;

  function buildMap(id) {
    const def = MAPS.find((m) => m.id === (id || mapId)) || MAPS[0];
    const g = [];
    // Cả lưới 13×13 đều XÂY ĐƯỢC (trừ ô nham). Cổng Sinh/Tử nằm NGOÀI lưới; mỗi cổng nối vào
    // 2 ô rìa — người chơi có thể xây bịt 1 trong 2 (không bịt được cả 2).
    const entries = [{ c: 0, r: 0 }, { c: 1, r: 0 }];                          // Sinh: góc trên-trái
    const exits = [{ c: COLS - 1, r: ROWS - 1 }, { c: COLS - 2, r: ROWS - 1 }]; // Tử: góc dưới-phải
    const lava = new Set();
    const addRect = (c0, r0, c1, r1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) lava.add(c + "," + r); };
    for (const rect of def.lava) addRect(rect[0], rect[1], rect[2], rect[3]);
    for (let r = 0; r < ROWS; r++) { const row = []; for (let c = 0; c < COLS; c++) row.push(lava.has(c + "," + r) ? CELL.WATER : CELL.LAND); g.push(row); }
    return {
      id: def.id, name: def.name, grid: g, entries, exits,
      // toạ độ pixel (grid-local) của 2 cổng NGOÀI lưới
      sinhPix: { x: 1.0 * TILE, y: -0.55 * TILE },
      tuPix: { x: (COLS - 1.0) * TILE, y: (ROWS + 0.55) * TILE },
    };
  }

  // ----- THÁP (6) — thông số theo BẢNG GỐC (mỗi cấp một dòng lv) -----
  // rate = giây/phát = 1 / (tốc độ bắn phát/giây). splash = AOE (ô). effect: slow|poison.
  const R = (sps) => +(1 / sps).toFixed(4);   // đổi phát/giây -> giây/phát
  const TOWERS = {
    ten: {
      key: "ten", name: "Tháp Tên", glyph: "🏹", color: "#c8a165", target: "both", block: true,
      cost: 5, up: [10, 20, 45, 110], projSpeed: 720, projColor: "#ffe8b0",
      // L1 đúng bảng gốc; L2-L5 ƯỚC LƯỢNG theo quy luật (chờ số liệu gốc)
      lv: [
        { dmg: 10, rate: R(1.5), range: 1.5, splash: 0 }, { dmg: 26, rate: R(1.7), range: 1.8, splash: 0 },
        { dmg: 68, rate: R(1.9), range: 2.1, splash: 0 }, { dmg: 170, rate: R(2.1), range: 2.4, splash: 0 },
        { dmg: 420, rate: R(2.4), range: 2.7, splash: 0 },
      ],
      desc: "Bắn tên rẻ, đánh cả BAY & BỘ.",
    },
    lua: {
      key: "lua", name: "Tháp Lửa", glyph: "🔥", color: "#ff5722", target: "ground", block: true,
      cost: 10, up: [20, 40, 80, 200], projSpeed: 160, projColor: "#ffb057",
      lv: [
        { dmg: 15, rate: R(0.6), range: 2, splash: 1 }, { dmg: 45, rate: R(0.6), range: 2.5, splash: 1 },
        { dmg: 135, rate: R(0.6), range: 3, splash: 1 }, { dmg: 405, rate: R(0.6), range: 3.5, splash: 1 },
        { dmg: 1013, rate: R(0.6), range: 4, splash: 2 },
      ],
      desc: "Bắn chậm, ST rất cao, nổ lan. CHỈ đánh quái BỘ.",
    },
    bang: {
      key: "bang", name: "Tháp Băng", glyph: "❄", color: "#29b6f6", target: "both", block: true, effect: "slow",
      cost: 20, up: [40, 80, 160, 320], projSpeed: 560, projColor: "#bdeaff",
      lv: [
        { dmg: 5, rate: R(2), range: 1.5, splash: 1, slowPct: 0.10 }, { dmg: 10, rate: R(2.5), range: 1.5, splash: 1, slowPct: 0.20 },
        { dmg: 20, rate: R(3), range: 1.5, splash: 2, slowPct: 0.30 }, { dmg: 40, rate: R(3.5), range: 1.5, splash: 2, slowPct: 0.40 },
        { dmg: 80, rate: R(4), range: 1.5, splash: 2, slowPct: 0.50 },
      ],
      desc: "Bắn nhanh, nổ lan, LÀM CHẬM (10-50%). Cả BAY & BỘ.",
    },
    set: {
      key: "set", name: "Tháp Sét", glyph: "⚡", color: "#ffd54f", target: "air", block: true,
      cost: 15, up: [30, 60, 120, 240], projSpeed: 900, projColor: "#fff3b0",
      lv: [
        { dmg: 20, rate: R(5), range: 2, splash: 2 }, { dmg: 50, rate: R(5.5), range: 2.5, splash: 2 },
        { dmg: 125, rate: R(6), range: 3, splash: 2 }, { dmg: 313, rate: R(6.5), range: 3.5, splash: 2 },
        { dmg: 782, rate: R(7), range: 4, splash: 2 },
      ],
      desc: "Bắn RẤT nhanh, nổ lan. CHỈ đánh quái BAY.",
    },
    doc: {
      key: "doc", name: "Tháp Độc", glyph: "☠", color: "#9c27b0", target: "ground", block: true, effect: "poison",
      cost: 20, up: [40, 80, 160, 320], projSpeed: 180, projColor: "#e29bff",
      lv: [
        { dmg: 1, rate: R(1), range: 1.5, splash: 1, poisonPct: 0.05 }, { dmg: 2, rate: R(1.1), range: 1.7, splash: 1, poisonPct: 0.10 },
        { dmg: 3, rate: R(1.2), range: 2, splash: 1, poisonPct: 0.15 }, { dmg: 4, rate: R(1.2), range: 2.5, splash: 1, poisonPct: 0.20 },
        { dmg: 5, rate: R(1.5), range: 3, splash: 1, poisonPct: 0.25 },
      ],
      desc: "Gây NHIỄM ĐỘC: mỗi giây trừ % máu HIỆN TẠI (bỏ giáp), 5s. Xé Boss/quái trâu. Chỉ BỘ.",
    },
    nangluong: {
      key: "nangluong", name: "Tháp Năng Lượng", glyph: "✦", color: "#00e5ff", target: "none", block: true, support: true,
      cost: 30, up: [40, 80, 150, 300], color2: "#7bf4ff",
      // L1 (+10%/+10%) đúng bảng gốc; buff L2-L5 ƯỚC LƯỢNG. Tầm KHÔNG đổi (1.5).
      lv: [
        { range: 1.5, dmgBonus: 0.10, rateBonus: 0.10 }, { range: 1.5, dmgBonus: 0.15, rateBonus: 0.13 },
        { range: 1.5, dmgBonus: 0.22, rateBonus: 0.17 }, { range: 1.5, dmgBonus: 0.30, rateBonus: 0.22 },
        { range: 1.5, dmgBonus: 0.40, rateBonus: 0.28 },
      ],
      desc: "KHÔNG bắn — buff sức mạnh & tốc bắn cho tháp quanh (10-40%).",
    },
  };
  const TRAPS = {
    dinh: {
      key: "dinh", name: "Bẫy Dính", glyph: "🕸", color: "#8d6e63",
      cost: 40, trap: true, once: true, block: false, target: "ground", radius: 0.5,
      base: { freeze: 2.4 }, desc: "Dùng 1 lần: đóng băng 1 con quái BỘ bước vào ô này.",
    },
    hut: {
      key: "hut", name: "Bẫy Hút", glyph: "🌀", color: "#5c6bc0",
      cost: 70, trap: true, once: true, block: false, target: "ground", radius: 0.5,
      base: { back: 12 }, desc: "Dùng 1 lần: hút 1 con quái BỘ bước vào ô này về vị trí ngẫu nhiên. Vô hiệu Boss & BAY.",
    },
  };
  const TOWER_ORDER = ["ten", "lua", "bang", "set", "doc", "nangluong"];
  const TRAP_ORDER = ["dinh", "hut"];
  const MAX_LEVEL = 5;
  function upgradeCost(def, level) { return (def.up && def.up[level - 1]) || 0; }  // giá lên cấp (level -> level+1)
  function statAt(def, level) { return def.lv[Math.min(level, def.lv.length) - 1]; } // thông số cấp `level`
  // Thời gian chờ xây/nâng/bán: tỉ lệ THUẬN với vàng của hành động & số thứ tự đợt hiện tại
  function workTime(gold, wave) { return +(0.4 + gold * 0.015 * (1 + (wave || 0) * 0.03)).toFixed(2); }

  // ----- QUÁI (các chủng bản gốc) -----
  // cf = hệ số số lượng ; shape = kiểu vẽ ; split/splitInto = tách khi chết
  const ENEMIES = {
    bo_ngua: { key: "bo_ngua", name: "Bọ Ngựa", shape: "mantis", fly: false, color: "#9ccc65", hp: 40, speed: 66, reward: 3, armor: 0, radius: 11, cf: 1.0 },
    hai_cot: { key: "hai_cot", name: "Hài Cốt", shape: "skeleton", fly: false, color: "#eceff1", hp: 22, speed: 62, reward: 2, armor: 0, radius: 9, cf: 1.9 },
    trau_dien: { key: "trau_dien", name: "Trâu Điên", shape: "buffalo", fly: false, color: "#6d4c41", hp: 56, speed: 124, reward: 4, armor: 2, radius: 12, cf: 1.0 },
    nguoi_khong_lo: { key: "nguoi_khong_lo", name: "Người Khổng Lồ", shape: "giant", fly: false, color: "#a1887f", hp: 320, speed: 36, reward: 9, armor: 10, radius: 16, cf: 0.4 },
    yeu_sen: { key: "yeu_sen", name: "Yêu Sên", shape: "snail", fly: false, color: "#4fc3f7", hp: 66, speed: 50, reward: 4, armor: 0, radius: 12, cf: 0.7, split: 2, splitInto: "yeu_sen_nho" },
    yeu_sen_nho: { key: "yeu_sen_nho", name: "Yêu Sên Nhỏ", shape: "snail", fly: false, color: "#4fc3f7", hp: 20, speed: 62, reward: 1, armor: 0, radius: 8, cf: 1.0 },
    rong_tinh: { key: "rong_tinh", name: "Rồng Tinh", shape: "dragon", fly: true, color: "#ef5350", hp: 46, speed: 84, reward: 4, armor: 0, radius: 12, cf: 1.0 },
    ac_dieu: { key: "ac_dieu", name: "Ác Điểu", shape: "bird", fly: true, color: "#42a5f5", hp: 36, speed: 122, reward: 4, armor: 0, radius: 10, cf: 1.1 },
    cao_tinh: { key: "cao_tinh", name: "Cáo Tinh", shape: "fox", fly: false, color: "#ff8f2d", hp: 48, speed: 138, reward: 5, armor: 1, radius: 11, cf: 0.9, slowResist: 0.4 },
  };
  // Vòng xoay chủng theo đợt (quái BAY chỉ từ đợt 6 trở đi)
  const CYCLE = ["bo_ngua", "hai_cot", "trau_dien", "cao_tinh", "yeu_sen", "nguoi_khong_lo", "rong_tinh", "hai_cot", "ac_dieu", "cao_tinh", "trau_dien", "yeu_sen"];
  const FLY_FROM = 6;
  function pickType(n) { let t = CYCLE[(n - 1) % CYCLE.length]; if (n < FLY_FROM && ENEMIES[t].fly) t = "hai_cot"; return t; }
  // Chủng để phép Triệu Hồi thả (loại con tách nhỏ). Caster chọn 1 lần -> áp CÙNG chủng cho mọi đối thủ.
  const SUMMON_TYPES = ["bo_ngua", "hai_cot", "trau_dien", "cao_tinh", "yeu_sen", "nguoi_khong_lo", "rong_tinh", "ac_dieu"];
  function randomSummonType() { return SUMMON_TYPES[(Math.random() * SUMMON_TYPES.length) | 0]; }
  function bossType(n) { const bi = (Math.floor(n / 10) - 1) % CYCLE.length; return CYCLE[(bi + CYCLE.length) % CYCLE.length]; }
  // Thông tin chủng của đợt n (dùng cho banner)
  function waveInfo(n) { const boss = n % 10 === 0; const type = boss ? bossType(n) : pickType(n); const d = ENEMIES[type]; return { type, name: d.name, fly: d.fly, boss, shape: d.shape, color: d.color }; }
  const COUNT_SCALE = 0.6;   // GIẢM số lượng quái mỗi đợt còn ~60%
  function buildWave(n) {
    const hpMul = Math.pow(1.135, n - 1) * (1 + n * 0.03);
    if (n % 10 === 0) { const type = bossType(n); return { type, count: 1 + Math.floor(n / 40), gap: 3.0, hpMul, rwMul: 1, boss: true }; }
    const type = pickType(n), d = ENEMIES[type];
    const rawCount = Math.max(3, Math.round((6 + n * 1.05) * d.cf));   // số lượng "gốc"
    const count = Math.max(2, Math.round(rawCount * COUNT_SCALE));     // ít quái hơn
    const rwMul = rawCount / count;                                    // BÙ vàng: count×reward ≈ giữ nguyên tổng/đợt
    const gap = d.fly ? 0.55 : d.speed > 100 ? 0.45 : d.speed < 45 ? 1.1 : 0.7;
    return { type, count, gap, hpMul, rwMul };
  }

  // ----- CÂY PHÉP (13 node) — vị trí, giá (Điểm KN để HỌC), nhánh, phụ thuộc -----
  // tier 0..4 (hàng), col 0..4 (cột) khớp ảnh gốc. pvp: chỉ dùng ở chế độ đối kháng.
  // aim: 'area'|'enemy'|'tower'|'global'|'pvp'
  const SKILLS = {
    muaLua: { key: "muaLua", name: "Mưa Lửa", glyph: "🌋", learn: 1, tier: 0, col: 2, branch: "gold", parents: [], cd: 60, aim: "area", radius: 1.9, dmg: 70, pct: 0.10, hits: "ground", desc: "ST nhóm quái BỘ (70 + 10% máu ĐÃ MẤT)." },
    baoSet: { key: "baoSet", name: "Bão Sét", glyph: "🌩", learn: 10, tier: 1, col: 1, branch: "red", parents: ["muaLua"], cd: 60, aim: "area", radius: 1.9, dmg: 70, pct: 0.10, hits: "air", desc: "ST nhóm quái BAY (70 + 10% máu ĐÃ MẤT)." },
    trieuHoi: { key: "trieuHoi", name: "Triệu Hồi", glyph: "👹", learn: 15, tier: 1, col: 2, branch: "blue", parents: ["muaLua"], cd: 120, aim: "pvp", desc: "[Đối kháng] Thả 1 quái (chủng ngẫu nhiên GIỐNG nhau mọi người, mạnh theo đợt hiện tại) lên sân TẤT CẢ đối thủ, tại ô ngẫu nhiên bất kỳ CHƯA xây — kể cả ô bị quây kín không còn đường về đích." },
    tangLuc: { key: "tangLuc", name: "Tăng Lực", glyph: "💪", learn: 15, tier: 1, col: 3, branch: "green", parents: ["muaLua"], cd: 40, aim: "tower", mult: 2, dur: 8, desc: "Tăng gấp đôi sức mạnh 1 tháp trong 8s." },
    khoiDoc: { key: "khoiDoc", name: "Khói Độc", glyph: "🟣", learn: 40, tier: 2, col: 0, branch: "red", parents: ["baoSet"], cd: 75, aim: "area", radius: 2.2, dps: 30, pctps: 0.05, dur: 5, desc: "Khói độc: mỗi giây trừ (30 + 5% máu tối đa), 5s." },
    nhatDuong: { key: "nhatDuong", name: "Nhất Dương Chỉ", glyph: "☝", learn: 30, tier: 2, col: 1, branch: "red", parents: ["baoSet", "trieuHoi"], cd: 100, aim: "enemy", desc: "Giết ngay 1 quái thường, hoặc -25% máu Boss." },
    huyetQuy: { key: "huyetQuy", name: "Huyết Quỷ", glyph: "🩸", learn: 25, tier: 2, col: 2, branch: "blue", parents: ["trieuHoi"], cd: 300, aim: "pvp", desc: "[Đối kháng] Quái sân TẤT CẢ đối thủ đi nhanh hơn." },
    meTran: { key: "meTran", name: "Mê Trận", glyph: "🌫", learn: 30, tier: 2, col: 3, branch: "green", parents: ["trieuHoi", "tangLuc"], cd: 130, aim: "global", slow: 0.35, dur: 5, desc: "Làm chậm toàn bộ quái (còn 35% tốc) 5s." },
    phongAn: { key: "phongAn", name: "Phong Ấn", glyph: "🧊", learn: 55, tier: 2, col: 4, branch: "green", parents: ["tangLuc"], cd: 90, aim: "area", radius: 2.3, dur: 3.5, desc: "Đóng băng nhóm quái trong vùng 3.5s." },
    maGiap: { key: "maGiap", name: "Ma Giáp", glyph: "🛡", learn: 50, tier: 3, col: 2, branch: "blue", parents: ["huyetQuy"], cd: 150, aim: "pvp", desc: "[Đối kháng] Tăng máu quái sân TẤT CẢ đối thủ." },
    kiemThan: { key: "kiemThan", name: "Kiếm Thần", glyph: "🗡", learn: 100, tier: 4, col: 1, branch: "red", parents: ["khoiDoc", "maGiap"], cd: 170, aim: "global", dmg: 120, pct: 0.35, desc: "ST toàn bộ quái trên sân (120 + 35% máu tối đa), KỂ CẢ Boss." },
    diaChan: { key: "diaChan", name: "Địa Chấn", glyph: "💥", learn: 90, tier: 4, col: 2, branch: "blue", parents: ["maGiap"], cd: 500, aim: "pvp", desc: "[Đối kháng] Phá/hạ cấp 1 tháp của MỖI đối thủ." },
    dichChuyen: { key: "dichChuyen", name: "Dịch Chuyển", glyph: "🌀", learn: 80, tier: 4, col: 3, branch: "green", parents: ["phongAn", "maGiap"], cd: 250, aim: "global", desc: "Đưa mọi quái về điểm xuất phát." },
  };
  const SKILL_TREE_ORDER = ["muaLua", "baoSet", "trieuHoi", "tangLuc", "khoiDoc", "nhatDuong", "huyetQuy", "meTran", "phongAn", "maGiap", "kiemThan", "diaChan", "dichChuyen"];
  // Cạnh cây kỹ năng [từ, tới, màu, hai-chiều?] — vẽ đúng mũi tên bản gốc.
  const SKILL_EDGES = [
    ["muaLua", "baoSet", "red"], ["muaLua", "trieuHoi", "blue"], ["muaLua", "tangLuc", "green"],
    ["baoSet", "khoiDoc", "red"], ["baoSet", "nhatDuong", "red"],
    ["trieuHoi", "nhatDuong", "blue"], ["trieuHoi", "meTran", "blue"],
    ["tangLuc", "meTran", "green"], ["tangLuc", "phongAn", "green"],
    ["nhatDuong", "khoiDoc", "red"],                 // 30 → 40
    ["nhatDuong", "huyetQuy", "blue", true],         // 30 ↔ 25
    ["huyetQuy", "meTran", "blue", true],            // 25 ↔ 30
    ["meTran", "phongAn", "green"],                  // 30 → 55
    ["huyetQuy", "maGiap", "blue"],                  // 25 → 50 (Ma Giáp chỉ nối từ Huyết Quỷ; KHÔNG từ Nhất Dương/Mê Trận)
    ["trieuHoi", "huyetQuy", "blue"],                // 15 → 25 (Triệu Hồi tỏa xuống CẢ BA node giữa)
    ["khoiDoc", "kiemThan", "red"],                  // 40 → 100
    ["nhatDuong", "kiemThan", "red"],                // 30col1 → 100 (Nhất Dương Chỉ nối tới Kiếm Thần)
    ["maGiap", "kiemThan", "red"],                   // 50 → 100 (Ma Giáp tỏa xuống CẢ 3 ultimate)
    ["maGiap", "diaChan", "blue"],                   // 50 → 90
    ["maGiap", "dichChuyen", "green"],               // 50 → 80
    ["phongAn", "dichChuyen", "green"],              // 55 → 80
    ["meTran", "dichChuyen", "green"],               // 30col3 → 80 (cột lục)
  ];
  // Suy ra parents (cho điều kiện học) từ EDGES
  for (const k in SKILLS) SKILLS[k].parents = [];
  for (const [f, t, , bidir] of SKILL_EDGES) { SKILLS[t].parents.push(f); if (bidir) SKILLS[f].parents.push(t); }

  STM.CFG = {
    TILE, COLS, ROWS, CELL, MARGIN, buildMap, MAPS, curMap, setMap, getMapId,
    GRID_W: TILE * COLS, GRID_H: TILE * ROWS,
    CANVAS_W: TILE * COLS + 2 * MARGIN, CANVAS_H: TILE * ROWS + 2 * MARGIN,
    WAVE_INTERVAL: 15, WAVE_INTERVAL_LATE: 20, LATE_WAVE: 30, GAME_PACE: 0.75, BUILD_TIME: 2.0, UP_TIME: 1.5, SELL_TIME: 1.0,
    TOWERS, TRAPS, TOWER_ORDER, TRAP_ORDER, MAX_LEVEL, upgradeCost, statAt, workTime,
    ENEMIES, buildWave, waveInfo, pickType, randomSummonType, FLY_FROM,
    VS_START_DELAY: 30, VS_AI_PERIOD: 1.6, MAX_PLAYERS: 5,
    SKILLS, SKILL_TREE_ORDER, SKILL_EDGES,
    START_GOLD: 35, START_SP: 0, START_LIVES: 10, MAX_SKILLS: 6, CAMPAIGN_WAVES: 30,
    WAVE_BONUS: 0, SP_PER_KILL: 1, SP_PER_BOSS: 10, SELL_RATE: 0.5,
    BOSS_HP: 24, BOSS_RADIUS: 1.7, BOSS_REWARD: 7, BOSS_SPEED: 0.8,
  };
})(window.STM || (window.STM = {}));
