package core

import (
	"fmt"

	"github.com/fcbyk/lansend/internal/network"
)

// State 是 Server 的运行状态快照，CLI 与桌面端都只读它来展示信息。
type State struct {
	Running  bool                    `json:"running"`
	Port     int                     `json:"port"`
	Networks []network.InterfaceInfo `json:"networks"`
	Err      string                  `json:"err,omitempty"`
}

// LocalURL 返回本机回环地址。
func (st State) LocalURL() string {
	return fmt.Sprintf("http://localhost:%d", st.Port)
}

// LANURL 返回局域网访问地址：优先取第一个非虚拟网卡的首个 IP，取不到则退回回环地址。
func (st State) LANURL() string {
	if ip := st.firstLANIP(); ip != "" {
		return fmt.Sprintf("http://%s:%d", ip, st.Port)
	}
	return st.LocalURL()
}

func (st State) firstLANIP() string {
	for _, n := range st.Networks {
		if n.Virtual {
			continue
		}
		for _, ip := range n.IPs {
			if ip != "127.0.0.1" {
				return ip
			}
		}
	}
	for _, n := range st.Networks {
		for _, ip := range n.IPs {
			if ip != "127.0.0.1" {
				return ip
			}
		}
	}
	return ""
}
