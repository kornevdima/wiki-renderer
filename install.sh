#!/bin/sh
# Installs Wiki Renderer on macOS or Linux (US-279):
#   curl -fsSL https://raw.githubusercontent.com/kornevdima/wiki-renderer/main/install.sh | sh
#
# Downloads the archive for this OS and CPU from the GitHub release, checks it against SHA256SUMS, unpacks it into
# <home>/<version>/ and links <home>/bin/wiki-renderer to it. It never edits a shell rc file (it prints the line to add)
# and never touches your config or your wikis. Run it again to update; older versions stay beside the new one.
#
# Environment:
#   WIKI_RENDERER_VERSION        install this version instead of the latest (1.2.3 or v1.2.3)
#   WIKI_RENDERER_HOME           install folder (default ~/.wiki-renderer)
#   WIKI_RENDERER_DOWNLOAD_BASE  default https://github.com/kornevdima/wiki-renderer/releases   (a test seam)
#   WIKI_RENDERER_API_BASE       default https://api.github.com/repos/kornevdima/wiki-renderer   (a test seam)
#
# POSIX sh only: no bashisms, no jq. Everything runs inside main(), called on the last line, so a download cut short
# (curl | sh) parses an incomplete body and runs nothing.
set -eu

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

TMP_DIR=
TMP_LINK=
cleanup() {
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
  if [ -n "$TMP_LINK" ]; then
    rm -f "$TMP_LINK"
  fi
}

# A number: digits only, not empty.
is_number() {
  case $1 in
    '' | *[!0-9]*) return 1 ;;
  esac
  return 0
}

# 1.2.3 or 1.2.3-rc.1, judged on the whole string (a newline or any other character outside 0-9 A-Z a-z . - is refused).
valid_version() {
  case $1 in
    '' | *[!0-9A-Za-z.-]*) return 1 ;;
    *.*.*) ;;
    *) return 1 ;;
  esac
  v_core=${1%%-*}
  case $v_core in
    *.*.*) ;;
    *) return 1 ;;
  esac
  v_major=${v_core%%.*}
  v_rest=${v_core#*.}
  v_minor=${v_rest%%.*}
  v_patch=${v_rest#*.}
  is_number "$v_major" && is_number "$v_minor" && is_number "$v_patch" || return 1
  case $1 in
    *-) return 1 ;;
  esac
  return 0
}

# http_allowed <url>: plain http only for a URL under a test seam that was set (WIKI_RENDERER_DOWNLOAD_BASE or WIKI_RENDERER_API_BASE).
http_allowed() {
  if [ -n "${WIKI_RENDERER_DOWNLOAD_BASE:-}" ]; then
    case $1 in
      "$WIKI_RENDERER_DOWNLOAD_BASE"*) return 0 ;;
    esac
  fi
  if [ -n "${WIKI_RENDERER_API_BASE:-}" ]; then
    case $1 in
      "$WIKI_RENDERER_API_BASE"*) return 0 ;;
    esac
  fi
  return 1
}

# fetch <url> <file>. https only with TLS 1.2 unless the URL is under a test seam. A stall limit (under 1 KB/s for 60 s)
# rather than a total time limit, so a slow but moving download finishes.
fetch() {
  if [ "$DOWNLOADER" = curl ]; then
    if http_allowed "$1"; then
      curl -fsSL --connect-timeout 15 --speed-limit 1024 --speed-time 60 --retry 2 "$1" -o "$2" </dev/null
    else
      curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 15 --speed-limit 1024 --speed-time 60 --retry 2 "$1" -o "$2" </dev/null
    fi
  else
    wget -q -T 30 -O "$2" "$1" </dev/null
  fi
}

# check_target: <home>/<version> must not exist, unless it is a working install.
check_target() {
  if [ -e "$INSTALL_HOME/$VERSION" ] || [ -L "$INSTALL_HOME/$VERSION" ]; then
    fail "$INSTALL_HOME/$VERSION exists but is not a Wiki Renderer install. Move it away and run this again."
  fi
}

# check_link: <home>/bin/wiki-renderer may be absent or a link (replaced), never a folder or a file this installer did not make.
check_link() {
  link_target=$BIN_DIR/wiki-renderer
  if [ -d "$link_target" ]; then
    fail "$link_target is a folder, not the link this installer makes. Move it away and run this again."
  fi
  if [ -e "$link_target" ] && [ ! -L "$link_target" ]; then
    fail "$link_target is a file this installer did not make. Move it away and run this again."
  fi
}

# link_current: <home>/bin/wiki-renderer -> the launcher of $VERSION, made under a temp name and renamed over, so the command never disappears.
link_current() {
  [ -f "$INSTALL_HOME/$VERSION/wiki-renderer" ] && [ -x "$INSTALL_HOME/$VERSION/wiki-renderer" ] ||
    fail "$INSTALL_HOME/$VERSION has no wiki-renderer launcher, so nothing was linked."
  mkdir -p "$BIN_DIR" || fail "Could not create $BIN_DIR."
  check_link
  TMP_LINK=$BIN_DIR/.wiki-renderer.$$
  rm -f "$TMP_LINK"
  ln -s "$INSTALL_HOME/$VERSION/wiki-renderer" "$TMP_LINK" || fail "Could not link $link_target."
  mv -f "$TMP_LINK" "$link_target" || fail "Could not link $link_target."
  TMP_LINK=
}

# shell_quote_pair: prints the path as it must sit inside export PATH="..." inside echo '...' (both layers escaped).
path_for_rc() {
  p_head=
  p_tail=$BIN_DIR
  if [ -n "${HOME:-}" ]; then
    case "$BIN_DIR" in
      "$HOME"/*)
        p_head='$HOME/'
        p_tail=${BIN_DIR#"$HOME"/}
        ;;
    esac
  fi
  p_tail=$(printf '%s' "$p_tail" | sed -e 's/[\\"$`]/\\&/g')
  printf '%s%s' "$p_head" "$p_tail" | sed -e "s/'/'\\\\''/g"
}

path_hint() {
  case ":${PATH:-}:" in
    *":$BIN_DIR:"*) return 0 ;;
  esac
  shell_name=$(basename "${SHELL:-sh}")
  case "$shell_name" in
    zsh) rc='~/.zshrc' ;;
    bash)
      if [ "$OS_NAME" = Darwin ]; then rc='~/.bash_profile'; else rc='~/.bashrc'; fi
      ;;
    *) rc='~/.profile' ;;
  esac
  printf '%s\n' "$BIN_DIR is not on your PATH. To add it:"
  printf '  echo '\''export PATH="%s:$PATH"'\'' >> %s\n' "$(path_for_rc)" "$rc"
  printf '%s\n' "Then open a new terminal."
}

main() {
  DOWNLOAD_BASE=${WIKI_RENDERER_DOWNLOAD_BASE:-https://github.com/kornevdima/wiki-renderer/releases}
  API_BASE=${WIKI_RENDERER_API_BASE:-https://api.github.com/repos/kornevdima/wiki-renderer}
  trap cleanup EXIT
  trap 'exit 1' INT TERM HUP

  # --- this machine ---
  OS_NAME=$(uname -s 2>/dev/null || echo unknown)
  CPU_NAME=$(uname -m 2>/dev/null || echo unknown)
  case "$OS_NAME" in
    Darwin) PLATFORM_OS=darwin ;;
    Linux) PLATFORM_OS=linux ;;
    MINGW* | MSYS* | CYGWIN*) fail "This installer is for macOS and Linux. On Windows, use the PowerShell line in the README." ;;
    *) fail "Wiki Renderer has no build for $OS_NAME $CPU_NAME. It runs on macOS and Linux (arm64 or x64) and Windows (x64)." ;;
  esac
  case "$CPU_NAME" in
    arm64 | aarch64) PLATFORM_ARCH=arm64 ;;
    x86_64 | amd64) PLATFORM_ARCH=x64 ;;
    *) fail "Wiki Renderer has no build for $OS_NAME $CPU_NAME. It runs on macOS and Linux (arm64 or x64) and Windows (x64)." ;;
  esac
  PLATFORM="$PLATFORM_OS-$PLATFORM_ARCH"

  # --- how to download ---
  if command -v curl >/dev/null 2>&1; then
    DOWNLOADER=curl
  elif command -v wget >/dev/null 2>&1; then
    DOWNLOADER=wget
  else
    fail "Neither curl nor wget is installed. Install one of them and run this again."
  fi

  # --- where to install ---
  if [ -n "${WIKI_RENDERER_HOME:-}" ]; then
    INSTALL_HOME=$WIKI_RENDERER_HOME
  elif [ -n "${HOME:-}" ]; then
    INSTALL_HOME=$HOME/.wiki-renderer
  else
    fail "HOME is not set. Set WIKI_RENDERER_HOME to the folder to install into."
  fi
  BIN_DIR=$INSTALL_HOME/bin
  mkdir -p "$INSTALL_HOME" || fail "Could not create $INSTALL_HOME."
  TMP_DIR=$(mktemp -d "$INSTALL_HOME/.install-XXXXXX") || fail "Could not write to $INSTALL_HOME."

  # --- which version ---
  if [ -n "${WIKI_RENDERER_VERSION:-}" ]; then
    VERSION=${WIKI_RENDERER_VERSION#v}
  else
    fetch "$API_BASE/releases/latest" "$TMP_DIR/latest.json" ||
      fail "Could not read the latest release from $API_BASE/releases/latest. Check your connection, or set WIKI_RENDERER_VERSION=<version>."
    VERSION=$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p' "$TMP_DIR/latest.json" | head -n 1)
    [ -n "$VERSION" ] || fail "The latest release has no version tag. Set WIKI_RENDERER_VERSION=<version>."
  fi
  if ! valid_version "$VERSION"; then
    fail "\"$VERSION\" is not a version like 1.2.3."
  fi

  # --- already installed? ---
  if [ -f "$INSTALL_HOME/$VERSION/wiki-renderer" ] && [ -x "$INSTALL_HOME/$VERSION/wiki-renderer" ]; then
    link_current
    path_hint
    printf '%s\n' "Wiki Renderer $VERSION is already installed. Run: wiki-renderer"
    return 0
  fi
  check_target
  check_link

  # --- download and check ---
  ASSET="wiki-renderer-$VERSION-$PLATFORM.tar.gz"
  RELEASE_URL="$DOWNLOAD_BASE/download/v$VERSION"
  printf '%s\n' "Downloading Wiki Renderer $VERSION for $PLATFORM..."
  fetch "$RELEASE_URL/$ASSET" "$TMP_DIR/$ASSET" || fail "Could not download $RELEASE_URL/$ASSET. Check the version and your connection."
  fetch "$RELEASE_URL/SHA256SUMS" "$TMP_DIR/SHA256SUMS" || fail "Could not download $RELEASE_URL/SHA256SUMS."

  EXPECTED=$(awk -v name="$ASSET" '{ n = $2; sub(/^\*/, "", n); if (n == name) { print tolower($1); exit } }' "$TMP_DIR/SHA256SUMS")
  [ -n "$EXPECTED" ] || fail "SHA256SUMS has no entry for $ASSET."

  if [ "$OS_NAME" = Darwin ] && command -v shasum >/dev/null 2>&1; then
    ACTUAL=$(shasum -a 256 <"$TMP_DIR/$ASSET" | awk '{ print tolower($1) }')
  elif command -v sha256sum >/dev/null 2>&1; then
    ACTUAL=$(sha256sum <"$TMP_DIR/$ASSET" | awk '{ print tolower($1) }')
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL=$(shasum -a 256 <"$TMP_DIR/$ASSET" | awk '{ print tolower($1) }')
  else
    fail "Neither shasum nor sha256sum is installed, so the download cannot be checked."
  fi
  if [ "$ACTUAL" != "$EXPECTED" ]; then
    fail "The download does not match SHA256SUMS ($ASSET). It was deleted and nothing was installed."
  fi

  # --- unpack beside, then move into place ---
  TOP="wiki-renderer-$VERSION-$PLATFORM"
  mkdir "$TMP_DIR/unpacked"
  tar -xzf "$TMP_DIR/$ASSET" -C "$TMP_DIR/unpacked" || fail "Could not unpack $ASSET."
  [ -f "$TMP_DIR/unpacked/$TOP/wiki-renderer" ] || fail "$ASSET does not hold $TOP/wiki-renderer, so nothing was installed."
  check_target
  mv "$TMP_DIR/unpacked/$TOP" "$INSTALL_HOME/$VERSION" || fail "Could not move the new version into $INSTALL_HOME."

  link_current
  path_hint
  printf '%s\n' "Installed Wiki Renderer $VERSION. Run: wiki-renderer"
}

main "$@"
