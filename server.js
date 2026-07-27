/* =====================================================================
 * server.js — Máy chủ LAN cho Sinh Tử Môn (Node thuần, KHÔNG cần thư viện)
 *   • Phục vụ file tĩnh (mở http://<IP-LAN>:PORT/ trên máy khác để vào)
 *   • WebSocket tự cài (RFC6455) — NHIỀU phòng chờ cùng lúc + đồng bộ đợt
 *     + relay snapshot/phép. Mỗi phòng là 1 ván riêng, cô lập với phòng khác.
 *   Chạy:  node server.js           (mặc định cổng 8090)
 *          PORT=9000 node server.js
 * ===================================================================== */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const ROOT = __dirname;
const PORT = +(process.env.PORT || 8090);
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json", ".sh": "text/plain" };

/* ----------------------------- HTTP tĩnh ----------------------------- */
// Chống CACHE cũ (Cloudflare/trình duyệt): gắn ?v=<mtime> vào MỌI file js/css trong index.html.
// index.html luôn phục vụ tươi (no-cache) nên token đổi theo file -> deploy mới là client tải lại ngay,
// KHÔNG kẹt sau bản JS cũ đã bị CDN cache.
function assetVersion() {
  let mx = 0;
  for (const d of ["js", "css"]) { try { for (const f of fs.readdirSync(path.join(ROOT, d))) { const st = fs.statSync(path.join(ROOT, d, f)); if (st.mtimeMs > mx) mx = st.mtimeMs; } } catch (e) {} }
  return Math.floor(mx).toString(36);
}
function serveIndex(res) {
  fs.readFile(path.join(ROOT, "index.html"), "utf8", (err, html) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    const v = assetVersion();
    html = html.replace(/((?:src|href)="(?:js|css)\/[^"?]+)"/g, '$1?v=' + v + '"');   // js/x.js -> js/x.js?v=TOKEN
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, must-revalidate" });
    res.end(html);
  });
}
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/_stm") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ stm: 1, lan: true })); return; }  // marker để client biết đây LÀ máy chủ LAN
  if (p === "/" || p === "/index.html") { serveIndex(res); return; }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end("forbidden"); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

/* --------------------------- WebSocket lõi --------------------------- */
// Giải mã 1 khung từ client (đã mask). Trả {op,payload,rest} hoặc null nếu thiếu byte.
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const b0 = buf[0], b1 = buf[1];
  const op = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f, off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
  let mask = null;
  if (masked) { if (buf.length < off + 4) return null; mask = buf.slice(off, off + 4); off += 4; }
  if (buf.length < off + len) return null;
  const payload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) payload[i] = masked ? buf[off + i] ^ mask[i & 3] : buf[off + i];
  return { op, payload, rest: buf.slice(off + len) };
}
// Mã hoá khung text (server -> client, KHÔNG mask)
function encodeText(str) {
  const data = Buffer.from(str, "utf8"), len = data.length;
  let head;
  if (len < 126) { head = Buffer.from([0x81, len]); }
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, data]);
}
function encodeClose() { return Buffer.from([0x88, 0]); }
function encodePong(payload) { return Buffer.concat([Buffer.from([0x8a, payload.length]), payload]); }

let nextConnId = 1, nextPid = 1, nextRoomId = 1;
const clients = new Map();   // id kết nối -> connection {id, sock, buf, slot, browsing}
// slot = DANH TÍNH người chơi, sống sót qua F5/rớt mạng nhờ sid (session id).
//   {sid, pid, R, name, alive, connected, sock, graceTimer, team, authority}   (R = phòng chứa slot)
const allSlots = new Map();  // sid -> slot   (tra cứu nhanh khi kết nối lại, XUYÊN phòng)
const rooms = new Map();     // roomId -> phòng
const browsers = new Set();  // connection đang XEM danh sách phòng (chưa vào phòng nào)

// Hằng số ván đấu (dùng CHUNG cho mọi phòng)
const VS_START_DELAY = 30, WAVE_INTERVAL = 15, WAVE_INTERVAL_LATE = 20, LATE_WAVE = 30, MAX = 5, GRACE = 60, MAX_ROOMS = 24;

function makeSid() { return crypto.randomBytes(9).toString("hex"); }
function sendSock(sock, obj) { try { sock.write(encodeText(JSON.stringify(obj))); } catch (e) {} }
function send(slot, obj) { if (slot && slot.sock) sendSock(slot.sock, obj); }
// phát tới MỌI người trong CÙNG phòng R
function broadcast(R, obj, exceptPid) { if (!R) return; for (const s of R.slots.values()) if (s.connected && s.pid !== exceptPid) send(s, obj); }

/* ------------------------------ Nhiều phòng ------------------------------ */
function makeRoom() {
  const id = nextRoomId++;
  const R = {
    id, name: "Phòng " + id,
    slots: new Map(),          // sid -> slot (thành viên phòng NÀY)
    started: false, over: false,
    mode: "ffa",               // "ffa" (cá nhân, tối đa 5) | "2v2" (2 đội × 2, chung bàn mỗi đội)
    wave: 0, waveTimer: 0, tickTimer: null,
    hostSid: null, map: null, coreTiers: null,   // cấp bậc 3 ô lõi (CHUNG mọi người trong phòng)
    deathOrder: [],            // pid (ffa) hoặc team (2v2) theo thứ tự gục (sớm nhất trước)
  };
  rooms.set(id, R);
  return R;
}
function destroyRoom(R) { if (R.tickTimer) { clearInterval(R.tickTimer); R.tickTimer = null; } rooms.delete(R.id); }

function slotList(R) { return [...R.slots.values()].sort((a, b) => a.pid - b.pid); }
function joinedList(R) {
  return slotList(R).map((s) => ({ pid: s.pid, name: s.name, host: s.sid === R.hostSid, alive: s.alive, connected: s.connected, team: s.team, authority: !!s.authority }));
}
/* ---- 2v2: đội, chủ-bàn (authority), đồng đội, đối thủ ---- */
function teammateOf(slot) { const R = slot.R; return [...R.slots.values()].find((s) => s !== slot && s.team === slot.team) || null; }
function authorityOf(R, team) { return [...R.slots.values()].find((s) => s.team === team && s.authority) || null; }
function enemyAuthority(slot) { return authorityOf(slot.R, slot.team === 0 ? 1 : 0); }
function aliveTeams(R) { const t = new Set(); for (const s of R.slots.values()) if (s.alive) t.add(s.team); return [...t]; }
function teamCount(R, t) { let n = 0; for (const s of R.slots.values()) if (s.team === t) n++; return n; }
// chủ-bàn = người vào sớm nhất (pid nhỏ nhất) trong mỗi đội
function assignAuthorities(R) { for (const tm of [0, 1]) slotList(R).filter((s) => s.team === tm).forEach((s, i) => { s.authority = i === 0; }); }
// gán đội CÂN BẰNG cho ai chưa có đội (giữ nguyên đội đã chọn thủ công)
function autoBalanceTeams(R) { for (const s of slotList(R)) if (s.team !== 0 && s.team !== 1) { s.team = teamCount(R, 0) <= teamCount(R, 1) ? 0 : 1; } }
function clearTeams(R) { for (const s of R.slots.values()) { s.team = undefined; s.authority = false; } }
function canStartNow(R) { return R.mode === "2v2" ? (R.slots.size === 4 && teamCount(R, 0) === 2 && teamCount(R, 1) === 2) : joinedList(R).length >= 2; }
function hostPid(R) { const h = R.slots.get(R.hostSid); return h ? h.pid : null; }
function aliveSlots(R) { return [...R.slots.values()].filter((s) => s.alive); }
function interval(R) { return R.wave >= LATE_WAVE ? WAVE_INTERVAL_LATE : WAVE_INTERVAL; }
function lobbyUpdate(R) {
  broadcast(R, { t: "lobby", players: joinedList(R), started: R.started, canStart: canStartNow(R), hostPid: hostPid(R), mode: R.mode });
  roomsUpdate();   // phòng đổi -> làm mới danh sách cho người đang duyệt
}
/* ---- danh sách phòng gửi cho người đang duyệt (kèm TÊN người đã join) ---- */
function roomInfo(R) {
  return { id: R.id, name: R.name, mode: R.mode, count: R.slots.size, max: MAX, started: R.started, over: R.over,
    host: (R.slots.get(R.hostSid) || {}).name || null,
    players: slotList(R).map((s) => ({ name: s.name, host: s.sid === R.hostSid })) };
}
function roomsList() { return [...rooms.values()].map(roomInfo); }
function roomsUpdate() { const msg = { t: "rooms", rooms: roomsList() }; for (const c of browsers) sendSock(c.sock, msg); }

/* ---- phép PvP giáng vào người đang OFFLINE: đệm lại (kèm đợt) để phát khi họ nối lại ---- */
function bufferPvp(slot, msg) {
  if (!slot.pvpQueue) slot.pvpQueue = [];
  if (slot.pvpQueue.length >= 60) return;   // chống tràn
  const kind = (msg.t === "vacuum" || msg.t === "teamvacuum") ? "vacuum" : "spell";
  slot.pvpQueue.push({ wave: slot.R.wave, kind, key: msg.key, data: msg.data });
}
// gửi phép PvP tới 1 sân: còn kết nối -> gửi ngay; offline mà còn sống (đang giữ chỗ) -> đệm lại
function deliverPvp(slot, msg) {
  if (!slot) return;
  if (slot.connected && slot.sock) send(slot, msg);
  else if (slot.alive) bufferPvp(slot, msg);
}

function startMatch(R, mapId, mode) {
  if (R.started) return;
  if (mode === "2v2" && !(R.slots.size === 4 && teamCount(R, 0) === 2 && teamCount(R, 1) === 2)) return;   // 2v2 cần 2 đội × 2
  R.mode = mode === "2v2" ? "2v2" : "ffa";
  R.started = true; R.over = false; R.wave = 0; R.deathOrder = [];
  R.map = mapId || R.map || null;                // bản đồ do CHỦ PHÒNG chọn, áp cho mọi máy
  { const T = ["bac", "vang", "kimcuong"]; R.coreTiers = [0, 0, 0].map(() => T[(Math.random() * 3) | 0]); }   // cấp bậc lõi ngẫu nhiên, CHUNG cho mọi người trong phòng
  for (const s of R.slots.values()) { s.alive = true; s.pvpQueue = []; if (R.mode !== "2v2") { s.team = 0; s.authority = false; } }
  if (R.mode === "2v2") assignAuthorities(R);     // giữ đội đã chọn ở phòng chờ, chỉ định chủ-bàn
  for (const s of R.slots.values()) send(s, {
    t: "start", mode: R.mode, players: joinedList(R), map: R.map, coreTiers: R.coreTiers,
    team: s.team, authority: !!s.authority,
    teammate: R.mode === "2v2" ? (function () { const m = teammateOf(s); return m ? { pid: m.pid, name: m.name, authority: !!m.authority } : null; })() : null,
  });
  R.waveTimer = VS_START_DELAY;
  R.tickTimer = setInterval(() => serverTick(R), 250);
  roomsUpdate();
}
function serverTick(R) {
  if (R.over) return;
  R.waveTimer -= 0.25;
  if (R.waveTimer <= 0) { R.wave++; broadcast(R, { t: "wave", n: R.wave }); R.waveTimer = interval(R); }
  broadcast(R, { t: "clock", wave: R.wave, waveTimer: Math.max(0, R.waveTimer), alive: aliveSlots(R).length });
}
function playerDead(slot) {
  const R = slot.R;
  if (!slot || !slot.alive) return;
  if (R.mode === "2v2") return teamDead(R, slot.team);
  slot.alive = false; R.deathOrder.push(slot.pid);
  broadcast(R, { t: "eliminated", pid: slot.pid });
  const alive = aliveSlots(R);
  if (alive.length <= 1) endMatch(R, alive[0] || null);
  else lobbyUpdate(R);
}
// 2v2: cả ĐỘI thất thủ cùng lúc (bàn chung thủng cửa Tử)
function teamDead(R, team) {
  const members = [...R.slots.values()].filter((s) => s.team === team);
  if (!members.some((s) => s.alive)) return;
  for (const s of members) s.alive = false;
  R.deathOrder.push(team);
  for (const s of members) broadcast(R, { t: "eliminated", pid: s.pid });
  const left = aliveTeams(R);
  if (left.length <= 1) endMatch2v2(R, left[0]); else lobbyUpdate(R);
}
function endMatch(R, winner) {
  R.over = true; if (R.tickTimer) { clearInterval(R.tickTimer); R.tickTimer = null; }
  // xếp hạng: người trụ cuối trước, rồi gục muộn -> gục sớm
  const rank = [];
  if (winner) rank.push(winner.pid);
  for (let i = R.deathOrder.length - 1; i >= 0; i--) rank.push(R.deathOrder[i]);
  const names = {}; for (const s of R.slots.values()) names[s.pid] = s.name;
  broadcast(R, { t: "end", winner: winner ? winner.pid : null, ranking: rank, names, wave: R.wave });
  roomsUpdate();
}
function endMatch2v2(R, winTeam) {
  R.over = true; if (R.tickTimer) { clearInterval(R.tickTimer); R.tickTimer = null; }
  // thứ tự đội: đội thắng trước, rồi đội gục muộn -> sớm
  const teamOrder = [];
  if (winTeam != null) teamOrder.push(winTeam);
  for (let i = R.deathOrder.length - 1; i >= 0; i--) if (!teamOrder.includes(R.deathOrder[i])) teamOrder.push(R.deathOrder[i]);
  const names = {}, teams = {}; for (const s of R.slots.values()) { names[s.pid] = s.name; teams[s.pid] = s.team; }
  const rank = []; for (const tm of teamOrder) for (const s of slotList(R)) if (s.team === tm) rank.push(s.pid);
  broadcast(R, { t: "end", mode: "2v2", winTeam: winTeam != null ? winTeam : null, teamOrder, ranking: rank, names, teams, wave: R.wave });
  roomsUpdate();
}
function resetRoom(R) {
  R.started = false; R.over = false; R.wave = 0; R.deathOrder = [];
  if (R.tickTimer) { clearInterval(R.tickTimer); R.tickTimer = null; }
}
// Gỡ hẳn 1 người khỏi phòng (rời CHỦ ĐỘNG hoặc hết giờ giữ chỗ). Phòng trống -> xoá phòng.
function leaveRoom(slot) {
  const R = slot.R;
  if (slot.graceTimer) { clearTimeout(slot.graceTimer); slot.graceTimer = null; }
  if (R.started && !R.over && slot.alive) {
    // 2v2: chỉ khi CHỦ-BÀN rời hẳn thì đội mới thất thủ (mất bàn mô phỏng); đồng đội rời -> đội chơi thiếu người
    if (R.mode === "2v2") { if (slot.authority) teamDead(R, slot.team); }
    else playerDead(slot);
  }
  R.slots.delete(slot.sid); allSlots.delete(slot.sid);
  if (slot.sid === R.hostSid) R.hostSid = (slotList(R)[0] || {}).sid || null;
  if (R.slots.size === 0) { resetRoom(R); destroyRoom(R); roomsUpdate(); }   // phòng trống hẳn -> xoá khỏi danh sách
  else lobbyUpdate(R);
}
// người rớt mạng/F5 không quay lại trong thời gian giữ chỗ -> coi như thất thủ / rời phòng
function dropSlot(slot) {
  if (slot.connected) return;                 // đã kết nối lại rồi
  leaveRoom(slot);
}

// Tạo slot cho người mới VÀO 1 phòng (dùng cho cả "vào phòng có sẵn" lẫn "tạo phòng").
function enterRoom(c, R, nm) {
  const sid = makeSid(), pid = nextPid++;
  const slot = { sid, pid, R, name: nm || ("Người " + pid), alive: true, connected: true, sock: c.sock, graceTimer: null, pvpQueue: [] };
  R.slots.set(sid, slot); allSlots.set(sid, slot); c.slot = slot;
  browsers.delete(c); c.browsing = false;
  if (R.hostSid == null) R.hostSid = sid;
  if (R.mode === "2v2") autoBalanceTeams(R);           // xếp người mới vào đội thiếu
  send(slot, { t: "welcome", pid, host: sid === R.hostSid, sid, room: R.id });
  lobbyUpdate(R);
}

function handleMsg(c, msg) {
  let o; try { o = JSON.parse(msg); } catch (e) { return; }
  const R = c.slot ? c.slot.R : null;          // phòng của người gửi (nếu đã vào phòng)
  switch (o.t) {
    /* ---- duyệt phòng ---- */
    case "list": { c.browsing = true; browsers.add(c); sendSock(c.sock, { t: "rooms", rooms: roomsList() }); break; }
    case "create": {
      if (c.slot) break;                        // đã ở trong phòng rồi
      if (rooms.size >= MAX_ROOMS) { send({ sock: c.sock }, { t: "reject", why: "Đã đạt tối đa " + MAX_ROOMS + " phòng." }); break; }
      const nm = (o.name || "").toString().slice(0, 14).trim();
      enterRoom(c, makeRoom(), nm); roomsUpdate();
      break;
    }
    case "join": {
      const nm = (o.name || "").toString().slice(0, 14).trim();
      // 1) KẾT NỐI LẠI: sid cũ còn slot -> gắn socket mới vào đúng danh tính (đúng phòng)
      if (o.sid && allSlots.has(o.sid)) {
        const slot = allSlots.get(o.sid), RR = slot.R;
        if (slot.sock && slot.sock !== c.sock) sendSock(slot.sock, { t: "kick", why: "Phiên mở ở nơi khác." });
        if (slot.graceTimer) { clearTimeout(slot.graceTimer); slot.graceTimer = null; }
        slot.sock = c.sock; slot.connected = true; if (nm) slot.name = nm;
        c.slot = slot; browsers.delete(c); c.browsing = false;
        if (RR.hostSid == null) RR.hostSid = slot.sid;
        send(slot, { t: "welcome", pid: slot.pid, host: slot.sid === RR.hostSid, sid: slot.sid, room: RR.id });
        if (RR.started) { const mate = teammateOf(slot); send(slot, { t: "resume", pid: slot.pid, host: slot.sid === RR.hostSid,
          wave: RR.wave, waveTimer: Math.max(0, RR.waveTimer), alive: aliveSlots(RR).length,
          players: joinedList(RR), map: RR.map, over: RR.over, coreTiers: RR.coreTiers,
          mode: RR.mode, team: slot.team, authority: !!slot.authority,
          pvp: slot.pvpQueue || [],   // phép PvP đối thủ giáng vào lúc offline -> client phát lại khi tua bù
          reward: { gold: slot.pendGold || 0, sp: slot.pendSp || 0 },   // 2v2 đồng đội: vàng/KN chủ-bàn chia trong lúc offline -> cộng bù khi nối lại
          teammate: RR.mode === "2v2" && mate ? { pid: mate.pid, name: mate.name, authority: !!mate.authority } : null }); }
        slot.pvpQueue = []; slot.pendGold = 0; slot.pendSp = 0;   // đã bàn giao -> dọn hàng đợi
        lobbyUpdate(RR);
        break;
      }
      // 2) VÀO PHÒNG CÓ SẴN (theo roomId người chơi chọn ở danh sách)
      if (c.slot) break;                        // đã ở trong phòng rồi
      const RR = (o.room != null) ? rooms.get(o.room) : null;
      if (!RR) { send({ sock: c.sock }, { t: "reject", why: "Phòng không còn tồn tại." }); break; }
      if (RR.started) { send({ sock: c.sock }, { t: "reject", why: "Trận đã bắt đầu — chờ ván sau." }); break; }
      if (RR.slots.size >= MAX) { send({ sock: c.sock }, { t: "reject", why: "Phòng đã đủ " + MAX + " người." }); break; }
      enterRoom(c, RR, nm);
      break;
    }
    case "leave": { if (c.slot) { const slot = c.slot; c.slot = null; leaveRoom(slot); c.browsing = true; browsers.add(c); sendSock(c.sock, { t: "rooms", rooms: roomsList() }); } break; }   // rời phòng -> quay về danh sách (vẫn giữ kết nối)
    case "setmode": if (c.slot && c.slot.sid === R.hostSid && !R.started) { R.mode = o.mode === "2v2" ? "2v2" : "ffa"; if (R.mode === "2v2") autoBalanceTeams(R); else clearTeams(R); lobbyUpdate(R); } break;
    case "setteam": if (c.slot && !R.started && R.mode === "2v2" && (o.team === 0 || o.team === 1)) { c.slot.team = o.team; lobbyUpdate(R); } break;
    case "start": if (c.slot && c.slot.sid === R.hostSid && !R.started) { const m = o.mode === "2v2" ? "2v2" : "ffa"; if (m === "2v2" ? R.slots.size === 4 : R.slots.size >= 2) startMatch(R, o.map, m); } break;
    case "snap": if (c.slot) {   // minimap: 2v2 chỉ CHỦ-BÀN gửi, cho đội KHÁC xem; ffa gửi mọi người
      if (R.mode === "2v2") { if (c.slot.authority) for (const s of R.slots.values()) if (s.connected && s.team !== c.slot.team) send(s, { t: "snap", pid: c.slot.pid, team: c.slot.team, s: o.s }); }
      else broadcast(R, { t: "snap", pid: c.slot.pid, s: o.s }, c.slot.pid);
    } break;
    case "pcores": if (c.slot && R.mode !== "2v2") broadcast(R, { t: "pcores", pid: c.slot.pid, cores: o.cores }, c.slot.pid); break;   // khoe lõi đã chọn cho MỌI đối thủ (ffa; 2v2 dùng "skills" cho đồng đội)
    case "spell": if (c.slot) { for (const s of R.slots.values()) if (s.pid !== c.slot.pid) deliverPvp(s, { t: "spell", from: c.slot.pid, key: o.key, data: o.data }); } break; // phép PvP tác động người khác (ffa); ai offline -> đệm lại
    case "vacuum": if (c.slot) {   // Bẫy Hút (ffa): hút quái sang MỘT đối thủ còn sống ngẫu nhiên (kể cả người đang offline -> đệm lại)
      const others = aliveSlots(R).filter((s) => s.pid !== c.slot.pid);
      if (others.length) deliverPvp(others[(Math.random() * others.length) | 0], { t: "vacuum", from: c.slot.pid, data: o.data });
    } break;
    /* ---- 2v2 ---- */
    case "board": if (c.slot && c.slot.authority) send(teammateOf(c.slot), { t: "board", s: o.s }); break;        // chủ-bàn -> đồng đội (xem bàn chung)
    case "cmd": if (c.slot) send(authorityOf(R, c.slot.team), { t: "cmd", from: c.slot.pid, c: o.c }); break;      // đồng đội -> chủ-bàn (xây/nâng/bán/phép)
    case "reward": if (c.slot && c.slot.authority) { const m = teammateOf(c.slot);   // chủ-bàn chia vàng/KN cho đồng đội
      if (m) { if (m.connected && m.sock) send(m, { t: "reward", gold: o.gold, sp: o.sp }); else if (m.alive) { m.pendGold = (m.pendGold || 0) + (o.gold || 0); m.pendSp = (m.pendSp || 0) + (o.sp || 0); } }   // đồng đội offline -> đệm lại, cộng bù khi nối lại
    } break;
    case "skills": if (c.slot) send(teammateOf(c.slot), { t: "skills", pid: c.slot.pid, learned: o.learned, sp: o.sp, cores: o.cores }); break; // khoe phép + lõi đã chọn cho đồng đội
    case "teamspell": if (c.slot) { const a = enemyAuthority(c.slot); if (a && a.alive) deliverPvp(a, { t: "teamspell", key: o.key, data: o.data }); } break;   // phép PvP -> bàn đội địch (chủ-bàn offline -> đệm)
    case "teamvacuum": if (c.slot) { const a = enemyAuthority(c.slot); if (a && a.alive) deliverPvp(a, { t: "teamvacuum", data: o.data }); } break;               // Bẫy Hút -> bàn đội địch (chủ-bàn offline -> đệm)
    case "dead": if (c.slot) { if (R.mode === "2v2") { if (c.slot.authority) teamDead(R, c.slot.team); } else playerDead(c.slot); } break;
    case "again": if (c.slot && c.slot.sid === R.hostSid && R.over) { resetRoom(R); lobbyUpdate(R); } break;
    case "ping": sendSock(c.sock, { t: "pong" }); break;
  }
}

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  const c = { id: nextConnId++, sock: socket, slot: null, buf: Buffer.alloc(0), browsing: false };
  clients.set(c.id, c);

  socket.on("data", (chunk) => {
    c.buf = Buffer.concat([c.buf, chunk]);
    let f;
    while ((f = decodeFrame(c.buf))) {
      c.buf = f.rest;
      if (f.op === 0x8) { try { socket.write(encodeClose()); } catch (e) {} socket.end(); return; }
      else if (f.op === 0x9) { try { socket.write(encodePong(f.payload)); } catch (e) {} }
      else if (f.op === 0x1) handleMsg(c, f.payload.toString("utf8"));
    }
  });
  const gone = () => {
    if (!clients.has(c.id)) return;
    clients.delete(c.id);
    browsers.delete(c);
    const slot = c.slot;
    if (!slot || slot.sock !== c.sock) return;   // socket cũ đã bị thay bằng kết nối lại -> bỏ qua
    const R = slot.R;
    slot.connected = false; slot.sock = null;
    if (R.started && !R.over && slot.alive) {
      // GIỮ CHỖ: chờ người chơi kết nối lại trong GRACE giây rồi mới coi là thất thủ
      broadcast(R, { t: "lobby", players: joinedList(R), started: R.started, canStart: false, hostPid: hostPid(R) });
      slot.graceTimer = setTimeout(() => dropSlot(slot), GRACE * 1000);
    } else {
      dropSlot(slot);                            // ở phòng chờ hoặc trận đã xong -> rời hẳn
    }
  };
  socket.on("close", gone); socket.on("error", gone);
});

/* ------------------------------ Khởi động ------------------------------ */
// Phân loại IP theo tên interface: LAN ảo (ZeroTier zt*/Tailscale tailscale*), LAN thật (eth/wlan/en/wl), bỏ docker.
function classifyIPs() {
  const virt = [], real = []; const ifs = os.networkInterfaces();
  for (const name in ifs) {
    if (/^(docker|br-|veth|virbr|lo)/.test(name)) continue;         // bỏ bridge docker & loopback (gây nhiễu)
    for (const a of ifs[name]) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (/^(zt|tailscale|ham|tun|nebula)/.test(name)) virt.push({ ip: a.address, dev: name });
      else real.push({ ip: a.address, dev: name });
    }
  }
  return { virt, real };
}
server.listen(PORT, "0.0.0.0", () => {
  const { virt, real } = classifyIPs();
  const line = (ip) => "http://" + ip + ":" + PORT + "/";
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║  Sinh Tử Môn — Máy chủ đối kháng đang chạy         ║");
  console.log("╚═══════════════════════════════════════════════════╝");
  console.log("  • Trên MÁY NÀY mở:            " + line("localhost"));
  if (real.length) { console.log("  • Bạn bè CÙNG LAN thật mở:"); for (const r of real) console.log("      " + line(r.ip) + "   (" + r.dev + ")"); }
  if (virt.length) {
    console.log("  • Bạn bè Ở XA qua LAN ẢO (VPN) mở:");
    for (const v of virt) console.log("      " + line(v.ip) + "   (" + v.dev + " — gửi địa chỉ NÀY cho bạn bè)");
  } else {
    console.log("  • LAN ảo (VPN) cho bạn ở xa: CHƯA thấy interface zt*/tailscale*.");
    console.log("      → Cài & vào mạng ZeroTier rồi khởi động lại server. Xem HUONGDAN-LAN-AO.md");
  }
  console.log("  (Trong game: chọn ⚔ Đối kháng → tab 'Mạng LAN' → Vào phòng)");
});
