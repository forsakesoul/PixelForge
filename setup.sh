#!/bin/bash

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
SERVER_DIR="$ROOT_DIR/server"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC} $1"; }
ok()    { echo -e "${GREEN}[ok]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }

need_install() {
  local dir="$1"
  if [ ! -d "$dir/node_modules" ]; then
    return 0
  fi
  # package.json 比 node_modules 更新，需要重新安装
  if [ "$dir/package.json" -nt "$dir/node_modules" ]; then
    return 0
  fi
  return 1
}

install_deps() {
  local name="$1"
  local dir="$2"

  if need_install "$dir"; then
    info "Installing $name dependencies..."
    (cd "$dir" && npm install)
    ok "$name dependencies installed."
  else
    ok "$name dependencies already up to date, skipping."
  fi
}

show_menu() {
  echo ""
  echo "==============================="
  echo "  PixelForge Setup"
  echo "==============================="
  echo ""
  echo "  1) Install all dependencies"
  echo "  2) Install client only"
  echo "  3) Install server only"
  echo "  4) Start dev mode (auto install if needed)"
  echo "  5) Build for production"
  echo "  6) Start production server"
  echo "  0) Exit"
  echo ""
  read -rp "Select an option: " choice
  echo ""

  case $choice in
    1)
      install_deps "client" "$CLIENT_DIR"
      install_deps "server" "$SERVER_DIR"
      ;;
    2)
      install_deps "client" "$CLIENT_DIR"
      ;;
    3)
      install_deps "server" "$SERVER_DIR"
      ;;
    4)
      install_deps "client" "$CLIENT_DIR"
      install_deps "server" "$SERVER_DIR"
      info "Starting dev servers..."
      echo ""
      (cd "$ROOT_DIR" && npm start)
      ;;
    5)
      install_deps "client" "$CLIENT_DIR"
      install_deps "server" "$SERVER_DIR"
      info "Building..."
      (cd "$ROOT_DIR" && npm run build)
      ok "Build complete."
      ;;
    6)
      if [ ! -d "$CLIENT_DIR/dist" ] || [ ! -d "$SERVER_DIR/dist" ]; then
        warn "No build output found. Running build first..."
        install_deps "client" "$CLIENT_DIR"
        install_deps "server" "$SERVER_DIR"
        (cd "$ROOT_DIR" && npm run build)
      fi
      info "Starting production server at http://localhost:3001"
      (cd "$ROOT_DIR" && npm run serve)
      ;;
    0)
      echo "Bye."
      exit 0
      ;;
    *)
      warn "Invalid option."
      show_menu
      ;;
  esac
}

# 支持直接传参: ./setup.sh install | dev | build | serve
case "${1:-}" in
  install)
    install_deps "client" "$CLIENT_DIR"
    install_deps "server" "$SERVER_DIR"
    ;;
  dev)
    install_deps "client" "$CLIENT_DIR"
    install_deps "server" "$SERVER_DIR"
    info "Starting dev servers..."
    (cd "$ROOT_DIR" && npm start)
    ;;
  build)
    install_deps "client" "$CLIENT_DIR"
    install_deps "server" "$SERVER_DIR"
    (cd "$ROOT_DIR" && npm run build)
    ok "Build complete."
    ;;
  serve)
    if [ ! -d "$CLIENT_DIR/dist" ] || [ ! -d "$SERVER_DIR/dist" ]; then
      warn "No build output found. Running build first..."
      install_deps "client" "$CLIENT_DIR"
      install_deps "server" "$SERVER_DIR"
      (cd "$ROOT_DIR" && npm run build)
    fi
    info "Starting production server at http://localhost:3001"
    (cd "$ROOT_DIR" && npm run serve)
    ;;
  "")
    show_menu
    ;;
  *)
    echo "Usage: ./setup.sh [install|dev|build|serve]"
    exit 1
    ;;
esac
