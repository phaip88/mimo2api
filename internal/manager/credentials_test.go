package manager

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestParseCredentialsFormats(t *testing.T) {
	tests := map[string]string{
		"cookie":          "userId=12345; xiaomichatbot_serviceToken=test-token==; xiaomichatbot_ph=test-ph;",
		"aliases":         "uid=12345; serviceToken=test-token==; ph=test-ph",
		"quoted":          "userId=12345; serviceToken=\"test-token==\"; ph='test-ph'",
		"curl":            "curl 'https://example.invalid/api' -H 'Cookie: userId=12345; serviceToken=test-token==; ph=test-ph' \\\n -H 'Accept: */*'",
		"firefox rows":    "userId\t12345\t.xiaomimimo.com\t/\ttrue\nserviceToken\ttest-token==\t.xiaomimimo.com\t/\ttrue\nph\ttest-ph\t.xiaomimimo.com\t/\ttrue",
		"json":            `{"userId":"12345","serviceToken":"test-token==","xiaomichatbot_ph":"test-ph"}`,
		"json numeric id": `{"userId":12345,"xiaomichatbot_serviceToken":"test-token==","ph":"test-ph"}`,
		"export":          `[{"name":"userId","value":"12345"},{"name":"serviceToken","value":"test-token=="},{"name":"ph","value":"test-ph"}]`,
	}
	for name, raw := range tests {
		t.Run(name, func(t *testing.T) {
			user, err := ParseCredentials(raw)
			if err != nil {
				t.Fatal(err)
			}
			if user.UserID != "12345" || user.ServiceToken != "test-token==" || user.PH != "test-ph" {
				t.Fatalf("incorrect parse for %s", name)
			}
		})
	}
}

func TestParseCredentialsRejectsInvalidInput(t *testing.T) {
	tests := []string{"", "cUserId=encrypted; serviceToken=test; ph=test", "userId=../../etc; serviceToken=test; ph=test", "userId=123; serviceToken=test", strings.Repeat("x", 16385), "{invalid}"}
	for _, value := range []string{"contains space", "bad;cookie=1", "line\ninjection", "bad\x00value"} {
		raw, _ := json.Marshal(map[string]string{"userId": "123", "serviceToken": value, "ph": "test"})
		tests = append(tests, string(raw))
	}
	for _, raw := range tests {
		if _, err := ParseCredentials(raw); err == nil {
			t.Fatal("accepted invalid credentials")
		}
	}
}

func TestParseCredentialsPrefersServiceSpecificCookies(t *testing.T) {
	user, err := ParseCredentials("userId=123; serviceToken=other; xiaomichatbot_serviceToken=correct; ph=other; xiaomichatbot_ph=correct")
	if err != nil || user.ServiceToken != "correct" || user.PH != "correct" {
		t.Fatal("selected unrelated service cookies")
	}
}
