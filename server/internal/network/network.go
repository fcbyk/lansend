package network

import (
	"fmt"
	"net"
	"sort"
	"strings"
)

type InterfaceInfo struct {
	Iface    string   `json:"iface"`
	IPs      []string `json:"ips"`
	Type     string   `json:"type"`
	Virtual  bool     `json:"virtual"`
	Priority int      `json:"priority"`
}

type ifaceRule struct {
	keywords []string
	typ      string
	virtual  bool
	priority int
}

var ifaceRules = []ifaceRule{
	{[]string{"vmware", "vmnet"}, "vmware", true, 30},
	{[]string{"vbox", "virtualbox"}, "virtualbox", true, 30},
	{[]string{"docker", "wsl"}, "container", true, 40},
	{[]string{"bluetooth"}, "bluetooth", true, 60},
	{[]string{"ethernet", "以太网"}, "ethernet", false, 10},
	{[]string{"wlan", "wi-fi", "无线"}, "wifi", false, 10},
	{[]string{"loopback"}, "loopback", true, 100},
}

func detectIfaceType(name string) (string, bool, int) {
	lower := strings.ToLower(name)
	for _, rule := range ifaceRules {
		for _, kw := range rule.keywords {
			if strings.Contains(lower, kw) {
				return rule.typ, rule.virtual, rule.priority
			}
		}
	}
	return "unknown", false, 50
}

func GetPrivateNetworks() []InterfaceInfo {
	interfaces, err := net.Interfaces()
	if err != nil {
		return []InterfaceInfo{{
			Iface:    "localhost",
			IPs:      []string{"127.0.0.1"},
			Type:     "loopback",
			Virtual:  true,
			Priority: 100,
		}}
	}

	var results []InterfaceInfo
	for _, iface := range interfaces {
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		ifaceType, isVirtual, priority := detectIfaceType(iface.Name)
		var ips []string

		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipNet.IP
			if ip.To4() == nil {
				continue
			}
			ipStr := ip.String()

			if strings.HasPrefix(ipStr, "127.") {
				continue
			}
			if strings.HasPrefix(ipStr, "169.254.") {
				continue
			}

			if isPrivateIP(ipStr) {
				ips = append(ips, ipStr)
			}
		}

		if len(ips) > 0 {
			results = append(results, InterfaceInfo{
				Iface:    iface.Name,
				IPs:      ips,
				Type:     ifaceType,
				Virtual:  isVirtual,
				Priority: priority,
			})
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Priority < results[j].Priority
	})

	if len(results) == 0 {
		results = append(results, InterfaceInfo{
			Iface:    "localhost",
			IPs:      []string{"127.0.0.1"},
			Type:     "loopback",
			Virtual:  true,
			Priority: 100,
		})
	}

	return results
}

func isPrivateIP(ip string) bool {
	if strings.HasPrefix(ip, "10.") || strings.HasPrefix(ip, "192.168.") {
		return true
	}
	if strings.HasPrefix(ip, "172.") {
		parts := strings.Split(ip, ".")
		if len(parts) >= 2 {
			var secondOctet int
			fmt.Sscanf(parts[1], "%d", &secondOctet)
			if secondOctet >= 16 && secondOctet <= 31 {
				return true
			}
		}
	}
	return false
}

func EnsurePortAvailable(port int, host string) error {
	addr := fmt.Sprintf("%s:%d", host, port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("port %d on %s is already in use", port, host)
	}
	listener.Close()
	return nil
}