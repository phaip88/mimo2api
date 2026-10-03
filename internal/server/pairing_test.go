package server

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"mimo2api/internal/auth"
	"mimo2api/internal/config"
)

func TestPairingSingleUseAndExpiry(t *testing.T) {
	s := newPairingStore()
	now := time.Now()
	s.now = func() time.Time { return now }
	token, expires, err := s.issue()
	if err != nil || len(token) != 43 || !expires.Equal(now.Add(pairingTTL)) {
		t.Fatal("invalid issued token")
	}
	var successes atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if s.consume(token) {
				successes.Add(1)
			}
		}()
	}
	wg.Wait()
	if successes.Load() != 1 {
		t.Fatal("pairing token was not single-use")
	}
	token, _, _ = s.issue()
	now = now.Add(pairingTTL)
	if s.consume(token) {
		t.Fatal("accepted token at expiry boundary")
	}
	if s.consume(strings.Repeat("x", 43)) {
		t.Fatal("accepted unknown code")
	}
}

func TestPairingBoundedStore(t *testing.T) {
	s := newPairingStore()
	now := time.Now()
	s.now = func() time.Time { return now }
	for i := 0; i < 128; i++ {
		if _, _, err := s.issue(); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := s.issue(); err == nil {
		t.Fatal("missing capacity limit")
	}
	now = now.Add(pairingTTL)
	if _, _, err := s.issue(); err != nil {
		t.Fatal("expired entries were not removed")
	}
}

func TestPairingImportValidationAndReplay(t *testing.T) {
	s := newPairingStore()
	token, _, _ := s.issue()
	calls := 0
	router := gin.New()
	router.POST("/import", s.importHandler(func(raw string) (string, error) { calls++; return "12345", nil }))
	post := func(body, auth string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/import", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", auth)
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		return out
	}
	valid := `{"userId":"12345","xiaomichatbot_serviceToken":"fixture","xiaomichatbot_ph":"fixture"}`
	for _, raw := range []string{"{}", valid + "{}", strings.Repeat("x", 16385), `{"raw_text":"not accepted"}`} {
		if out := post(raw, "Bearer "+token); out.Code != 400 {
			t.Fatalf("expected validation error, got %d", out.Code)
		}
	}
	if out := post(valid, ""); out.Code != 401 {
		t.Fatal("unauthenticated import accepted")
	}
	if out := post(valid, "Bearer "+token); out.Code != 200 || !strings.Contains(out.Body.String(), `"ok":true`) {
		t.Fatal("valid import failed")
	}
	if out := post(valid, "Bearer "+token); out.Code != 401 {
		t.Fatal("replayed import accepted")
	}
	if calls != 1 {
		t.Fatalf("expected 1 import, got %d", calls)
	}
}

func TestPairingRequiresAdminSession(t *testing.T) {
	oldPass, oldSecret, oldCookie, oldUser := config.WebUIPassword, config.WebUISecretKey, config.WebUICookieName, config.WebUIUsername
	defer func() {
		config.WebUIPassword, config.WebUISecretKey, config.WebUICookieName, config.WebUIUsername = oldPass, oldSecret, oldCookie, oldUser
	}()
	// Fixture credentials only; never operational secrets.
	config.WebUIPassword = "test-only-password"
	config.WebUISecretKey = "test-only-signing-key"
	config.WebUICookieName = "test_session"
	config.WebUIUsername = "admin"
	r := gin.New()
	s := newPairingStore()
	r.POST("/login", auth.LoginHandler)
	r.POST("/pair", auth.AdminSessionMiddleware(), s.createHandler)
	req := httptest.NewRequest("POST", "/pair", nil)
	req.Header.Set("Authorization", "Bearer "+config.WebUIPassword)
	out := httptest.NewRecorder()
	r.ServeHTTP(out, req)
	if out.Code != 401 {
		t.Fatal("non-session credentials minted a code")
	}
	login := httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/login", strings.NewReader(`{"username":"admin","password":"test-only-password"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(login, req)
	if login.Code != 200 {
		t.Fatal("login failed")
	}
	req = httptest.NewRequest("POST", "/pair", nil)
	req.AddCookie(login.Result().Cookies()[0])
	out = httptest.NewRecorder()
	r.ServeHTTP(out, req)
	if out.Code != 201 || out.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("admin pairing failed")
	}
	var response map[string]interface{}
	if json.Unmarshal(out.Body.Bytes(), &response) != nil || response["token"] == nil {
		t.Fatal("missing pairing code")
	}
}

func TestEmbeddedAssetsAndSecretFreeUserscript(t *testing.T) {
	r := gin.New()
	r.GET("/webui", WebUIHandler)
	r.GET("/script", UserscriptHandler)
	r.GET("/extension", ExtensionDownloadHandler)
	get := func(path string) *httptest.ResponseRecorder {
		out := httptest.NewRecorder()
		r.ServeHTTP(out, httptest.NewRequest("GET", path, nil))
		return out
	}
	if out := get("/webui"); out.Code != 200 || !strings.Contains(out.Body.String(), "服务概览") || !strings.Contains(out.Header().Get("Content-Security-Policy"), "script-src 'self'") {
		t.Fatal("embedded UI failed")
	}
	if out := get("/script?key=should-not-appear"); out.Code != 400 || strings.Contains(out.Body.String(), "should-not-appear") {
		t.Fatal("credentials interpolated in script")
	}
	script := get("/script?server=%22%3Balert(1)")
	if script.Code != 200 || strings.Contains(script.Body.String(), "alert(1)") || strings.Contains(script.Body.String(), "DEFAULT_KEY") {
		t.Fatal("script template injection")
	}
	out := get("/extension")
	archive, err := zip.NewReader(bytes.NewReader(out.Body.Bytes()), int64(out.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, f := range archive.File {
		names[f.Name] = true
	}
	for _, name := range []string{"manifest.json", "popup.html", "popup.js", "connector.js", "popup.css"} {
		if !names[name] {
			t.Fatalf("missing extension asset: %s", name)
		}
	}
}
