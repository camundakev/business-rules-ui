#!/usr/bin/env bash
# Lead Programs PoC — start/stop the workers + Vite dev server reliably.
#
# Usage:
#   ./dev.sh up       Start both in background (logs in .dev/)
#   ./dev.sh down     Stop both (graceful TERM, then KILL after 3s)
#   ./dev.sh status   Show what's running
#   ./dev.sh logs     Tail both logs together (Ctrl+C to stop tailing)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEV_DIR="$ROOT/.dev"
mkdir -p "$DEV_DIR"

WORKERS_PID="$DEV_DIR/workers.pid"
WORKERS_LOG="$DEV_DIR/workers.log"
FRONTEND_PID="$DEV_DIR/frontend.pid"
FRONTEND_LOG="$DEV_DIR/frontend.log"
VITE_PORT=5173

is_running() {
  local pidfile="$1"
  [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

start_one() {
  local name="$1" dir="$2" cmd="$3" pidfile="$4" logfile="$5"
  if is_running "$pidfile"; then
    echo "  $name already running (PID $(cat "$pidfile"))"
    return 0
  fi
  echo "  starting $name..."
  ( cd "$dir" && nohup $cmd > "$logfile" 2>&1 & echo $! > "$pidfile" )
  sleep 0.3
  if is_running "$pidfile"; then
    echo "  $name started (PID $(cat "$pidfile"), log: $logfile)"
  else
    echo "  $name failed to start — check $logfile"
    return 1
  fi
}

stop_one() {
  local name="$1" pidfile="$2"
  if ! is_running "$pidfile"; then
    echo "  $name not running"
    [[ -f "$pidfile" ]] && rm -f "$pidfile"
    return 0
  fi
  local pid; pid=$(cat "$pidfile")
  echo "  stopping $name (PID $pid)..."
  # TERM the whole process group so npm + node child both die
  kill -TERM -- -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "  $name didn't exit gracefully, sending KILL"
    kill -KILL -- -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$pidfile"
  echo "  $name stopped"
}

cmd_up() {
  echo "▶ Starting services"
  start_one "workers"  "$ROOT/workers"  "npm start"   "$WORKERS_PID"  "$WORKERS_LOG"
  start_one "frontend" "$ROOT/frontend" "npm run dev" "$FRONTEND_PID" "$FRONTEND_LOG"
  echo ""
  echo "  Vite:    http://localhost:$VITE_PORT"
  echo "  Logs:    ./dev.sh logs"
  echo "  Stop:    ./dev.sh down"
}

cmd_down() {
  echo "▶ Stopping services"
  stop_one "frontend" "$FRONTEND_PID"
  stop_one "workers"  "$WORKERS_PID"
  # Belt-and-suspenders: anything still bound to Vite's port?
  local stragglers
  stragglers=$(lsof -ti :"$VITE_PORT" 2>/dev/null || true)
  if [[ -n "$stragglers" ]]; then
    echo "  killing stragglers on :$VITE_PORT — $stragglers"
    kill -KILL $stragglers 2>/dev/null || true
  fi
}

cmd_status() {
  if is_running "$WORKERS_PID"; then
    echo "  workers:  RUNNING (PID $(cat "$WORKERS_PID"))"
  else
    echo "  workers:  stopped"
  fi
  if is_running "$FRONTEND_PID"; then
    echo "  frontend: RUNNING (PID $(cat "$FRONTEND_PID")) — http://localhost:$VITE_PORT"
  else
    echo "  frontend: stopped"
  fi
}

cmd_logs() {
  touch "$WORKERS_LOG" "$FRONTEND_LOG"
  tail -f "$WORKERS_LOG" "$FRONTEND_LOG"
}

case "${1:-}" in
  up)     cmd_up ;;
  down)   cmd_down ;;
  status) cmd_status ;;
  logs)   cmd_logs ;;
  *)
    echo "Usage: $0 {up|down|status|logs}"
    exit 1
    ;;
esac
