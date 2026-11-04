package main

import (
	"bytes"
	"embed"
	"image"
	"image/color"
	"image/png"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	var window *application.WebviewWindow
	var showWindow func()

	app := application.New(application.Options{
		Name:        "gui",
		Description: "Lansend GUI",
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
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
	tray.SetIcon(generateTrayIcon())
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

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}

func generateTrayIcon() []byte {
	img := image.NewRGBA(image.Rect(0, 0, 32, 32))
	cx, cy, r := 16, 16, 14
	for y := 0; y < 32; y++ {
		for x := 0; x < 32; x++ {
			dx, dy := x-cx, y-cy
			if dx*dx+dy*dy <= r*r {
				img.Set(x, y, color.RGBA{64, 128, 255, 255})
			}
		}
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}