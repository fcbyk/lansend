package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"testing"
)

// unpackBits 是 packBits 的逆操作，仅在测试里用来校验编码结果。
func unpackBits(data []byte) []byte {
	out := make([]byte, 0, len(data)*2)
	for i := 0; i < len(data); {
		n := data[i]
		if n < 0x80 {
			out = append(out, data[i+1:i+int(n)+2]...)
			i += int(n) + 2
		} else {
			for k := 0; k < int(n)-0x7D; k++ {
				out = append(out, data[i+1])
			}
			i += 2
		}
	}
	return out
}

func TestPackBitsRoundTrip(t *testing.T) {
	var data []byte
	// 长度 1/2 的短游程、正好 3 个的游程、超过 130 的长游程，以及超过 128 的字面量段。
	for _, run := range []struct {
		val   byte
		count int
	}{
		{7, 1}, {8, 2}, {9, 3}, {10, 129}, {11, 130}, {12, 131}, {13, 300},
	} {
		data = append(data, bytes.Repeat([]byte{run.val}, run.count)...)
	}
	for i := 0; i < 200; i++ {
		data = append(data, byte(i%251))
	}

	got := unpackBits(packBits(data))
	if !bytes.Equal(got, data) {
		t.Fatalf("round trip mismatch: got %d bytes, want %d", len(got), len(data))
	}
}

func TestEncodeARGB(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	for y := 0; y < 4; y++ {
		for x := 0; x < 4; x++ {
			img.SetRGBA(x, y, color.RGBA{R: 200, G: 100, B: 50, A: 255})
		}
	}
	// 留一个全透明像素，确认透明区域编码成 0。
	img.SetRGBA(0, 0, color.RGBA{})

	data := encodeARGB(img)
	if string(data[:4]) != "ARGB" {
		t.Fatalf("magic = %q, want ARGB", data[:4])
	}
	raw := unpackBits(data[4:])
	if len(raw) != 4*4*4 {
		t.Fatalf("decoded %d bytes, want %d", len(raw), 4*4*4)
	}

	plane := 4 * 4
	for i := 0; i < plane; i++ {
		a, r, g, b := raw[i], raw[plane+i], raw[2*plane+i], raw[3*plane+i]
		if i == 0 {
			if a != 0 || r != 0 || g != 0 || b != 0 {
				t.Fatalf("pixel 0 = (%d,%d,%d,%d), want all zero", a, r, g, b)
			}
			continue
		}
		if a != 255 || r != 200 || g != 100 || b != 50 {
			t.Fatalf("pixel %d = (%d,%d,%d,%d), want (255,200,100,50)", i, a, r, g, b)
		}
	}
}

func TestBuildICNSUsesModernSlots(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			src.SetRGBA(x, y, color.RGBA{R: 255, G: 202, B: 40, A: 255})
		}
	}

	data, err := buildICNS(src)
	if err != nil {
		t.Fatal(err)
	}

	var types []string
	entries := map[string][]byte{}
	for i := 8; i+8 <= len(data); {
		typ := string(data[i : i+4])
		n := int(binary.BigEndian.Uint32(data[i+4 : i+8]))
		if i+n > len(data) {
			t.Fatalf("entry %q overflows container", typ)
		}
		types = append(types, typ)
		entries[typ] = data[i+8 : i+n]
		i += n
	}

	// icp4/icp5/icp6 里的 PNG 不会被 macOS 解码，必须使用 ic04 + 现代 PNG 槽位。
	for _, legacy := range []string{"icp4", "icp5", "icp6"} {
		if _, ok := entries[legacy]; ok {
			t.Fatalf("legacy slot %q must not be written (macOS renders it as noise)", legacy)
		}
	}
	for _, want := range []string{"ic04", "ic11", "ic12", "ic07", "ic08"} {
		if _, ok := entries[want]; !ok {
			t.Fatalf("missing slot %q (got %v)", want, types)
		}
	}

	if string(entries["ic04"][:4]) != "ARGB" {
		t.Fatalf("ic04 magic = %q, want ARGB", entries["ic04"][:4])
	}
	if raw := unpackBits(entries["ic04"][4:]); len(raw) != 16*16*4 {
		t.Fatalf("ic04 decodes to %d bytes, want %d", len(raw), 16*16*4)
	}
}
