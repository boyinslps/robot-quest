#!/bin/bash
# Mac / Linux：在終端機執行  bash 啟動模擬器.command
cd "$(dirname "$0")" || exit 1
PORT=8765
echo "SPIKE 模擬器（本機版）：http://127.0.0.1:$PORT/   （關掉這個視窗或按 Ctrl+C 就結束）"
( sleep 2; (command -v open >/dev/null && open "http://127.0.0.1:$PORT/") || (command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:$PORT/") ) >/dev/null 2>&1 &
if command -v python3 >/dev/null; then python3 -m http.server $PORT --bind 127.0.0.1; else python -m http.server $PORT --bind 127.0.0.1; fi
