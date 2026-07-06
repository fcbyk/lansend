package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/fcbyk/lansend/internal/chat"
	"github.com/fcbyk/lansend/internal/cli"
	"github.com/fcbyk/lansend/internal/config"
	"github.com/fcbyk/lansend/internal/files"
	"github.com/fcbyk/lansend/internal/network"
	"github.com/fcbyk/lansend/internal/spa"
	"github.com/fcbyk/lansend/internal/speedtest"
	"github.com/fcbyk/lansend/internal/tray"
	"github.com/fcbyk/lansend/internal/upload"

	"github.com/spf13/cobra"
	"golang.org/x/term"
)

// 编译时通过 -ldflags 注入
var (
	version    = "dev"
	commitHash = "unknown"
)

var (
	port           int
	directory      string
	useExeDir      bool
	useWorkDir     bool
	password       bool
	uploadPassword string
	browser        bool
	download       bool
	enableUpload   bool
	chatEnabled    bool
	trayMode       bool
)

func main() {
	// 禁用 Cobra 的 Windows 双击拦截，允许双击 exe 直接进入交互菜单
	cobra.MousetrapHelpText = ""

	versionStr := strings.TrimPrefix(version, "v")
	if commitHash != "unknown" {
		versionStr = fmt.Sprintf("%s (%s)", versionStr, commitHash)
	}

	rootCmd := &cobra.Command{
		Use:     "lansend",
		Short:   "Start a local web server for sharing files over LAN",
		Version: versionStr,
		Run:     run,
	}
	rootCmd.SetVersionTemplate("lansend {{.Version}}\n")

	rootCmd.Flags().StringVarP(&directory, "directory", "d", "", "Directory to share (default: current directory)")
	rootCmd.Flags().BoolVarP(&useExeDir, "exe", "e", false, "Use executable directory")
	rootCmd.Flags().BoolVarP(&useWorkDir, "work", "w", false, "Use current working directory")
	rootCmd.Flags().IntVarP(&port, "port", "p", 80, "Web server port")
	rootCmd.Flags().BoolVarP(&download, "download", "1", false, "Enable download functionality")
	rootCmd.Flags().BoolVarP(&enableUpload, "upload", "2", false, "Enable upload functionality")
	rootCmd.Flags().BoolVarP(&chatEnabled, "chat", "3", false, "Enable chat functionality")
	rootCmd.Flags().BoolVarP(&password, "password", "4", false, "Prompt to set upload password")
	rootCmd.Flags().BoolVarP(&browser, "browser", "b", false, "Enable automatic browser opening")
	rootCmd.Flags().BoolVarP(&trayMode, "tray", "t", false, "Start in system tray mode")
	rootCmd.Flags().SortFlags = false

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func validateDirectory(dir string) (string, bool) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: cannot resolve directory %s\n", dir)
		return "", false
	}
	info, err := os.Stat(abs)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: directory %s does not exist\n", abs)
		return "", false
	}
	if !info.IsDir() {
		fmt.Fprintf(os.Stderr, "Error: %s is not a directory\n", abs)
		return "", false
	}
	return abs, true
}

func promptPassword() string {
	fmt.Print("Upload password (press Enter to use default: 123456): ")
	pwd, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return ""
	}
	if len(pwd) == 0 {
		return "123456"
	}
	return string(pwd)
}

func printServerSummary(sharedDirectory string, port int, networks []network.InterfaceInfo, uploadPasswordEnabled bool) string {
	fmt.Println()
	fmt.Printf(" Directory: %s\n", sharedDirectory)
	if uploadPasswordEnabled {
		fmt.Println(" Upload Password: Enabled")
	}

	fmt.Printf(" Local: \033[36mhttp://localhost:%d\033[0m\n", port)
	fmt.Printf(" Local: \033[36mhttp://127.0.0.1:%d\033[0m\n", port)

	for _, net := range networks {
		for _, ip := range net.IPs {
			if ip == "127.0.0.1" {
				continue
			}
			fmt.Printf(" [%s] Network URL: \033[36mhttp://%s:%d\033[0m\n", net.Iface, ip, port)
		}
	}

	var localIP string
	if len(networks) > 0 && len(networks[0].IPs) > 0 {
		localIP = networks[0].IPs[0]
	}

	url := fmt.Sprintf("http://localhost:%d", port)
	if localIP != "" {
		url = fmt.Sprintf("http://%s:%d", localIP, port)
	}

	if err := cli.CopyToClipboard(url); err != nil {
		fmt.Printf(" Warning: Could not copy URL to clipboard (%v)\n", err)
	} else {
		fmt.Println(" URL has been copied to clipboard")
	}

	fmt.Println()
	return url
}

func checkPort(port int) bool {
	if err := network.EnsurePortAvailable(port, "0.0.0.0"); err != nil {
		fmt.Fprintf(os.Stderr, " Error: %v\n", err)
		fmt.Fprintf(os.Stderr, " Please choose another port (e.g. --port %d).\n\n", port+1)
		return false
	}
	return true
}

// getExeDir returns the directory containing the running executable.
func getExeDir() string {
	if exePath, err := os.Executable(); err == nil {
		return filepath.Dir(exePath)
	}
	if wd, err := os.Getwd(); err == nil {
		return wd
	}
	return "."
}

func run(cmd *cobra.Command, args []string) {
	if trayMode {
		runTray()
		return
	}

	hasPath := cmd.Flags().Changed("directory") ||
		cmd.Flags().Changed("exe") ||
		cmd.Flags().Changed("work")

	hasFlags := cmd.Flags().Changed("port") ||
		cmd.Flags().Changed("password") || cmd.Flags().Changed("browser") ||
		cmd.Flags().Changed("download") || cmd.Flags().Changed("upload") ||
		cmd.Flags().Changed("chat")

	if !hasPath && !hasFlags {
		runInteractive()
		return
	}

	if !hasPath {
		fmt.Fprintln(os.Stderr, "Error: must specify a directory: -d /path, -e (exe dir), or -w (work dir)")
		os.Exit(1)
	}

	// Resolve directory
	if cmd.Flags().Changed("directory") {
		// already set by pflag
	} else if cmd.Flags().Changed("work") {
		if wd, err := os.Getwd(); err == nil {
			directory = wd
		} else {
			directory = "."
		}
	} else if cmd.Flags().Changed("exe") {
		directory = getExeDir()
	}

	startServer()
}


// ── Interactive Mode ──────────────────────

func runInteractive() {
	fmt.Print(`
   _         _     _   _  ____                    _ 
  | |       / \   | \ | |/ ___|   ___  _ __    __| |
  | |      / _ \  |  \| |\___ \  / _ \| '_ \  / _` + "`" + ` |
  | |___  / ___ \ | |\  | ___) ||  __/| | | || (_| |
  |_____|/_/   \_\|_| \_||____/  \___||_| |_| \__,_|
`)
	fmt.Println()
	if commitHash != "unknown" {
		fmt.Printf("  %s (%s)", version, commitHash)
	} else {
		fmt.Printf("  %s", version)
	}
	fmt.Println()
	fmt.Println()
	fmt.Println("  Directory (required):")
	fmt.Println("    e   exe dir    ── 可执行文件所在目录")
	fmt.Println("    w   work dir   ── 当前工作目录")
	fmt.Println()
	fmt.Println("  Features:")
	fmt.Println("    1   download   ── 启用文件下载")
	fmt.Println("    2   upload     ── 启用文件上传")
	fmt.Println("    3   chat       ── 启用聊天")
	fmt.Println("    4   password   ── 设置上传密码")
	fmt.Println("    b   browser    ── 自动打开浏览器")
	fmt.Println("    t   tray       ── 系统托盘模式（关闭终端不停止服务）")
	fmt.Println()
	fmt.Println("  提示: 将想开启的选项字母拼在一起输入即可，如:")
	fmt.Println("    et      ── exe目录 + 托盘模式（推荐）")
	fmt.Println("    w1b     ── 工作目录 + 下载 + 打开浏览器")
	fmt.Println("    et123   ── exe目录 + 托盘 + 下载/上传/聊天")
	fmt.Println()

	for {
		fmt.Print("  请输入选项组合 [默认: et]: ")

		input, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil {
			fmt.Println("  读取输入失败，请重试。")
			continue
		}
		input = strings.TrimSpace(input)

		// 用户直接回车，使用默认值：exe dir + tray mode
		if input == "" {
			input = "et"
		}

		hasE := strings.ContainsRune(input, 'e')
		hasW := strings.ContainsRune(input, 'w')
		if !hasE && !hasW {
			fmt.Println("  错误: 必须选择目录，输入 e (exe dir) 或 w (work dir)")
			continue
		}
		if hasE && hasW {
			fmt.Println("  错误: e 和 w 不能同时使用，请只选一个")
			continue
		}

		// 重置所有状态变量
		port = 80
		directory = ""
		download = false
		enableUpload = false
		chatEnabled = false
		password = false
		browser = false
		trayMode = false
		uploadPassword = ""

		validInput := true
		for _, ch := range input {
			switch ch {
			case 'e':
				directory = getExeDir()
			case 'w':
				if wd, err := os.Getwd(); err == nil {
					directory = wd
				} else {
					directory = "."
				}
			case '1':
				download = true
			case '2':
				enableUpload = true
			case '3':
				chatEnabled = true
			case '4':
				password = true
			case 'b':
				browser = true
			case 't':
				trayMode = true
			default:
				fmt.Printf("  忽略无效选项: '%c'\n", ch)
				validInput = false
			}
		}
		if !validInput {
			fmt.Println("  有效选项: e w 1 2 3 4 b t，请重新输入。")
			continue
		}

		break
	}

	if password && enableUpload {
		uploadPassword = promptPassword()
	}

	if trayMode {
		runTray()
	} else {
		startServer()
	}
}

func startServer() {
	sharedDirectory, ok := validateDirectory(directory)
	if !ok {
		os.Exit(1)
	}

	if !checkPort(port) {
		os.Exit(1)
	}

	if password && enableUpload && uploadPassword == "" {
		uploadPassword = promptPassword()
	}

	networks := network.GetPrivateNetworks()
	url := printServerSummary(sharedDirectory, port, networks, uploadPassword != "")

	cfg := &config.Config{
		SharedDirectory: sharedDirectory,
		UploadPassword:  uploadPassword,
		DownloadEnabled: download,
		UploadEnabled:   enableUpload,
		ChatEnabled:     chatEnabled,
	}

	fileService := &files.Service{Config: cfg}

	mux := http.NewServeMux()

	spa.RegisterRoutes(mux)

	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		fmt.Fprintf(w, `{"code":200,"message":"success","data":{"download_enabled":%t,"upload_enabled":%t,"chat_enabled":%t}}`,
			cfg.DownloadEnabled, cfg.UploadEnabled, cfg.ChatEnabled)
	})

	files.RegisterRoutes(mux, fileService)

	if cfg.UploadEnabled {
		upload.RegisterRoutes(mux, &upload.Service{
			FileService: fileService,
			Config:      cfg,
		})
	}

	if cfg.ChatEnabled {
		chat.RegisterRoutes(mux, chat.NewService(chat.NewStore(1000)))
	}

	speedtest.RegisterRoutes(mux)

	server := &http.Server{
		Addr:    fmt.Sprintf("0.0.0.0:%d", port),
		Handler: mux,
	}

	if browser && url != "" {
		go func() {
			if cli.WaitForServerReady(port, 10*time.Second) {
				cli.OpenBrowser(url)
			}
		}()
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	log.Printf("Server starting on http://0.0.0.0:%d\n", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}

	// 非托盘模式下，服务停止后暂停等待用户确认退出
	// Windows 上控制台窗口随进程退出而关闭，暂停避免一闪而过
	if runtime.GOOS == "windows" {
		fmt.Println()
		fmt.Print("  服务已停止。按 Enter 键退出...")
		bufio.NewReader(os.Stdin).ReadBytes('\n')
	}
}

func runTray() {
	if directory == "" {
		if wd, err := os.Getwd(); err == nil {
			directory = wd
		} else {
			directory = "."
		}
	}

	cfg := &config.Config{
		SharedDirectory: directory,
		UploadPassword:  uploadPassword,
		DownloadEnabled: download,
		UploadEnabled:   enableUpload,
		ChatEnabled:     chatEnabled,
	}

	if browser {
		url := fmt.Sprintf("http://localhost:%d", port)
		networks := network.GetPrivateNetworks()
		for _, n := range networks {
			if n.Virtual {
				continue
			}
			for _, ip := range n.IPs {
				if ip != "127.0.0.1" {
					url = fmt.Sprintf("http://%s:%d", ip, port)
					break
				}
			}
		}
		go func() {
			if cli.WaitForServerReady(port, 10*time.Second) {
				cli.OpenBrowser(url)
			}
		}()
	}

	fmt.Println()
	fmt.Println(" 托盘已启动。")
	fmt.Println()

	// 启动托盘（goroutine），主线程等退出信号防止进程被杀
	quitCh := make(chan struct{})
	go func() {
		tray.Run(cfg, port)
		close(quitCh)
	}()

	// 短暂延迟让托盘图标出现，然后脱离控制台
	time.Sleep(300 * time.Millisecond)
	tray.FreeConsoleWindows()

	<-quitCh
}
