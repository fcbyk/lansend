package main

// 编译期通过 -ldflags 注入，与 cmd/lansend 的用法保持一致：
//
//	go build -ldflags="-X 'main.version=v2026.11.6' -X 'main.commitHash=d38a20d'"
//
// 版本号是时间语义的（YYYY.M.D），同一天多次构建完全相同，所以页面必须把
// 哈希一起显示出来，否则没法判断用户跑的是当天的哪一版。
//
// 两个值随状态快照下发而不是走 HTTP 接口：窗口打开时服务还没启动，
// 页脚在那一刻就得能显示版本。
var (
	version    = "dev"
	commitHash = "unknown"
)
