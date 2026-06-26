# lansend

局域网文件分享工具，一键启动 Web 服务，同一网络下的设备通过浏览器即可浏览、上传、下载文件，支持在线聊天和网速测试。

## 功能

- **文件浏览** — 目录树导航、文件列表、文本/图片/音视频在线预览
- **文件下载** — 单文件下载、多文件打包 ZIP 下载、支持断点续传
- **文件上传** — 拖拽上传、分片上传、进度显示、上传密码保护
- **在线聊天** — 局域网内设备实时文字聊天
- **网速测试** — 上传/下载速率测试
- **系统托盘** — macOS / Windows 支持托盘模式，关闭终端也不影响运行
- **交互式 CLI** — 无参数启动时进入向导模式，逐项配置
- **剪贴板复制** — 自动复制局域网访问地址
- **跨平台** — 支持 macOS、Windows、Linux

## 快速开始

### 下载二进制

在 [Releases](https://github.com/fcbyk/lansend/releases) 页面下载对应平台的二进制文件：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `lansend-darwin-arm64.tar.gz` |
| macOS (Intel) | `lansend-darwin-x86_64.tar.gz` |
| Windows (x64) | `lansend-windows-x64.zip` |
| Linux (x86_64) | `lansend-linux-x86_64.tar.gz` |
| Linux (ARM64) | `lansend-linux-arm64.tar.gz` |

### macOS / Linux

解压后直接运行：

```bash
tar xzf lansend-darwin-arm64.tar.gz
./lansend
```

如果提示"无法验证开发者"，在终端执行：

```bash
xattr -d com.apple.quarantine lansend
```

### Windows

解压 ZIP 后双击运行，或在命令行执行：

```cmd
lansend.exe
```

> 注意：Windows 首次运行可能被 SmartScreen 拦截，点击"更多信息" → "仍要运行"即可。

### 使用方式

**交互模式**（推荐）：直接运行 `lansend`，按向导提示配置各项参数：

```
$ lansend

  lansend - LAN File Sharing
  ────────────────────────────

  Directory [/path/to/dir]  输入要共享的目录路径，回车默认
  Port [80]                 输入端口号 (1-65535)，回车默认
  Enable upload? [No]       ← → 切换，回车确认
  Enable download? [No]
  Enable chat? [No]
  Open browser after start? [No]
  Start in system tray? [No]

  回车确认启动，Ctrl+C 取消
```

**命令行模式**：

```bash
# 基本使用：共享当前目录，端口 80
lansend

# 指定端口和目录
lansend --port 8080 --directory /path/to/share

# 启用上传、下载、聊天
lansend --upload --download --chat

# 启用上传并设置密码
lansend --upload --password

# 启动后自动打开浏览器
lansend --browser

# 系统托盘模式（macOS / Windows）
lansend --tray
```

| 参数 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `--port` | `-p` | `80` | 服务端口 |
| `--directory` | `-d` | 当前目录 | 共享目录路径 |
| `--upload` | | `false` | 启用上传功能 |
| `--password` | | `false` | 启动时提示设置上传密码 |
| `--download` | | `false` | 启用下载功能 |
| `--chat` | | `false` | 启用聊天功能 |
| `--browser` | | `false` | 启动后自动打开浏览器 |
| `--tray` | | `false` | 系统托盘模式 |

## 从源码构建

### 环境要求

- Go 1.26+
- Node.js 22+
- pnpm

### 构建步骤

```bash
# 安装前端依赖
pnpm install

# 构建前端
pnpm build:web

# 构建服务端
cd server
CGO_ENABLED=1 go build -ldflags="-s -w" -o lansend .
```

> Linux 不需要托盘功能时，可以关闭 CGO：
> ```bash
> CGO_ENABLED=0 go build -ldflags="-s -w" -o lansend .
> ```

## 技术栈

- **后端**：Go 标准库 `net/http`、[cobra](https://github.com/spf13/cobra)、[systray](https://github.com/getlantern/systray)
- **前端**：React 19、Vite 8、Tailwind CSS 4
- **API**：RESTful JSON，无额外依赖

## License

[MIT](LICENSE)