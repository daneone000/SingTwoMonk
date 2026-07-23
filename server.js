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

let nextId = 1;
const clients = new Map();   // id -> {id, sock, name, pid, alive}

function send(c, obj) { try { c.sock.write(encodeText(JSON.stringify(obj))); } catch (e) {} }
function broadcast(obj, exceptId) { for (const c of clients.values()) if (c.id !== exceptId && c.joined) send(c, obj); }

/* ------------------------------ Phòng ------------------------------ */
const room = {
  started: false, over: false,
  wave: 0, waveTimer: 0, tickTimer: null,
  hostId: null,
  VS_START_DELAY: 30, WAVE_INTERVAL: 15, WAVE_INTERVAL_LATE: 20, LATE_WAVE: 30, MAX: 5,
  deathOrder: [],   // pid theo thứ tự gục (sớm nhất trước)
};
function joinedList() {
  return [...clients.values()].filter((c) => c.joined).sort((a, b) => a.pid - b.pid)
    .map((c) => ({ pid: c.pid, name: c.name, host: c.id === room.hostId, alive: c.alive }));
}
function lobbyUpdate() {
  const players = joinedList();
  broadcast({ t: "lobby", players, started: room.started, canStart: players.length >= 2, hostPid: hostPid() });
}
function hostPid() { const h = clients.get(room.hostId); return h ? h.pid : null; }
function aliveClients() { return [...clients.values()].filter((c) => c.joined && c.alive); }
function interval() { return room.wave >= room.LATE_WAVE ? room.WAVE_INTERVAL_LATE : room.WAVE_INTERVAL; }

function startMatch(mapId) {
  if (room.started) return;
  room.started = true; room.over = false; room.wave = 0; room.deathOrder = [];
  room.map = mapId || room.map || null;          // bản đồ do CHỦ PHÒNG chọn, áp cho mọi máy
  for (const c of clients.values()) if (c.joined) c.alive = true;
  broadcast({ t: "start", players: joinedList(), map: room.map });
  room.waveTimer = room.VS_START_DELAY;
  room.tickTimer = setInterval(serverTick, 250);
}
function serverTick() {
  if (room.over) return;
  room.waveTimer -= 0.25;
  if (room.waveTimer <= 0) { room.wave++; broadcast({ t: "wave", n: room.wave }); room.waveTimer = interval(); }
  broadcast({ t: "clock", wave: room.wave, waveTimer: Math.max(0, room.waveTimer), alive: aliveClients().length });
}
function playerDead(c) {
  if (!c.alive) return;
  c.alive = false; room.deathOrder.push(c.pid);
  broadcast({ t: "eliminated", pid: c.pid });
  const alive = aliveClients();
  if (alive.length <= 1) endMatch(alive[0] || null);
  else lobbyUpdate();
}
function endMatch(winner) {
  room.over = true; if (room.tickTimer) clearInterval(room.tickTimer);
  // xếp hạng: người trụ cuối trước, rồi gục muộn -> gục sớm
  const rank = [];
  if (winner) rank.push(winner.pid);
  for (let i = room.deathOrder.length - 1; i >= 0; i--) rank.push(room.deathOrder[i]);
  const names = {}; for (const c of clients.values()) names[c.pid] = c.name;
  broadcast({ t: "end", winner: winner ? winner.pid : null, ranking: rank, names, wave: room.wave });
}
function resetRoom() {
  room.started = false; room.over = false; room.wave = 0; room.deathOrder = [];
  if (room.tickTimer) { clearInterval(room.tickTimer); room.tickTimer = null; }
}

function handleMsg(c, msg) {
  let o; try { o = JSON.parse(msg); } catch (e) { return; }
  switch (o.t) {
    case "join": {
      if (c.joined) break;
      if (room.started) { send(c, { t: "reject", why: "Trận đã bắt đầu — chờ ván sau." }); break; }
      if (joinedList().length >= room.MAX) { send(c, { t: "reject", why: "Phòng đã đủ " + room.MAX + " người." }); break; }
      c.name = (o.name || "").toString().slice(0, 14).trim() || ("Người " + c.pid);
      c.joined = true; c.alive = true;
      if (room.hostId == null) room.hostId = c.id;
      send(c, { t: "welcome", pid: c.pid, host: c.id === room.hostId });
      lobbyUpdate();
      break;
    }
    case "start": if (c.id === room.hostId && !room.started && joinedList().length >= 2) startMatch(o.map); break;
    case "snap": broadcast({ t: "snap", pid: c.pid, s: o.s }, c.id); break;      // minimap của người khác
    case "spell": broadcast({ t: "spell", from: c.pid, key: o.key, data: o.data }, c.id); break; // phép PvP tác động người khác (kèm data, vd chủng Triệu Hồi)
    case "dead": playerDead(c); break;
    case "again": if (c.id === room.hostId && room.over) { resetRoom(); lobbyUpdate(); } break;
    case "ping": send(c, { t: "pong" }); break;
  }
}

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  const c = { id: nextId++, sock: socket, name: "", pid: 0, joined: false, alive: false, buf: Buffer.alloc(0) };
  c.pid = c.id;
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
    const wasHost = c.id === room.hostId;
    clients.delete(c.id);
    if (room.started && !room.over) playerDead(c);
    if (wasHost) { room.hostId = [...clients.values()].filter((x) => x.joined)[0]?.id ?? null; }
    if (joinedList().length === 0) resetRoom();
    lobbyUpdate();
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
