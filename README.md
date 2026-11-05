# LanSend

局域网文件分享工具。一条命令启动 Web 服务，同一网络下的设备通过浏览器即可浏览、上传、下载文件，支持在线聊天和网速测试。

## 功能

- **文件浏览** — 目录导航、文件列表展示
- **文件预览** — 文本（语法高亮，支持 Go/Python/JS/TS/JSON/CSS/CPP/Markdown 等）、图片、视频/音频在线预览
- **文件下载** — 单文件下载、多文件批量打包 ZIP 下载
- **文件上传** — 拖拽上传（支持文件夹拖入）、分片上传、进度显示、上传密码保护
- **在线聊天** — 局域网设备间实时文字聊天
- **网速测试** — Ping 延迟、上传/下载速率测试
- **系统托盘** — macOS / Windows 托盘模式，关闭终端也不影响运行
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

- **壳 A**：CLI + 系统托盘 → `lansend`
- **壳 B**：桌面端（Wails）→ `lansend-desktop`

```bash
# 安装前端依赖
pnpm install

# 构建前端（直接输出到 server/embeddist/dist）
pnpm build:web

# 构建壳 A（CLI + 托盘，含版本信息）
pnpm build:cli

# 一步构建（前端 + 壳 A）
pnpm build

# 构建壳 B（桌面端，不包含在 pnpm build 内）
pnpm build:desktop

# 构建 macOS .app 包（在 macOS 上执行）
bash scripts/build-mac-desktop.sh
```

所有 Go 二进制产物统一输出到 `build/`：

| 壳 | Windows | Linux / macOS |
|---|---|---|
| A | `build/lansend.exe` | `build/lansend` |
| B | `build/lansend-desktop.exe` | `build/lansend-desktop`（macOS 另打包为 `build/lansend.app`） |

> 构建脚本一律使用显式包路径（`./cmd/lansend` 与 `./desktop`）。**不要使用 `go build ./...`**：它会同时编译桌面端，在缺少 GTK/webkit2gtk 的 Linux 环境会失败。

> Linux 不需要托盘功能时，可以关闭 CGO，将 `scripts/build-cli.mjs` 中 `CGO_ENABLED: '1'` 改为 `CGO_ENABLED: '0'`。

#### 图标资源

图标只有一个源文件 `server/internal/icon/icon.png`，派生产物已提交进仓库，日常构建无需重新生成：

| 产物 | 用途 |
|---|---|
| `server/internal/icon/icon.ico` | 多尺寸 ICO，两个壳的托盘图标 |
| `server/internal/icon/icon.icns` | macOS `.app` 的 Finder / Dock 图标 |
| `server/desktop/rsrc_windows_*.syso` | Windows exe 的 PE 图标（资源管理器、任务栏） |

更新图标后重新生成：

```bash
cd server/tools/iconres && go run .
```

该工具是独立的 Go module，不会被主模块导入，也不影响 `go build`。

## 使用方式

### 交互模式

无参数直接运行 `lansend`，输入选项组合即可启动（推荐）：

```
$ lansend

   _         _     _   _  ____                    _
  | |       / \   | \ | |/ ___|   ___  _ __    __| |
  | |      / _ \  |  \| |\___ \  / _ \| '_ \  / _` |
  | |___  / ___ \ | |\  | ___) ||  __/| | | || (_| |
  |_____|/_/   \_\|_| \_||____/  \___||_| |_| \__,_|

  1.0.0 (abc1234)

  Directory (required):
    e   exe dir    ── 可执行文件所在目录
    w   work dir   ── 当前工作目录

  Features:
    1   download   ── 启用文件下载
    2   upload     ── 启用文件上传
    3   chat       ── 启用聊天
    4   password   ── 设置上传密码
    b   browser    ── 自动打开浏览器
    t   tray       ── 系统托盘模式（关闭终端不停止服务）

  将想开启的选项字母拼在一起输入即可，如:
    et      ── exe目录 + 托盘模式（推荐）
    w1b     ── 工作目录 + 下载 + 打开浏览器
    et123   ── exe目录 + 托盘 + 下载/上传/聊天

  请输入选项组合 [默认: et]:
```

### 命令行模式

```bash
# 工作目录 + 下载 + 打开浏览器
lansend -w1b

# exe 目录 + 上传/下载/聊天 + 托盘
lansend -e123t

# 指定端口和目录 + 上传并设置密码（带值的参数不可合并）
lansend -p 8080 -d /path/to/share -24

# 查看帮助
lansend --help
```

> 短参数可组合书写，如 `-w1b` 等同于 `-w -1 -b`。带值的参数（`-p`、`-d`）需单独写。

### 参数列表

| 参数 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `--directory` | `-d` | — | 指定共享目录路径 |
| `--exe` | `-e` | `false` | 使用可执行文件所在目录 |
| `--work` | `-w` | `false` | 使用当前工作目录 |
| `--port` | `-p` | `80` | 服务端口 |
| `--download` | `-1` | `false` | 启用下载功能 |
| `--upload` | `-2` | `false` | 启用上传功能 |
| `--chat` | `-3` | `false` | 启用聊天功能 |
| `--password` | `-4` | `false` | 提示设置上传密码 |
| `--browser` | `-b` | `false` | 启动后自动打开浏览器 |
| `--tray` | `-t` | `false` | 系统托盘模式 |

## 开发

```bash
# 同时启动 Vite 开发服务器和 Go 后端
pnpm dev
```

Vite 开发服务器会代理 API 请求到 Go 后端（默认 80 端口）。修改前端代码时自动热更新。

## 技术栈

- **后端**：Go 标准库 `net/http`（Go 1.22+ 增强路由）、[cobra](https://github.com/spf13/cobra)（CLI）、[systray](https://github.com/getlantern/systray)（系统托盘）
- **前端**：React 19、TypeScript、Vite 8、Tailwind CSS 4、Lucide Icons
- **代码高亮**：[highlight.js](https://highlightjs.org/)
- **部署**：前端 SPA 通过 Go `embed.FS` 内嵌到二进制，单一文件部署

## License

[MIT](LICENSE)