#!/bin/bash
set -e

# 仓库根目录（本脚本位于 scripts/ 下）
cd "$(dirname "$0")/.."

APP_NAME="LANSend"
BUNDLE_DIR="build/LANSend.app"

if [ "$(uname -s)" != "Darwin" ]; then
    echo "错误: DMG 只能在 macOS 上打包（create-dmg 依赖 hdiutil）" >&2
    exit 1
fi

if [ ! -d "${BUNDLE_DIR}" ]; then
    echo "错误: 缺少 ${BUNDLE_DIR}" >&2
    echo "请先运行 pnpm build:desktop:mac 生成 .app，或直接运行 pnpm build:desktop:dmg" >&2
    exit 1
fi

# create-dmg 依赖 macos-alias / fs-xattr 两个原生模块，编译产物与 Node 版本绑定
# （NODE_MODULE_VERSION）。切换 Node 版本后不重编译会报 ERR_DLOPEN_FAILED，
# 打包前就地重编一次（约 2 秒；重新 pnpm install 也能顺带修复）。
pnpm rebuild macos-alias fs-xattr

# 安装界面交给 create-dmg（底层是 electron-builder 同款 appdmg 引擎）：
# 白底背景、应用图标在左、Applications 在右、卷标用 App 图标、
# Finder 窗口尺寸/位置布局，全部是主流软件的默认样式。
# 版本号取自 Info.plist 的 CFBundleShortVersionString，产物为
# build/LANSend <version>.dmg。
# --no-code-sign: 没有开发者证书，跳过签名（与未签名的 .app 保持一致）。
pnpm exec create-dmg "${BUNDLE_DIR}" build --no-code-sign --overwrite
