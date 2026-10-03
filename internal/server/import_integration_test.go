package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"mimo2api/internal/auth"
	"mimo2api/internal/config"
	"mimo2api/internal/manager"
	"mimo2api/internal/models"
)

func TestBrowserImportPersistsAndRedactsCredentials(t *testing.T) {
	t.Chdir(t.TempDir())
	oldManager := manager.GlobalManager
	oldSlots := config.MaxActiveLifecycleSlots
	config.MaxActiveLifecycleSlots = 1
	// Occupy the lifecycle slot: this test must not contact Xiaomi or start a node.
	manager.GlobalManager = &manager.AccountManager{Users: map[string]models.UserRecord{}, LifecycleStops: map[string]chan struct{}{"test-slot": make(chan struct{})}}
	t.Cleanup(func() { manager.GlobalManager = oldManager; config.MaxActiveLifecycleSlots = oldSlots })
	oldPass, oldSecret, oldCookie, oldUser := config.WebUIPassword, config.WebUISecretKey, config.WebUICookieName, config.WebUIUsername
	config.WebUIPassword = "fixture-password"
	config.WebUISecretKey = "fixture-secret"
	config.WebUICookieName = "fixture_session"
	config.WebUIUsername = "admin"
	t.Cleanup(func() {
		config.WebUIPassword, config.WebUISecretKey, config.WebUICookieName, config.WebUIUsername = oldPass, oldSecret, oldCookie, oldUser
	})
	s := newPairingStore()
	r := gin.New()
	r.POST("/login", auth.LoginHandler)
	r.POST("/pair", auth.AdminSessionMiddleware(), s.createHandler)
	r.POST("/import", s.importHandler(manager.GlobalManager.AddUser))
	r.GET("/users", auth.WebUIMiddleware(), UsersListHandler)
	request := func(method, path, body string, cookie *http.Cookie, token string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			req.AddCookie(cookie)
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		out := httptest.NewRecorder()
		r.ServeHTTP(out, req)
		return out
	}
	login := request("POST", "/login", `{"username":"admin","password":"fixture-password"}`, nil, "")
	if login.Code != 200 {
		t.Fatal("login failed")
	}
	cookie := login.Result().Cookies()[0]
	issued := request("POST", "/pair", "{}", cookie, "")
	var code struct {
		Token string `json:"token"`
	}
	if json.Unmarshal(issued.Body.Bytes(), &code) != nil || code.Token == "" {
		t.Fatal("pairing failed")
	}
	body := `{"userId":"12345","xiaomichatbot_serviceToken":"fixture-only-token==","xiaomichatbot_ph":"fixture-only-ph"}`
	imported := request("POST", "/import", body, nil, code.Token)
	if imported.Code != 200 {
		t.Fatalf("import failed: %s", imported.Body.String())
	}
	data, err := os.ReadFile(filepath.Join("users", "user_12345.json"))
	if err != nil {
		t.Fatal(err)
	}
	var user models.UserRecord
	if json.Unmarshal(data, &user) != nil || user.ServiceToken != "fixture-only-token==" || user.PH != "fixture-only-ph" {
		t.Fatal("credentials were not persisted correctly")
	}
	listing := request("GET", "/users", "", cookie, "")
	if listing.Code != 200 {
		t.Fatal("list failed")
	}
	for _, secret := range []string{"fixture-only-token", "fixture-only-ph", "serviceToken", "sessionKey", "xiaomichatbot_ph"} {
		if strings.Contains(listing.Body.String(), secret) {
			t.Fatal("account list leaked credentials")
		}
	}
	if !strings.Contains(listing.Body.String(), `"has_credentials":true`) {
		t.Fatal("credential state missing")
	}
	if replay := request("POST", "/import", body, nil, code.Token); replay.Code != 401 {
		t.Fatal("replay accepted")
	}
}
