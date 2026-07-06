//go:build !windows

package tray

import (
	"os/signal"
	"syscall"
)

func ignoreTerminalClose() {
	signal.Ignore(syscall.SIGHUP)
}

// FreeConsoleWindows is a no-op on non-Windows platforms.
func FreeConsoleWindows() {}
