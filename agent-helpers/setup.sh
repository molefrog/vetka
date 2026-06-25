#!/bin/bash
# Vetka agent environment setup — run once at the start of each session.
# Idempotent: safe to run again if something is missing.
set -e

UPLOADS=/mnt/session/uploads

# ── Copy uploaded files to writable locations ─────────────────────────────────
mkdir -p /workspace/scripts "$HOME/.ssh"

[ -f "$UPLOADS/workspace/scripts/setup.sh" ]      && cp "$UPLOADS/workspace/scripts/setup.sh"      /workspace/scripts/setup.sh
[ -f "$UPLOADS/workspace/scripts/screenshot.ts" ] && cp "$UPLOADS/workspace/scripts/screenshot.ts" /workspace/scripts/screenshot.ts
[ -f "$UPLOADS/root/.ssh/id_vetka" ] && cp "$UPLOADS/root/.ssh/id_vetka" "$HOME/.ssh/id_vetka" && chmod 600 "$HOME/.ssh/id_vetka"

# ── System deps ──────────────────────────────────────────────────────────────
command -v ssh &>/dev/null || apt-get install -y -q openssh-client 2>&1 | tail -1

# ── Bun ──────────────────────────────────────────────────────────────────────
if ! command -v bun &>/dev/null && ! [ -f "$HOME/.bun/bin/bun" ]; then
  echo "→ Installing bun..."
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME/.bun/bin:$PATH"

# ── Playwright Chromium ───────────────────────────────────────────────────────
if ! [ -d "$HOME/.cache/ms-playwright" ]; then
  echo "→ Installing Chromium (one-time, ~300 MB)..."
  python3 -m playwright install chromium --with-deps 2>&1 | tail -3
fi

echo ""
echo "✓ Ready"
echo "  bun:      $(~/.bun/bin/bun --version 2>/dev/null || echo 'not yet in PATH')"
echo "  chromium: $HOME/.cache/ms-playwright"
[ -f "$HOME/.ssh/id_vetka" ] && echo "  ssh key:  $HOME/.ssh/id_vetka"
