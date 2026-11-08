package config

// Config 是服务端的全部可变配置。
//
// 服务运行期间 handler 直接读这份结构体的指针，因此运行中不允许原地修改字段：
// 变更一律走 core.Server.Apply（先停服务、再改、再启动）。
type Config struct {
	SharedDirectory string
	Port            int
	// UploadPassword 是密码原文。关闭密码后依然保留：桌面端把它当作「已保存的密码」，
	// 重新启用时不必再输一遍。
	UploadPassword string
	// UploadPasswordEnabled 决定是否校验密码，与密码值分开存。
	// 若用「密码为空 = 关闭」来表达，关闭就等于擦掉密码，用户没法再查看/复用。
	UploadPasswordEnabled bool
	// AccessPassword 是整站访问密码，进入站点前要输入的那一个。
	// 与上传密码是两回事：它挡住的是整个网页（含文件列表与下载），不是单个写操作。
	AccessPassword        string
	AccessPasswordEnabled bool
	DownloadEnabled       bool
	UploadEnabled         bool
	ChatEnabled           bool
}

// RequireUploadPassword 报告上传是否需要密码。
//
// 只有「已启用且密码非空」才算数：零值配置即不校验，与旧行为一致。
func (c Config) RequireUploadPassword() bool {
	return c.UploadPasswordEnabled && c.UploadPassword != ""
}

// RequireAccessPassword 报告进入站点是否需要访问密码。
func (c Config) RequireAccessPassword() bool {
	return c.AccessPasswordEnabled && c.AccessPassword != ""
}

// Default 返回 CLI 与桌面端共用的初始配置。
func Default() Config {
	return Config{Port: 80}
}
