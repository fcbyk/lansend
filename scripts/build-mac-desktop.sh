#!/bin/bash
set -e

# 仓库根目录（本脚本位于 scripts/ 下）
cd "$(dirname "$0")/.."

APP_NAME="LANSend"
BIN_NAME="lansend-desktop"
BUILD_DIR="build"
BUNDLE_DIR="${BUILD_DIR}/LANSend.app"

# plist 里的版本必须和二进制同源：写死的话 Finder 里永远是 1.0，
# 和页脚显示的版本对不上。版本号读自根目录 package.json（唯一来源）。
# 哈希只能放自定义键 —— CFBundle*Version 只接受点分数字，塞字母会被系统判为无效包。
read -r VERSION HASH <<< "$(node --input-type=module -e 'import { readVersionTag, computeCommitHash } from "./scripts/lib/version.mjs"; console.log(readVersionTag(), computeCommitHash())')"
SHORT_VERSION="${VERSION#v}"

echo "==> 编译 Go 二进制..."
node scripts/build-desktop.mjs

echo "==> 创建 .app 打包结构..."
rm -rf "${BUNDLE_DIR}"
mkdir -p "${BUNDLE_DIR}/Contents/MacOS"
mkdir -p "${BUNDLE_DIR}/Contents/Resources"

cp "${BUILD_DIR}/${BIN_NAME}" "${BUNDLE_DIR}/Contents/MacOS/${BIN_NAME}"
chmod +x "${BUNDLE_DIR}/Contents/MacOS/${BIN_NAME}"

# Finder / Dock 图标。由 server/tools/iconres 从同一份 PNG 生成，与托盘图标同源。
ICNS_SRC="server/desktop/assets/icon.icns"
if [ ! -f "${ICNS_SRC}" ]; then
    echo "错误: 缺少 ${ICNS_SRC}，请先在 server/tools/iconres 执行 go run ." >&2
    exit 1
fi
cp "${ICNS_SRC}" "${BUNDLE_DIR}/Contents/Resources/icon.icns"

cat > "${BUNDLE_DIR}/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${BIN_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.lansend.gui</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleVersion</key>
    <string>${SHORT_VERSION}</string>
    <key>CFBundleShortVersionString</key>
    <string>${SHORT_VERSION}</string>
    <key>LANSendCommit</key>
    <string>${HASH}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

echo "==> 完成: ${BUNDLE_DIR}"
