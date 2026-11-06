# LanSend

局域网文件分享工具。一条命令启动 Web 服务，同一网络下的设备通过浏览器即可浏览、上传、下载文件，支持在线聊天和网速测试。

## 功能

- **文件浏览** — 目录导航、文件列表展示
- **文件预览** — 文本（语法高亮，支持 Go/Python/JS/TS/JSON/CSS/CPP/Markdown 等）、图片、视频/音频在线预览
- **文件下载** — 单文件下载、多文件批量打包 ZIP 下载
- **文件上传** — 拖拽上传（支持文件夹拖入）、分片上传、进度显示、上传密码保护
- **在线聊天** — 局域网设备间实时文字聊天
- **网速测试** — Ping 延迟、上传/下载速率测试
- **响应式布局** — 桌面端左右分栏（可拖拽调整宽度），移动端 Tab 切换
- **剪贴板复制** — 自动复制局域网访问地址
- **跨平台** — 支持 macOS、Windows、Linux

## 安装

### 下载二进制

从 [Releases](https://github.com/fcbyk/lansend/releases) 页面下载对应平台的二进制文件：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `lansend-darwin-arm64.tar.gz` |
| macOS (Intel) | `lansend-darwin-x86_64.tar.gz` |
| Windows (x64) | `lansend-windows-x64.zip` |
| Linux (x86_64) | `lansend-linux-x86_64.tar.gz` |
| Linux (ARM64) | `lansend-linux-arm64.tar.gz` |

### 从源码构建

#### 环境要求

- Go 1.26+
- Node.js 22+
- pnpm

#### 构建步骤

项目包含两个独立的可执行程序，同属一个 Go module（`server/`）：

- **壳 A**：CLI（纯控制台）→ `lansend`
- **壳 B**：桌面端（Wails）→ `lansend-desktop`

```bash
# 安装前端依赖
pnpm install

# 构建前端（直接输出到 server/embeddist/dist）
pnpm build:web

# 构建壳 A（CLI，含版本信息）
pnpm build:cli

# 一步构建（前端 + 壳 A）
pnpm build

# 构建壳 B（桌面端，不包含在 pnpm build 内）
pnpm build:desktop

# 构建 macOS .app 包（在 macOS 上执行）
bash scripts/build-mac-desktop.sh
```

桌面端界面源码在 `desktop-web/`（React + TypeScript），由 `vite.desktop.config.ts` 构建到 `server/desktop/frontend/dist`，再用 `//go:embed` 打进二进制。因此：

- `pnpm build:desktop` 已包含前端构建（类型检查 → vite → go build），一步到位
- 单独执行 `go build ./desktop` 之前必须先跑过一次 `pnpm build:web:desktop`，否则编译期报 `no matching files found`（产物不进 git，这是刻意为之）

所有 Go 二进制产物统一输出到 `build/`：

| 壳 | Windows | Linux / macOS |
|---|---|---|
| A | `build/lansend.exe` | `build/lansend` |
| B | `build/lansend-desktop.exe` | `build/lansend-desktop`（macOS 另打包为 `build/lansend.app`） |

> 构建脚本一律使用显式包路径（`./cmd/lansend` 与 `./desktop`）。**不要使用 `go build ./...`**：它会同时编译桌面端，在缺少 GTK/webkit2gtk 的 Linux 环境会失败。

#### 版本号

版本号只有一个来源：根目录 `package.json` 的 `version` 字段，**手动改，不带 `v`**：

```json
"version": "2026.11.6"
```

所有构建脚本只读不写，`v` 前缀由脚本自动补。这样版本跟着提交走，切回旧提交重建得到的是旧版本，而不是"今天"的日期。字段缺失时（本方案落地之前的历史提交）回退 `v0.1.0`，构建不会中断。

| 位置 | 形态 |
|---|---|
| CLI | `lansend -v` → `lansend 2026.11.6 (d38a20d)` |
| 桌面端 | 窗口页脚底部的小字，点一下复制 |
| Windows exe | 属性 → 详细信息：文件版本 / 产品版本 |
| macOS `.app` | `Info.plist` 的 `CFBundleShortVersionString`，哈希在 `LansendCommit` 键 |

版本同一天内不变，同一天发两次只能靠哈希区分。发布流程：

```bash
# 1. 改 package.json 的 version，例如 2026.11.7
# 2. 提交
git commit -am "release: v2026.11.7"

# 3. 在当前 HEAD 上打标签（只打标签，不改文件、不提交；缺 version 字段会报错）
pnpm tag

# 4. 推送标签，触发 CI 发布
pnpm release
```

CI 也只认 `package.json`：`ci.yml` 直接读它，`build.yml` 还会断言标签名与版本号一致，不一致当场失败，避免发布出「标签一个号、二进制另一个号」的产物。

#### 图标资源

图标只有一个源文件 `server/desktop/assets/icon.png`：

| 产物 | 进仓库 | 用途 |
|---|---|---|
| `server/desktop/assets/icon.ico` | 是 | 多尺寸 ICO，桌面端托盘与窗口图标 |
| `server/desktop/assets/icon.icns` | 是 | macOS `.app` 的 Finder / Dock 图标（按 824/1024 网格留白） |
| `server/desktop/rsrc_windows_*.syso` | 否 | Windows exe 的 PE 资源：图标 + 版本信息 |

图标是桌面端独有资产，CLI 不引用，因此不会进入 `lansend` 二进制。

更新图标源后重新生成前两个：

```bash
cd server/tools/iconres && go run .
```

syso 不进仓库，有两个原因：Go 的链接器只接受一个 `.rsrc` 段（图标和版本信息没法拆成两个文件分别提交），而版本号和哈希每天都不同。`pnpm build:desktop` 会在 `go build` 之前自动现生成，`-skip-assets` 保证已提交的 ico / icns 不被重写：

```bash
cd server/tools/iconres
go run . -version v2026.11.6 -commit d38a20d -skip-assets
```

代价是：Windows 上直接 `go build ./desktop`（不经过构建脚本）得到的 exe 没有文件图标和版本信息，运行时窗口与托盘图标不受影响（它们走 `//go:embed` 的 icon.ico）。

该工具是独立的 Go module，不会被主模块导入，也不影响 `go build`。

## 使用方式

### 快速开始

```bash
# 共享当前目录，端口 80
lansend
```

无参数时默认共享当前工作目录，等价于 `lansend -d .`。启动后终端会打印本机与局域网访问地址，并自动复制到剪贴板。

### 命令行模式

```bash
# 共享指定目录 + 下载 + 打开浏览器
lansend -d /path/to/share -1 -b

# 共享当前目录，指定端口，开启下载/上传/聊天并设置上传密码
lansend -p 8080 -1 -2 -3 -4

# 查看帮助
lansend --help
```

> 短参数可组合书写，如 `-1b` 等同于 `-1 -b`。带值的参数（`-p`、`-d`）需单独写。

### 参数列表

| 参数 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `--directory` | `-d` | 当前工作目录 | 指定共享目录路径 |
| `--port` | `-p` | `80` | 服务端口 |
| `--download` | `-1` | `false` | 启用下载功能 |
| `--upload` | `-2` | `false` | 启用上传功能 |
| `--chat` | `-3` | `false` | 启用聊天功能 |
| `--password` | `-4` | `false` | 提示设置上传密码 |
| `--browser` | `-b` | `false` | 启动后自动打开浏览器 |

## 开发

```bash
# 同时启动 Vite 开发服务器和 Go 后端
pnpm dev
```

Vite 开发服务器会代理 API 请求到 Go 后端（默认 80 端口）。修改前端代码时自动热更新。

## 技术栈

- **后端**：Go 标准库 `net/http`（Go 1.22+ 增强路由）、[cobra](https://github.com/spf13/cobra)（CLI）
- **前端**：React 19、TypeScript、Vite 8、Tailwind CSS 4、Lucide Icons
- **代码高亮**：[highlight.js](https://highlightjs.org/)
- **部署**：前端 SPA 通过 Go `embed.FS` 内嵌到二进制，单一文件部署

## License

[MIT](LICENSE)