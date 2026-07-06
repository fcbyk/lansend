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

### byk 插件安装（推荐）

```bash
byk add fcbyk/lansend
```

安装后即可运行：

```bash
byk lansend
```

### 下载二进制

从 [Releases](https://github.com/fcbyk/lansend/releases) 页面下载对应平台的二进制文件：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `lansend-darwin-arm64.tar.gz` |
| macOS (Intel) | `lansend-darwin-x86_64.tar.gz` |
| Windows (x64) | `lansend-windows-x64.zip` |
| Linux (x86_64) | `lansend-linux-x86_64.tar.gz` |
| Linux (ARM64) | `lansend-linux-arm64.tar.gz` |

#### macOS / Linux

```bash
tar xzf lansend-darwin-arm64.tar.gz
./lansend
```

如果提示"无法验证开发者"，在终端执行：

```bash
xattr -d com.apple.quarantine lansend
```

#### Windows

解压 ZIP 后双击运行，或在命令行执行：

```cmd
lansend.exe
```

> Windows 首次运行可能被 SmartScreen 拦截，点击"更多信息" → "仍要运行"即可。

### 从源码构建

#### 环境要求

- Go 1.26+
- Node.js 22+
- pnpm

#### 构建步骤

```bash
# 安装前端依赖
pnpm install

# 构建前端并复制到 server/embeddist/
pnpm build:web

# 构建服务端（含版本信息）
pnpm build:server

# 一步构建
pnpm build
```

构建后的二进制文件位于 `server/lansend`（Windows 为 `server/lansend.exe`）。

> Linux 不需要托盘功能时，可以关闭 CGO，将 `scripts/build-server.mjs` 中 `CGO_ENABLED: '1'` 改为 `CGO_ENABLED: '0'`。

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