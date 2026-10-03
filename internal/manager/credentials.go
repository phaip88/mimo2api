package manager

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"mimo2api/internal/models"
)

var credentialLine = regexp.MustCompile(`(?i)\b(userId|uid|xiaomichatbot_serviceToken|serviceToken|xiaomichatbot_ph|ph)\b\s*[:=\t ]+\s*([^;\r\n]+)`)
var safeUserID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`)

// ParseCredentials accepts Cookie/cURL, Firefox storage rows and JSON exports.
// It never probes localStorage or substitutes cUserId (an encrypted, different ID).
func ParseCredentials(raw string) (models.UserRecord, error) {
	var user models.UserRecord
	if len(raw) > 16384 {
		return user, fmt.Errorf("凭据内容不能超过 16 KB")
	}
	fields := make(map[string]string)
	clean := func(s string) string { return strings.Trim(strings.TrimSpace(s), "\\\"' \t\r\n") }
	put := func(k, v string) { fields[strings.ToLower(k)] = clean(v) }
	trimmed := strings.TrimSpace(raw)
	if strings.HasPrefix(trimmed, "{") {
		var object map[string]json.RawMessage
		if err := json.Unmarshal([]byte(trimmed), &object); err != nil {
			return user, fmt.Errorf("JSON 凭据格式无效")
		}
		for key, val := range object {
			var str string
			if json.Unmarshal(val, &str) == nil {
				put(key, str)
			} else if strings.EqualFold(key, "userId") {
				put(key, string(val))
			}
		}
	} else if strings.HasPrefix(trimmed, "[") {
		var cookies []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		}
		if err := json.Unmarshal([]byte(trimmed), &cookies); err != nil {
			return user, fmt.Errorf("Cookie JSON 导出格式无效")
		}
		for _, cookie := range cookies {
			put(cookie.Name, cookie.Value)
		}
	} else {
		for _, match := range credentialLine.FindAllStringSubmatch(raw, -1) {
			// Firefox/Chromium storage table: name TAB value TAB domain/path/flags...
			value := strings.SplitN(match[2], "\t", 2)[0]
			put(match[1], value)
		}
	}
	first := func(keys ...string) string {
		for _, key := range keys {
			if fields[key] != "" {
				return fields[key]
			}
		}
		return ""
	}
	user.UserID = first("userid", "uid")
	user.ServiceToken = first("xiaomichatbot_servicetoken", "servicetoken")
	user.PH = first("xiaomichatbot_ph", "ph")
	if user.UserID == "" || user.ServiceToken == "" || user.PH == "" {
		return user, fmt.Errorf("缺少 userId、serviceToken 或 xiaomichatbot_ph，请复制完整登录凭据")
	}
	if !safeUserID.MatchString(user.UserID) {
		return user, fmt.Errorf("userId 格式无效")
	}
	for _, value := range []string{user.ServiceToken, user.PH} {
		if len(value) > 8192 || strings.ContainsAny(value, ";\r\n\t \"'\\") {
			return user, fmt.Errorf("凭据包含无效字符")
		}
		for _, r := range value {
			if r < 33 || r > 126 {
				return user, fmt.Errorf("凭据包含无效字符")
			}
		}
	}
	return user, nil
}
