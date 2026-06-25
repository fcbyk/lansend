package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
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
	port          int
	directory     string
	askPassword   bool
	noBrowser     bool
	hideDownload  bool
	disableUpload bool
	chatEnabled   bool
)

func main() {
	if len(os.Args) == 1 {
		runTray()
		return
	}

	rootCmd := &cobra.Command{
		Use:   "lansend",
		Short: "Start a local web server for sharing files over LAN",
		Run:   run,
	}

	rootCmd.Flags().IntVarP(&port, "port", "p", 80, "Web server port")
	rootCmd.Flags().StringVarP(&directory, "directory", "d", "", "Directory to share (default: executable location)")
	rootCmd.Flags().BoolVar(&askPassword, "ask-password", false, "Prompt to set upload password")
	rootCmd.Flags().BoolVar(&noBrowser, "no-browser", false, "Disable automatic browser opening")
	rootCmd.Flags().BoolVar(&hideDownload, "hide-download", false, "Hide download buttons in directory tab")
	rootCmd.Flags().BoolVar(&disableUpload, "disable-upload", false, "Disable upload functionality")
	rootCmd.Flags().BoolVar(&chatEnabled, "chat", false, "Enable chat functionality")

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

func promptPassword(askPassword, disableUpload bool) string {
	if !askPassword || disableUpload {
		return ""
	}
	fmt.Print("Upload password (press Enter to use default: 123456): ")
	password, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return ""
	}
	if len(password) == 0 {
		return "123456"
	}
	return string(password)
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
	if directory == "" {
		if wd, err := os.Getwd(); err == nil {
			directory = wd
		} else {
			directory = "."
		}
	}

	sharedDirectory, ok := validateDirectory(directory)
	if !ok {
		os.Exit(1)
	}

	if !checkPort(port) {
		os.Exit(1)
	}

	uploadPassword := promptPassword(askPassword, disableUpload)

	networks := network.GetPrivateNetworks()
	url := printServerSummary(sharedDirectory, port, networks, uploadPassword != "")

	cfg := &config.Config{
		SharedDirectory: sharedDirectory,
		UploadPassword:  uploadPassword,
		UnDownload:      hideDownload,
		UnUpload:        disableUpload,
		ChatEnabled:     chatEnabled,
	}

	fileService := &files.Service{Config: cfg}

	mux := http.NewServeMux()

	spa.RegisterRoutes(mux)

	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		fmt.Fprintf(w, `{"code":200,"message":"success","data":{"un_download":%t,"un_upload":%t,"chat_enabled":%t}}`,
			cfg.UnDownload, cfg.UnUpload, cfg.ChatEnabled)
	})

	files.RegisterRoutes(mux, fileService)

	if !cfg.UnUpload {
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

	if !noBrowser && url != "" {
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
	dir, err := os.Getwd()
	if err != nil {
		dir = "."
	}

	fmt.Println()
	fmt.Println(" 托盘已启动，关闭终端不影响运行。")
	fmt.Println(" 通过菜单栏图标控制服务器。")
	fmt.Println()

	cfg := &config.Config{
		SharedDirectory: dir,
	}

	tray.Run(cfg, 80)
}
