package upload

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fcbyk/lansend/internal/config"
	"github.com/fcbyk/lansend/internal/files"
)

type Service struct {
	FileService *files.Service
	Config      *config.Config

	logMu   sync.Mutex
	logFile *os.File
}

type UploadMeta struct {
	UploadID    string `json:"upload_id"`
	Filename    string `json:"filename"`
	Size        int64  `json:"size"`
	RelPath     string `json:"rel_path"`
	TargetDir   string `json:"target_dir"`
	FinalPath   string `json:"final_path"`
	ChunkSize   int64  `json:"chunk_size"`
	TotalChunks int    `json:"total_chunks"`
	Renamed     bool   `json:"renamed"`
	CreatedAt   string `json:"created_at"`
}

var safeUploadIDRe = regexp.MustCompile(`[^a-zA-Z0-9_-]`)

func (s *Service) SafeUploadID(uploadID string) string {
	return safeUploadIDRe.ReplaceAllString(uploadID, "")
}

func (s *Service) VerifyPassword(password string) (bool, string) {
	if s.Config.UploadPassword == "" {
		return true, ""
	}
	if password == "" {
		return false, "upload password required"
	}
	if password != s.Config.UploadPassword {
		return false, "wrong password"
	}
	return true, ""
}

func (s *Service) EnsureTmpDir() (string, error) {
	base, err := s.FileService.EnsureSharedDirectory()
	if err != nil {
		return "", err
	}
	tmpDir := filepath.Join(base, ".lansend_upload_tmp")
	if err := os.MkdirAll(tmpDir, 0755); err != nil {
		return "", err
	}
	return tmpDir, nil
}

func (s *Service) InitUpload(
	ip string,
	filenameRaw string,
	size int64,
	relPath string,
	chunkSize int64,
	totalChunks int,
) (*UploadMeta, error) {
	if filenameRaw == "" {
		return nil, fmt.Errorf("filename is required")
	}
	if size < 0 {
		return nil, fmt.Errorf("size is required")
	}
	if totalChunks <= 0 {
		return nil, fmt.Errorf("total_chunks is required")
	}
	if chunkSize <= 0 {
		return nil, fmt.Errorf("invalid chunk_size")
	}

	targetDir, err := s.FileService.AbsTargetDir(relPath)
	if err != nil {
		s.logUpload(ip, 0, "failed (shared directory not set)", relPath, size)
		return nil, err
	}

	info, err := os.Stat(targetDir)
	if err != nil || !info.IsDir() {
		relLabel := relPath
		if relLabel == "" {
			relLabel = "root"
		}
		s.logUpload(ip, 0, fmt.Sprintf("failed (target directory missing: %s)", relLabel), relPath, size)
		return nil, fmt.Errorf("target directory not found")
	}

	filename := s.FileService.SafeFilename(filenameRaw)
	if filename == "" {
		filename = "untitled"
	}

	finalPath, filename, renamed := s.buildTargetPath(targetDir, filename)

	uploadID := fmt.Sprintf("%d_%d_%s",
		time.Now().UnixMilli(), os.Getpid(), randomHex(12))

	uploadDir := filepath.Join(s.ensureTmpDirInternal(), uploadID)
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create upload dir")
	}

	meta := &UploadMeta{
		UploadID:    uploadID,
		Filename:    filename,
		Size:        size,
		RelPath:     relPath,
		TargetDir:   targetDir,
		FinalPath:   finalPath,
		ChunkSize:   chunkSize,
		TotalChunks: totalChunks,
		Renamed:     renamed,
		CreatedAt:   time.Now().Format(time.RFC3339),
	}

	metaPath := filepath.Join(uploadDir, "meta.json")
	data, _ := json.MarshalIndent(meta, "", "  ")
	if err := os.WriteFile(metaPath, data, 0644); err != nil {
		return nil, fmt.Errorf("failed to write meta")
	}

	return meta, nil
}

func (s *Service) ensureTmpDirInternal() string {
	base, _ := s.FileService.EnsureSharedDirectory()
	if base == "" {
		return ""
	}
	return filepath.Join(base, ".lansend_upload_tmp")
}

func (s *Service) buildTargetPath(targetDir, filename string) (string, string, bool) {
	targetPath := filepath.Join(targetDir, filename)
	renamed := false
	if _, err := os.Stat(targetPath); err == nil {
		ext := filepath.Ext(filename)
		name := strings.TrimSuffix(filename, ext)
		counter := 1
		for {
			filename = fmt.Sprintf("%s_%d%s", name, counter, ext)
			targetPath = filepath.Join(targetDir, filename)
			if _, err := os.Stat(targetPath); os.IsNotExist(err) {
				break
			}
			counter++
		}
		renamed = true
	}
	return targetPath, filename, renamed
}

func (s *Service) chunkPaths(uploadID string) (string, string) {
	tmpDir := s.ensureTmpDirInternal()
	uploadDir := filepath.Join(tmpDir, uploadID)
	metaPath := filepath.Join(uploadDir, "meta.json")
	return uploadDir, metaPath
}

func (s *Service) SaveChunk(uploadID string, index int, reader io.Reader, ip string) error {
	uploadDir, metaPath := s.chunkPaths(uploadID)
	if _, err := os.Stat(metaPath); os.IsNotExist(err) {
		return fmt.Errorf("upload not found")
	}

	chunkPath := filepath.Join(uploadDir, fmt.Sprintf("chunk_%08d.part", index))
	f, err := os.Create(chunkPath)
	if err != nil {
		s.logUpload(ip, 1, fmt.Sprintf("failed (chunk save failed: %s)", err.Error()), "", 0)
		return fmt.Errorf("failed to save chunk")
	}
	defer f.Close()

	if _, err := io.Copy(f, reader); err != nil {
		s.logUpload(ip, 1, fmt.Sprintf("failed (chunk save failed: %s)", err.Error()), "", 0)
		return fmt.Errorf("failed to save chunk")
	}

	return nil
}

func (s *Service) CompleteUpload(uploadID string, ip string) (map[string]interface{}, error) {
	_, metaPath := s.chunkPaths(uploadID)
	if _, err := os.Stat(metaPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("upload not found")
	}

	data, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read meta")
	}

	var meta UploadMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		return nil, fmt.Errorf("failed to parse meta")
	}

	uploadDir := filepath.Dir(metaPath)
	var missing []int
	for i := 0; i < meta.TotalChunks; i++ {
		chunkPath := filepath.Join(uploadDir, fmt.Sprintf("chunk_%08d.part", i))
		if _, err := os.Stat(chunkPath); os.IsNotExist(err) {
			missing = append(missing, i)
			if len(missing) > 20 {
				break
			}
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing chunks: %v", missing[:min(len(missing), 20)])
	}

	if err := os.MkdirAll(filepath.Dir(meta.FinalPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create target directory")
	}

	out, err := os.Create(meta.FinalPath)
	if err != nil {
		s.logUpload(ip, 1, fmt.Sprintf("failed (merge failed: %s)", err.Error()), meta.RelPath, meta.Size)
		return nil, fmt.Errorf("failed to merge file")
	}
	defer out.Close()

	for i := 0; i < meta.TotalChunks; i++ {
		chunkPath := filepath.Join(uploadDir, fmt.Sprintf("chunk_%08d.part", i))
		in, err := os.Open(chunkPath)
		if err != nil {
			s.logUpload(ip, 1, fmt.Sprintf("failed (merge failed: %s)", err.Error()), meta.RelPath, meta.Size)
			return nil, fmt.Errorf("failed to merge file")
		}
		io.Copy(out, in)
		in.Close()
	}

	s.AbortUpload(uploadID)
	s.logUpload(ip, 1, fmt.Sprintf("success (%s)", meta.Filename), meta.RelPath, meta.Size)
	return map[string]interface{}{
		"filename": meta.Filename,
		"renamed":  meta.Renamed,
	}, nil
}

func (s *Service) AbortUpload(uploadID string) {
	uploadDir, _ := s.chunkPaths(uploadID)
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		return
	}
	os.RemoveAll(uploadDir)
}

func (s *Service) SaveFile(ip string, reader io.Reader, filename string, relPath string, fileSize int64) (map[string]interface{}, error) {
	targetDir, err := s.FileService.AbsTargetDir(relPath)
	if err != nil {
		s.logUpload(ip, 0, "failed (shared directory not set)", relPath, fileSize)
		return nil, err
	}

	safeFilename := s.FileService.SafeFilename(filename)
	if safeFilename == "" {
		safeFilename = "untitled"
	}

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		s.logUpload(ip, 0, fmt.Sprintf("failed (create directory failed: %s)", err.Error()), relPath, fileSize)
		return nil, fmt.Errorf("failed to create target directory")
	}

	info, err := os.Stat(targetDir)
	if err != nil || !info.IsDir() {
		relLabel := relPath
		if relLabel == "" {
			relLabel = "root"
		}
		s.logUpload(ip, 0, fmt.Sprintf("failed (target directory missing: %s)", relLabel), relPath, fileSize)
		return nil, fmt.Errorf("target directory not found")
	}

	targetPath, finalFilename, renamed := s.buildTargetPath(targetDir, safeFilename)

	f, err := os.Create(targetPath)
	if err != nil {
		s.logUpload(ip, 1, fmt.Sprintf("failed (save failed: %s)", err.Error()), relPath, fileSize)
		return nil, fmt.Errorf("failed to save file")
	}
	defer f.Close()

	if _, err := io.Copy(f, reader); err != nil {
		s.logUpload(ip, 1, fmt.Sprintf("failed (save failed: %s)", err.Error()), relPath, fileSize)
		return nil, fmt.Errorf("failed to save file")
	}

	s.logUpload(ip, 1, fmt.Sprintf("success (%s)", finalFilename), relPath, fileSize)
	return map[string]interface{}{
		"filename": finalFilename,
		"renamed":  renamed,
	}, nil
}

func (s *Service) logUpload(ip string, fileCount int, status string, relPath string, fileSize int64) {
	s.logMu.Lock()
	defer s.logMu.Unlock()

	if s.logFile == nil {
		logPath := filepath.Join(s.Config.SharedDirectory, "lansend.log")
		f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			return
		}
		s.logFile = f
	}

	ts := time.Now().Format("2006-01-02 15:04:05")
	pathStr := "/"
	if relPath != "" {
		pathStr = "/" + relPath
	}
	sizeStr := s.FileService.FormatSize(fileSize)
	if fileSize < 0 {
		sizeStr = "unknown size"
	}
	logMsg := fmt.Sprintf("[%s] %s upload %d file(s), status: %s, path: %s, size: %s\n",
		ts, ip, fileCount, status, pathStr, sizeStr)
	s.logFile.WriteString(logMsg)
}

func randomHex(n int) string {
	b := make([]byte, n/2)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func tryInt(s string) (int64, bool) {
	v, err := strconv.ParseInt(s, 10, 64)
	return v, err == nil
}
