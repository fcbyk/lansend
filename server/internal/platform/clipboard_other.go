//go:build !windows

package platform

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

// CopyToClipboard 借助系统自带的剪贴板工具写入文本。
func CopyToClipboard(text string) error {
	var cmd *exec.Cmd
	switch {
	case runtime.GOOS == "darwin":
		cmd = exec.Command("pbcopy")
	default:
		switch {
		case hasCommand("wl-copy"):
			cmd = exec.Command("wl-copy")
		case hasCommand("xclip"):
			cmd = exec.Command("xclip", "-selection", "clipboard")
		case hasCommand("xsel"):
			cmd = exec.Command("xsel", "--clipboard", "--input")
		default:
			return fmt.Errorf("no clipboard tool found (install wl-copy, xclip, or xsel)")
		}
	}
	cmd.Stdin = strings.NewReader(text)
	return cmd.Run()
}

func hasCommand(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}
