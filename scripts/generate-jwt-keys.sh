#!/usr/bin/env bash
set -euo pipefail

# generate-jwt-keys.sh
#
# Generates an RS256 keypair for JWT signing/verification and writes
# base64-encoded JWT_PRIVATE_KEY / JWT_PUBLIC_KEY lines directly into your
# local .env file. Nothing is printed to the terminal and nothing leaves
# your machine — that's the whole point.
#
# Usage:
#   ./scripts/generate-jwt-keys.sh            # writes to ./.env
#   ./scripts/generate-jwt-keys.sh path/to/.env
#
# SECURITY: never paste the values this writes into chat, a PR, a commit,
# Slack, or anywhere else. .env must already be in .gitignore (it is, per
# this project's .gitignore) — this script does not check that for you.

KEY_DIR="$(mktemp -d)"
PRIVATE_KEY_FILE="$KEY_DIR/jwt_private.pem"
PUBLIC_KEY_FILE="$KEY_DIR/jwt_public.pem"

echo "Generating 2048-bit RSA keypair for RS256 JWT signing..."
openssl genrsa -out "$PRIVATE_KEY_FILE" 2048 2>/dev/null
openssl rsa -in "$PRIVATE_KEY_FILE" -pubout -out "$PUBLIC_KEY_FILE" 2>/dev/null

# base64-encode as a single line — GNU base64 (Linux) supports -w0 to disable
# line wrapping; BSD/macOS base64 doesn't have -w, so strip newlines instead.
if base64 --help 2>&1 | grep -q -- '-w'; then
  PRIVATE_B64="$(base64 -w0 "$PRIVATE_KEY_FILE")"
  PUBLIC_B64="$(base64 -w0 "$PUBLIC_KEY_FILE")"
else
  PRIVATE_B64="$(base64 "$PRIVATE_KEY_FILE" | tr -d '\n')"
  PUBLIC_B64="$(base64 "$PUBLIC_KEY_FILE" | tr -d '\n')"
fi

ENV_FILE="${1:-.env}"

# If .env already has these keys (e.g. re-running this script), drop the old
# lines first so you don't end up with duplicate/stale JWT_* vars.
if [ -f "$ENV_FILE" ]; then
  grep -v -e '^JWT_PRIVATE_KEY=' -e '^JWT_PUBLIC_KEY=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
  mv "$ENV_FILE.tmp" "$ENV_FILE"
else
  touch "$ENV_FILE"
fi

{
  echo "JWT_PRIVATE_KEY=$PRIVATE_B64"
  echo "JWT_PUBLIC_KEY=$PUBLIC_B64"
} >> "$ENV_FILE"

# Delete the loose .pem files — only the base64 copy inside .env should exist.
rm -rf "$KEY_DIR"

echo "Done. JWT_PRIVATE_KEY and JWT_PUBLIC_KEY written to $ENV_FILE."
echo "identity-service reads JWT_PRIVATE_KEY. All 4 services read JWT_PUBLIC_KEY."
echo "Copy both lines into each service's own .env (or symlink/share the root .env, per your setup)."
