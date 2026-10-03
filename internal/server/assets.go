package server

import (
	"archive/zip"
	"bytes"
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	assets "mimo2api"
)

func WebUIHandler(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Referrer-Policy", "no-referrer")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
	data, _ := assets.Files.ReadFile("webui.html")
	c.Data(http.StatusOK, "text/html; charset=utf-8", data)
}

func UserscriptHandler(c *gin.Context) {
	// Never interpolate credentials or untrusted query strings into executable source.
	if c.Query("key") != "" || c.Query("api_key") != "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "请使用控制台的一次性配对码，不要在脚本地址中传递密钥"})
		return
	}
	data, _ := assets.Files.ReadFile("mimo_sync.user.js")
	c.Header("Cache-Control", "no-store")
	c.Header("Content-Disposition", "inline; filename=mimo_sync.user.js")
	c.Data(http.StatusOK, "text/javascript; charset=utf-8", data)
}

func ExtensionDownloadHandler(c *gin.Context) {
	var buf bytes.Buffer
	archive := zip.NewWriter(&buf)
	entries, err := fs.ReadDir(assets.Files, "extension")
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() || strings.HasSuffix(entry.Name(), ".test.js") {
				continue
			}
			var content []byte
			content, err = assets.Files.ReadFile("extension/" + entry.Name())
			if err != nil {
				break
			}
			writer, writeErr := archive.Create(entry.Name())
			if writeErr != nil {
				err = writeErr
				break
			}
			if _, err = writer.Write(content); err != nil {
				break
			}
		}
	}
	closeErr := archive.Close()
	if err != nil || closeErr != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Header("Content-Disposition", "attachment; filename=mimo-connector.zip")
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}
