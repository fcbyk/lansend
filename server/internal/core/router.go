package core

import (
	"fmt"
	"net/http"

	"github.com/fcbyk/lansend/internal/chat"
	"github.com/fcbyk/lansend/internal/config"
	"github.com/fcbyk/lansend/internal/files"
	"github.com/fcbyk/lansend/internal/spa"
	"github.com/fcbyk/lansend/internal/speedtest"
	"github.com/fcbyk/lansend/internal/upload"
)

// BuildHandler 组装局域网侧的完整路由，是 CLI 与桌面端唯一的 HTTP 装配点。
//
// 开关在装配时决定：上传与聊天关闭时对应路由不会注册，因此改变开关需要重建
// handler（见 Server.Apply）。spa 提供内嵌的网页文件页，与桌面端窗口页面无关。
func BuildHandler(cfg *config.Config) *http.ServeMux {
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

	return mux
}
