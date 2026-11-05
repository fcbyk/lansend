// Command iconres 从单张 PNG 生成所有平台需要的图标资源。
//
// 输入：desktop/assets/icon.png（唯一的图标源文件）
// 输出：
//   - desktop/assets/icon.ico           多尺寸 ICO，供 embed 与 Windows 托盘使用
//   - desktop/assets/icon.icns          macOS .app 用的 icns
//   - desktop/rsrc_windows_amd64.syso   Windows exe 的 PE 图标资源
//   - desktop/rsrc_windows_arm64.syso
//
// 这是一个构建期工具，产物已提交进仓库，日常构建无需运行。
// 图标源更新后，在 server/tools/iconres 目录执行：
//
//	go run .
//
// 依赖 winres 的缩放逻辑，保证 ICO 与 ICNS 的像素来源完全一致。
package main

import (
	"bytes"
	"encoding/binary"
	"flag"
	"fmt"
	"image"
	_ "image/png"
	"os"
	"path/filepath"

	"github.com/tc-hib/winres"
)

// PE 图标规格上限是 256，超过 winres 会直接报错。
var icoSizes = []int{256, 128, 64, 48, 32, 24, 16}

// icoResourceID 是 Windows 图标资源的常量 ID。
const icoResourceID = winres.ID(1)

// icnsEntry 是一个 icns 条目：4 字节类型 + 4 字节长度（含 8 字节头）+ 数据。
// 对于 icp4..icp6 / ic07..ic10 这些类型，数据部分直接就是 PNG 流。
type icnsEntry struct {
	typ  string
	data []byte
}

func main() {
	src := flag.String("src", filepath.Join("..", "..", "desktop", "assets", "icon.png"), "源 PNG 路径")
	icoOut := flag.String("ico", filepath.Join("..", "..", "desktop", "assets", "icon.ico"), "输出 ICO 路径")
	icnsOut := flag.String("icns", filepath.Join("..", "..", "desktop", "assets", "icon.icns"), "输出 ICNS 路径")
	sysoDir := flag.String("syso", filepath.Join("..", "..", "desktop"), "syso 输出目录")
	flag.Parse()

	if err := run(*src, *icoOut, *icnsOut, *sysoDir); err != nil {
		fmt.Fprintln(os.Stderr, "错误:", err)
		os.Exit(1)
	}
}

func run(src, icoOut, icnsOut, sysoDir string) error {
	img, err := loadPNG(src)
	if err != nil {
		return err
	}
	fmt.Printf("源图: %s (%dx%d)\n", src, img.Bounds().Dx(), img.Bounds().Dy())

	// 1. 统一缩放一次，得到多尺寸图标。
	//    winres 会保持宽高比缩放，再居中填进正方形画布，所以非正方形源图不会变形。
	icon, err := winres.NewIconFromResizedImage(img, icoSizes)
	if err != nil {
		return fmt.Errorf("生成图标失败: %w", err)
	}

	// 2. ICO
	var icoBuf bytes.Buffer
	if err := icon.SaveICO(&icoBuf); err != nil {
		return fmt.Errorf("编码 ICO 失败: %w", err)
	}
	if err := os.WriteFile(icoOut, icoBuf.Bytes(), 0o644); err != nil {
		return err
	}
	frames, err := parseICO(icoBuf.Bytes())
	if err != nil {
		return fmt.Errorf("回读 ICO 失败: %w", err)
	}
	fmt.Printf("写出: %s (%d 字节, %d 个尺寸)\n", icoOut, icoBuf.Len(), len(frames))

	// 3. ICNS —— 复用 ICO 里的 PNG 帧，不做二次缩放
	icns, err := buildICNS(frames)
	if err != nil {
		return err
	}
	if err := os.WriteFile(icnsOut, icns, 0o644); err != nil {
		return err
	}
	fmt.Printf("写出: %s (%d 字节)\n", icnsOut, len(icns))

	// 4. syso —— 链接进 exe 的 PE 资源，决定资源管理器/任务栏里的图标
	for _, a := range []struct {
		suffix string
		arch   winres.Arch
	}{
		{"amd64", winres.ArchAMD64},
		{"arm64", winres.ArchARM64},
	} {
		var obj bytes.Buffer
		rs := winres.ResourceSet{}
		if err := rs.SetIcon(icoResourceID, icon); err != nil {
			return fmt.Errorf("写入资源集失败: %w", err)
		}
		if err := rs.WriteObject(&obj, a.arch); err != nil {
			return fmt.Errorf("生成 %s syso 失败: %w", a.arch, err)
		}
		path := filepath.Join(sysoDir, "rsrc_windows_"+a.suffix+".syso")
		if err := os.WriteFile(path, obj.Bytes(), 0o644); err != nil {
			return err
		}
		fmt.Printf("写出: %s (%d 字节)\n", path, obj.Len())
	}

	return nil
}

func loadPNG(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	img, format, err := image.Decode(f)
	if err != nil {
		return nil, fmt.Errorf("解码 %s 失败: %w", path, err)
	}
	if format != "png" {
		return nil, fmt.Errorf("%s 不是 PNG（实际为 %s）", path, format)
	}
	return img, nil
}

// parseICO 解析 ICO 容器，返回 边长 -> PNG 数据。
// 这里只处理 winres 产出的格式（每帧都是 PNG 流）。
func parseICO(data []byte) (map[int][]byte, error) {
	if len(data) < 6 {
		return nil, fmt.Errorf("ICO 头部不完整")
	}
	if binary.LittleEndian.Uint16(data[2:4]) != 1 {
		return nil, fmt.Errorf("不是 ICO 格式")
	}
	count := int(binary.LittleEndian.Uint16(data[4:6]))

	frames := make(map[int][]byte, count)
	for i := 0; i < count; i++ {
		off := 6 + i*16
		if off+16 > len(data) {
			return nil, fmt.Errorf("第 %d 个目录项越界", i)
		}
		width := int(data[off]) // 0 表示 256
		if width == 0 {
			width = 256
		}
		size := int(binary.LittleEndian.Uint32(data[off+8 : off+12]))
		pos := int(binary.LittleEndian.Uint32(data[off+12 : off+16]))
		if size <= 0 || pos < 0 || pos+size > len(data) {
			return nil, fmt.Errorf("第 %d 个图像数据越界", i)
		}
		frames[width] = data[pos : pos+size]
	}
	return frames, nil
}

// buildICNS 组装 icns 容器。
// 条目类型按 macOS 的 PNG 型编码选：icp4=16, icp5=32, icp6=64, ic07=128, ic08=256。
// 源图只有 209px，不做 512 以上的插值放大，避免 icns 里塞进无信息的虚像素。
func buildICNS(frames map[int][]byte) ([]byte, error) {
	table := []struct {
		typ  string
		size int
	}{
		{"icp4", 16},
		{"icp5", 32},
		{"icp6", 64},
		{"ic07", 128},
		{"ic08", 256},
	}

	entries := make([]icnsEntry, 0, len(table))
	for _, t := range table {
		data, ok := frames[t.size]
		if !ok {
			return nil, fmt.Errorf("ICO 中缺少 %dpx 帧，无法构造 icns", t.size)
		}
		entries = append(entries, icnsEntry{typ: t.typ, data: data})
	}

	body := &bytes.Buffer{}
	for _, e := range entries {
		// 每个条目 4 字节类型 + 4 字节长度（长度包含这 8 字节头本身）
		var hdr [8]byte
		copy(hdr[:4], e.typ)
		binary.BigEndian.PutUint32(hdr[4:], uint32(len(e.data)+8))
		body.Write(hdr[:])
		body.Write(e.data)
	}

	out := &bytes.Buffer{}
	var hdr [8]byte
	copy(hdr[:4], "icns")
	binary.BigEndian.PutUint32(hdr[4:], uint32(body.Len()+8))
	out.Write(hdr[:])
	out.Write(body.Bytes())

	return out.Bytes(), nil
}
