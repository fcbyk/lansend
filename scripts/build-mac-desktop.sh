#!/bin/bash
set -e

# 仓库根目录（本脚本位于 scripts/ 下）
cd "$(dirname "$0")/.."

APP_NAME="Lansend"
BIN_NAME="lansend-desktop"
BUILD_DIR="build"
BUNDLE_DIR="${BUILD_DIR}/lansend.app"

echo "==> 编译 Go 二进制..."
node scripts/build-desktop.mjs

echo "==> 创建 .app 打包结构..."
rm -rf "${BUNDLE_DIR}"
mkdir -p "${BUNDLE_DIR}/Contents/MacOS"
mkdir -p "${BUNDLE_DIR}/Contents/Resources"

cp "${BUILD_DIR}/${BIN_NAME}" "${BUNDLE_DIR}/Contents/MacOS/${BIN_NAME}"
chmod +x "${BUNDLE_DIR}/Contents/MacOS/${BIN_NAME}"

cat > "${BUNDLE_DIR}/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${BIN_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.lansend.gui</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
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
