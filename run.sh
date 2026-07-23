#!/usr/bin/env bash
# Chạy Sinh Tử Môn (bản local).
#   • Có Node  -> chạy server.js: chơi 1 người, đấu AI, VÀ đối kháng qua MẠNG LAN.
#   • Không Node -> fallback python (chỉ 1 người + đấu AI, KHÔNG có LAN).
# Tự chọn cổng trống nếu cổng mặc định bị chiếm.
set -e
cd "$(dirname "$0")"

port_busy() { (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -q ":$1[[:space:]]"; }

PORT="${1:-8090}"
if port_busy "$PORT"; then
  echo "⚠ Cổng $PORT đang bận, tìm cổng khác…"
  for p in 8090 8000 5500 9000 8888 8081 3000; do
    if ! port_busy "$p"; then PORT="$p"; break; fi
  done
fi

URL="http://localhost:${PORT}"
command -v xdg-open >/dev/null 2>&1 && (sleep 1 && xdg-open "$URL" >/dev/null 2>&1 &) || true

if command -v node >/dev/null 2>&1; then
  echo "▶ Sinh Tử Môn (máy chủ LAN) — chọn ⚔ → tab 'Mạng LAN' để chơi cùng máy khác."
  exec env PORT="$PORT" node server.js
else
  echo "▶ Sinh Tử Môn tại: ${URL}  (không có Node -> KHÔNG hỗ trợ LAN)"
  echo "  (Nhấn Ctrl+C để dừng)"
  exec python3 -m http.server "$PORT"
fi
