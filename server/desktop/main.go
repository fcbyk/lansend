package main

import (
	"embed"
	"io/fs"
	"log"

	"github.com/fcbyk/lansend/internal/config"
	"github.com/fcbyk/lansend/internal/core"
	"github.com/fcbyk/lansend/internal/platform"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// 前端产物由 desktop-web/ 经 vite 构建而来（pnpm build:web:desktop）。
// embed 只能引用当前包目录内的文件，所以目录位置是钉死的。
//
//go:embed all:frontend/dist
var assets embed.FS

const (
	windowWidth  = 420
	windowHeight = 500
)

func main() {
	var window *application.WebviewWindow
	var showWindow func()

	// embed 保留相对包目录的路径，资源根要下沉到 dist 才算对
	webFS, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}

	// 桌面端默认共享系统下载目录；取不到时退回可执行文件所在目录。
	cfg := config.Default()
	if dir, err := platform.DownloadsDir(); err == nil {
		cfg.SharedDirectory = dir
	} else if dir, err := platform.ExeDir(); err == nil {
		cfg.SharedDirectory = dir
	}

	srv := core.New(cfg)
	ctrl := &Controller{srv: srv}

	wailsApp := application.New(application.Options{
		Name:        "LANSend",
		Description: "LANSend 局域网文件共享",
		Icon:        iconData(),
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(webFS),
		},
		Services: []application.Service{application.NewService(ctrl)},
		Windows: application.WindowsOptions{
			DisableQuitOnLastWindowClosed: true,
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.lansend.gui",
			OnSecondInstanceLaunch: func(_ application.SecondInstanceData) {
				if showWindow != nil {
					showWindow()
				}
			},
		},
		OnShutdown: func() {
			_ = srv.Stop()
		},
	})

	ctrl.app = wailsApp

	window = wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:               "LANSend",
		Width:               windowWidth,
		Height:              windowHeight,
		MinWidth:            windowWidth,
		MinHeight:           windowHeight,
		MaxWidth:            windowWidth,
		MaxHeight:           windowHeight,
		DisableResize:       true,
		MaximiseButtonState: application.ButtonHidden,
	})

	var savedX, savedY int
	var hasSaved bool

	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		event.Cancel()
		savedX, savedY = window.Position()
		hasSaved = true
		window.Hide()
	})

	showWindow = func() {
		if hasSaved {
			window.SetPosition(savedX, savedY)
		} else {
			window.Center()
		}
		window.Show().Focus()
	}

	tray := wailsApp.SystemTray.New()
	tray.SetIcon(iconData())
	tray.SetTooltip("LANSend")

	tray.OnClick(func() {
		if window.IsVisible() {
			savedX, savedY = window.Position()
			hasSaved = true
			window.Hide()
		} else {
			showWindow()
		}
	})

	menu := application.NewMenu()
	menu.Add("显示").OnClick(func(_ *application.Context) {
		showWindow()
	})
	menu.Add("退出").OnClick(func(_ *application.Context) {
		wailsApp.Quit()
	})
	tray.SetMenu(menu)

	// 任何启停/配置变更都推送一次快照，页面只负责渲染。
	srv.Subscribe(func(st core.State) {
		wailsApp.Event.Emit("state", newView(srv.Config(), st))
	})

	// 打开窗口时服务保持未启动，由用户在界面上确认目录与端口后自己点启动。

	tray.Run()

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
