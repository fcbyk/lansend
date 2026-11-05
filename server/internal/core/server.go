package core

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/fcbyk/lansend/internal/config"
	"github.com/fcbyk/lansend/internal/network"
)

// Server 持有一份配置与其 HTTP 服务，是 CLI 与桌面端共用的唯一生命周期入口。
//
// 配置变更一律通过 Apply 完成：先停服务、再改配置、再启动。服务运行期间
// handler 直接读配置指针，因此不允许在运行中原地修改。
type Server struct {
	mu      sync.Mutex
	cfg     config.Config
	srv     *http.Server
	running bool
	nets    []network.InterfaceInfo
	lastErr error

	nextSubID int
	subs      map[int]func(State)
}

// New 创建 Server，此时尚未启动。
func New(cfg config.Config) *Server {
	return &Server{cfg: cfg, subs: map[int]func(State){}}
}

// Config 返回当前配置的副本。
func (s *Server) Config() config.Config {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cfg
}

// Start 同步绑定端口后再开始服务，返回时端口已可连接；端口被占用会直接返回错误。
func (s *Server) Start() error {
	s.mu.Lock()
	err := s.startLocked()
	st := s.stateLocked()
	s.mu.Unlock()
	s.emit(st)
	return err
}

// Stop 关闭监听并等待处理中的请求结束（最长 5 秒）。
func (s *Server) Stop() error {
	s.mu.Lock()
	err := s.stopLocked()
	st := s.stateLocked()
	s.mu.Unlock()
	s.emit(st)
	return err
}

// Apply 在锁内完成「停止 → 修改配置 → 启动」，未运行时不自动启动。
func (s *Server) Apply(mutate func(*config.Config)) error {
	if mutate == nil {
		return errors.New("core: mutate must not be nil")
	}

	s.mu.Lock()
	wasRunning := s.running
	stopErr := s.stopLocked()
	mutate(&s.cfg)

	var startErr error
	if wasRunning {
		startErr = s.startLocked()
	}

	st := s.stateLocked()
	s.mu.Unlock()
	s.emit(st)

	return errors.Join(stopErr, startErr)
}

// State 返回当前状态快照。
func (s *Server) State() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stateLocked()
}

// Subscribe 注册状态变化回调，返回取消函数。回调在独立的调用链上触发，可安全调用 State。
func (s *Server) Subscribe(fn func(State)) (cancel func()) {
	if fn == nil {
		return func() {}
	}

	s.mu.Lock()
	id := s.nextSubID
	s.nextSubID++
	s.subs[id] = fn
	s.mu.Unlock()

	return func() {
		s.mu.Lock()
		delete(s.subs, id)
		s.mu.Unlock()
	}
}

func (s *Server) startLocked() error {
	if s.running {
		return nil
	}

	dir, err := resolveDirectory(s.cfg.SharedDirectory)
	if err != nil {
		s.lastErr = err
		return err
	}
	s.cfg.SharedDirectory = dir

	// 同步 Listen：端口冲突在这里立刻暴露，Start 返回后端口已可连接。
	ln, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", s.cfg.Port))
	if err != nil {
		err = fmt.Errorf("cannot listen on port %d: %w", s.cfg.Port, err)
		s.lastErr = err
		return err
	}

	srv := &http.Server{Handler: BuildHandler(&s.cfg)}
	s.srv = srv
	s.running = true
	s.nets = network.GetPrivateNetworks()
	s.lastErr = nil

	go s.serve(srv, ln)
	return nil
}

func (s *Server) serve(srv *http.Server, ln net.Listener) {
	err := srv.Serve(ln)

	s.mu.Lock()
	// 被 Stop/Apply 主动关闭时状态已更新过，这里不再重复广播。
	if s.srv != srv {
		s.mu.Unlock()
		return
	}
	s.srv = nil
	s.running = false
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		s.lastErr = err
	}
	st := s.stateLocked()
	s.mu.Unlock()

	s.emit(st)
}

func (s *Server) stopLocked() error {
	if !s.running || s.srv == nil {
		return nil
	}

	srv := s.srv
	s.srv = nil
	s.running = false

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}

func (s *Server) stateLocked() State {
	st := State{
		Running:  s.running,
		Port:     s.cfg.Port,
		Networks: s.nets,
	}
	if s.lastErr != nil {
		st.Err = s.lastErr.Error()
	}
	return st
}

func (s *Server) emit(st State) {
	s.mu.Lock()
	fns := make([]func(State), 0, len(s.subs))
	for _, fn := range s.subs {
		fns = append(fns, fn)
	}
	s.mu.Unlock()

	for _, fn := range fns {
		fn(st)
	}
}

// resolveDirectory 把配置里的目录解析成绝对路径并校验，空值等价于当前工作目录。
func resolveDirectory(dir string) (string, error) {
	if dir == "" {
		dir = "."
	}

	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", fmt.Errorf("cannot resolve directory %s", dir)
	}

	info, err := os.Stat(abs)
	if err != nil {
		return "", fmt.Errorf("directory %s does not exist", abs)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%s is not a directory", abs)
	}

	return abs, nil
}
