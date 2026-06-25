package cli

import (
	"context"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

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

func PickDirectory() (string, error) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("osascript", "-e", `POSIX path of (choose folder with prompt "选择共享目录")`)
	case "linux":
		if _, err := exec.LookPath("zenity"); err == nil {
			cmd = exec.Command("zenity", "--file-selection", "--directory")
		} else if _, err := exec.LookPath("kdialog"); err == nil {
			cmd = exec.Command("kdialog", "--getexistingdirectory")
		} else {
			return "", fmt.Errorf("no directory picker found (install zenity or kdialog)")
		}
	case "windows":
		cmd = exec.Command("powershell", "-Command",
			`Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowDialog(); $f.SelectedPath`)
	default:
		return "", fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}

	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	path := strings.TrimSpace(string(out))
	if path == "" {
		return "", fmt.Errorf("no directory selected")
	}
	return path, nil
}

func WaitForServerReady(port int, timeout time.Duration) bool {
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	deadline := time.Now().Add(timeout)

	client := &http.Client{Timeout: 500 * time.Millisecond}
	for time.Now().Before(deadline) {
		req, err := http.NewRequestWithContext(context.Background(), "GET", url, nil)
		if err != nil {
			time.Sleep(50 * time.Millisecond)
			continue
		}
		resp, err := client.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return true
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}
