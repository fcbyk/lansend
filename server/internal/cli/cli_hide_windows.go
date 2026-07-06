//go:build windows

package cli

import (
	"os/exec"
	"syscall"
)

func hideCmdWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow: true,
	}
}
