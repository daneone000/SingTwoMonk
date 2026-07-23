/* =====================================================================
 * net.js — Đối kháng qua MẠNG LAN (client)
 *   • NetClient: bọc WebSocket tới server.js
 *   • NetMatch : lái sân cục bộ theo sự kiện server (đợt đồng bộ, phép PvP,
 *                loại/thắng), gửi snapshot để đối thủ vẽ minimap
 * ===================================================================== */
(function (STM) {
  "use strict";
  const CFG = STM.CFG, TILE = CFG.TILE, CELL = CFG.CELL;

  /* --------- LƯU PHIÊN (để F5/mất mạng vẫn vào lại được) --------- */
  const LS = (typeof localStorage !== "undefined") ? localStorage : null;
  STM.saveSession = (o) => { try { LS && LS.setItem("stm.session", JSON.stringify(o)); } catch (e) {} };
  STM.loadSession = () => { try { return JSON.parse((LS && LS.getItem("stm.session")) || "null"); } catch (e) { return null; } };
  STM.clearSession = () => { try { if (LS) { LS.removeItem("stm.session"); LS.removeItem("stm.board"); } } catch (e) {} };
  STM.saveBoard = (b) => { try { LS && LS.setItem("stm.board", JSON.stringify(b)); } catch (e) {} };
  STM.loadBoard = () => { try { return JSON.parse((LS && LS.getItem("stm.board")) || "null"); } catch (e) { return null; } };

  /* --------------------------- NetClient --------------------------- */
  class NetClient {
    constructor(url, onMsg, onOpen, onClose) {
      this.url = url; this.onMsg = onMsg; this.onOpen = onOpen; this.onClose = onClose;
      this.ws = new WebSocket(url);
      this.ws.onopen = () => { this._alive = true; if (onOpen) onOpen(); };
      this.ws.onmessage = (ev) => { let o; try { o = JSON.parse(ev.data); } catch (e) { return; } onMsg(o); };
      this.ws.onclose = () => { this._alive = false; if (onClose) onClose(); };
      this.ws.onerror = () => {};
    }
    send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
    close() { try { this.ws.close(); } catch (e) {} }
  }

  /* --------------------------- NetMatch --------------------------- */
  class NetMatch {
    constructor(game, client, myName) {
      this.game = game; this.client = client; this.myName = myName;
      this.net = true;
      this.myPid = null; this.isHost = false;
      this.players = [];             // [{pid,name,host,alive}]
      this.names = {};               // pid -> name
      this.snaps = {};               // pid -> snapshot (đối thủ)
      this.wave = 0; this.waveTimer = 0; this._alive = 1;
      this.started = false; this.over = false; this.winner = null; this.ranking = [];
      this.onLobby = null; this.onStart = null; this.onEnd = null; this.onChange = null;
      this.onResume = null; this.onKick = null;
      this.sid = null; this._saveT = 0;
      this._sentDead = false; this._pushT = null;
      // gắn vào game
      game.reset("endless"); game.versus = true; game.netMatch = this; game.name = myName;
    }
    join() { this.client.send({ t: "join", name: this.myName, sid: this.sid || undefined }); }
    startMatch() { if (this.isHost) this.client.send({ t: "start", map: STM.CFG.getMapId() }); }
    playAgain() { if (this.isHost) this.client.send({ t: "again" }); }
    sendSpell(key, data) { this.client.send({ t: "spell", key, data }); }
    sendVacuum(data) { this.client.send({ t: "vacuum", data }); }   // Bẫy Hút: server chọn 1 đối thủ ngẫu nhiên

    handle(o) {
      const g = this.game, map = { trieuHoi: "pvpSummon", huyetQuy: "pvpHaste", maGiap: "pvpArmor", diaChan: "pvpQuake" };
      switch (o.t) {
        case "welcome":
          this.myPid = o.pid; this.isHost = o.host; if (o.sid) this.sid = o.sid;
          STM.saveSession({ sid: this.sid, host: (typeof location !== "undefined" ? location.host : ""), name: this.myName, active: true });
          break;
        case "reject": if (this.onReject) this.onReject(o.why); break;
        case "kick": STM.clearSession(); if (this.onKick) this.onKick(o.why); break;
        case "resume": {   // KẾT NỐI LẠI vào trận đang diễn ra -> khôi phục sân từ bản lưu cục bộ
          this.started = true; this.over = !!o.over; this.myPid = o.pid; this.isHost = o.host;
          this.players = o.players || []; for (const p of this.players) this.names[p.pid] = p.name;
          if (o.map) STM.CFG.setMap(o.map);
          const saved = STM.loadBoard();
          if (saved) g.restore(saved); else { g.reset("endless"); g.started = o.wave > 0; }
          g.versus = true; g.netMatch = this; g.name = this.myName; g.wave = o.wave;
          this.wave = o.wave; this.waveTimer = o.waveTimer; this._alive = o.alive; this._sentDead = false;
          this._beginPush();
          if (this.onResume) this.onResume(this);
          if (this.onChange) this.onChange();
          break;
        }
        case "lobby":
          this.players = o.players; this.isHost = o.hostPid === this.myPid; this.canStart = o.canStart;
          for (const p of o.players) this.names[p.pid] = p.name;
          if (!this.started && this.onLobby) this.onLobby(this);
          break;
        case "start":
          this.started = true; this.players = o.players;
          // bản đồ chủ phòng chọn -> dựng lại sân sạch cho mọi máy trước khi vào trận
          if (o.map) STM.CFG.setMap(o.map);
          g.reset("endless"); g.versus = true; g.netMatch = this; g.name = this.myName;
          for (const p of o.players) this.names[p.pid] = p.name;
          STM.saveSession({ sid: this.sid, host: (typeof location !== "undefined" ? location.host : ""), name: this.myName, active: true });
          STM.saveBoard(g.serialize());
          this._beginPush();
          if (this.onStart) this.onStart(this);
          break;
        case "wave": this.wave = o.n; g.receiveWave(o.n); if (this.onChange) this.onChange(); break;
        case "clock": this.wave = o.wave; this.waveTimer = o.waveTimer; this._alive = o.alive; if (this.onChange) this.onChange(); break;
        case "snap": this.snaps[o.pid] = o.s; break;                    // minimap đối thủ
        case "spell": if (map[o.key]) g[map[o.key]](o.data && o.data.type); if (this.onChange) this.onChange(); break;  // đối thủ đánh mình (trieuHoi kèm chủng chung)
        case "vacuum": g.spawnTransferred(o.data); if (this.onChange) this.onChange(); break;   // đối thủ hút quái sang sân mình
        case "eliminated": { const p = this.players.find((x) => x.pid === o.pid); if (p) p.alive = false; if (this.onChange) this.onChange(); break; }
        case "end":
          this.over = true; this.winner = o.winner; this.ranking = o.ranking; this.names = o.names || this.names; this.endWave = o.wave;
          this._stopPush(); STM.clearSession();       // trận xong -> không còn phiên để nối lại
          if (this.onEnd) this.onEnd(this);
          break;
      }
    }
    // đẩy snapshot định kỳ + phát hiện mình thua + làm mới HUD (kể cả khi sân đã đóng băng)
    _beginPush() {
      if (this._pushT) return;
      this._pushT = setInterval(() => {
        const g = this.game;
        if (!this._sentDead && g.gameOver) { this._sentDead = true; this.client.send({ t: "dead" }); }
        if (!g.gameOver) this.client.send({ t: "snap", s: g.snapshot() });
        // lưu sân định kỳ (~2s) để F5/mất mạng còn khôi phục được
        if (!g.gameOver && (this._saveT = (this._saveT + 1) % 10) === 0) STM.saveBoard(g.serialize());
        if (this.onChange) this.onChange();       // làm mới minimap/đồng hồ dù local đã chết
      }, 200);
    }
    _stopPush() { if (this._pushT) { clearInterval(this._pushT); this._pushT = null; } }
    leave() { this._stopPush(); STM.clearSession(); this.client.close(); }

    aliveN() { return this._alive; }
    opponentViews() {
      return this.players.filter((p) => p.pid !== this.myPid).map((p) => {
        const snap = this.snaps[p.pid];
        return { pid: p.pid, name: p.name, wave: snap ? snap.w : 0, lives: snap ? snap.lv : 10, dead: (snap && snap.go) || p.alive === false,
          draw: (cx, sz) => STM.drawMiniSnap(cx, sz, snap, this.game.map) };
      });
    }
    resultRows() {
      return this.ranking.map((pid, i) => ({ pid, name: this.names[pid] || ("Người " + pid), win: i === 0, me: pid === this.myPid, rank: i + 1 }));
    }
  }

  /* -------- vẽ minimap đối thủ TỪ SNAPSHOT (nền lava lấy từ map cục bộ) -------- */
  STM.drawMiniSnap = function (ctx, size, snap, map) {
    const s = size / CFG.COLS, grid = map.grid;
    ctx.save();
    ctx.fillStyle = "#4a5238"; ctx.fillRect(0, 0, size, size);
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) if (grid[r][c] === CELL.WATER) { ctx.fillStyle = "#7a2410"; ctx.fillRect(c * s, r * s, s + .5, s + .5); }
    ctx.fillStyle = "#2ec76b"; ctx.fillRect(0, 0, s * 2, s * .9);
    ctx.fillStyle = "#e0503a"; ctx.fillRect(size - s * 2, size - s * .9, s * 2, s * .9);
    if (snap) {
      for (const t of snap.t) { ctx.fillStyle = t[3] ? "#c56bff" : (t[2] ? "#ffe08a" : "#9a8a55"); const w = t[3] ? s * .4 : s * .6, o = t[3] ? s * .3 : s * .2; ctx.fillRect(t[0] * s + o, t[1] * s + o, w, w); }
      for (const e of snap.e) { ctx.fillStyle = e[2] ? "#ff9de0" : "#ff5a5a"; ctx.fillRect(e[0] / TILE * s - 1, e[1] / TILE * s - 1, 2.4, 2.4); }
    }
    ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, size - 1, size - 1);
    if (snap && snap.go) { ctx.fillStyle = "rgba(20,0,0,.55)"; ctx.fillRect(0, 0, size, size); ctx.fillStyle = "#ff8a8a"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("THẤT THỦ", size / 2, size / 2 + 4); ctx.textAlign = "left"; }
    ctx.restore();
  };

  STM.NetClient = NetClient;
  STM.NetMatch = NetMatch;
})(window.STM = window.STM || {});
