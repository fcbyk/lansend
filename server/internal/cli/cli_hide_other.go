//go:build !windows

package cli

import "os/exec"

func hideCmdWindow(cmd *exec.Cmd) {}
