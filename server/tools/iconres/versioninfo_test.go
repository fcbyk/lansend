package main

import (
	"testing"

	"github.com/tc-hib/winres/version"
)

func TestParseVersionNumbers(t *testing.T) {
	cases := []struct {
		in      string
		want    [4]uint16
		wantErr bool
	}{
		// 正式形态：时间语义版本
		{"v2026.11.6", [4]uint16{2026, 11, 6, 0}, false},
		// 没有 v 前缀也接受
		{"2026.11.6", [4]uint16{2026, 11, 6, 0}, false},
		// 段数不足时补 0
		{"v2026.11", [4]uint16{2026, 11, 0, 0}, false},
		// 四段值原样保留
		{"v1.2.3.4", [4]uint16{1, 2, 3, 4}, false},
		// 显式给出的 0 段不该被覆盖
		{"v2026.0.1", [4]uint16{2026, 0, 1, 0}, false},
		// 越界、非数字、空值都拒绝
		{"", [4]uint16{}, true},
		{"vdev", [4]uint16{}, true},
		{"v2026.11.x", [4]uint16{}, true},
		{"v2026.70000", [4]uint16{}, true},
		{"v1.2.3.4.5", [4]uint16{}, true},
	}

	for _, c := range cases {
		got, err := parseVersionNumbers(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("parseVersionNumbers(%q) 期望报错，实际得到 %v", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseVersionNumbers(%q) 意外报错: %v", c.in, err)
			continue
		}
		if got != c.want {
			t.Errorf("parseVersionNumbers(%q) = %v, 期望 %v", c.in, got, c.want)
		}
	}
}

func TestBuildVersionInfoEmbedsHash(t *testing.T) {
	vi, err := buildVersionInfo("v2026.11.6", "d38a20d")
	if err != nil {
		t.Fatalf("buildVersionInfo 报错: %v", err)
	}

	if vi.FileVersion != [4]uint16{2026, 11, 6, 0} {
		t.Errorf("FileVersion = %v", vi.FileVersion)
	}

	table := vi.Table()
	st := table[version.LangDefault]
	if st == nil {
		t.Fatal("缺少默认语言的字符串表")
	}

	// 哈希只能以字符串形式存在，两处版本字段都要带上，属性页里才看得见
	for _, key := range []string{version.FileVersion, version.ProductVersion} {
		if got := (*st)[key]; got != "2026.11.6 (d38a20d)" {
			t.Errorf("%s = %q, 期望 %q", key, got, "2026.11.6 (d38a20d)")
		}
	}

	if got := (*st)[version.ProductName]; got != "LANSend" {
		t.Errorf("ProductName = %q", got)
	}
}

// 拿不到哈希（本地 go run、源码包构建）时只写版本号，不要留一个 "unknown" 在属性页里。
func TestBuildVersionInfoWithoutHash(t *testing.T) {
	for _, commit := range []string{"", "unknown"} {
		vi, err := buildVersionInfo("v2026.11.6", commit)
		if err != nil {
			t.Fatalf("commit=%q 时报错: %v", commit, err)
		}
		st := vi.Table()[version.LangDefault]
		if got := (*st)[version.ProductVersion]; got != "2026.11.6" {
			t.Errorf("commit=%q 时 ProductVersion = %q", commit, got)
		}
	}
}
