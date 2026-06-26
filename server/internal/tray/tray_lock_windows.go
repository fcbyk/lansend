//go:build windows

package tray

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"golang.org/x/sys/windows"
)

var lockFile *os.File

func tryLock() bool {
	lockPath := filepath.Join(os.TempDir(), "lansend.lock")

	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		data, err := os.ReadFile(lockPath)
		if err != nil {
			os.Remove(lockPath)
			return tryLock()
		}

		pidStr := strings.TrimSpace(string(data))
		pid, err := strconv.Atoi(pidStr)
		if err != nil {
			os.Remove(lockPath)
			return tryLock()
		}

		if isProcessAlive(pid) {
			return false
		}

		os.Remove(lockPath)
		return tryLock()
	}

	fmt.Fprintf(f, "%d\n", os.Getpid())
	lockFile = f
	return true
}

func isProcessAlive(pid int) bool {
	h, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		return false
	}
	defer windows.CloseHandle(h)

	event, err := windows.WaitForSingleObject(h, 0)
	if err != nil {
		return false
	}
	return event == uint32(windows.WAIT_TIMEOUT)
}

func unlock() {
	if lockFile == nil {
		return
	}
	lockPath := filepath.Join(os.TempDir(), "lansend.lock")
	lockFile.Close()
	os.Remove(lockPath)
	lockFile = nil
}
