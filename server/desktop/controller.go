package main

import (
	"fmt"
	"strings"

	"github.com/fcbyk/lansend/internal/config"
	"github.com/fcbyk/lansend/internal/core"
	"github.com/fcbyk/lansend/internal/platform"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Controller 是窗口页面能调用的全部能力：读状态、启停服务、修改配置。
//
// 页面通过 Wails 绑定按 FQN 调用，前缀为 main.Controller：
//
//	Call.ByName("main.Controller.GetState")
//
// 每次配置变更都会重建服务，因此 UI 需要处理短暂的重启过程。
type Controller struct {
	app *application.App
	srv *core.Server
}

// URLView 是一条可访问的地址。
type URLView struct {
	Iface string `json:"iface"`
	URL   string `json:"url"`
	// Virtual 标记 VMware / WSL 这类虚拟网卡，页面据此加个标签，免得和真实网卡混淆。
	Virtual bool `json:"virtual"`
}

// StateView 是给页面的扁平快照，合并了配置与运行状态。
type StateView struct {
	Running   bool   `json:"running"`
	Port      int    `json:"port"`
	Directory string `json:"directory"`

	DownloadEnabled bool `json:"downloadEnabled"`
	UploadEnabled   bool `json:"uploadEnabled"`
	ChatEnabled     bool `json:"chatEnabled"`
	PasswordSet     bool `json:"passwordSet"`

	LocalURL string    `json:"localUrl"`
	LANURL   string    `json:"lanUrl"`
	URLs     []URLView `json:"urls"`

	Error string `json:"error"`
}

// GetState 返回当前快照，页面初始化与事件回调都以它为准。
func (c *Controller) GetState() StateView {
	return newView(c.srv.Config(), c.srv.State())
}

// Start 启动服务，返回时端口已可访问。
func (c *Controller) Start() error {
	return c.srv.Start()
}

// Stop 停止服务。
func (c *Controller) Stop() error {
	return c.srv.Stop()
}

// SetDirectory 切换共享目录，服务在运行中会重启。
func (c *Controller) SetDirectory(dir string) error {
	if dir == "" {
		return fmt.Errorf("directory must not be empty")
	}
	return c.srv.Apply(func(cfg *config.Config) { cfg.SharedDirectory = dir })
}

// SetPort 切换端口，服务在运行中会重启。
func (c *Controller) SetPort(port int) error {
	if port < 1 || port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	return c.srv.Apply(func(cfg *config.Config) { cfg.Port = port })
}

// RefreshNetworks 重新枚举网卡并推送一次快照。
//
// Wi-Fi 换网络、插拔网线之后地址会变，服务没法自己察觉，交给页面上的刷新按钮触发。
func (c *Controller) RefreshNetworks() error {
	c.srv.RefreshNetworks()
	return nil
}

// SetFeature 切换功能开关，name 取 download / upload / chat。
func (c *Controller) SetFeature(name string, enabled bool) error {
	switch name {
	case "download", "upload", "chat":
	default:
		return fmt.Errorf("unknown feature: %s", name)
	}

	return c.srv.Apply(func(cfg *config.Config) {
		switch name {
		case "download":
			cfg.DownloadEnabled = enabled
		case "upload":
			cfg.UploadEnabled = enabled
		case "chat":
			cfg.ChatEnabled = enabled
		}
	})
}

// PickDirectory 打开系统目录选择框，选中后立即应用；用户取消时返回空字符串。
func (c *Controller) PickDirectory() (string, error) {
	dir, err := c.app.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		CanChooseDirectories: true,
		CanChooseFiles:       false,
		Title:                "选择共享目录",
		ButtonText:           "选择",
	}).PromptForSingleSelection()
	if err != nil {
		// 取消对话框在各平台都以 error 形式上抛（Windows 是 "cancelled by user"）。
		// 用户只是关掉了窗口，不该在页面上弹一条红色报错。
		if isDialogCancelled(err) {
			return "", nil
		}
		return "", err
	}
	if dir == "" {
		return "", nil
	}

	if err := c.SetDirectory(dir); err != nil {
		return "", err
	}
	return dir, nil
}

// isDialogCancelled 判断错误是否只是「用户关掉了对话框」。
//
// Wails 没有导出跨平台的取消错误：Windows 用的是内部包里的
// cfd.ErrorCancelled，其他平台多半直接回空路径，所以这里按文案兜底。
func isDialogCancelled(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "cancel")
}

// OpenInBrowser 在系统浏览器中打开指定地址；url 为空时退回主局域网地址。
func (c *Controller) OpenInBrowser(url string) error {
	st := c.srv.State()
	if !st.Running {
		return fmt.Errorf("server is not running")
	}
	if url == "" {
		url = st.LANURL()
	}
	return platform.OpenBrowser(url)
}

// CopyURL 把指定地址写入剪贴板；url 为空时退回主局域网地址。
func (c *Controller) CopyURL(url string) error {
	st := c.srv.State()
	if !st.Running {
		return fmt.Errorf("server is not running")
	}
	if url == "" {
		url = st.LANURL()
	}
	return platform.CopyToClipboard(url)
}

func newView(cfg config.Config, st core.State) StateView {
	v := StateView{
		Running:         st.Running,
		Port:            st.Port,
		Directory:       cfg.SharedDirectory,
		DownloadEnabled: cfg.DownloadEnabled,
		UploadEnabled:   cfg.UploadEnabled,
		ChatEnabled:     cfg.ChatEnabled,
		PasswordSet:     cfg.UploadPassword != "",
		LocalURL:        st.LocalURL(),
		LANURL:          st.LANURL(),
		// 空切片而不是 nil：nil 序列化成 null，页面拿到 null 再 .map 就炸了
		URLs:  []URLView{},
		Error: st.Err,
	}

	for _, iface := range st.Networks {
		for _, ip := range iface.IPs {
			if ip == "127.0.0.1" {
				continue
			}
			v.URLs = append(v.URLs, URLView{
				Iface:   iface.Iface,
				URL:     fmt.Sprintf("http://%s:%d", ip, st.Port),
				Virtual: iface.Virtual,
			})
		}
	}

	return v
}
