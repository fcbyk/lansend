package files

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/fcbyk/lansend/internal/config"
)

type Service struct {
	Config *config.Config
}

var safeFilenameRe = regexp.MustCompile(`[^\w\s\p{Han}\-\.]`)

func (s *Service) SafeFilename(filename string) string {
	return safeFilenameRe.ReplaceAllString(filename, "")
}

func (s *Service) EnsureSharedDirectory() (string, error) {
	if s.Config.SharedDirectory == "" {
		return "", fmt.Errorf("shared directory not set")
	}
	return s.Config.SharedDirectory, nil
}

func (s *Service) AbsTargetDir(relPath string) (string, error) {
	base, err := s.EnsureSharedDirectory()
	if err != nil {
		return "", err
	}
	relPath = strings.Trim(relPath, "/")
	targetDir, err := filepath.Abs(filepath.Join(base, relPath))
	if err != nil {
		return "", err
	}
	baseAbs, err := filepath.Abs(base)
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(targetDir, baseAbs) {
		return "", fmt.Errorf("invalid path")
	}
	return targetDir, nil
}

func (s *Service) ResolveFilePath(filename string) (string, error) {
	base, err := s.EnsureSharedDirectory()
	if err != nil {
		return "", err
	}
	normalized := strings.ReplaceAll(filename, "/", string(filepath.Separator))
	filePath, err := filepath.Abs(filepath.Join(base, normalized))
	if err != nil {
		return "", err
	}
	baseAbs, err := filepath.Abs(base)
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(filePath, baseAbs) {
		return "", fmt.Errorf("invalid path")
	}
	return filePath, nil
}

func (s *Service) IsImageFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	imageExts := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".gif": true,
		".bmp": true, ".webp": true, ".svg": true, ".ico": true,
		".tiff": true, ".tif": true,
	}
	return imageExts[ext]
}

func (s *Service) IsVideoFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	videoExts := map[string]bool{
		".mp4": true, ".webm": true, ".ogg": true, ".mov": true,
		".mkv": true, ".avi": true, ".m4v": true,
	}
	return videoExts[ext]
}

func (s *Service) FormatSize(numBytes int64) string {
	if numBytes < 0 {
		return "unknown size"
	}
	units := []string{"B", "KB", "MB", "GB", "TB"}
	size := float64(numBytes)
	for _, unit := range units {
		if size < 1024 || unit == units[len(units)-1] {
			if unit == "B" {
				return fmt.Sprintf("%d %s", int64(size), unit)
			}
			return fmt.Sprintf("%.2f %s", size, unit)
		}
		size /= 1024
	}
	return fmt.Sprintf("%.2f %s", size, units[len(units)-1])
}

type PathPart struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

func (s *Service) GetPathParts(currentPath string) []PathPart {
	var parts []PathPart
	if currentPath == "" {
		return parts
	}
	current := ""
	for _, part := range strings.Split(currentPath, "/") {
		if part == "" {
			continue
		}
		if current == "" {
			current = part
		} else {
			current = current + "/" + part
		}
		parts = append(parts, PathPart{Name: part, Path: current})
	}
	return parts
}

type FileTreeItem struct {
	Name     string         `json:"name"`
	Path     string         `json:"path"`
	IsDir    bool           `json:"is_dir"`
	Children []FileTreeItem `json:"children,omitempty"`
}

func (s *Service) GetFileTree(basePath string, relativePath string) []FileTreeItem {
	currentPath := basePath
	if relativePath != "" {
		currentPath = filepath.Join(basePath, relativePath)
	}

	entries, err := os.ReadDir(currentPath)
	if err != nil {
		return nil
	}

	var items []FileTreeItem
	for _, entry := range entries {
		itemPath := relativePath
		if itemPath == "" {
			itemPath = entry.Name()
		} else {
			itemPath = filepath.Join(relativePath, entry.Name())
		}
		itemPath = strings.ReplaceAll(itemPath, "\\", "/")

		item := FileTreeItem{
			Name:  entry.Name(),
			Path:  itemPath,
			IsDir: entry.IsDir(),
		}
		if item.IsDir {
			item.Children = s.GetFileTree(basePath, itemPath)
		}
		items = append(items, item)
	}

	sortFileTreeItems(items)
	return items
}

func sortFileTreeItems(items []FileTreeItem) {
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			aDir, bDir := items[i].IsDir, items[j].IsDir
			if aDir != bDir {
				if !aDir && bDir {
					items[i], items[j] = items[j], items[i]
				}
				continue
			}
			if strings.ToLower(items[i].Name) > strings.ToLower(items[j].Name) {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
}

type DirectoryItem struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
}

type DirectoryListing struct {
	ShareName       string          `json:"share_name"`
	RelativePath    string          `json:"relative_path"`
	PathParts       []PathPart      `json:"path_parts"`
	Items           []DirectoryItem `json:"items"`
	RequirePassword bool            `json:"require_password"`
}

func (s *Service) GetDirectoryListing(relativePath string) (*DirectoryListing, error) {
	base, err := s.EnsureSharedDirectory()
	if err != nil {
		return nil, err
	}
	relativePath = strings.Trim(relativePath, "/")
	currentPath := base
	if relativePath != "" {
		currentPath = filepath.Join(base, relativePath)
	}

	info, err := os.Stat(currentPath)
	if err != nil || !info.IsDir() {
		return nil, fmt.Errorf("directory not found")
	}

	entries, err := os.ReadDir(currentPath)
	if err != nil {
		return nil, err
	}

	var items []DirectoryItem
	for _, entry := range entries {
		itemPath := relativePath
		if itemPath == "" {
			itemPath = entry.Name()
		} else {
			itemPath = filepath.Join(relativePath, entry.Name())
		}
		itemPath = strings.ReplaceAll(itemPath, "\\", "/")

		items = append(items, DirectoryItem{
			Name:  entry.Name(),
			Path:  itemPath,
			IsDir: entry.IsDir(),
		})
	}

	shareName := filepath.Base(base)
	if shareName == "" || shareName == "." {
		shareName = base
	}

	return &DirectoryListing{
		ShareName:       shareName,
		RelativePath:    relativePath,
		PathParts:       s.GetPathParts(relativePath),
		Items:           items,
		RequirePassword: s.Config.UploadPassword != "",
	}, nil
}

type FileContent struct {
	Content  string `json:"content,omitempty"`
	Path     string `json:"path"`
	Name     string `json:"name"`
	IsImage  bool   `json:"is_image,omitempty"`
	IsVideo  bool   `json:"is_video,omitempty"`
	IsBinary bool   `json:"is_binary,omitempty"`
	Error    string `json:"error,omitempty"`
}

func (s *Service) ReadFileContent(relativePath string) (*FileContent, error) {
	filePath, err := s.ResolveFilePath(relativePath)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(filePath)
	if err != nil || info.IsDir() {
		return nil, fmt.Errorf("file not found")
	}

	rawName := filepath.Base(relativePath)
	lowerName := strings.ToLower(rawName)

	if s.IsImageFile(lowerName) {
		return &FileContent{
			IsImage: true,
			Path:    relativePath,
			Name:    rawName,
		}, nil
	}

	if s.IsVideoFile(lowerName) {
		return &FileContent{
			IsVideo: true,
			Path:    relativePath,
			Name:    rawName,
		}, nil
	}

	const maxPreviewBytes = 2 * 1024 * 1024
	fileSize := info.Size()
	if fileSize > maxPreviewBytes {
		return &FileContent{
			IsBinary: true,
			Path:     relativePath,
			Name:     rawName,
			Error:    "文件过大，超过 2MB，建议在浏览器打开",
		}, nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	content := string(data)
	if len(content) > maxPreviewBytes {
		return &FileContent{
			IsBinary: true,
			Path:     relativePath,
			Name:     rawName,
			Error:    "文件过大，超过 2MB，建议在浏览器打开",
		}, nil
	}

	if !isTextContent(data) {
		return &FileContent{
			IsBinary: true,
			Path:     relativePath,
			Name:     rawName,
			Error:    "无法预览此文件类型",
		}, nil
	}

	return &FileContent{
		Content: content,
		Path:    relativePath,
		Name:    rawName,
	}, nil
}

func isTextContent(data []byte) bool {
	if len(data) == 0 {
		return true
	}
	checkLen := len(data)
	if checkLen > 512 {
		checkLen = 512
	}
	for _, b := range data[:checkLen] {
		if b == 0 {
			return false
		}
	}
	return true
}
