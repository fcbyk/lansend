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
	password       bool
	uploadPassword string
	browser        bool
	download       bool
	enableUpload   bool
	chatEnabled    bool
)

func main() {
	// 禁用 Cobra 的 Windows 双击拦截，允许双击 exe 直接启动服务
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
	rootCmd.Flags().IntVarP(&port, "port", "p", 80, "Web server port")
	rootCmd.Flags().BoolVarP(&download, "download", "1", false, "Enable download functionality")
	rootCmd.Flags().BoolVarP(&enableUpload, "upload", "2", false, "Enable upload functionality")
	rootCmd.Flags().BoolVarP(&chatEnabled, "chat", "3", false, "Enable chat functionality")
	rootCmd.Flags().BoolVarP(&password, "password", "4", false, "Prompt to set upload password")
	rootCmd.Flags().BoolVarP(&browser, "browser", "b", false, "Enable automatic browser opening")
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

func run(_ *cobra.Command, _ []string) {
	// 未指定 -d 时默认共享当前工作目录
	if directory == "" {
		if wd, err := os.Getwd(); err == nil {
			directory = wd
		} else {
			directory = "."
		}
	}

	startServer()
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

	// 服务停止后暂停等待用户确认退出
	// Windows 上控制台窗口随进程退出而关闭，暂停避免一闪而过
	if runtime.GOOS == "windows" {
		fmt.Println()
		fmt.Print("  服务已停止。按 Enter 键退出...")
		bufio.NewReader(os.Stdin).ReadBytes('\n')
	}
}
