#!/bin/bash
cd "$(dirname "$0")"
PORT=${1:-8765}
echo ""
echo "🤎  KIND SIGMA UA Planner"
echo "─────────────────────────"
echo "→  Open: http://localhost:$PORT"
echo "→  Stop: Ctrl+C"
echo ""
python3 -m http.server $PORT
