//go:build cgo && windows

package tray

import _ "embed"

// Windows systray requires .ico format
//go:embed icon.ico
var iconData []byte
