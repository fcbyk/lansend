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
	port           int
	directory      string
	password       bool
	uploadPassword string
	browser        bool
	download       bool
	enableUpload   bool
	chatEnabled    bool
	trayMode       bool
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

const (
	colorDim   = "\033[90m"
	colorRed   = "\033[31m"
	colorGreen = "\033[32m"
	colorReset = "\033[0m"
)

func dim(s string) string {
	return colorDim + s + colorReset
}

func boolToYN(v bool) string {
	if v {
		return "Yes"
	}
	return "No"
}

func runInteractive() {
	fmt.Println()
	fmt.Println("  lansend - LAN File Sharing")
	fmt.Println("  ────────────────────────────")
	fmt.Println()

	wd, _ := os.Getwd()
	directory = readString("  Directory ", wd, "输入要共享的目录路径，回车默认")

	port = readPort(80)

	enableUpload = readBool("  Enable upload? ", false)
	if enableUpload {
		uploadPassword = readPassword("  Upload password ", "输入密码，回车跳过")
	}
	download = readBool("  Enable download? ", false)
	chatEnabled = readBool("  Enable chat? ", false)

	browser = readBool("  Open browser after start? ", false)
	trayMode = readBool("  Start in system tray? ", false)

	confirmSettings()

	if trayMode {
		runTray()
		return
	}

	startServer()
}

func readString(label, defaultVal, placeholder string) string {
	fd := int(os.Stdin.Fd())
	oldState, err := term.MakeRaw(fd)
	if err != nil {
		return readStringFallback(label, defaultVal, placeholder)
	}
	defer term.Restore(fd, oldState)

	inputPrefix := fmt.Sprintf("%s[%s]  ", label, defaultVal)
	fmt.Print(inputPrefix)
	fmt.Print(dim(placeholder))

	var buf []rune
	placeholderVisible := true

	for {
		var b [3]byte
		n, _ := os.Stdin.Read(b[:])

		if n == 1 {
			switch b[0] {
			case 3:
				term.Restore(fd, oldState)
				fmt.Print("\r\n")
				os.Exit(0)
			case 13:
				value := string(buf)
				if value == "" {
					value = defaultVal
				}
				fmt.Print("\r\n")
				fmt.Print("\033[1A\r\033[K")
				fmt.Printf("%s[%s%s%s]", label, colorGreen, value, colorReset)
				fmt.Print("\r\n")
				return value
			case 127:
				if len(buf) > 0 {
					buf = buf[:len(buf)-1]
					fmt.Print("\b \b")
				}
				if len(buf) == 0 && !placeholderVisible {
					fmt.Print("\r" + inputPrefix + dim(placeholder))
					placeholderVisible = true
				}
			default:
				if b[0] >= 32 {
					if placeholderVisible {
						fmt.Print("\r" + inputPrefix + "\033[K")
						placeholderVisible = false
						for _, r := range buf {
							fmt.Print(string(r))
						}
					}
					buf = append(buf, rune(b[0]))
					fmt.Print(string(b[0]))
				}
			}
		}
	}
}

func readPort(defaultVal int) int {
	defaultStr := strconv.Itoa(defaultVal)
	label := "  Port "
	placeholder := "输入端口号 (1-65535)，回车默认"

	for {
		input := readString(label, defaultStr, placeholder)
		if input == defaultStr {
			return defaultVal
		}
		p, err := strconv.Atoi(input)
		if err != nil || p < 1 || p > 65535 {
			fmt.Printf("  %s⚠ 无效端口 (1-65535)，重新输入%s\n", colorRed, colorReset)
			time.Sleep(1 * time.Second)
			fmt.Print("\033[1A\r\033[K")
			fmt.Print("\033[1A\r\033[K")
			continue
		}
		return p
	}
}

func readBool(label string, defaultVal bool) bool {
	fd := int(os.Stdin.Fd())
	oldState, err := term.MakeRaw(fd)
	if err != nil {
		return readBoolFallback(label, defaultVal)
	}
	defer term.Restore(fd, oldState)

	current := defaultVal
	hint := dim("← → 切换，回车确认")

	printLine := func() {
		fmt.Printf("\r\033[K%s[%s]  %s", label, boolToYN(current), hint)
	}
	printLine()

	for {
		var b [3]byte
		n, _ := os.Stdin.Read(b[:])

		if n == 1 {
			switch b[0] {
			case 3:
				term.Restore(fd, oldState)
				fmt.Print("\r\n")
				os.Exit(0)
			case 13:
				fmt.Print("\r\n")
				fmt.Print("\033[1A\r\033[K")
				fmt.Printf("%s[%s%s%s]", label, colorGreen, boolToYN(current), colorReset)
				fmt.Print("\r\n")
				return current
			}
		} else if n == 3 && b[0] == 27 && b[1] == 91 {
			switch b[2] {
			case 67:
				if !current {
					current = true
					printLine()
				}
			case 68:
				if current {
					current = false
					printLine()
				}
			}
		}
	}
}

func readPassword(label, placeholder string) string {
	fd := int(os.Stdin.Fd())
	oldState, err := term.MakeRaw(fd)
	if err != nil {
		return readPasswordFallback(label, placeholder)
	}
	defer term.Restore(fd, oldState)

	inputPrefix := fmt.Sprintf("%s[]  ", label)
	fmt.Print(inputPrefix)
	fmt.Print(dim(placeholder))

	var buf []rune
	placeholderVisible := true

	for {
		var b [3]byte
		n, _ := os.Stdin.Read(b[:])

		if n == 1 {
			switch b[0] {
			case 3:
				term.Restore(fd, oldState)
				fmt.Print("\r\n")
				os.Exit(0)
			case 13:
				value := string(buf)
				fmt.Print("\r\n")
				fmt.Print("\033[1A\r\033[K")
				if value == "" {
					fmt.Printf("%s[%s无%s]", label, colorDim, colorReset)
				} else {
					masked := strings.Repeat("*", len(buf))
					fmt.Printf("%s[%s%s%s]", label, colorGreen, masked, colorReset)
				}
				fmt.Print("\r\n")
				return value
			case 127:
				if len(buf) > 0 {
					buf = buf[:len(buf)-1]
					fmt.Print("\b \b")
				}
				if len(buf) == 0 && !placeholderVisible {
					fmt.Print("\r" + inputPrefix + dim(placeholder))
					placeholderVisible = true
				}
			default:
				if b[0] >= 32 {
					if placeholderVisible {
						fmt.Print("\r" + inputPrefix + "\033[K")
						placeholderVisible = false
						for range buf {
							fmt.Print("*")
						}
					}
					buf = append(buf, rune(b[0]))
					fmt.Print("*")
				}
			}
		}
	}
}

func readPasswordFallback(label, placeholder string) string {
	fmt.Printf("%s[]  %s\n", label, dim(placeholder))
	fmt.Print("  ")
	pwd, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil || len(pwd) == 0 {
		fmt.Printf("  → %s无%s\n", colorDim, colorReset)
		return ""
	}
	masked := strings.Repeat("*", len(pwd))
	fmt.Printf("  → %s%s%s\n", colorGreen, masked, colorReset)
	return string(pwd)
}

func readStringFallback(label, defaultVal, placeholder string) string {
	fmt.Printf("%s[%s]  %s\n", label, defaultVal, dim(placeholder))
	fmt.Print("  ")
	reader := bufio.NewReader(os.Stdin)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(input)
	if input == "" {
		fmt.Printf("  → %s%s%s\n", colorGreen, defaultVal, colorReset)
		return defaultVal
	}
	return input
}

func readBoolFallback(label string, defaultVal bool) bool {
	defaultStr := boolToYN(defaultVal)
	defaultChar := "n"
	if defaultVal {
		defaultChar = "y"
	}
	fmt.Printf("%s[%s]  %s\n", label, defaultStr, dim(fmt.Sprintf("输入 y/n，回车默认 (%s)", defaultChar)))
	fmt.Print("  ")
	reader := bufio.NewReader(os.Stdin)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(strings.ToLower(input))
	if input == "" {
		fmt.Printf("  → %s%s%s\n", colorGreen, defaultStr, colorReset)
		return defaultVal
	}
	return input == "y" || input == "yes"
}

func confirmSettings() {
	fmt.Println()
	fmt.Printf("  %s回车确认启动，Ctrl+C 取消%s\n", colorDim, colorReset)
	bufio.NewReader(os.Stdin).ReadString('\n')
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

	tray.Run(cfg, port)
}
