//go:build windows

package platform

import (
	"fmt"
	"os/exec"
	"strings"
	"syscall"
)

// CREATE_NO_WINDOW：为新进程创建控制台时不分配窗口。
//
// 桌面壳用 -H windowsgui 构建，自身没有控制台；此时任何 exec 控制台程序
// （clip.exe 就是），Windows 都会为它新建一个控制台窗口，用户就会看到一闪。
// 加上这个标志后子进程仍然照常运行，只是不再有窗口。
const createNoWindow = 0x08000000

// CopyToClipboard 通过 clip.exe 写入剪贴板，且不显示控制台窗口。
func CopyToClipboard(text string) error {
	cmd := exec.Command("clip")
	cmd.Stdin = strings.NewReader(text)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("clip: %w", err)
	}
	return nil
}
