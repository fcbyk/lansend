//go:build windows

package icon

import _ "embed"

// Windows 的托盘与窗口图标均使用 .ico 格式。
//
// 该文件是多尺寸 ICO（16~256px 共 7 帧），由 server/tools/iconres 从 icon.png 生成，
// 请勿手工替换：托盘依赖多帧让系统挑选合适尺寸，exe 的 PE 图标也复用同一份像素。
//
//go:embed icon.ico
var data []byte

// Data 返回当前平台可直接使用的图标字节
func Data() []byte {
	return data
}
