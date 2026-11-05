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

//go:embed all:frontend
var assets embed.FS

func main() {
	var window *application.WebviewWindow
	var showWindow func()

	webFS, err := fs.Sub(assets, "frontend")
	if err != nil {
		log.Fatal(err)
	}

	// 桌面端默认共享可执行文件所在目录，功能开关默认全关。
	cfg := config.Default()
	if dir, err := platform.ExeDir(); err == nil {
		cfg.SharedDirectory = dir
	}

	srv := core.New(cfg)
	ctrl := &Controller{srv: srv}

	wailsApp := application.New(application.Options{
		Name:        "gui",
		Description: "Lansend GUI",
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
		Title:  "Lansend",
		Width:  1000,
		Height: 618,
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
	tray.SetTooltip("Lansend")

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

	// 启动失败（如端口被占用）不清场，错误随状态推给页面展示。
	_ = srv.Start()

	tray.Run()

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
