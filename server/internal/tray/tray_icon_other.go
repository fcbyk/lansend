//go:build cgo && !windows

package tray

import _ "embed"

// macOS / Linux accept .png
//go:embed icon.png
var iconData []byte
