package config

// Config 是服务端的全部可变配置。
//
// 服务运行期间 handler 直接读这份结构体的指针，因此运行中不允许原地修改字段：
// 变更一律走 core.Server.Apply（先停服务、再改、再启动）。
type Config struct {
	SharedDirectory string
	Port            int
	UploadPassword  string
	DownloadEnabled bool
	UploadEnabled   bool
	ChatEnabled     bool
}

// Default 返回 CLI 与桌面端共用的初始配置。
func Default() Config {
	return Config{Port: 80}
}
