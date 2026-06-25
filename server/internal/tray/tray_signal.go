//go:build !windows

package tray

import (
	"os/signal"
	"syscall"
)

func ignoreTerminalClose() {
	signal.Ignore(syscall.SIGHUP)
}
