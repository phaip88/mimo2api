package auth

import (
	"github.com/gin-gonic/gin"
	"mimo2api/internal/config"
	"net/http"
)

// Pairing is an administrative action; an inference API key cannot mint codes.
func AdminSessionMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(config.WebUICookieName)
		if config.WebUIPassword == "" || (err == nil && verifySessionToken(token)) {
			c.Next()
			return
		}
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "请先登录管理控制台"})
	}
}
