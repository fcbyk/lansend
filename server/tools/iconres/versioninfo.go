package main

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/tc-hib/winres/version"
)

// buildVersionInfo 组装写进 exe 的 VERSIONINFO，也就是「属性 → 详细信息」里那几行。
//
// 数值部分（FileVersion / ProductVersion 的 4 段 uint16）供系统比较和排序，必须是
// 纯数字；哈希只能放进字符串里。所以两处字符串都写成「2026.11.6 (d38a20d)」，
// 和界面页脚展示的是同一份信息 —— 时间语义的版本同一天内不变化，没有哈希就分不清
// 用户跑的是当天的哪一次构建。
func buildVersionInfo(ver, commit string) (version.Info, error) {
	nums, err := parseVersionNumbers(ver)
	if err != nil {
		return version.Info{}, err
	}

	label := strings.TrimPrefix(ver, "v")
	if commit != "" && commit != "unknown" {
		label = fmt.Sprintf("%s (%s)", label, commit)
	}

	vi := version.Info{
		FileVersion:    nums,
		ProductVersion: nums,
		Type:           version.App,
	}

	fields := [][2]string{
		{version.ProductName, "Lansend"},
		{version.FileDescription, "Lansend 局域网文件共享"},
		{version.CompanyName, "Lansend"},
		{version.InternalName, "lansend-desktop"},
		{version.OriginalFilename, "lansend-desktop.exe"},
		{version.LegalCopyright, "Copyright (c) 2026 Yoki · MIT"},
		{version.FileVersion, label},
		{version.ProductVersion, label},
	}
	for _, kv := range fields {
		if err := vi.Set(version.LangDefault, kv[0], kv[1]); err != nil {
			return version.Info{}, fmt.Errorf("写入版本字段 %s 失败: %w", kv[0], err)
		}
	}

	return vi, nil
}

// parseVersionNumbers 把 vYYYY.M.D 转成 PE 资源要求的 4 段 uint16。
//
// 年份 2026 远小于上限，月份和日期也都放得下。段数不足时高位补 0
// （v2026.11 → 2026.11.0.0），避免 Windows 把缺失段当成无意义值。
func parseVersionNumbers(ver string) ([4]uint16, error) {
	var out [4]uint16

	raw := strings.TrimPrefix(strings.TrimSpace(ver), "v")
	if raw == "" {
		return out, fmt.Errorf("版本号为空")
	}

	parts := strings.Split(raw, ".")
	if len(parts) > 4 {
		return out, fmt.Errorf("版本号最多 4 段: %s", ver)
	}

	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || n > 0xFFFF {
			return out, fmt.Errorf("版本号第 %d 段不是 0-65535 的整数: %q", i+1, p)
		}
		out[i] = uint16(n)
	}

	return out, nil
}
