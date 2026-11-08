package main

import (
	"bufio"
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"syscall"

	"github.com/fcbyk/lansend/internal/config"
	"github.com/fcbyk/lansend/internal/core"
	"github.com/fcbyk/lansend/internal/platform"

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

func printServerSummary(st core.State, sharedDirectory string, uploadPasswordEnabled bool) {
	fmt.Println()
	fmt.Printf(" Directory: %s\n", sharedDirectory)
	if uploadPasswordEnabled {
		fmt.Println(" Upload Password: Enabled")
	}

	fmt.Printf(" Local: \033[36m%s\033[0m\n", st.LocalURL())
	fmt.Printf(" Local: \033[36mhttp://127.0.0.1:%d\033[0m\n", st.Port)

	for _, iface := range st.Networks {
		for _, ip := range iface.IPs {
			if ip == "127.0.0.1" {
				continue
			}
			fmt.Printf(" [%s] Network URL: \033[36mhttp://%s:%d\033[0m\n", iface.Iface, ip, st.Port)
		}
	}

	if err := platform.CopyToClipboard(st.LANURL()); err != nil {
		fmt.Printf(" Warning: Could not copy URL to clipboard (%v)\n", err)
	} else {
		fmt.Println(" URL has been copied to clipboard")
	}

	fmt.Println()
}

func run(_ *cobra.Command, _ []string) {
	cfg := config.Default()
	cfg.Port = port
	cfg.SharedDirectory = directory
	cfg.UploadPassword = uploadPassword
	cfg.DownloadEnabled = download
	cfg.UploadEnabled = enableUpload
	cfg.ChatEnabled = chatEnabled

	if password && enableUpload {
		if cfg.UploadPassword == "" {
			cfg.UploadPassword = promptPassword()
		}
		// 命令行只提供「启用」这一条路径，关闭密码在桌面端设置。
		cfg.UploadPasswordEnabled = true
	}

	srv := core.New(cfg)
	if err := srv.Start(); err != nil {
		fmt.Fprintf(os.Stderr, " Error: %v\n", err)
		fmt.Fprintf(os.Stderr, " Please choose another port (e.g. --port %d) or another directory.\n\n", port+1)
		os.Exit(1)
	}

	running := srv.Config()
	st := srv.State()
	printServerSummary(st, running.SharedDirectory, running.RequireUploadPassword())

	if browser {
		platform.OpenBrowser(st.LANURL())
	}

	waitForSignal()
	_ = srv.Stop()

	// 服务停止后暂停等待用户确认退出
	// Windows 上控制台窗口随进程退出而关闭，暂停避免一闪而过
	if runtime.GOOS == "windows" {
		fmt.Println()
		fmt.Print("  服务已停止。按 Enter 键退出...")
		bufio.NewReader(os.Stdin).ReadBytes('\n')
	}
}

func waitForSignal() {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
}
