package server

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"mimo2api/internal/manager"
)

const pairingTTL = 5 * time.Minute

type pairingStore struct {
	mu     sync.Mutex
	tokens map[[32]byte]time.Time
	now    func() time.Time
}

func newPairingStore() *pairingStore {
	return &pairingStore{tokens: make(map[[32]byte]time.Time), now: time.Now}
}

func (s *pairingStore) issue() (string, time.Time, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for key, expires := range s.tokens {
		if !now.Before(expires) {
			delete(s.tokens, key)
		}
	}
	// Bound memory even when a logged-in client repeatedly creates codes.
	if len(s.tokens) >= 128 {
		return "", time.Time{}, errPairingLimit
	}
	expires := now.Add(pairingTTL)
	s.tokens[sha256.Sum256([]byte(token))] = expires
	return token, expires, nil
}

var errPairingLimit = &pairingLimitError{}

type pairingLimitError struct{}

func (*pairingLimitError) Error() string {
	return "配对码数量已达上限，请五分钟后重试"
}

func (s *pairingStore) consume(token string) bool {
	if len(token) != 43 {
		return false
	}
	key := sha256.Sum256([]byte(token))
	s.mu.Lock()
	defer s.mu.Unlock()
	expires, exists := s.tokens[key]
	delete(s.tokens, key)
	return exists && s.now().Before(expires)
}

func (s *pairingStore) createHandler(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	token, expires, err := s.issue()
	if err != nil {
		c.JSON(http.StatusTooManyRequests, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"token": token, "expires_at": expires.Unix(), "expires_in": int(pairingTTL.Seconds())})
}

func (s *pairingStore) importHandler(add func(string) (string, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		// Only Authorization is accepted: codes must never enter URLs or access logs.
		token, bearer := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
		if !bearer || len(token) != 43 {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "配对码无效或已过期，请在控制台重新生成"})
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
		var body struct {
			UserID       string `json:"userId"`
			ServiceToken string `json:"xiaomichatbot_serviceToken"`
			PH           string `json:"xiaomichatbot_ph"`
		}
		decoder := json.NewDecoder(c.Request.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "凭据格式无效或超过大小限制"})
			return
		}
		if decoder.Decode(&struct{}{}) != io.EOF {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "请求只能包含一个 JSON 对象"})
			return
		}
		raw, _ := json.Marshal(map[string]string{"userId": body.UserID, "serviceToken": body.ServiceToken, "xiaomichatbot_ph": body.PH})
		if _, err := manager.ParseCredentials(string(raw)); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		if !s.consume(token) {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "配对码无效、已使用或已过期"})
			return
		}
		uid, err := add(string(raw))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "凭据保存失败，请重新生成配对码后重试"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "userId": uid})
	}
}
