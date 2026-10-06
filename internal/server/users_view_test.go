package server

import (
	"mimo2api/internal/manager"
	"mimo2api/internal/models"
	"mimo2api/internal/state"
	"testing"
)

func TestAccountAvailabilityRequiresMatchingReadyMimoNode(t *testing.T) {
	user := models.UserRecord{UserID: "123", Status: "AVAILABLE"}
	ready := manager.DeploymentStatus{Ready: true}
	cases := []struct {
		name       string
		nodes      []state.ActiveNodeInfo
		deployment manager.DeploymentStatus
		want       string
	}{
		{"instance only", nil, ready, "INSTANCE_READY"},
		{"missing file", nil, manager.DeploymentStatus{Code: "BRIDGE_MISSING"}, "BRIDGE_MISSING"},
		{"other account", []state.ActiveNodeInfo{{Host: "user:999", Role: state.NodeRoleMimo, Available: true}}, ready, "INSTANCE_READY"},
		{"proxy node", []state.ActiveNodeInfo{{Host: "user:123", Role: state.NodeRoleProxy, Available: true}}, ready, "INSTANCE_READY"},
		{"cooldown node", []state.ActiveNodeInfo{{Host: "user:123", Role: state.NodeRoleMimo}}, ready, "NODE_UNAVAILABLE"},
		{"ready node", []state.ActiveNodeInfo{{Host: "user:123", Role: state.NodeRoleMimo, Available: true}}, ready, "AVAILABLE"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := accountAPIStatus(user, tc.nodes, tc.deployment); got != tc.want {
				t.Fatalf("got %s want %s", got, tc.want)
			}
		})
	}
	user.Status = "DAILY_LIMIT"
	if got := accountAPIStatus(user, nil, ready); got != "DAILY_LIMIT" {
		t.Fatalf("quota state lost: %s", got)
	}
}

func TestUnavailableMessageExplainsMissingDeployment(t *testing.T) {
	t.Chdir(t.TempDir())
	if got := unavailableNodeMessage(); got == "Gateway Error: 没有可用的内网节点" {
		t.Fatal("missing bridge still hidden behind generic node error")
	}
}
