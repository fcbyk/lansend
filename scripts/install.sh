#!/bin/sh
# LANSend installer for macOS and Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/fcbyk/lansend/main/scripts/install.sh | sh
#   curl -fsSL .../install.sh | sh -s -- -d "$HOME/bin"
#
# Downloads the latest CLI release for this OS/arch, verifies its SHA-256
# against checksums.txt, and installs it to ~/.local/bin by default.
set -eu

REPO="fcbyk/lansend"
INSTALL_DIR="${LANSEND_INSTALL_DIR:-$HOME/.local/bin}"
VERIFY=1

usage() {
  cat <<'EOF'
Install the LANSend CLI from the latest GitHub release.

Usage: install.sh [options]

Options:
  -d, --dir DIR   Install directory (default: ~/.local/bin,
                  or $LANSEND_INSTALL_DIR when set)
      --no-verify Skip SHA-256 verification
  -h, --help      Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -d|--dir)
      if [ $# -lt 2 ]; then
        echo "error: $1 requires a directory" >&2
        exit 1
      fi
      INSTALL_DIR="$2"
      shift 2
      ;;
    --no-verify)
      VERIFY=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Expand a leading ~/ so quoted paths behave as expected.
case "$INSTALL_DIR" in
  "~") INSTALL_DIR="$HOME" ;;
  "~/"*) INSTALL_DIR="$HOME/${INSTALL_DIR#\~/}" ;;
esac

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "error: this installer is for macOS and Linux." >&2
    echo "       On Windows use scripts/install.ps1 instead." >&2
    exit 1
    ;;
  *)
    echo "error: unsupported operating system: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64|amd64) arch="x86_64" ;;
  arm64|aarch64) arch="arm64" ;;
  *)
    echo "error: unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

asset="lansend-$os-$arch.tar.gz"
base_url="https://github.com/$REPO/releases/latest/download"

have() {
  command -v "$1" >/dev/null 2>&1
}

fetch() {
  url="$1"
  dest="$2"
  if have curl; then
    curl -fL --retry 3 --connect-timeout 15 -o "$dest" "$url"
  elif have wget; then
    wget -q --tries=3 -O "$dest" "$url"
  else
    echo "error: curl or wget is required to download LANSend." >&2
    return 1
  fi
}

hash_file() {
  if have shasum; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif have sha256sum; then
    sha256sum "$1" | awk '{print $1}'
  elif have openssl; then
    openssl dgst -sha256 "$1" | awk '{print $NF}'
  else
    return 1
  fi
}

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/lansend.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

echo "Downloading $asset ..."
fetch "$base_url/$asset" "$tmp_dir/$asset"

if [ "$VERIFY" -eq 1 ]; then
  if fetch "$base_url/checksums.txt" "$tmp_dir/checksums.txt"; then
    expected=$(awk -v name="$asset" '$2 == name { print $1; exit }' "$tmp_dir/checksums.txt")
    if [ -z "$expected" ]; then
      echo "warning: checksums.txt does not list $asset; skipping verification." >&2
    else
      actual=$(hash_file "$tmp_dir/$asset") || true
      if [ -z "$actual" ]; then
        echo "error: no SHA-256 tool found (shasum, sha256sum or openssl)." >&2
        exit 1
      fi
      if [ "$actual" != "$expected" ]; then
        echo "error: SHA-256 mismatch for $asset" >&2
        echo "  expected: $expected" >&2
        echo "  actual:   $actual" >&2
        echo "The download may be corrupted. Aborting." >&2
        exit 1
      fi
    fi
  else
    echo "warning: could not download checksums.txt; skipping verification." >&2
  fi
fi

mkdir -p "$tmp_dir/extract" "$INSTALL_DIR"
tar -xzf "$tmp_dir/$asset" -C "$tmp_dir/extract"
cp "$tmp_dir/extract/lansend" "$INSTALL_DIR/.lansend.new"
chmod +x "$INSTALL_DIR/.lansend.new"
mv -f "$INSTALL_DIR/.lansend.new" "$INSTALL_DIR/lansend"

echo "Installed to $INSTALL_DIR/lansend"

if version=$("$INSTALL_DIR/lansend" -v 2>/dev/null | head -n 1); then
  [ -n "$version" ] && echo "$version"
fi

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo
    echo "Note: $INSTALL_DIR is not in your PATH."
    echo "Add this line to ~/.zshrc or ~/.bashrc, then restart your shell:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac
