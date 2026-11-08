package core

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fcbyk/lansend/internal/config"
)

// TestAccessPasswordWiring 验证访问密码真的包在装配好的整条路由外面，
// 而不只是中间件单测里那层 httptest 套壳。
func TestAccessPasswordWiring(t *testing.T) {
	cfg := config.Default()
	cfg.SharedDirectory = t.TempDir()
	cfg.DownloadEnabled = true
	cfg.AccessPassword = "secret"
	cfg.AccessPasswordEnabled = true

	h := BuildHandler(&cfg)

	t.Run("未登录时数据接口被拦下", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/config", nil))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", rec.Code)
		}
	})

	t.Run("网页外壳仍然可以加载", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 for the shell, got %d", rec.Code)
		}
	})

	t.Run("登录后接口放行", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"password":"secret"}`))
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("login failed: %d %s", rec.Code, rec.Body.String())
		}

		cookies := rec.Result().Cookies()
		if len(cookies) == 0 {
			t.Fatal("login did not set a cookie")
		}

		req = httptest.NewRequest(http.MethodGet, "/api/config", nil)
		for _, cookie := range cookies {
			req.AddCookie(cookie)
		}
		rec = httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 with cookie, got %d", rec.Code)
		}
		if !strings.Contains(rec.Body.String(), `"download_enabled":true`) {
			t.Fatalf("unexpected body: %s", rec.Body.String())
		}
	})
}
