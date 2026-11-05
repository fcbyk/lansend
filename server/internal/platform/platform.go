package platform

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// ExeDir 返回当前可执行文件所在目录。
func ExeDir() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Dir(exe), nil
}

// DownloadsDir 返回系统下载目录，目录不存在时返回错误。
//
// 这里用 ~/Downloads 这个约定路径：Windows 上即便被重定向到其他盘，
// 用户主目录下通常会留有同名目录；取不到时由调用方决定回退策略。
func DownloadsDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	dir := filepath.Join(home, "Downloads")
	info, err := os.Stat(dir)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%s is not a directory", dir)
	}
	return dir, nil
}

func CopyToClipboard(text string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("pbcopy")
	case "linux":
		if _, err := exec.LookPath("wl-copy"); err == nil {
			cmd = exec.Command("wl-copy")
		} else if _, err := exec.LookPath("xclip"); err == nil {
			cmd = exec.Command("xclip", "-selection", "clipboard")
		} else if _, err := exec.LookPath("xsel"); err == nil {
			cmd = exec.Command("xsel", "--clipboard", "--input")
		} else {
			return fmt.Errorf("no clipboard tool found (install wl-copy, xclip, or xsel)")
		}
	case "windows":
		cmd = exec.Command("clip")
	default:
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
	cmd.Stdin = strings.NewReader(text)
	return cmd.Run()
}

func OpenBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
	return cmd.Start()
}
