package main

import (
	"embed"
	"io/fs"
	"log"

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

	app := application.New(application.Options{
		Name:        "gui",
		Description: "Lansend GUI",
		Icon:        iconData(),
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(webFS),
		},
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
	})

	window = app.Window.NewWithOptions(application.WebviewWindowOptions{
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

	tray := app.SystemTray.New()
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
		app.Quit()
	})
	tray.SetMenu(menu)

	tray.Run()

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
