//go:build cgo

package tray

import (
	"context"
	_ "embed"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/fcbyk/lansend/internal/chat"
	"github.com/fcbyk/lansend/internal/cli"
	"github.com/fcbyk/lansend/internal/config"
	"github.com/fcbyk/lansend/internal/files"
	"github.com/fcbyk/lansend/internal/network"
	"github.com/fcbyk/lansend/internal/spa"
	"github.com/fcbyk/lansend/internal/speedtest"
	"github.com/fcbyk/lansend/internal/upload"
	"github.com/getlantern/systray"
)

//go:embed icon.png
var iconData []byte

type app struct {
	mu      sync.Mutex
	server  *http.Server
	running bool
	cfg     *config.Config
	port    int
	lanIP   string

	toggleItem     *systray.MenuItem
	dirStatusItem  *systray.MenuItem
	addrStatusItem *systray.MenuItem
	statusItem     *systray.MenuItem

	uploadToggleItem   *systray.MenuItem
	downloadToggleItem *systray.MenuItem
	chatToggleItem     *systray.MenuItem
}

func Run(cfg *config.Config, port int) {
	if !tryLock() {
		fmt.Fprintln(os.Stderr, "lansend 已在运行中")
		os.Exit(1)
	}

	ignoreTerminalClose()

	a := &app{cfg: cfg, port: port, lanIP: resolveLANIP()}
	systray.Run(func() { a.onReady() }, a.onExit)
}

func (a *app) onReady() {
	systray.SetIcon(iconData)
	systray.SetTooltip("lansend - LAN File Sharing")

	a.dirStatusItem = systray.AddMenuItem("共享目录: "+a.cfg.SharedDirectory, "当前共享目录")
	a.dirStatusItem.Disable()
	a.addrStatusItem = systray.AddMenuItem("地址: "+a.lanIP+":"+fmt.Sprint(a.port), "局域网访问地址")
	a.addrStatusItem.Disable()
	a.statusItem = systray.AddMenuItem("状态: 未启动", "服务器状态")
	a.statusItem.Disable()
	systray.AddSeparator()

	a.toggleItem = systray.AddMenuItem("启动服务器", "启动/停止服务器")
	browserItem := systray.AddMenuItem("打开浏览器", "在浏览器中打开")
	systray.AddSeparator()

	settingsItem := systray.AddMenuItem("设置", "设置")
	dirItem := settingsItem.AddSubMenuItem("选择共享目录", "选择要共享的文件夹")
	a.uploadToggleItem = settingsItem.AddSubMenuItemCheckbox("上传开关", "启用/禁用上传功能", !a.cfg.UnUpload)
	a.downloadToggleItem = settingsItem.AddSubMenuItemCheckbox("下载开关", "启用/禁用下载功能", !a.cfg.UnDownload)
	a.chatToggleItem = settingsItem.AddSubMenuItemCheckbox("聊天开关", "启用/禁用聊天功能", a.cfg.ChatEnabled)
	systray.AddSeparator()
	quitItem := systray.AddMenuItem("退出", "退出程序")

	go a.handleMenu(browserItem, dirItem, quitItem)
}

func (a *app) handleMenu(browserItem, dirItem, quitItem *systray.MenuItem) {
	for {
		select {
		case <-a.toggleItem.ClickedCh:
			a.toggleServer()
		case <-browserItem.ClickedCh:
			cli.OpenBrowser(fmt.Sprintf("http://%s:%d", a.lanIP, a.port))
		case <-dirItem.ClickedCh:
			a.pickAndApplyDirectory()
		case <-a.uploadToggleItem.ClickedCh:
			a.toggleUpload()
		case <-a.downloadToggleItem.ClickedCh:
			a.toggleDownload()
		case <-a.chatToggleItem.ClickedCh:
			a.toggleChat()
		case <-quitItem.ClickedCh:
			a.stopServer()
			systray.Quit()
			return
		}
	}
}

func (a *app) pickAndApplyDirectory() {
	dir, err := cli.PickDirectory()
	if err != nil {
		return
	}

	a.mu.Lock()
	oldRunning := a.running
	if a.running {
		a.stopServerLocked()
	}
	a.cfg.SharedDirectory = dir
	a.dirStatusItem.SetTitle("共享目录: " + dir)
	if oldRunning {
		a.startServerLocked()
		a.statusItem.SetTitle("状态: 运行中")
		a.toggleItem.SetTitle("停止服务器")
	}
	a.mu.Unlock()
}

func (a *app) toggleUpload() {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.cfg.UnUpload = !a.cfg.UnUpload
	if a.cfg.UnUpload {
		a.uploadToggleItem.Uncheck()
	} else {
		a.uploadToggleItem.Check()
	}

	if a.running {
		a.stopServerLocked()
		a.startServerLocked()
	}
}

func (a *app) toggleDownload() {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.cfg.UnDownload = !a.cfg.UnDownload
	if a.cfg.UnDownload {
		a.downloadToggleItem.Uncheck()
	} else {
		a.downloadToggleItem.Check()
	}

	if a.running {
		a.stopServerLocked()
		a.startServerLocked()
	}
}

func (a *app) toggleChat() {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.cfg.ChatEnabled = !a.cfg.ChatEnabled
	if a.cfg.ChatEnabled {
		a.chatToggleItem.Check()
	} else {
		a.chatToggleItem.Uncheck()
	}

	if a.running {
		a.stopServerLocked()
		a.startServerLocked()
	}
}

func (a *app) toggleServer() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.running {
		a.stopServerLocked()
	} else {
		a.startServerLocked()
	}
}

func (a *app) startServerLocked() {
	cfg := a.cfg
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

	a.server = &http.Server{
		Addr:    fmt.Sprintf("0.0.0.0:%d", a.port),
		Handler: mux,
	}

	a.running = true
	a.toggleItem.SetTitle("停止服务器")
	a.statusItem.SetTitle("状态: 运行中")
	systray.SetTooltip(fmt.Sprintf("lansend - 运行中 (端口 %d)", a.port))

	go func() {
		log.Printf("Server starting on http://0.0.0.0:%d\n", a.port)
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("Server error: %v\n", err)
		}
		a.mu.Lock()
		a.running = false
		a.mu.Unlock()
	}()
}

func (a *app) stopServer() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.stopServerLocked()
}

func (a *app) stopServerLocked() {
	if a.server == nil || !a.running {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := a.server.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v\n", err)
	}

	a.server = nil
	a.running = false
	a.toggleItem.SetTitle("启动服务器")
	a.statusItem.SetTitle("状态: 未启动")
	systray.SetTooltip("lansend - LAN File Sharing")
}

func (a *app) onExit() {
	a.stopServer()
	unlock()
}

func resolveLANIP() string {
	networks := network.GetPrivateNetworks()
	for _, n := range networks {
		if n.Virtual {
			continue
		}
		for _, ip := range n.IPs {
			if ip != "127.0.0.1" {
				return ip
			}
		}
	}
	return "127.0.0.1"
}
