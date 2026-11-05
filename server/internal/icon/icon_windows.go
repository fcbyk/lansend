//go:build windows

package icon

import _ "embed"

// Windows 的托盘与窗口图标均使用 .ico 格式
//
//go:embed icon.ico
var data []byte

// Data 返回当前平台可直接使用的图标字节
func Data() []byte {
	return data
}
