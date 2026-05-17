#!/usr/bin/env bash
# Start, stop, restart, or check the local Kando dev server (port 3001).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=3001
URL="http://127.0.0.1:${PORT}"
HEALTH_URL="${URL}/api/health"

usage() {
  echo "Usage: $0 {start|stop|restart|status} [--force]"
  echo "  start    Install deps if needed, run npm run dev, wait for /api/health"
  echo "  stop     Stop Kando on port ${PORT} (--force kills any listener)"
  echo "  restart  stop then start"
  echo "  status   Print whether Kando from this repo is running"
}

pid_on_port() {
  lsof -ti ":${PORT}" -sTCP:LISTEN 2>/dev/null | head -1 || true
}

server_cwd() {
  local pid="$1"
  lsof -p "$pid" 2>/dev/null | awk '/cwd/{print $NF; exit}'
}

wait_for_health() {
  local i
  for i in $(seq 1 40); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

cmd_status() {
  local pid cwd health
  pid=$(pid_on_port)
  if [[ -z "$pid" ]]; then
    echo "stopped"
    return 0
  fi
  cwd=$(server_cwd "$pid")
  if [[ "$cwd" == "$ROOT" ]]; then
    health=$(curl -sf "$HEALTH_URL" 2>/dev/null || echo "{}")
    echo "running pid=${pid} url=${URL} cwd=${cwd}"
    echo "health: ${health}"
  else
    echo "port-in-use pid=${pid} cwd=${cwd} (not ${ROOT})"
    return 2
  fi
}

cmd_stop() {
  local force="${1:-}"
  local pid cwd
  pid=$(pid_on_port)
  if [[ -z "$pid" ]]; then
    echo "Nothing listening on port ${PORT}"
    return 0
  fi
  cwd=$(server_cwd "$pid")
  if [[ "$cwd" != "$ROOT" && "$force" != "--force" ]]; then
    echo "Port ${PORT} held by pid=${pid} (${cwd}). Use: $0 stop --force"
    return 1
  fi
  kill "$pid" 2>/dev/null || true
  sleep 0.5
  if pid_on_port >/dev/null; then
    kill -9 "$(pid_on_port)" 2>/dev/null || true
  fi
  echo "Stopped process on port ${PORT}"
}

cmd_start() {
  local pid cwd
  pid=$(pid_on_port)
  if [[ -n "$pid" ]]; then
    cwd=$(server_cwd "$pid")
    if [[ "$cwd" == "$ROOT" ]]; then
      echo "Already running: ${URL} (pid=${pid})"
      curl -sf "$HEALTH_URL" && echo || true
      return 0
    fi
    echo "Port ${PORT} in use by pid=${pid} (${cwd}). Run: $0 stop --force"
    return 1
  fi

  cd "$ROOT"
  if [[ ! -d node_modules ]]; then
    echo "Installing dependencies..."
    npm install
  fi

  echo "Starting Kando from ${ROOT}..."
  npm run dev &
  disown 2>/dev/null || true

  if wait_for_health; then
    echo "Kando ready at ${URL}"
    curl -sf "$HEALTH_URL" && echo || true
  else
    echo "Kando did not respond at ${HEALTH_URL} in time" >&2
    return 1
  fi
}

cmd_restart() {
  local force="${1:-}"
  cmd_stop "$force" || true
  sleep 0.5
  cmd_start
}

main() {
  local action="${1:-}"
  local flag="${2:-}"
  case "$action" in
    start)   cmd_start ;;
    stop)    cmd_stop "$flag" ;;
    restart) cmd_restart "$flag" ;;
    status)  cmd_status ;;
    -h|--help|help) usage ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
