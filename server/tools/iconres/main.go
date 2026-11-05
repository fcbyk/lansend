// Command iconres 从单张 PNG 生成所有平台需要的图标资源。
//
// 输入：desktop/assets/icon.png（唯一的图标源文件）
// 输出：
//   - desktop/assets/icon.ico           多尺寸 ICO，供 embed 与 Windows 托盘使用
//   - desktop/assets/icon.icns          macOS .app 用的 icns（按 macOS 图标网格留白）
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
	"image/color"
	"image/png"
	"math"
	"os"
	"path/filepath"

	"github.com/tc-hib/winres"
	"golang.org/x/image/draw"
)

// PE 图标规格上限是 256，超过 winres 会直接报错。
var icoSizes = []int{256, 128, 64, 48, 32, 24, 16}

// icoResourceID 是 Windows 图标资源的常量 ID。
const icoResourceID = winres.ID(1)

// icnsEntry 是一个 icns 条目：4 字节类型 + 4 字节长度（含 8 字节头）+ 数据。
// ic04/ic05/ic06 的数据是 ARGB（PackBits），ic07..ic14 的数据直接就是 PNG 流。
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

	// 3. ICNS —— 按 macOS 图标网格重新排版（源图直接参与缩放，不复用 ICO 帧）
	icns, err := buildICNS(img)
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

// macContentRatio 是 macOS 应用图标的内容占比：圆角矩形占画布的 824/1024，四周留白。
// 不留白会让图标在 Dock / 启动台里比系统里的其他 App 明显偏大。
const macContentRatio = 824.0 / 1024.0

// buildICNS 按 macOS 图标网格重新排版后组装 icns 容器。
//
// 条目类型不能随便挑：
//   - 16px 必须写成 ic04（ARGB + PackBits）。macOS 不解码 icp4/icp5/icp6 里的
//     PNG，而是把这些字节当成原始像素，于是 Finder 列表、分栏、废纸篓等小尺寸
//     场景会显示成彩色噪点；Dock / 启动台用的是 128px 以上的槽位，所以看起来正常。
//   - 32px 及以上用现代 PNG 槽位：ic11=32, ic12=64, ic07=128, ic08=256。
//
// 源图只有 209px，不做 512 以上的插值放大，避免 icns 里塞进无信息的虚像素。
func buildICNS(src image.Image) ([]byte, error) {
	table := []struct {
		typ  string
		size int
		argb bool
	}{
		{"ic04", 16, true},  // 16x16 @1x
		{"ic11", 32, false}, // 16x16 @2x
		{"ic12", 64, false}, // 32x32 @2x
		{"ic07", 128, false},
		{"ic08", 256, false},
	}

	entries := make([]icnsEntry, 0, len(table))
	for _, t := range table {
		img := composeMacIcon(src, t.size)
		var data []byte
		if t.argb {
			data = encodeARGB(img)
		} else {
			var err error
			if data, err = encodePNG(img, t.size); err != nil {
				return nil, err
			}
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

// composeMacIcon 把源图按比例缩放到 size×size 画布的内容区内并居中。
// 非正方形源图保持宽高比，多余空间留成透明，避免被拉伸。
func composeMacIcon(src image.Image, size int) *image.RGBA {
	dst := image.NewRGBA(image.Rect(0, 0, size, size))

	sb := src.Bounds()
	box := float64(size) * macContentRatio
	scale := math.Min(box/float64(sb.Dx()), box/float64(sb.Dy()))

	w := int(math.Round(float64(sb.Dx()) * scale))
	h := int(math.Round(float64(sb.Dy()) * scale))
	if w < 1 {
		w = 1
	}
	if h < 1 {
		h = 1
	}

	x0 := (size - w) / 2
	y0 := (size - h) / 2
	draw.CatmullRom.Scale(dst, image.Rect(x0, y0, x0+w, y0+h), src, sb, draw.Over, nil)

	return dst
}

// encodePNG 把画布编码成 icns 现代 PNG 槽位（ic07、ic08、ic11、ic12…）用的数据。
func encodePNG(img image.Image, size int) ([]byte, error) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("编码 %dpx PNG 失败: %w", size, err)
	}
	return buf.Bytes(), nil
}

// encodeARGB 把画布编码成 ic04/ic05 使用的 ARGB 数据：
// 4 字节魔数 "ARGB" + A/R/G/B 四个平面，每个平面各自做 PackBits 压缩。
// 这是 iconutil 的输出格式，macOS 会按原始像素解码。
func encodeARGB(img *image.RGBA) []byte {
	b := img.Bounds()
	planes := make([][]byte, 4)
	for i := range planes {
		planes[i] = make([]byte, 0, b.Dx()*b.Dy())
	}
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			// image.RGBA 是预乘 alpha；ARGB 槽位存的是非预乘通道，这里转回来。
			c := color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
			planes[0] = append(planes[0], c.A)
			planes[1] = append(planes[1], c.R)
			planes[2] = append(planes[2], c.G)
			planes[3] = append(planes[3], c.B)
		}
	}

	out := make([]byte, 0, 4+b.Dx()*b.Dy())
	out = append(out, 'A', 'R', 'G', 'B')
	for _, p := range planes {
		out = append(out, packBits(p)...)
	}
	return out
}

// packBits 是 ic04/ic05 使用的 PackBits 变体（与 iconutil 一致）：
// 控制字节 n < 0x80 表示后面跟 n+1 个字面量；n >= 0x80 表示重复下一个字节
// n-0x7D 次（3..130）。0xFF 单独用来编码超过 130 的长游程。
func packBits(data []byte) []byte {
	out := make([]byte, 0, len(data))
	lit := make([]byte, 0, 128)
	flush := func() {
		if len(lit) == 0 {
			return
		}
		out = append(out, byte(len(lit)-1))
		out = append(out, lit...)
		lit = lit[:0]
	}

	for i := 0; i < len(data); {
		x := data[i]
		if i+2 < len(data) && data[i+1] == x && data[i+2] == x {
			flush()
			run := 3
			for i+run < len(data) && data[i+run] == x {
				run++
			}
			i += run
			for run > 130 {
				out = append(out, 0xFF, x)
				run -= 130
			}
			if run > 2 {
				out = append(out, byte(run+0x7D), x)
			} else {
				i -= run // 不足 3 个的尾巴交给字面量分支
			}
		} else {
			lit = append(lit, x)
			if len(lit) > 127 {
				flush()
			}
			i++
		}
	}
	flush()
	return out
}
