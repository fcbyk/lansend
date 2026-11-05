//go:build !windows

package main

import _ "embed"

// macOS / Linux 的托盘与窗口图标使用 .png 格式。
//
// assets/icon.png 是全部图标资源的唯一源文件，由 server/tools/iconres 派生出 ico / icns / syso。
//
//go:embed assets/icon.png
var iconBytes []byte

// iconData 返回当前平台可直接使用的图标字节
func iconData() []byte {
	return iconBytes
}
