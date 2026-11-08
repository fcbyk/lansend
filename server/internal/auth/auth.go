// Package auth 提供整站访问密码：未登录的访客只能拿到网页外壳，所有 /api 数据
// 都会被拦下，登录成功后发一张会话 Cookie 放行。
//
// 这里不保存任何会话状态：Cookie 的值是「密码派生的票据」，改密码后旧票据立刻
// 失效。代价是同一次密码签出的票据在会话期内不可单独吊销 —— 对局域网分享够用，
// 换来的是服务端零状态、重启不丢登录态。
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/fcbyk/lansend/internal/config"
	"github.com/fcbyk/lansend/internal/response"
)

// CookieName 是会话票据的 Cookie 名。
const CookieName = "lansend_access"

// RequiredHeader 标记「这次 401 是访问密码没过」。
//
// 上传密码的 401 不带这个头，前端据此区分：前者要弹登录页，后者要弹上传密码框。
const RequiredHeader = "X-Access-Required"

// ticketMessage 是票据的固定消息，只有密码作为 HMAC 的密钥参与计算。
var ticketMessage = []byte("lansend access v1")

// ticket 把访问密码派生为一个可下发给浏览器的值。
//
// 之所以不直接下发密码：Cookie 会随每个请求带着走，明文密码一旦进了网络面板或
// 日志就再也收不回来，而派生的票据没有任何独立价值 —— 它只是「输入过密码」的凭证。
func ticket(password string) string {
	mac := hmac.New(sha256.New, []byte(password))
	mac.Write(ticketMessage)
	return hex.EncodeToString(mac.Sum(nil))
}

// gated 判断某个路径是否属于需要访问密码的数据面。
//
// 只拦 /api/* 与 /upload：其余都是网页外壳（HTML / JS / CSS），本身不含用户数据。
// 把它们也拦住的话，深链和静态资源会一起 401，连登录页都加载不出来。
func gated(path string) bool {
	if strings.HasPrefix(path, "/api/auth/") {
		return false
	}
	return strings.HasPrefix(path, "/api/") || path == "/upload"
}

// Guard 是访问密码中间件：未启用时直接放行，启用后校验会话 Cookie。
//
// cfg 是指针，服务运行中改配置（core.Server.Apply）后这里读到的是新值，
// 不需要额外通知。
func Guard(cfg *config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !cfg.RequireAccessPassword() || !gated(r.URL.Path) || authorized(r, cfg.AccessPassword) {
			next.ServeHTTP(w, r)
			return
		}

		w.Header().Set(RequiredHeader, "1")
		response.Error(w, http.StatusUnauthorized, "access password required")
	})
}

func authorized(r *http.Request, password string) bool {
	cookie, err := r.Cookie(CookieName)
	if err != nil {
		return false
	}
	got := []byte(cookie.Value)
	want := []byte(ticket(password))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// RegisterRoutes 注册登录接口。
func RegisterRoutes(mux *http.ServeMux, cfg *config.Config) {
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		// 没开访问密码时登录等于空操作：前端可能带着旧 Cookie 进来，
		// 这里回成功比回 401 更好，省得登录页反复弹。
		if !cfg.RequireAccessPassword() {
			response.SuccessMsg(w, "access password not required", nil)
			return
		}

		var body struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Error(w, http.StatusBadRequest, "invalid request")
			return
		}

		// 定长比较，避免按字节提前返回泄露密码前缀
		if subtle.ConstantTimeCompare([]byte(body.Password), []byte(cfg.AccessPassword)) != 1 {
			response.Error(w, http.StatusUnauthorized, "wrong password")
			return
		}

		// 会话 Cookie：不设 MaxAge / Expires，关掉浏览器即失效；
		// HttpOnly 让页面脚本读不到票据，SameSite 挡掉跨站携带。
		http.SetCookie(w, &http.Cookie{
			Name:     CookieName,
			Value:    ticket(cfg.AccessPassword),
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
		})
		response.SuccessMsg(w, "ok", nil)
	})
}
