//go:build windows

package tray

import "syscall"

var (
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	procFreeConsole  = kernel32.NewProc("FreeConsole")
)

// ignoreTerminalClose ensures closing the terminal does not terminate the process.
func ignoreTerminalClose() {
	procFreeConsole.Call()
}

// FreeConsoleWindows detaches from the console and closes the terminal window.
// Call this after interactive setup is complete, before entering the tray loop.
func FreeConsoleWindows() {
	procFreeConsole.Call()
}
