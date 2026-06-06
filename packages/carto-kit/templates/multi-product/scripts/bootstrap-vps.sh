#!/usr/bin/env bash
set -euo pipefail

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required when deploying as a non-root user." >&2
    exit 1
  fi
  SUDO="sudo"
fi

NODE_VERSION="22.17.1"

has_node() {
  command -v node >/dev/null 2>&1 && node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
}

glibc_version() {
  getconf GNU_LIBC_VERSION 2>/dev/null | awk '{print $2}'
}

glibc_lt_228() {
  local version
  version="$(glibc_version)"
  [ -n "$version" ] && [ "$(printf '%s\n2.28\n' "$version" | sort -V | head -n1)" != "2.28" ]
}

install_node_glibc217() {
  if [ "$(uname -m)" != "x86_64" ]; then
    echo "Node glibc-217 fallback only supports x86_64." >&2
    exit 1
  fi
  local archive="node-v${NODE_VERSION}-linux-x64-glibc-217.tar.gz"
  local url="https://unofficial-builds.nodejs.org/download/release/v${NODE_VERSION}/${archive}"
  local tmp="/tmp/${archive}"
  $SUDO mkdir -p /usr/local/carto-node
  curl -fsSL "$url" -o "$tmp"
  $SUDO tar -xzf "$tmp" -C /usr/local/carto-node --strip-components=1
  $SUDO ln -sf /usr/local/carto-node/bin/node /usr/local/bin/node
  $SUDO ln -sf /usr/local/carto-node/bin/npm /usr/local/bin/npm
  $SUDO ln -sf /usr/local/carto-node/bin/npx /usr/local/bin/npx
}

install_node() {
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update
    $SUDO apt-get install -y ca-certificates curl gnupg
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash -
    $SUDO apt-get install -y nodejs
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    if glibc_lt_228; then
      install_node_glibc217
      return
    fi
    $SUDO dnf install -y curl
    curl -fsSL https://rpm.nodesource.com/setup_22.x | $SUDO bash -
    $SUDO dnf install -y nodejs
    return
  fi
  if command -v yum >/dev/null 2>&1; then
    if glibc_lt_228; then
      install_node_glibc217
      return
    fi
    $SUDO yum install -y curl
    curl -fsSL https://rpm.nodesource.com/setup_22.x | $SUDO bash -
    $SUDO yum install -y nodejs
    return
  fi
  if command -v apk >/dev/null 2>&1; then
    $SUDO apk add --no-cache nodejs npm
    return
  fi
  echo "Could not install Node.js automatically: unsupported package manager." >&2
  exit 1
}

install_caddy() {
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update
    $SUDO apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | $SUDO gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | $SUDO tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    $SUDO apt-get update
    $SUDO apt-get install -y caddy
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y curl
    install_caddy_binary
    return
  fi
  if command -v yum >/dev/null 2>&1; then
    $SUDO yum install -y curl
    install_caddy_binary
    return
  fi
  if command -v apk >/dev/null 2>&1; then
    $SUDO apk add --no-cache caddy
    return
  fi
  echo "Could not install Caddy automatically: unsupported package manager." >&2
  exit 1
}

install_caddy_binary() {
  if [ "$(uname -m)" != "x86_64" ]; then
    echo "Caddy binary fallback only supports x86_64." >&2
    exit 1
  fi
  local tmp="/tmp/caddy-linux-amd64"
  curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" -o "$tmp"
  $SUDO install -m 0755 "$tmp" /usr/local/bin/caddy
  install_caddy_service
}

install_caddy_service() {
  $SUDO mkdir -p /etc/caddy /var/lib/caddy /var/log/caddy
  if [ ! -f /etc/caddy/Caddyfile ]; then
    echo ":80 {" | $SUDO tee /etc/caddy/Caddyfile >/dev/null
    echo "  respond \"Caddy is running\"" | $SUDO tee -a /etc/caddy/Caddyfile >/dev/null
    echo "}" | $SUDO tee -a /etc/caddy/Caddyfile >/dev/null
  fi
  if command -v systemctl >/dev/null 2>&1; then
    cat <<'EOF' | $SUDO tee /etc/systemd/system/caddy.service >/dev/null
[Unit]
Description=Caddy web server
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF
    $SUDO systemctl daemon-reload
  fi
}

enable_caddy() {
  if command -v systemctl >/dev/null 2>&1; then
    $SUDO systemctl enable --now caddy
    return
  fi
  if command -v rc-update >/dev/null 2>&1; then
    $SUDO rc-update add caddy default || true
    $SUDO service caddy start || true
  fi
}

ensure_swap() {
  if [ "$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)" -gt 0 ]; then
    return
  fi
  local swapfile="/swapfile"
  if [ ! -f "$swapfile" ]; then
    if command -v fallocate >/dev/null 2>&1; then
      $SUDO fallocate -l 1G "$swapfile"
    else
      $SUDO dd if=/dev/zero of="$swapfile" bs=1M count=1024
    fi
    $SUDO chmod 600 "$swapfile"
    $SUDO mkswap "$swapfile"
  fi
  $SUDO swapon "$swapfile" || true
  if ! grep -q "^${swapfile} " /etc/fstab 2>/dev/null; then
    echo "${swapfile} none swap sw 0 0" | $SUDO tee -a /etc/fstab >/dev/null
  fi
}

if ! has_node; then
  install_node
fi

ensure_swap

if ! command -v pm2 >/dev/null 2>&1; then
  $SUDO npm install -g pm2
fi
if command -v npm >/dev/null 2>&1; then
  npm_global_bin="$(npm prefix -g 2>/dev/null)/bin"
  if [ -x "${npm_global_bin}/pm2" ]; then
    $SUDO ln -sf "${npm_global_bin}/pm2" /usr/local/bin/pm2
  fi
fi

if ! command -v caddy >/dev/null 2>&1; then
  install_caddy
fi

enable_caddy
