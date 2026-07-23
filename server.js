/* =====================================================================
 * server.js — Máy chủ LAN cho Sinh Tử Môn (Node thuần, KHÔNG cần thư viện)
 *   • Phục vụ file tĩnh (mở http://<IP-LAN>:PORT/ trên máy khác để vào)
 *   • WebSocket tự cài (RFC6455) — phòng chờ + đồng bộ đợt + relay snapshot/phép
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
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/_stm") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ stm: 1, lan: true })); return; }  // marker để client biết đây LÀ máy chủ LAN
  if (p === "/") p = "/index.html";
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

let nextConnId = 1, nextPid = 1;
const clients = new Map();   // id kết nối -> connection {id, sock, buf, slot}
// slot = DANH TÍNH người chơi, sống sót qua F5/rớt mạng nhờ sid (session id).
//   {sid, pid, name, alive, connected, sock, graceTimer}
const slots = new Map();     // sid -> slot

function makeSid() { return crypto.randomBytes(9).toString("hex"); }
function sendSock(sock, obj) { try { sock.write(encodeText(JSON.stringify(obj))); } catch (e) {} }
function send(slot, obj) { if (slot && slot.sock) sendSock(slot.sock, obj); }
function broadcast(obj, exceptPid) { for (const s of slots.values()) if (s.connected && s.pid !== exceptPid) send(s, obj); }

/* ------------------------------ Phòng ------------------------------ */
const room = {
  started: false, over: false,
  mode: "ffa",      // "ffa" (cá nhân, tối đa 5) | "2v2" (2 đội × 2, chung bàn mỗi đội)
  wave: 0, waveTimer: 0, tickTimer: null,
  hostSid: null, map: null,
  VS_START_DELAY: 30, WAVE_INTERVAL: 15, WAVE_INTERVAL_LATE: 20, LATE_WAVE: 30, MAX: 5,
  GRACE: 60,        // giây giữ chỗ cho người rớt mạng/F5 trước khi coi là thất thủ
  deathOrder: [],   // pid (ffa) hoặc team (2v2) theo thứ tự gục (sớm nhất trước)
};
function slotList() { return [...slots.values()].sort((a, b) => a.pid - b.pid); }
function joinedList() {
  return slotList().map((s) => ({ pid: s.pid, name: s.name, host: s.sid === room.hostSid, alive: s.alive, connected: s.connected, team: s.team, authority: !!s.authority }));
}
/* ---- 2v2: đội, chủ-bàn (authority), đồng đội, đối thủ ---- */
function teammateOf(slot) { return [...slots.values()].find((s) => s !== slot && s.team === slot.team) || null; }
function authorityOf(team) { return [...slots.values()].find((s) => s.team === team && s.authority) || null; }
function enemyAuthority(slot) { return authorityOf(slot.team === 0 ? 1 : 0); }
function aliveTeams() { const t = new Set(); for (const s of slots.values()) if (s.alive) t.add(s.team); return [...t]; }
function assignTeams() { slotList().forEach((s, i) => { s.team = i < 2 ? 0 : 1; s.authority = (i % 2 === 0); }); }
function canStartNow() { return room.mode === "2v2" ? joinedList().length === 4 : joinedList().length >= 2; }
function lobbyUpdate() {
  broadcast({ t: "lobby", players: joinedList(), started: room.started, canStart: canStartNow(), hostPid: hostPid(), mode: room.mode });
}
function hostPid() { const h = slots.get(room.hostSid); return h ? h.pid : null; }
function aliveSlots() { return [...slots.values()].filter((s) => s.alive); }
function interval() { return room.wave >= room.LATE_WAVE ? room.WAVE_INTERVAL_LATE : room.WAVE_INTERVAL; }

function startMatch(mapId, mode) {
  if (room.started) return;
  if (mode === "2v2" && slots.size !== 4) return;   // 2v2 cần đúng 4 người
  room.mode = mode === "2v2" ? "2v2" : "ffa";
  room.started = true; room.over = false; room.wave = 0; room.deathOrder = [];
  room.map = mapId || room.map || null;          // bản đồ do CHỦ PHÒNG chọn, áp cho mọi máy
  for (const s of slots.values()) { s.alive = true; s.team = 0; s.authority = false; }
  if (room.mode === "2v2") assignTeams();
  for (const s of slots.values()) send(s, {
    t: "start", mode: room.mode, players: joinedList(), map: room.map,
    team: s.team, authority: !!s.authority,
    teammate: room.mode === "2v2" ? (function () { const m = teammateOf(s); return m ? { pid: m.pid, name: m.name, authority: !!m.authority } : null; })() : null,
  });
  room.waveTimer = room.VS_START_DELAY;
  room.tickTimer = setInterval(serverTick, 250);
}
function serverTick() {
  if (room.over) return;
  room.waveTimer -= 0.25;
  if (room.waveTimer <= 0) { room.wave++; broadcast({ t: "wave", n: room.wave }); room.waveTimer = interval(); }
  broadcast({ t: "clock", wave: room.wave, waveTimer: Math.max(0, room.waveTimer), alive: aliveSlots().length });
}
function playerDead(slot) {
  if (!slot || !slot.alive) return;
  if (room.mode === "2v2") return teamDead(slot.team);
  slot.alive = false; room.deathOrder.push(slot.pid);
  broadcast({ t: "eliminated", pid: slot.pid });
  const alive = aliveSlots();
  if (alive.length <= 1) endMatch(alive[0] || null);
  else lobbyUpdate();
}
// 2v2: cả ĐỘI thất thủ cùng lúc (bàn chung thủng cửa Tử)
function teamDead(team) {
  const members = [...slots.values()].filter((s) => s.team === team);
  if (!members.some((s) => s.alive)) return;
  for (const s of members) s.alive = false;
  room.deathOrder.push(team);
  for (const s of members) broadcast({ t: "eliminated", pid: s.pid });
  const left = aliveTeams();
  if (left.length <= 1) endMatch2v2(left[0]); else lobbyUpdate();
}
function endMatch(winner) {
  room.over = true; if (room.tickTimer) { clearInterval(room.tickTimer); room.tickTimer = null; }
  // xếp hạng: người trụ cuối trước, rồi gục muộn -> gục sớm
  const rank = [];
  if (winner) rank.push(winner.pid);
  for (let i = room.deathOrder.length - 1; i >= 0; i--) rank.push(room.deathOrder[i]);
  const names = {}; for (const s of slots.values()) names[s.pid] = s.name;
  broadcast({ t: "end", winner: winner ? winner.pid : null, ranking: rank, names, wave: room.wave });
}
function endMatch2v2(winTeam) {
  room.over = true; if (room.tickTimer) { clearInterval(room.tickTimer); room.tickTimer = null; }
  // thứ tự đội: đội thắng trước, rồi đội gục muộn -> sớm
  const teamOrder = [];
  if (winTeam != null) teamOrder.push(winTeam);
  for (let i = room.deathOrder.length - 1; i >= 0; i--) if (!teamOrder.includes(room.deathOrder[i])) teamOrder.push(room.deathOrder[i]);
  const names = {}, teams = {}; for (const s of slots.values()) { names[s.pid] = s.name; teams[s.pid] = s.team; }
  const rank = []; for (const tm of teamOrder) for (const s of slotList()) if (s.team === tm) rank.push(s.pid);
  broadcast({ t: "end", mode: "2v2", winTeam: winTeam != null ? winTeam : null, teamOrder, ranking: rank, names, teams, wave: room.wave });
}
function resetRoom() {
  room.started = false; room.over = false; room.wave = 0; room.deathOrder = [];
  if (room.tickTimer) { clearInterval(room.tickTimer); room.tickTimer = null; }
}
// người rớt mạng/F5 không quay lại trong thời gian giữ chỗ -> coi như thất thủ
function dropSlot(slot) {
  if (slot.connected) return;                 // đã kết nối lại rồi
  if (slot.graceTimer) { clearTimeout(slot.graceTimer); slot.graceTimer = null; }
  if (room.started && !room.over) {
    // 2v2: chỉ khi CHỦ-BÀN rời hẳn thì đội mới thất thủ (mất bàn mô phỏng); đồng đội rời -> đội chơi thiếu người
    if (room.mode === "2v2") { if (slot.authority) teamDead(slot.team); }
    else playerDead(slot);
  }
  slots.delete(slot.sid);
  if (slot.sid === room.hostSid) room.hostSid = (slotList()[0] || {}).sid || null;
  if (slots.size === 0) resetRoom();
  lobbyUpdate();
}

function handleMsg(c, msg) {
  let o; try { o = JSON.parse(msg); } catch (e) { return; }
  switch (o.t) {
    case "join": {
      const nm = (o.name || "").toString().slice(0, 14).trim();
      // 1) KẾT NỐI LẠI: sid cũ còn slot -> gắn socket mới vào đúng danh tính
      if (o.sid && slots.has(o.sid)) {
        const slot = slots.get(o.sid);
        if (slot.sock && slot.sock !== c.sock) sendSock(slot.sock, { t: "kick", why: "Phiên mở ở nơi khác." });
        if (slot.graceTimer) { clearTimeout(slot.graceTimer); slot.graceTimer = null; }
        slot.sock = c.sock; slot.connected = true; if (nm) slot.name = nm;
        c.slot = slot;
        if (room.hostSid == null) room.hostSid = slot.sid;
        send(slot, { t: "welcome", pid: slot.pid, host: slot.sid === room.hostSid, sid: slot.sid });
        if (room.started) { const mate = teammateOf(slot); send(slot, { t: "resume", pid: slot.pid, host: slot.sid === room.hostSid,
          wave: room.wave, waveTimer: Math.max(0, room.waveTimer), alive: aliveSlots().length,
          players: joinedList(), map: room.map, over: room.over,
          mode: room.mode, team: slot.team, authority: !!slot.authority,
          teammate: room.mode === "2v2" && mate ? { pid: mate.pid, name: mate.name, authority: !!mate.authority } : null }); }
        lobbyUpdate();
        break;
      }
      // 2) VÀO MỚI
      if (c.slot) break;                       // đã ở trong phòng rồi
      if (room.started) { send({ sock: c.sock }, { t: "reject", why: "Trận đã bắt đầu — chờ ván sau." }); break; }
      if (slots.size >= room.MAX) { send({ sock: c.sock }, { t: "reject", why: "Phòng đã đủ " + room.MAX + " người." }); break; }
      const sid = makeSid(), pid = nextPid++;
      const slot = { sid, pid, name: nm || ("Người " + pid), alive: true, connected: true, sock: c.sock, graceTimer: null };
      slots.set(sid, slot); c.slot = slot;
      if (room.hostSid == null) room.hostSid = sid;
      send(slot, { t: "welcome", pid, host: sid === room.hostSid, sid });
      lobbyUpdate();
      break;
    }
    case "setmode": if (c.slot && c.slot.sid === room.hostSid && !room.started) { room.mode = o.mode === "2v2" ? "2v2" : "ffa"; lobbyUpdate(); } break;
    case "start": if (c.slot && c.slot.sid === room.hostSid && !room.started) { const m = o.mode === "2v2" ? "2v2" : "ffa"; if (m === "2v2" ? slots.size === 4 : slots.size >= 2) startMatch(o.map, m); } break;
    case "snap": if (c.slot) {   // minimap: 2v2 chỉ CHỦ-BÀN gửi, cho đội KHÁC xem; ffa gửi mọi người
      if (room.mode === "2v2") { if (c.slot.authority) for (const s of slots.values()) if (s.connected && s.team !== c.slot.team) send(s, { t: "snap", pid: c.slot.pid, team: c.slot.team, s: o.s }); }
      else broadcast({ t: "snap", pid: c.slot.pid, s: o.s }, c.slot.pid);
    } break;
    case "spell": if (c.slot) broadcast({ t: "spell", from: c.slot.pid, key: o.key, data: o.data }, c.slot.pid); break; // phép PvP tác động người khác (ffa)
    case "vacuum": if (c.slot) {   // Bẫy Hút (ffa): hút quái sang MỘT đối thủ còn sống ngẫu nhiên
      const others = aliveSlots().filter((s) => s.pid !== c.slot.pid && s.connected);
      if (others.length) send(others[(Math.random() * others.length) | 0], { t: "vacuum", from: c.slot.pid, data: o.data });
    } break;
    /* ---- 2v2 ---- */
    case "board": if (c.slot && c.slot.authority) send(teammateOf(c.slot), { t: "board", s: o.s }); break;        // chủ-bàn -> đồng đội (xem bàn chung)
    case "cmd": if (c.slot) send(authorityOf(c.slot.team), { t: "cmd", from: c.slot.pid, c: o.c }); break;        // đồng đội -> chủ-bàn (xây/nâng/bán/phép)
    case "reward": if (c.slot && c.slot.authority) send(teammateOf(c.slot), { t: "reward", gold: o.gold, sp: o.sp }); break; // chủ-bàn chia vàng/KN cho đồng đội
    case "skills": if (c.slot) send(teammateOf(c.slot), { t: "skills", pid: c.slot.pid, learned: o.learned, sp: o.sp }); break; // khoe phép đã học cho đồng đội (chỉ xem)
    case "teamspell": if (c.slot) { const a = enemyAuthority(c.slot); if (a && a.alive) send(a, { t: "teamspell", key: o.key, data: o.data }); } break;   // phép PvP -> bàn đối thủ
    case "teamvacuum": if (c.slot) { const a = enemyAuthority(c.slot); if (a && a.alive) send(a, { t: "teamvacuum", data: o.data }); } break;               // Bẫy Hút -> bàn đối thủ
    case "dead": if (c.slot) { if (room.mode === "2v2") { if (c.slot.authority) teamDead(c.slot.team); } else playerDead(c.slot); } break;
    case "again": if (c.slot && c.slot.sid === room.hostSid && room.over) { resetRoom(); lobbyUpdate(); } break;
    case "ping": sendSock(c.sock, { t: "pong" }); break;
  }
}

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  const c = { id: nextConnId++, sock: socket, slot: null, buf: Buffer.alloc(0) };
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
    const slot = c.slot;
    if (!slot || slot.sock !== c.sock) return;   // socket cũ đã bị thay bằng kết nối lại -> bỏ qua
    slot.connected = false; slot.sock = null;
    if (room.started && !room.over && slot.alive) {
      // GIỮ CHỖ: chờ người chơi kết nối lại trong room.GRACE giây rồi mới coi là thất thủ
      broadcast({ t: "lobby", players: joinedList(), started: room.started, canStart: false, hostPid: hostPid() });
      slot.graceTimer = setTimeout(() => dropSlot(slot), room.GRACE * 1000);
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
