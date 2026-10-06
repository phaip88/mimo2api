package manager

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"mimo2api/internal/config"
	"mimo2api/internal/models"
)

func TestCheckDeploymentMissingInvalidAndPresent(t *testing.T) {
	t.Chdir(t.TempDir())
	if got := CheckDeployment(); got.Ready || got.Code != "BRIDGE_MISSING" {
		t.Fatalf("unexpected status: %+v", got)
	}
	if err := os.MkdirAll(filepath.Dir(BridgePayloadPath), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(BridgePayloadPath, nil, 0600); err != nil {
		t.Fatal(err)
	}
	if got := CheckDeployment(); got.Ready || got.Code != "BRIDGE_INVALID" {
		t.Fatalf("unexpected empty-file status: %+v", got)
	}
	if err := os.WriteFile(BridgePayloadPath, []byte("test fixture, never executed"), 0600); err != nil {
		t.Fatal(err)
	}
	if got := CheckDeployment(); !got.Ready {
		t.Fatalf("file existence check failed: %+v", got)
	}
}

func TestMissingBridgeDoesNotReserveSlotsOrContactUpstream(t *testing.T) {
	t.Chdir(t.TempDir())
	oldSlots := config.MaxActiveLifecycleSlots
	config.MaxActiveLifecycleSlots = 4
	t.Cleanup(func() { config.MaxActiveLifecycleSlots = oldSlots })
	m := &AccountManager{Users: map[string]models.UserRecord{"123": {UserID: "123", Status: "AVAILABLE"}}, LifecycleStops: map[string]chan struct{}{}, UserOrder: []string{"123"}, rebuildCh: make(chan struct{})}
	m.ensureActiveSlots()
	if len(m.LifecycleStops) != 0 || m.Users["123"].Status != "BRIDGE_MISSING" {
		t.Fatal("missing bridge scheduled a lifecycle")
	}
	m.TriggerRebuild()
	if len(m.LifecycleStops) != 0 {
		t.Fatal("rebuild bypassed preflight")
	}
}

func TestSlotReleasePreservesDailyLimit(t *testing.T) {
	t.Chdir(t.TempDir())
	stop := make(chan struct{})
	m := &AccountManager{Users: map[string]models.UserRecord{"123": {UserID: "123", Status: "DAILY_LIMIT", DailyLimitAt: float64(time.Now().Unix())}}, LifecycleStops: map[string]chan struct{}{"123": stop}, UserOrder: []string{"123"}}
	m.releaseLifecycleSlot("123", stop)
	if m.Users["123"].Status != "DAILY_LIMIT" || len(m.LifecycleStops) != 0 {
		t.Fatal("daily quota state lost after slot release")
	}
}

func TestReloadPreservesQuotaAndMetadataWithoutStartingLifecycle(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.MkdirAll("users", 0700); err != nil {
		t.Fatal(err)
	}
	saved := models.UserRecord{UserID: "123", Name: "saved account", ServiceToken: "test-fixture", PH: "test-fixture", AddedAt: 1234, DailyLimitAt: float64(time.Now().Unix()), DailyCreatedAt: 5678}
	raw, _ := json.Marshal(saved)
	if err := os.WriteFile("users/user_123.json", raw, 0600); err != nil {
		t.Fatal(err)
	}
	m := &AccountManager{Users: map[string]models.UserRecord{}, LifecycleStops: map[string]chan struct{}{}, rebuildCh: make(chan struct{})}
	m.LoadUsersFromDir("users")
	got := m.Users["123"]
	if got.Status != "DAILY_LIMIT" || got.Name != saved.Name || got.AddedAt != saved.AddedAt || got.DailyLimitAt != saved.DailyLimitAt || got.DailyCreatedAt != saved.DailyCreatedAt {
		t.Fatal("restart lost account metadata or quota")
	}
	if len(m.LifecycleStops) != 0 {
		t.Fatal("restart scheduled upstream work")
	}
}
