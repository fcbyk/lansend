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
	"strconv"
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

var (
	port         int
	directory    string
	password     bool
	browser      bool
	download     bool
	enableUpload bool
	chatEnabled  bool
	trayMode     bool
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "lansend",
		Short: "Start a local web server for sharing files over LAN",
		Run:   run,
	}

	rootCmd.Flags().IntVarP(&port, "port", "p", 80, "Web server port")
	rootCmd.Flags().StringVarP(&directory, "directory", "d", "", "Directory to share (default: current directory)")
	rootCmd.Flags().BoolVar(&password, "password", false, "Prompt to set upload password")
	rootCmd.Flags().BoolVar(&browser, "browser", false, "Enable automatic browser opening")
	rootCmd.Flags().BoolVar(&download, "download", false, "Enable download functionality")
	rootCmd.Flags().BoolVar(&enableUpload, "upload", false, "Enable upload functionality")
	rootCmd.Flags().BoolVar(&chatEnabled, "chat", false, "Enable chat functionality")
	rootCmd.Flags().BoolVar(&trayMode, "tray", false, "Start in system tray mode")

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

func promptPassword(askPass, uploadEnabled bool) string {
	if !askPass || !uploadEnabled {
		return ""
	}
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

func run(cmd *cobra.Command, args []string) {
	if trayMode {
		runTray()
		return
	}

	hasFlags := cmd.Flags().Changed("port") || cmd.Flags().Changed("directory") ||
		cmd.Flags().Changed("password") || cmd.Flags().Changed("browser") ||
		cmd.Flags().Changed("download") || cmd.Flags().Changed("upload") ||
		cmd.Flags().Changed("chat")

	if !hasFlags {
		runInteractive()
		return
	}

	if directory == "" {
		if wd, err := os.Getwd(); err == nil {
			directory = wd
		} else {
			directory = "."
		}
	}

	startServer()
}

func runInteractive() {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println()
	fmt.Println("  lansend - LAN File Sharing")
	fmt.Println("  ────────────────────────────")
	fmt.Println()

	wd, _ := os.Getwd()
	fmt.Printf("  Directory [%s]: ", wd)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(input)
	if input != "" {
		directory = input
	} else {
		directory = wd
	}

	fmt.Printf("  Port [80]: ")
	input, _ = reader.ReadString('\n')
	input = strings.TrimSpace(input)
	if input != "" {
		if p, err := strconv.Atoi(input); err == nil && p > 0 && p <= 65535 {
			port = p
		} else {
			fmt.Println("  Invalid port, using default 80")
		}
	}

	enableUpload = promptYesNo(reader, "  Enable upload? [y/N]: ")
	download = promptYesNo(reader, "  Enable download? [y/N]: ")
	chatEnabled = promptYesNo(reader, "  Enable chat? [y/N]: ")

	if enableUpload {
		password = promptYesNo(reader, "  Set upload password? [y/N]: ")
	}

	browser = promptYesNo(reader, "  Open browser after start? [y/N]: ")
	trayMode = promptYesNo(reader, "  Start in system tray? [y/N]: ")

	if trayMode {
		runTray()
		return
	}

	startServer()
}

func promptYesNo(reader *bufio.Reader, prompt string) bool {
	fmt.Print(prompt)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(strings.ToLower(input))
	return input == "y" || input == "yes"
}

func startServer() {
	sharedDirectory, ok := validateDirectory(directory)
	if !ok {
		os.Exit(1)
	}

	if !checkPort(port) {
		os.Exit(1)
	}

	uploadPassword := promptPassword(password, enableUpload)

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
}

func runTray() {
	if directory == "" {
		if wd, err := os.Getwd(); err == nil {
			directory = wd
		} else {
			directory = "."
		}
	}

	fmt.Println()
	fmt.Println(" 托盘已启动，关闭终端不影响运行。")
	fmt.Println(" 通过菜单栏图标控制服务器。")
	fmt.Println()

	cfg := &config.Config{
		SharedDirectory: directory,
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

	tray.Run(cfg, port)
}
