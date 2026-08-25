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
      id: "ho_tu_than", name: "Hố Tử Thần", icon: "🌋",
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
      cost: 5, up: [10, 20, 45, 110, 220], projSpeed: 720, projColor: "#ffe8b0",   // lv6: giá 2× lv5
      // L1 đúng bảng gốc; L2-L5 ƯỚC LƯỢNG theo quy luật (chờ số liệu gốc). L6 = siêu cấp (dấu ấn: bắn ĐA MỤC TIÊU = cấp)
      lv: [
        { dmg: 10, rate: R(1.5), range: 1.5, splash: 0 }, { dmg: 26, rate: R(1.7), range: 1.8, splash: 0 },
        { dmg: 68, rate: R(1.9), range: 2.1, splash: 0 }, { dmg: 170, rate: R(2.1), range: 2.4, splash: 0 },
        { dmg: 420, rate: R(2.4), range: 2.7, splash: 0 }, { dmg: 1000, rate: R(2.6), range: 3.0, splash: 0 },
      ],
      desc: "Bắn tên rẻ, đánh cả BAY & BỘ.",
    },
    lua: {
      key: "lua", name: "Tháp Lửa", glyph: "🔥", color: "#ff5722", target: "ground", block: true,
      cost: 10, up: [20, 40, 80, 200, 400], projSpeed: 160, projColor: "#ffb057",   // lv6: giá 2× lv5
      lv: [
        { dmg: 15, rate: R(0.6), range: 2, splash: 1 }, { dmg: 45, rate: R(0.6), range: 2.5, splash: 1 },
        { dmg: 135, rate: R(0.6), range: 3, splash: 1 }, { dmg: 405, rate: R(0.6), range: 3.5, splash: 1 },
        { dmg: 1013, rate: R(0.6), range: 4, splash: 2 }, { dmg: 2500, rate: R(0.6), range: 4.5, splash: 2 },   // L6: dấu ấn = THIÊU ĐỐT
      ],
      desc: "Bắn chậm, ST rất cao, nổ lan. CHỈ đánh quái BỘ.",
    },
    bang: {
      key: "bang", name: "Tháp Băng", glyph: "❄", color: "#29b6f6", target: "both", block: true, effect: "slow",
      cost: 20, up: [40, 80, 160, 320, 640], projSpeed: 560, projColor: "#bdeaff",   // lv6: giá 2× lv5
      lv: [
        { dmg: 5, rate: R(2), range: 1.5, splash: 1, slowPct: 0.10 }, { dmg: 10, rate: R(2.5), range: 1.5, splash: 1, slowPct: 0.20 },
        { dmg: 20, rate: R(3), range: 1.5, splash: 2, slowPct: 0.30 }, { dmg: 40, rate: R(3.5), range: 1.5, splash: 2, slowPct: 0.40 },
        { dmg: 80, rate: R(4), range: 1.5, splash: 2, slowPct: 0.50 }, { dmg: 160, rate: R(4.5), range: 1.5, splash: 2, slowPct: 0.60 },   // L6: dấu ấn = mini-stun loang
      ],
      desc: "Bắn nhanh, nổ lan, LÀM CHẬM (10-50%). Cả BAY & BỘ.",
    },
    set: {
      key: "set", name: "Tháp Sét", glyph: "⚡", color: "#ffd54f", target: "air", block: true,
      cost: 15, up: [30, 60, 120, 240, 480], projSpeed: 900, projColor: "#fff3b0",   // lv6: giá 2× lv5
      lv: [
        { dmg: 20, rate: R(5), range: 2, splash: 2 }, { dmg: 50, rate: R(5.5), range: 2.5, splash: 2 },
        { dmg: 125, rate: R(6), range: 3, splash: 2 }, { dmg: 313, rate: R(6.5), range: 3.5, splash: 2 },
        { dmg: 782, rate: R(7), range: 4, splash: 2 }, { dmg: 1900, rate: R(7.5), range: 4.5, splash: 2 },   // L6: dấu ấn = +3% máu hiện tại/đòn
      ],
      desc: "Bắn RẤT nhanh, nổ lan. CHỈ đánh quái BAY.",
    },
    doc: {
      key: "doc", name: "Tháp Độc", glyph: "☠", color: "#9c27b0", target: "ground", block: true, effect: "poison",
      cost: 20, up: [40, 80, 160, 320, 640], projSpeed: 180, projColor: "#e29bff",   // lv6: giá 2× lv5
      lv: [
        { dmg: 1, rate: R(1), range: 1.5, splash: 1, poisonPct: 0.05 }, { dmg: 2, rate: R(1.1), range: 1.7, splash: 1, poisonPct: 0.10 },
        { dmg: 3, rate: R(1.2), range: 2, splash: 1, poisonPct: 0.15 }, { dmg: 4, rate: R(1.2), range: 2.5, splash: 1, poisonPct: 0.20 },
        { dmg: 5, rate: R(1.5), range: 3, splash: 1, poisonPct: 0.25 }, { dmg: 6, rate: R(1.6), range: 3.2, splash: 1, poisonPct: 0.30 },   // L6: độc 25%->30% (boon mới đổi sang %máu TỐI ĐA)
      ],
      desc: "Gây NHIỄM ĐỘC: mỗi giây trừ % máu HIỆN TẠI (bỏ giáp), 5s. Xé Boss/quái trâu. Chỉ BỘ.",
    },
    nangluong: {
      key: "nangluong", name: "Tháp Năng Lượng", glyph: "✦", color: "#00e5ff", target: "none", block: true, support: true,
      cost: 30, up: [40, 80, 150, 300, 600], color2: "#7bf4ff",   // lv6: giá 2× lv5
      // lv1 = +10%/+10% ĐÚNG BẢNG GỐC (ảnh play.zing). lv2-5 ƯỚC LƯỢNG: tăng dần, giữ F1=(1+dmg)(1+rate)≈1.90 < 2 ở lv5
      // -> 1 NL buff 1 tháp vẫn < xây THÊM 1 tháp; chỉ LỜI rõ khi 1 NL buff >=2 tháp (dồn nhiều tháp bắn quanh 1 NL). Tầm GIỮ 1.5.
      lv: [
        { range: 1.5, dmgBonus: 0.10, rateBonus: 0.10 }, { range: 1.5, dmgBonus: 0.20, rateBonus: 0.15 },
        { range: 1.5, dmgBonus: 0.30, rateBonus: 0.20 }, { range: 1.5, dmgBonus: 0.40, rateBonus: 0.25 },
        { range: 1.5, dmgBonus: 0.50, rateBonus: 0.30 }, { range: 1.5, dmgBonus: 0.75, rateBonus: 0.45 },   // L6: buff ×1.5 (dấu ấn)
      ],
      desc: "KHÔNG bắn — buff sức mạnh (+10→50%) & tốc bắn (+10→30%) cho tháp quanh (tầm 1.5). 1 NL < xây thêm 1 tháp: chỉ thật lời khi buff ≥2 tháp cùng lúc.",
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
      base: { back: 12 }, desc: "Dùng 1 lần: hút 1 con quái BỘ bước vào ô này về vị trí ngẫu nhiên. [Đối kháng] hút quái SANG sân đối thủ ngẫu nhiên. Vô hiệu Boss & BAY.",
    },
  };
  const TOWER_ORDER = ["ten", "lua", "bang", "set", "doc", "nangluong"];
  const TRAP_ORDER = ["dinh", "hut"];

  // ============================================================
  //  CHẾ ĐỘ CHIẾN DỊCH × LMHT — thay THÁP bằng TƯỚNG
  //  Tướng = 1 tháp (đòn đánh thường + nâng cấp cấp 1→6) GẮN THÊM 1 kỹ năng
  //  tự thi triển khi hết hồi chiêu (cd tính bằng giây thực). Dùng chung
  //  engine Tower/Projectile: champion def cùng HÌNH DẠNG với tower def.
  //  ability.kind -> bộ điều phối trong entities.js:
  //    "multishot"      : bắn N mũi vào N mục tiêu gần đích (Ashe W)
  //    "steroid_bounce" : mấy đòn kế tăng tốc đánh + đạn NẢY sang mục tiêu gần (Sivir W)
  // ============================================================
  const CHAMP_BOUNCE_RANGE = 2.4;   // tầm nảy của đạn (ô)
  const CHAMPIONS = {
    ashe: {
      key: "ashe", name: "Ashe", title: "Nữ Hoàng Băng Giá", glyph: "🏹", champion: true,
      color: "#5aa9d6", color2: "#bde8f5", target: "both", block: true, effect: "slow",
      cost: 20, up: [30, 60, 120, 240], projSpeed: 760, projColor: "#bde8f5",   // tướng: TỐI ĐA cấp 5 (up dài 4)
      // đòn đánh thường LÀM CHẬM (Frost Shot). Chỉ số tiệm cận đường cong tháp Tên nhưng có slow.
      lv: [
        { dmg: 14, rate: R(1.4), range: 2.2, splash: 0, slowPct: 0.15 }, { dmg: 30, rate: R(1.5), range: 2.4, splash: 0, slowPct: 0.18 },
        { dmg: 62, rate: R(1.6), range: 2.6, splash: 0, slowPct: 0.22 }, { dmg: 130, rate: R(1.7), range: 2.8, splash: 0, slowPct: 0.26 },
        { dmg: 300, rate: R(1.8), range: 3.0, splash: 0, slowPct: 0.30 },
      ],
      // [W] Tán Xạ Tiễn (Volley) — chỉ số gốc LMHT, 5 bậc theo CẤP tháp (cấp 1→5)
      ability: { key: "W", name: "Tán Xạ Tiễn", kind: "multishot",
        cd: [16, 13, 10, 7, 4], shots: 7, dmg: [40, 50, 60, 70, 80], adMul: 1.0,
        desc: "Bắn loạt tên hình nón vào tối đa 7 mục tiêu, mỗi mũi gây ST nền + 100% ST đòn đánh và làm chậm (mỗi kẻ địch chỉ chịu ST một lần)." },
      desc: "Xạ thủ băng: đòn đánh làm CHẬM; W bắn 7 mũi tên đa mục tiêu. Đánh cả BAY & BỘ.",
    },
    sivir: {
      key: "sivir", name: "Sivir", title: "Chiến Binh Sa Mạc", glyph: "🪃", champion: true,
      color: "#d99a4e", color2: "#f5cd8a", target: "both", block: true,
      cost: 25, up: [35, 70, 140, 280], projSpeed: 840, projColor: "#f5cd8a",   // tướng: TỐI ĐA cấp 5 (up dài 4)
      lv: [
        { dmg: 18, rate: R(1.5), range: 2.0, splash: 0 }, { dmg: 38, rate: R(1.6), range: 2.1, splash: 0 },
        { dmg: 78, rate: R(1.7), range: 2.2, splash: 0 }, { dmg: 160, rate: R(1.8), range: 2.3, splash: 0 },
        { dmg: 360, rate: R(1.9), range: 2.4, splash: 0 },
      ],
      // [W] Nảy Bật (Ricochet) — chỉ số gốc LMHT: 4s cường hóa, +tốc đánh, đạn nảy tối đa 8 lần
      ability: { key: "W", name: "Nảy Bật", kind: "steroid_bounce",
        cd: [12, 12, 12, 12, 12], dur: 4, rateMul: [1.20, 1.25, 1.30, 1.35, 1.40],
        bounces: 8, bouncePct: [0.40, 0.425, 0.45, 0.475, 0.50],
        desc: "Trong 4s: +20→40% tốc đánh, đạn NẢY tối đa 8 mục tiêu (mỗi lần nảy gây 40→50% ST đòn đánh)." },
      desc: "Xạ thủ boomerang: W tăng tốc đánh vài đòn và đạn nảy sang nhiều mục tiêu. Đánh cả BAY & BỘ.",
    },
    brand: {
      key: "brand", name: "Brand", title: "Phục Hận Rực Cháy", glyph: "🔥", champion: true,
      color: "#e2582a", color2: "#ffb057", target: "both", block: true,
      cost: 30, up: [40, 80, 160, 320], projSpeed: 300, projColor: "#ff8a3d",
      lv: [
        { dmg: 16, rate: R(0.9), range: 2.4, splash: 0 }, { dmg: 34, rate: R(0.95), range: 2.6, splash: 0 },
        { dmg: 72, rate: R(1.0), range: 2.8, splash: 0 }, { dmg: 150, rate: R(1.05), range: 3.0, splash: 0 },
        { dmg: 330, rate: R(1.1), range: 3.2, splash: 0 },
      ],
      // [W] Cột Lửa (Pillar of Flame) — chỉ số gốc LMHT: ST 75→255, hồi 10→8s
      ability: { key: "W", name: "Cột Lửa", kind: "area_nuke",
        cd: [10, 9.5, 9, 8.5, 8], radius: 1.5, dmg: [75, 120, 165, 210, 255], adMul: 0.7, burn: true,   // burnPct/burnDur mặc định = BURN_MISS_PCT/BURN_DUR (castArea)
        desc: "Tạo cột lửa nổ trong vùng quanh mục tiêu, gây ST vùng (+70% đòn đánh) và THIÊU ĐỐT (%máu đã mất)." },
      desc: "Pháp sư lửa: W 'Cột Lửa' nổ vùng + đốt. Đánh cả BAY & BỘ.",
    },
    cassiopeia: {
      key: "cassiopeia", name: "Cassiopeia", title: "Nữ Hoàng Rắn Độc", glyph: "🐍", champion: true,
      color: "#3fa66a", color2: "#8be0a0", target: "ground", block: true, effect: "poison",
      cost: 25, up: [35, 70, 140, 280], projSpeed: 360, projColor: "#8be0a0",
      lv: [
        { dmg: 6, rate: R(1.3), range: 2.0, splash: 0, poisonPct: 0.05 }, { dmg: 12, rate: R(1.4), range: 2.2, splash: 0, poisonPct: 0.08 },
        { dmg: 22, rate: R(1.5), range: 2.4, splash: 0, poisonPct: 0.11 }, { dmg: 40, rate: R(1.6), range: 2.6, splash: 0, poisonPct: 0.14 },
        { dmg: 75, rate: R(1.7), range: 2.8, splash: 0, poisonPct: 0.18 },
      ],
      // [W] Chướng Khí (Miasma) — chỉ số gốc LMHT: ST/giây 20→40, chậm 40→80%, 5s, hồi 24→16s
      ability: { key: "W", name: "Chướng Khí", kind: "dot_field",
        cd: [24, 22, 20, 18, 16], radius: 1.6, dps: [20, 25, 30, 35, 40], adMul: 0.1, dur: 5, slowPct: [0.40, 0.50, 0.60, 0.70, 0.80],
        desc: "Thả màn sương độc (5s): mỗi giây gây ST (nền + 10% đòn đánh) và LÀM CHẬM 40→80% quái BỘ trong vùng." },
      desc: "Nữ hoàng rắn: đòn đánh gây độc; W thả màn sương độc gây ST theo thời gian. CHỈ đánh quái BỘ.",
    },
    lux: {
      key: "lux", name: "Lux", title: "Thiếu Nữ Ánh Sáng", glyph: "✨", champion: true,
      color: "#e7c14b", color2: "#fff2a8", target: "both", block: true,
      cost: 30, up: [40, 80, 160, 320], projSpeed: 700, projColor: "#fff2a8",
      lv: [
        { dmg: 14, rate: R(1.0), range: 2.8, splash: 0 }, { dmg: 30, rate: R(1.05), range: 3.0, splash: 0 },
        { dmg: 64, rate: R(1.1), range: 3.2, splash: 0 }, { dmg: 135, rate: R(1.15), range: 3.4, splash: 0 },
        { dmg: 300, rate: R(1.2), range: 3.6, splash: 0 },
      ],
      // [Q] Khóa Ánh Sáng (Light Binding) — chỉ số gốc LMHT: trói 2s, tối đa 2 mục tiêu, hồi 10s
      ability: { key: "Q", name: "Khóa Ánh Sáng", kind: "root_shot",
        cd: [10, 10, 10, 10, 10], targets: 2, rootDur: 2, dmg: [80, 120, 160, 200, 240], adMul: 0.75,
        desc: "Bắn quả cầu ánh sáng TRÓI 2s tối đa 2 kẻ địch và gây ST." },
      desc: "Pháp sư ánh sáng: Q trói giữ quái. Đánh cả BAY & BỘ.",
    },
    caitlyn: {
      key: "caitlyn", name: "Caitlyn", title: "Cảnh Sát Trưởng Piltover", glyph: "🔫", champion: true,
      color: "#8a6fc0", color2: "#c9b6ef", target: "both", block: true,
      cost: 30, up: [45, 90, 180, 360], projSpeed: 820, projColor: "#e6d8ff",
      lv: [
        { dmg: 18, rate: R(1.1), range: 3.2, splash: 0 }, { dmg: 38, rate: R(1.15), range: 3.4, splash: 0 },
        { dmg: 80, rate: R(1.2), range: 3.6, splash: 0 }, { dmg: 165, rate: R(1.25), range: 3.8, splash: 0 },
        { dmg: 360, rate: R(1.3), range: 4.0, splash: 0 },
      ],
      // [W] Bẫy Yordle (Yordle Snap Trap) — chỉ số gốc LMHT: nạp bẫy mỗi 26→10s, tối đa 3/3/4/4/5, trói 1.5s
      ability: { key: "W", name: "Bẫy Yordle", kind: "place_trap", maxTraps: [3, 3, 4, 4, 5], adMul: 0.3,
        cd: [26, 22, 18, 14, 10],
        trap: { kind: "root", rootDur: 1.5, dmg: [35, 80, 125, 170, 215], glyph: "🪤" },
        desc: "Cứ hết hồi chiêu, đặt 1 Bẫy Yordle vào ô quái đi qua (trong tầm đánh). Quái giẫm bẫy bị TRÓI 1.5s + nhận ST (đòn Thiện Xạ). Tối đa 3→5 bẫy." },
      desc: "Cảnh sát trưởng (nội tại Thiện Xạ): W đặt Bẫy Yordle trói quái. Đánh cả BAY & BỘ.",
    },
    varus: {
      key: "varus", name: "Varus", title: "Mũi Tên Trừng Phạt", glyph: "🎯", champion: true,
      color: "#6a4fb0", color2: "#b39ff0", target: "both", block: true,
      cost: 30, up: [40, 80, 160, 320], projSpeed: 780, projColor: "#b39ff0",
      lv: [
        { dmg: 15, rate: R(1.0), range: 3.0, splash: 0 }, { dmg: 32, rate: R(1.05), range: 3.2, splash: 0 },
        { dmg: 68, rate: R(1.1), range: 3.4, splash: 0 }, { dmg: 140, rate: R(1.15), range: 3.6, splash: 0 },
        { dmg: 310, rate: R(1.2), range: 3.8, splash: 0 },
      ],
      // [Q] Mũi Tên Xuyên Phá (Piercing Arrow) — chỉ số gốc LMHT (giương tối đa): ST 80→360, hồi 16→12s
      ability: { key: "Q", name: "Mũi Tên Xuyên Phá", kind: "pierce_line",
        cd: [16, 15, 14, 13, 12], width: 0.55, dmg: [80, 150, 220, 290, 360], adMul: 1.2,
        desc: "Giương cung bắn mũi tên XUYÊN qua mọi kẻ địch trên đường thẳng, gây ST lớn (+120% đòn đánh)." },
      desc: "Xạ thủ xuyên phá: Q bắn mũi tên xuyên hàng dài. Đánh cả BAY & BỘ.",
    },
    kogmaw: {
      key: "kogmaw", name: "Kog'Maw", title: "Miệng Vực Thẳm", glyph: "🐸", champion: true,
      color: "#7fb04a", color2: "#c2e08a", target: "both", block: true,
      cost: 30, up: [40, 80, 160, 320], projSpeed: 620, projColor: "#c2e08a",
      lv: [
        { dmg: 16, rate: R(1.4), range: 2.4, splash: 0 }, { dmg: 32, rate: R(1.5), range: 2.6, splash: 0 },
        { dmg: 64, rate: R(1.6), range: 2.8, splash: 0 }, { dmg: 130, rate: R(1.7), range: 3.0, splash: 0 },
        { dmg: 280, rate: R(1.8), range: 3.2, splash: 0 },
      ],
      // [W] Cao Xạ Ma Pháp (Bio-Arcane Barrage) — chỉ số gốc LMHT: 8s, +tầm, +2→6% máu tối đa mỗi đòn
      ability: { key: "W", name: "Cao Xạ Ma Pháp", kind: "steroid_pctdmg",
        cd: [17, 17, 17, 17, 17], dur: 8, pct: [0.02, 0.03, 0.04, 0.05, 0.06], range: [0.6, 0.7, 0.8, 0.9, 1.0],
        desc: "Trong 8s: tăng tầm đánh và mỗi đòn gây thêm 2→6% MÁU TỐI ĐA (phép, bỏ giáp) — xé quái trâu & quái bay." },
      desc: "Xạ thủ xé giáp: W khiến đòn đánh gây %máu tối đa, khắc chế quái trâu/bay. Đánh cả BAY & BỘ.",
    },
    teemo: {
      key: "teemo", name: "Teemo", title: "Trinh Sát Nhanh Nhẹn", glyph: "🍄", champion: true,
      color: "#4fae5a", color2: "#a6e08a", target: "both", block: true, effect: "poison",
      cost: 25, up: [35, 70, 140, 280], projSpeed: 560, projColor: "#a6e08a",
      lv: [
        { dmg: 10, rate: R(1.6), range: 2.2, splash: 0, poisonPct: 0.04 }, { dmg: 20, rate: R(1.7), range: 2.3, splash: 0, poisonPct: 0.06 },
        { dmg: 40, rate: R(1.8), range: 2.4, splash: 0, poisonPct: 0.08 }, { dmg: 82, rate: R(1.9), range: 2.5, splash: 0, poisonPct: 0.10 },
        { dmg: 180, rate: R(2.0), range: 2.6, splash: 0, poisonPct: 0.13 },
      ],
      // [R] Bẫy Độc (Noxious Trap) — chỉ số gốc LMHT (3 bậc → 5 cấp): tổng độc 200/325/450 trong 4s, chậm 30/40/50%
      ability: { key: "R", name: "Bẫy Độc", kind: "place_trap", maxTraps: [3, 3, 4, 4, 5], adMul: 0.5,
        cd: [35, 35, 30, 30, 25],
        trap: { kind: "shroom", radius: 1.3, burnTotal: [200, 200, 325, 325, 450], burnDur: 4, slowPct: [0.30, 0.30, 0.40, 0.40, 0.50], slowDur: 4, glyph: "🍄" },
        desc: "Cứ hết hồi chiêu, đặt 1 Bẫy Độc vào ô quái đi qua. Quái giẫm nấm → NỔ vùng: nhiễm độc (tổng 200→450 ST trong 4s) + làm chậm 30→50% (4s). Tối đa 3→5 nấm." },
      desc: "Trinh sát: đòn đánh gây độc; R rải Bẫy Độc nổ vùng làm chậm + độc. Đánh cả BAY & BỘ.",
    },
    veigar: {
      key: "veigar", name: "Veigar", title: "Ác Nhân Tí Hon", glyph: "🎩", champion: true,
      color: "#7a4fb0", color2: "#c3a0ef", target: "both", block: true,
      cost: 30, up: [40, 80, 160, 320], projSpeed: 640, projColor: "#c3a0ef",
      lv: [
        { dmg: 14, rate: R(1.0), range: 2.8, splash: 0 }, { dmg: 30, rate: R(1.05), range: 3.0, splash: 0 },
        { dmg: 64, rate: R(1.1), range: 3.1, splash: 0 }, { dmg: 135, rate: R(1.15), range: 3.2, splash: 0 },
        { dmg: 300, rate: R(1.2), range: 3.3, splash: 0 },
      ],
      // [Q] Điềm Gở (Baleful Strike) — kết liễu → cộng dồn sức mạnh VĨNH VIỄN
      ability: { key: "Q", name: "Điềm Gở", kind: "strike",
        cd: [6, 5.5, 5, 4.5, 4], dmg: [80, 120, 160, 200, 240], adMul: 0.6,
        stack: { per: 4, kill: 2, killBig: 6 },
        desc: "Bắn năng lượng hắc ám: ST nền + cộng dồn. KẾT LIỄU quái → +sức mạnh VĨNH VIỄN (thường +2, boss +6)." },
      desc: "Ác nhân tí hon: Q kết liễu để cộng dồn sức mạnh vô hạn. Đánh cả BAY & BỘ.",
    },
    vayne: {
      key: "vayne", name: "Vayne", title: "Thợ Săn Bóng Đêm", glyph: "🎯", champion: true,
      color: "#8a4a6a", color2: "#e0a0b8", target: "both", block: true,
      cost: 25, up: [35, 70, 140, 280], projSpeed: 800, projColor: "#e0a0b8",
      lv: [
        { dmg: 16, rate: R(1.2), range: 2.2, splash: 0 }, { dmg: 34, rate: R(1.3), range: 2.3, splash: 0 },
        { dmg: 72, rate: R(1.4), range: 2.4, splash: 0 }, { dmg: 150, rate: R(1.5), range: 2.5, splash: 0 },
        { dmg: 330, rate: R(1.6), range: 2.6, splash: 0 },
      ],
      // [W] Mũi Tên Bạc (Silver Bolts) — NỘI TẠI: mỗi đòn thứ 3 gây ST CHUẨN theo %máu tối đa
      ability: { key: "W", name: "Mũi Tên Bạc", kind: "onhit_pct", n: 3, flat: [50, 65, 80, 95, 110], pctMax: [0.06, 0.07, 0.08, 0.09, 0.10],
        desc: "Nội tại: cứ đòn đánh THỨ 3 gây thêm ST CHUẨN = max(cố định, 6→10% máu tối đa) — xé quái trâu." },
      desc: "Thợ săn: mỗi đòn thứ 3 gây %máu tối đa (ST chuẩn). Đánh cả BAY & BỘ.",
    },
    // ================= TƯỚNG CẬN CHIẾN (chỉ đánh BỘ) =================
    garen: {
      key: "garen", name: "Garen", title: "Sức Mạnh Demacia", glyph: "⚔", champion: true, melee: true,
      color: "#4a80b8", color2: "#a9d0ef", target: "ground", block: true,
      cost: 25, up: [35, 70, 140, 280], projSpeed: 999, projColor: "#dbe9f7",
      lv: [
        { dmg: 20, rate: R(1.0), range: 1.4, splash: 0 }, { dmg: 44, rate: R(1.05), range: 1.4, splash: 0 },
        { dmg: 92, rate: R(1.1), range: 1.5, splash: 0 }, { dmg: 190, rate: R(1.15), range: 1.5, splash: 0 },
        { dmg: 410, rate: R(1.2), range: 1.6, splash: 0 },
      ],
      // [E] Phán Quyết (Judgment) — XOAY KIẾM quanh mình trong nhiều giây, gây ST DUY TRÌ liên tục
      ability: { key: "E", name: "Phán Quyết", kind: "spin", atSelf: true,
        cd: [9, 8.25, 7.5, 6.75, 6], radius: 1.35, dur: 3, dps: [10, 17, 24, 31, 38], adMul: 0.9,
        desc: "Xoay kiếm quanh mình trong 3s, LIÊN TỤC gây ST cho mọi quái BỘ trong vùng (mỗi giây: ST nền + 90% đòn đánh)." },
      desc: "Chiến binh xoáy kiếm: E gây ST vùng quanh mình. CHỈ đánh quái BỘ.",
    },
    darius: {
      key: "darius", name: "Darius", title: "Bàn Tay Noxus", glyph: "🪓", champion: true, melee: true,
      color: "#a83232", color2: "#e88b8b", target: "ground", block: true, effect: "poison",
      cost: 30, up: [40, 80, 160, 320], projSpeed: 999, projColor: "#f0b0b0",
      lv: [
        { dmg: 22, rate: R(0.85), range: 1.3, splash: 0, poisonPct: 0.03 }, { dmg: 48, rate: R(0.9), range: 1.3, splash: 0, poisonPct: 0.04 },
        { dmg: 100, rate: R(0.95), range: 1.4, splash: 0, poisonPct: 0.05 }, { dmg: 205, rate: R(1.0), range: 1.4, splash: 0, poisonPct: 0.06 },
        { dmg: 440, rate: R(1.05), range: 1.5, splash: 0, poisonPct: 0.07 },
      ],
      // [R] Máy Chém Noxus (Noxian Guillotine) — hành quyết, ST CHUẨN, ×2 máu thấp; KẾT LIỄU → hồi chiêu về 0 (chém liên tục)
      ability: { key: "R", name: "Máy Chém Noxus", kind: "strike", true: true, execute: true, executeBelow: 0.3, executeMul: 2, resetOnKill: true,
        cd: [120, 120, 100, 100, 80], dmg: [125, 125, 250, 250, 375], adMul: 0.75,
        desc: "Bổ rìu HÀNH QUYẾT: ST chuẩn (bỏ giáp); dưới 30% máu → ×2. KẾT LIỄU mục tiêu → hồi chiêu về 0, chém liên tục." },
      desc: "Đao phủ: đòn đánh gây CHẢY MÁU; R hành quyết ST chuẩn. CHỈ đánh quái BỘ.",
    },
    blitzcrank: {
      key: "blitzcrank", name: "Blitzcrank", title: "Người Máy Hơi Nước", glyph: "🤖", champion: true, melee: true,
      color: "#b8a83a", color2: "#efe08a", target: "ground", block: true,
      cost: 30, up: [40, 80, 160, 320], projSpeed: 999, projColor: "#efe08a",
      lv: [
        { dmg: 20, rate: R(0.9), range: 1.4, splash: 0 }, { dmg: 44, rate: R(0.95), range: 1.4, splash: 0 },
        { dmg: 92, rate: R(1.0), range: 1.5, splash: 0 }, { dmg: 190, rate: R(1.05), range: 1.5, splash: 0 },
        { dmg: 410, rate: R(1.1), range: 1.6, splash: 0 },
      ],
      // [Q] Bàn Tay Hỏa Tiễn (Rocket Grab) — chỉ GIẬT NGƯỢC quái ĐÃ ĐI QUA tháp về sát mình + choáng + ST
      ability: { key: "Q", name: "Bàn Tay Hỏa Tiễn", kind: "pull", grabRange: 5, stun: 0.65,
        cd: [20, 19, 18, 17, 16], dmg: [110, 160, 210, 260, 310], adMul: 1.2,
        desc: "Phóng móc GIẬT NGƯỢC quái đã ĐI QUA mình (trong 5 ô) về lại sát tháp, gây ST và choáng 0.65s — kéo dài đường đi của quái, KHÔNG rút ngắn." },
      desc: "Người máy: Q giật quái đã vượt qua về lại phía sau + choáng. CHỈ đánh quái BỘ.",
    },
    nasus: {
      key: "nasus", name: "Nasus", title: "Người Gác Cát", glyph: "🐺", champion: true, melee: true,
      color: "#c9a44a", color2: "#efd79a", target: "ground", block: true,
      cost: 30, up: [40, 80, 160, 320], projSpeed: 999, projColor: "#efd79a",
      lv: [
        { dmg: 24, rate: R(0.8), range: 1.4, splash: 0 }, { dmg: 52, rate: R(0.85), range: 1.4, splash: 0 },
        { dmg: 110, rate: R(0.9), range: 1.5, splash: 0 }, { dmg: 225, rate: R(0.95), range: 1.5, splash: 0 },
        { dmg: 480, rate: R(1.0), range: 1.6, splash: 0 },
      ],
      // [Q] Quyền Trượng Linh Hồn (Siphoning Strike) — CƯỜNG HÓA đòn đánh kế; kết liễu bằng đòn này → cộng dồn ST VĨNH VIỄN
      ability: { key: "Q", name: "Quyền Trượng Linh Hồn", kind: "empower_next", adMul: 0,
        cd: [7.5, 6.5, 5.5, 4.5, 3.5], dmg: [40, 60, 80, 100, 120],
        stack: { per: 1, kill: 4, killBig: 10 },
        desc: "Cường hóa đòn đánh KẾ: đòn đánh + ST nền + số cộng dồn. KẾT LIỄU bằng đòn này → +cộng dồn VĨNH VIỄN (thường +4, boss +10)." },
      desc: "Người gác cát: Q kết liễu để cộng dồn ST vô hạn. CHỈ đánh quái BỘ.",
    },
    poppy: {
      key: "poppy", name: "Poppy", title: "Người Gác Búa", glyph: "🛡", champion: true, melee: true,
      color: "#4a80a8", color2: "#a0cbe0", target: "ground", block: true,
      cost: 30, up: [40, 80, 160, 320], projSpeed: 999, projColor: "#a0cbe0",
      lv: [
        { dmg: 21, rate: R(1.0), range: 1.4, splash: 0 }, { dmg: 46, rate: R(1.05), range: 1.4, splash: 0 },
        { dmg: 96, rate: R(1.1), range: 1.5, splash: 0 }, { dmg: 198, rate: R(1.15), range: 1.5, splash: 0 },
        { dmg: 425, rate: R(1.2), range: 1.6, splash: 0 },
      ],
      // [R] Sứ Giả Phán Quyết (Keeper's Verdict) — đánh quái VĂNG NGƯỢC 1 đoạn (xa dần theo cấp) + ST lớn
      ability: { key: "R", name: "Sứ Giả Phán Quyết", kind: "knockback", grabRange: 3.5,
        cd: [140, 140, 120, 120, 100], dmg: [200, 200, 300, 300, 400], adMul: 0.9, pushTiles: [3, 4, 5, 6, 7],
        desc: "Vung búa đánh quái VĂNG NGƯỢC về phía cổng sinh một đoạn (3→7 ô theo cấp) + ST lớn — kéo dài quãng đường quái đó." },
      desc: "Người gác búa: R hất quái lùi 1 đoạn, kéo dài thời gian. CHỈ đánh quái BỘ.",
    },
    renekton: {
      key: "renekton", name: "Renekton", title: "Sát Thủ Cát Dữ", glyph: "🐊", champion: true, melee: true,
      color: "#b8783a", color2: "#efc38a", target: "ground", block: true,
      cost: 30, up: [40, 80, 160, 320], projSpeed: 999, projColor: "#efc38a",
      lv: [
        { dmg: 21, rate: R(1.0), range: 1.3, splash: 0 }, { dmg: 46, rate: R(1.05), range: 1.3, splash: 0 },
        { dmg: 96, rate: R(1.1), range: 1.4, splash: 0 }, { dmg: 198, rate: R(1.15), range: 1.4, splash: 0 },
        { dmg: 425, rate: R(1.2), range: 1.5, splash: 0 },
      ],
      // [W] Kẻ Săn Mồi Tàn Nhẫn (Ruthless Predator) — đòn kế +ST lớn & CHOÁNG
      ability: { key: "W", name: "Kẻ Săn Mồi Tàn Nhẫn", kind: "empower_next", stun: 0.75,
        cd: [16, 14, 12, 10, 8], dmg: [10, 40, 70, 100, 130], adMul: 1.5,
        desc: "Nạp đòn: đòn đánh KẾ +ST nền (+150% đòn đánh) và CHOÁNG 0.75s." },
      desc: "Cá sấu: W nạp đòn choáng cực mạnh. CHỈ đánh quái BỘ.",
    },
    alistar: {
      key: "alistar", name: "Alistar", title: "Ngưu Ma Vương", glyph: "🐂", champion: true, melee: true,
      color: "#6a5a8a", color2: "#c0b0e0", target: "ground", block: true,
      cost: 30, up: [40, 80, 160, 320], projSpeed: 999, projColor: "#c0b0e0",
      lv: [
        { dmg: 20, rate: R(1.0), range: 1.4, splash: 0 }, { dmg: 44, rate: R(1.05), range: 1.4, splash: 0 },
        { dmg: 92, rate: R(1.1), range: 1.5, splash: 0 }, { dmg: 190, rate: R(1.15), range: 1.5, splash: 0 },
        { dmg: 410, rate: R(1.2), range: 1.6, splash: 0 },
      ],
      // [Q] Nghiền Nát (Pulverize) — hất tung & CHOÁNG mọi quái quanh mình
      ability: { key: "Q", name: "Nghiền Nát", kind: "area_nuke", atSelf: true, stun: 1.0,
        cd: [14, 13, 12, 11, 10], radius: 1.5, dmg: [60, 100, 140, 180, 220], adMul: 0.8,
        desc: "Nện đất CHOÁNG mọi quái quanh mình 1s và gây ST (+80% đòn đánh)." },
      desc: "Ngưu ma: Q choáng vùng quanh mình cực mạnh. CHỈ đánh quái BỘ.",
    },
  };
  const RANGED_ORDER = ["ashe", "sivir", "caitlyn", "teemo", "varus", "kogmaw", "lux", "brand", "cassiopeia", "veigar", "vayne"];   // 11 tay dài
  const MELEE_ORDER = ["garen", "darius", "blitzcrank", "nasus", "renekton", "alistar", "poppy"];   // 7 cận chiến (chỉ đánh BỘ)
  const CHAMPION_ORDER = [...RANGED_ORDER, ...MELEE_ORDER];
  Object.assign(TOWERS, CHAMPIONS);   // tướng dùng chung lookup với tháp -> Tower/statAt/upgradeCost/buyCost chạy nguyên vẹn
  function buildOrder(mode) { return mode === "campaign" ? CHAMPION_ORDER : TOWER_ORDER; }

  // ----- CHIẾN DỊCH: bậc màn (ladder) + mở khóa tướng + nội tại (mastery) -----
  const CAMPAIGN_START = ["ashe"];      // tướng mở sẵn khi bắt đầu chiến dịch
  const MASTERY_PER = 0.10;             // mỗi bậc nội tại: +10% ST & tốc đánh cho tướng
  const MASTERY_MAX = 5;                // trần bậc nội tại
  const MASTERY_REWARD = 2;             // điểm nội tại nhận khi qua màn LẦN ĐẦU
  const CAMPAIGN = (() => {
    const rewards = CHAMPION_ORDER.slice(1);   // 19 tướng cần mở khóa (trừ Ashe mở sẵn)
    const names = ["Cửa Ải Mở Màn", "Miền Đất Chết", "Đồng Hoang", "Khe Nứt Lửa", "Bầu Trời Tối", "Thành Đổ Nát", "Hỏa Ngục", "Hang Rắn", "Đấu Trường", "Rừng Thẳm", "Đầm Lầy Độc", "Sườn Núi Gãy", "Cổ Mộ", "Pháo Đài Vỡ", "Vực Sâu", "Bão Cát", "Băng Nguyên", "Cổng Địa Ngục", "Đỉnh Tử Thần"];
    const targets = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 33];
    const st = rewards.map((rw, i) => ({ id: i + 1, name: names[i] || ("Màn " + (i + 1)), map: (i % 2) ? "dat_chet" : "ho_tu_than", target: targets[i] || (8 + i), reward: rw, desc: `Trụ tới hết đợt ${targets[i] || (8 + i)}.` }));
    st.push({ id: rewards.length + 1, name: "Tử Địa", map: "ho_tu_than", target: 40, reward: null, desc: "Thử thách cuối — trụ tới hết đợt 40." });
    return st;
  })();

  // ----- PHÍM TẮT MẶC ĐỊNH (người chơi cấu hình lại được, lưu ở localStorage) -----
  // Tháp/bẫy: gán theo từng loại. Phép: gán theo 6 Ô (học tối đa 6 phép), phép học được
  // xếp vào ô theo thứ tự -> phím theo Ô, không theo tên phép. Mặc định 6 ô: Q W E A S D.
  const DEFAULT_KEYS = { ten: "1", lua: "2", bang: "3", set: "4", doc: "5", nangluong: "6", dinh: "7", hut: "8" };
  const DEFAULT_SLOT_KEYS = ["q", "w", "e", "a", "s", "d", "z", "x", "c"];   // 6 ô gốc + tối đa 3 ô mở thêm bằng lõi Tham Lam
  const MAX_LEVEL = 6;
  // Cấp 6 (siêu cấp) — dấu ấn theo loại tháp
  const SET_L6_HP = 0.001;                // Sét: +0.1% máu HIỆN TẠI/đòn (nerf: 3% quá mạnh def quái bay)
  const BANG_L6_CHANCE = 0.01, BANG_L6_DUR = 0.3;   // Băng: mini-stun 0.3s CÓ loang (nerf: 1% để tránh khống chế quá mạnh)
  const TEN_L6_BONUS = 3;                 // Tên: nếu đã có boon multishot -> +3 mũi
  const LUA_L6_MUL = 1.5;                 // Lửa: trùng boon -> ×1.5 tỉ lệ đốt (dùng lại BURN_MISS_PCT/BURN_DUR)
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
    rong_tinh: { key: "rong_tinh", name: "Rồng Tinh", shape: "dragon", fly: true, color: "#ef5350", hp: 46, speed: 72, reward: 4, armor: 0, radius: 12, cf: 1.0 },   // CHẬM hơn ác điểu
    ac_dieu: { key: "ac_dieu", name: "Ác Điểu", shape: "bird", fly: true, color: "#42a5f5", hp: 27, speed: 122, reward: 4, armor: 0, radius: 10, cf: 0.7 },   // bầy ÍT hơn, máu MỎNG hơn
    cao_tinh: { key: "cao_tinh", name: "Cáo Tinh", shape: "fox", fly: false, color: "#ff8f2d", hp: 48, speed: 138, reward: 5, armor: 1, radius: 11, cf: 0.9, slowResist: 0.4 },
    // Cóc Độc: bản thân là loài độc nên KHÁNG ĐỘC — giảm 10% ST độc & rút ngắn thời gian nhiễm (5s -> 3s)
    coc_doc: { key: "coc_doc", name: "Cóc Độc", shape: "toad", fly: false, color: "#7cb342", hp: 62, speed: 72, reward: 5, armor: 1, radius: 12, cf: 0.9, poisonResist: { dmg: 0.10, dur: 0.4 } },
  };
  // Vòng xoay chủng theo đợt (quái BAY chỉ từ đợt 6 trở đi)
  const CYCLE = ["bo_ngua", "hai_cot", "trau_dien", "coc_doc", "cao_tinh", "yeu_sen", "nguoi_khong_lo", "rong_tinh", "hai_cot", "coc_doc", "ac_dieu", "cao_tinh", "trau_dien", "yeu_sen"];
  const FLY_FROM = 6;
  function pickType(n) { let t = CYCLE[(n - 1) % CYCLE.length]; if (n < FLY_FROM && ENEMIES[t].fly) t = "hai_cot"; return t; }
  // Chủng để phép Triệu Hồi thả (loại con tách nhỏ). Caster chọn 1 lần -> áp CÙNG chủng cho mọi đối thủ.
  const SUMMON_TYPES = ["bo_ngua", "hai_cot", "trau_dien", "coc_doc", "cao_tinh", "yeu_sen", "nguoi_khong_lo", "rong_tinh", "ac_dieu"];
  function randomSummonType() { return SUMMON_TYPES[(Math.random() * SUMMON_TYPES.length) | 0]; }
  function bossType(n) { const bi = (Math.floor(n / 10) - 1) % CYCLE.length; return CYCLE[(bi + CYCLE.length) % CYCLE.length]; }
  // Thông tin chủng của đợt n (dùng cho banner)
  function waveInfo(n) { const boss = n % 10 === 0; const type = boss ? bossType(n) : pickType(n); const d = ENEMIES[type]; return { type, name: d.name, fly: d.fly, boss, shape: d.shape, color: d.color }; }
  const COUNT_SCALE = 0.6;   // GIẢM số lượng quái mỗi đợt còn ~60%
  const MAX_COUNT = 20;      // TRẦN số quái/đợt (không tính trùm): vượt trần -> dồn phần khó vào MÁU, không thêm quái
  function buildWave(n) {
    let hpMul = Math.pow(1.135, n - 1) * (1 + n * 0.03);
    if (n % 10 === 0) { const type = bossType(n); return { type, count: 1 + Math.floor(n / 40), gap: 3.0, hpMul, rwMul: 1, boss: true }; }
    const type = pickType(n), d = ENEMIES[type];
    const rawCount = Math.max(3, Math.round((6 + n * 1.05) * d.cf));   // số lượng "gốc"
    let count = Math.max(2, Math.round(rawCount * COUNT_SCALE));       // ít quái hơn
    if (count > MAX_COUNT) { hpMul *= count / MAX_COUNT; count = MAX_COUNT; }   // đã tối đa số lượng: phần vượt biến thành MÁU
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

  /* ===================== LÕI NÂNG CẤP (giống Augment TFT) =====================
   * Mỗi ván: 3 ô lõi. Ô1 miễn phí từ đầu; ô2/ô3 mở bằng 100/150 Điểm KN.
   * Cấp bậc (bạc<vàng<kim cương) NGẪU NHIÊN mỗi ván nhưng GIỐNG nhau giữa các
   * người chơi ở CÙNG ô (đối kháng: server phát; solo: random cục bộ).
   * Khi mở 1 ô: hiện 3 lõi ngẫu nhiên CÙNG cấp bậc của ô đó để chọn (riêng mỗi người).
   * `tiers`: các cấp bậc lõi này có + GIÁ TRỊ ở cấp đó. `impl`: đã làm ở Phase 1.
   * `aim`: cần chọn mục tiêu sau khi lấy ("tower"...). `group`: nhóm hiển thị.
   * `note` chỉ để dev, KHÔNG hiện cho người chơi. */
  const CORE_TIERS = ["bac", "vang", "kimcuong"];
  const CORE_TIER_INFO = {
    bac: { name: "Bạc", color: "#c3ccd6", glow: "rgba(195,204,214,.6)" },
    vang: { name: "Vàng", color: "#ffcf4a", glow: "rgba(255,207,74,.6)" },
    kimcuong: { name: "Kim Cương", color: "#79e3ff", glow: "rgba(121,227,255,.65)" },
  };
  const CORE_UNLOCK_SP = [0, 100, 150];   // Điểm KN để mở ô 1/2/3
  const CORES = {
    // --- Kinh tế ---
    blackFriday: { id: "blackFriday", name: "Black Friday", icon: "🏷", group: "Kinh tế", impl: true,
      tiers: { bac: 5, vang: 10, kimcuong: 15 }, desc: (v) => `Giá xây/nâng tháp & bẫy rẻ hơn ${v}%.` },
    afk: { id: "afk", name: "AFK", icon: "💤", group: "Kinh tế", impl: true,
      tiers: { bac: 1 }, desc: () => "Không xây/nâng/bán qua nhiều đợt liền → nhận gấp đôi tổng vàng các đợt đó. Ngưỡng thưởng tăng dần 3 → 2 → 1 đợt, sau 3 lần thì lõi ngừng." },
    tayBuon: { id: "tayBuon", name: "Tay Buôn", icon: "💰", group: "Kinh tế", impl: true,
      tiers: { bac: 5, vang: 10, kimcuong: 15 }, desc: (v) => `Tăng ${v}% vàng nhận được từ mọi nguồn.` },
    // --- Tháp ---
    dungHop: { id: "dungHop", name: "Dung Hợp", icon: "⚗", group: "Tháp", impl: true,
      tiers: { kimcuong: 1 }, desc: () => "1 lần/ván: xây đè lên 1 tháp để dung hợp — giữ đặc tính tháp gốc, cộng chỉ số & hiệu ứng tháp kia." },
    giaCo: { id: "giaCo", name: "Gia Cố", icon: "🔧", group: "Tháp", impl: true, aim: "tower",
      tiers: { bac: 10, vang: 20, kimcuong: 30 }, desc: (v) => `Tăng ${v}% chỉ số (ST/tốc/tầm/loang) cho MỘT tháp được chọn (ST & tốc nhân đôi hiệu quả → DPS tăng mạnh).` },
    backKingXay: { id: "backKingXay", name: "Back King Xây", icon: "🧲", group: "Tháp", impl: true,
      tiers: { vang: 1 }, desc: () => "Có thể di chuyển tháp đã xây sang vị trí khác. Bán tháp/bẫy hoàn 100% vàng đã chi." },
    nguyenBan: { id: "nguyenBan", name: "Nguyên Bản", icon: "⭐", group: "Tháp", impl: true,
      tiers: { bac: 50 }, desc: (v) => `Mọi tháp CHƯA nâng cấp (cấp 1) được tăng ${v}% chỉ số & hiệu ứng (KHÔNG buff tầm).` },
    // --- Phép ---
    kePhaLuat: { id: "kePhaLuat", name: "Kẻ Phá Luật", icon: "📜", group: "Phép", impl: true,
      tiers: { vang: 1 }, desc: () => "Học phép không cần theo nhánh cây phép." },
    vuaPhep: { id: "vuaPhep", name: "Vua Phép Thuật", icon: "🎩", group: "Phép", impl: true,
      tiers: { kimcuong: 1 }, desc: () => "Đổi lại phép đã học thành phép khác (hồi chiêu vẫn chạy theo thời gian thực)." },
    nhanhNhen: { id: "nhanhNhen", name: "Nhanh Nhẹn", icon: "⚡", group: "Phép", impl: true,
      tiers: { bac: 10, vang: 25, kimcuong: 40 }, desc: (v) => `Giảm ${v}% thời gian hồi chiêu của mọi phép.` },
    thamLam: { id: "thamLam", name: "Tham Lam", icon: "🎰", group: "Phép", impl: true,
      tiers: { bac: 1, vang: 2, kimcuong: 3 }, desc: (v) => `Mở khoá thêm ${v} ô phép (học được nhiều phép hơn).` },
    // --- Phòng thủ ---
    thanhTri: { id: "thanhTri", name: "Thành Trì", icon: "🧱", group: "Phòng thủ", impl: true,
      tiers: { bac: 3, vang: 5, kimcuong: 8 }, desc: (v) => `Tăng ngay ${v} mạng tối đa (đỡ được nhiều quái lọt hơn).` + ((typeof v !== "number" || v >= 8) ? " ⟡ Kim Cương: mỗi đợt boss KHÔNG để boss nào lọt → +1 mạng tối đa (hồi 1)." : "") },
    taiThiet: { id: "taiThiet", name: "Tái Thiết", icon: "🩹", group: "Phòng thủ", impl: true,
      tiers: { bac: 1 }, desc: () => "Cứ 5 đợt liền KHÔNG để quái nào lọt cửa Tử → hồi 1 mạng (không vượt mức tối đa)." },
    laChan: { id: "laChan", name: "Lá Chắn", icon: "🛡", group: "Phòng thủ", impl: true,
      tiers: { vang: 1 }, desc: () => "Mỗi đợt: quái ĐẦU TIÊN lọt cửa Tử KHÔNG bị trừ mạng." },
    // --- Bản đồ ---
    trumBanDo: { id: "trumBanDo", name: "Trùm Bản Đồ", icon: "🗺", group: "Bản đồ", impl: true,
      tiers: { vang: 1 }, desc: () => "Dùng 10 KN nâng cao ô đất đã xây tháp để chặn cả quái BAY." },
  };
  const CORE_ORDER = ["blackFriday", "afk", "tayBuon", "giaCo", "nguyenBan", "nhanhNhen", "thamLam", "thanhTri", "taiThiet", "laChan", "dungHop", "backKingXay", "kePhaLuat", "vuaPhep", "trumBanDo"];
  // các lõi ĐÃ LÀM có mặt ở 1 cấp bậc
  function coresAtTier(tier) { return CORE_ORDER.filter((id) => CORES[id].impl && CORES[id].tiers[tier] != null); }
  const coreVal = (id, tier) => { const c = CORES[id]; return c && c.tiers[tier] != null ? c.tiers[tier] : 0; };
  // random không phụ thuộc (offer 3 thẻ per-player); tiers do server/solo phát riêng

  /* ===================== COMBO LÕI ===================== */
  // Chọn 2/3 lõi CÙNG NHÓM -> mở khóa hiệu ứng cộng thêm. Cộng dồn: 3 lõi = hưởng CẢ 2x lẫn 3x.
  // Nhóm có combo (>=3 lõi khả dụng): Kinh tế / Tháp / Phòng thủ / Phép. "Bản đồ" chỉ 1 lõi -> không combo.
  const COMBO_GROUPS = ["Kinh tế", "Tháp", "Phòng thủ", "Phép"];
  const COMBOS = {
    "Kinh tế": { icon: "💰", x2: "Nhận ngay +1000 vàng.", x3: "Mở đổi 10 KN → 20 vàng (lặp lại)." },
    "Tháp": { icon: "🏰", x2: "+10% sát thương & tốc đánh cho LOẠI tháp đang xây NHIỀU NHẤT.", x3: "Chọn 1 loại tháp để cường hóa hiệu ứng đặc biệt." },
    "Phòng thủ": { icon: "🛡", x2: "Mỗi 2 quái lọt cửa Tử → nhận 1 GEM (gắn vào tháp).", x3: "Gấp đôi chỉ số của mọi gem." },
    "Phép": { icon: "🎩", x2: "Dùng 1 phép → hồi 25% thời gian phép đó cho 1 phép NGẪU NHIÊN khác.", x3: "Phép giết quái ×2 vàng; Tăng Lực/Mê Trận/Phong Ấn ×2 thời gian; phép PvP mạnh hơn." },
  };
  const COMBO_ECO_GOLD = 1000, SP_TO_GOLD_SP = 10, SP_TO_GOLD_GOLD = 20;   // 3x Kinh tế: đổi KN→vàng tỉ lệ 1:2

  /* ===================== GEM (ngũ hành) ===================== */
  // Gắn vào tháp (tối đa 3/tháp). Nguồn DUY NHẤT: combo 2x Phòng thủ (2 quái lọt = 1 gem, NGẪU NHIÊN loại).
  // base +10%/gem; ×2 khi có combo 3x Phòng thủ. Nhiều gem cùng loại cộng dồn.
  const GEM_PER = 0.10, CRIT_MULT = 2, MAX_GEMS = 5, NGUHANH_MUL = 2;   // đủ 5 loại gem/tháp -> NGŨ HÀNH: ×2 hiệu quả mọi gem
  // per = hệ số MỖI gem (Hoả mạnh hơn: +50%/gem). ×gemMul(3x Phòng thủ) ×ngũ hành.
  const GEMS = {
    kim: { key: "kim", name: "Kim", icon: "◈", color: "#ffd24a", stat: "crit", per: 0.10, desc: (v) => `+${v}% tỉ lệ chí mạng (chí mạng gây ×2 sát thương).` },
    moc: { key: "moc", name: "Mộc", icon: "❧", color: "#5ab54a", stat: "rate", per: 0.10, desc: (v) => `+${v}% tốc đánh.` },
    thuy: { key: "thuy", name: "Thuỷ", icon: "❄", color: "#29b6f6", stat: "slow", per: 0.10, desc: (v) => `Đòn đánh làm chậm quái ${v}% (1.2s).` },
    hoa: { key: "hoa", name: "Hoả", icon: "🔥", color: "#ff5722", stat: "dmg", per: 0.50, desc: (v) => `+${v}% sát thương.` },
    tho: { key: "tho", name: "Thổ", icon: "⬢", color: "#a1887f", stat: "stun", per: 0.10, desc: (v) => `+${v}% xác suất choáng quái 1s — CHỈ mục tiêu chính (không loang).` },
  };
  const GEM_ORDER = ["kim", "moc", "thuy", "hoa", "tho"];

  /* ===== hằng số cường hóa tháp (combo 3x Tháp) ===== */
  const TOWER_COMBO_BONUS = 0.10;               // 2x Tháp: +10% ST & tốc cho loại nhiều nhất
  const BURN_CHANCE = 0.15, BURN_MISS_PCT = 0.02, BURN_DUR = 3;   // Lửa: 15% đốt = 2%/s MÁU ĐÃ MẤT (maxHp-hp), 3s
  const FREEZE_CHANCE = 0.10, FREEZE_DUR = 1;                // Băng: 10% đóng băng 1s
  const SET_DIST_PER = 0.10;                                 // Sét: +10%/ô khoảng cách — KHÔNG cap
  const ENERGY_RANGE_MUL = 2;                                // Năng Lượng: nhân đôi tầm phủ

  STM.CFG = {
    TILE, COLS, ROWS, CELL, MARGIN, buildMap, MAPS, curMap, setMap, getMapId,
    CORES, CORE_ORDER, CORE_TIERS, CORE_TIER_INFO, CORE_UNLOCK_SP, coresAtTier, coreVal, MAX_CORES: 3, RAISE_SP: 10,
    COMBO_GROUPS, COMBOS, COMBO_ECO_GOLD, SP_TO_GOLD_SP, SP_TO_GOLD_GOLD,
    GEMS, GEM_ORDER, GEM_PER, CRIT_MULT, MAX_GEMS, NGUHANH_MUL,
    TOWER_COMBO_BONUS, BURN_CHANCE, BURN_MISS_PCT, BURN_DUR, FREEZE_CHANCE, FREEZE_DUR, SET_DIST_PER, ENERGY_RANGE_MUL,
    SET_L6_HP, BANG_L6_CHANCE, BANG_L6_DUR, TEN_L6_BONUS, LUA_L6_MUL,
    GRID_W: TILE * COLS, GRID_H: TILE * ROWS,
    CANVAS_W: TILE * COLS + 2 * MARGIN, CANVAS_H: TILE * ROWS + 2 * MARGIN,
    WAVE_INTERVAL: 15, WAVE_INTERVAL_LATE: 20, LATE_WAVE: 30, GAME_PACE: 0.75, BUILD_TIME: 2.0, UP_TIME: 1.5, SELL_TIME: 1.0,
    TOWERS, TRAPS, TOWER_ORDER, TRAP_ORDER, MAX_LEVEL, upgradeCost, statAt, workTime,
    CHAMPIONS, CHAMPION_ORDER, RANGED_ORDER, MELEE_ORDER, CHAMP_BOUNCE_RANGE, buildOrder,
    CAMPAIGN, CAMPAIGN_START, MASTERY_PER, MASTERY_MAX, MASTERY_REWARD,
    ENEMIES, buildWave, waveInfo, pickType, randomSummonType, FLY_FROM,
    VS_START_DELAY: 30, VS_AI_PERIOD: 1.6, MAX_PLAYERS: 5,
    // 2v2: mỗi người nhận 0.75× vàng so với thường (2v -> 1.5v) nhưng TỔNG cả đội cao hơn 1 người thường (2 × 1.5 = 3v)
    VS2V2_GOLD_MUL: 0.75,
    DEFAULT_KEYS, DEFAULT_SLOT_KEYS,
    SKILLS, SKILL_TREE_ORDER, SKILL_EDGES,
    START_GOLD: 35, START_SP: 0, START_LIVES: 10, MAX_SKILLS: 6,
    AFK_THRESHOLDS: [3, 2, 1],   // lõi AFK: số đợt sạch cần cho mỗi lần thưởng (3→2→1); hết mảng -> lõi vô hiệu
    DESIGN_GOLD: 99999, DESIGN_SP: 999,   // Sân thử nghiệm (mode "design"): vàng & KN vô hạn để thử bố cục tháp
    DESIGN_MAX_WAVE: 60,
    WAVE_BONUS: 0, SP_PER_KILL: 1, SP_PER_BOSS: 10, SELL_RATE: 0.5,
    BOSS_HP: 24, BOSS_RADIUS: 1.7, BOSS_REWARD: 7, BOSS_SPEED: 0.8,
    // 2v2 phối hợp: loại dấu ping trên bàn chung + câu chat mẫu (khớp CHỈ SỐ giữa 2 máy)
    PINGS: {
      build: { icon: "🏗", color: "#5ab54a", label: "Xây đây" },
      danger: { icon: "⚠", color: "#e0592f", label: "Nguy hiểm" },
      watch: { icon: "👁", color: "#ffd24a", label: "Chú ý" },
    },
    PING_ORDER: ["build", "danger", "watch"],
    QUICKCHAT: ["Cần tháp bay! ✈️", "Sắp thua rồi! 😱", "Để tôi lo phép 🎩", "Dồn góc này 👉", "Tốt lắm! 👍", "Nâng cấp đi! ⬆️"],
  };
})(window.STM || (window.STM = {}));
