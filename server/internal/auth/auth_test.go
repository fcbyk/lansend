package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fcbyk/lansend/internal/config"
)

// buildTestHandler 搭一个最小站点：一个数据接口、一个网页外壳。
func buildTestHandler(cfg *config.Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("GET /api/directory", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	RegisterRoutes(mux, cfg)
	return Guard(cfg, mux)
}

func doRequest(h http.Handler, method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func loginCookie(t *testing.T, h http.Handler, password string) *http.Cookie {
	t.Helper()
	rec := doRequest(h, http.MethodPost, "/api/auth/login", `{"password":"`+password+`"}`, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("login failed: status %d, body %s", rec.Code, rec.Body.String())
	}
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == CookieName {
			return cookie
		}
	}
	t.Fatal("login did not set the access cookie")
	return nil
}

func TestGuardDisabledLetsEverythingThrough(t *testing.T) {
	cfg := &config.Config{AccessPassword: "secret"}
	h := buildTestHandler(cfg)

	if rec := doRequest(h, http.MethodGet, "/api/directory", "", nil); rec.Code != http.StatusOK {
		t.Fatalf("disabled guard should pass, got %d", rec.Code)
	}
}

func TestGuardRejectsDataWithoutCookie(t *testing.T) {
	cfg := &config.Config{AccessPassword: "secret", AccessPasswordEnabled: true}
	h := buildTestHandler(cfg)

	rec := doRequest(h, http.MethodGet, "/api/directory", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	// 前端靠这个头区分「需要访问密码」与「上传密码错误」
	if rec.Header().Get(RequiredHeader) != "1" {
		t.Fatalf("missing %s header", RequiredHeader)
	}
}

func TestGuardLeavesShellReachable(t *testing.T) {
	cfg := &config.Config{AccessPassword: "secret", AccessPasswordEnabled: true}
	h := buildTestHandler(cfg)

	// 登录页本身要能加载，所以网页外壳不能拦
	if rec := doRequest(h, http.MethodGet, "/", "", nil); rec.Code != http.StatusOK {
		t.Fatalf("shell should stay public, got %d", rec.Code)
	}
}

func TestLoginGrantsAccess(t *testing.T) {
	cfg := &config.Config{AccessPassword: "secret", AccessPasswordEnabled: true}
	h := buildTestHandler(cfg)

	cookie := loginCookie(t, h, "secret")
	if rec := doRequest(h, http.MethodGet, "/api/directory", "", cookie); rec.Code != http.StatusOK {
		t.Fatalf("expected 200 with cookie, got %d", rec.Code)
	}
}

func TestLoginRejectsWrongPassword(t *testing.T) {
	cfg := &config.Config{AccessPassword: "secret", AccessPasswordEnabled: true}
	h := buildTestHandler(cfg)

	rec := doRequest(h, http.MethodPost, "/api/auth/login", `{"password":"nope"}`, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	if len(rec.Result().Cookies()) != 0 {
		t.Fatal("wrong password must not issue a cookie")
	}
}

func TestPasswordChangeInvalidatesOldCookie(t *testing.T) {
	cfg := &config.Config{AccessPassword: "secret", AccessPasswordEnabled: true}
	h := buildTestHandler(cfg)

	cookie := loginCookie(t, h, "secret")

	// 改密码后旧票据必须立刻失效，否则改密码挡不住已经进来的人
	cfg.AccessPassword = "another"
	if rec := doRequest(h, http.MethodGet, "/api/directory", "", cookie); rec.Code != http.StatusUnauthorized {
		t.Fatalf("old cookie should be rejected after password change, got %d", rec.Code)
	}

	if rec := doRequest(h, http.MethodGet, "/api/directory", "", loginCookie(t, h, "another")); rec.Code != http.StatusOK {
		t.Fatalf("new password should work, got %d", rec.Code)
	}
}
