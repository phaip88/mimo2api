package server

import (
	"github.com/gin-gonic/gin"
	"mimo2api/internal/manager"
	"mimo2api/internal/models"
	"mimo2api/internal/state"
)

func accountAPIStatus(user models.UserRecord, nodes []state.ActiveNodeInfo, deployment manager.DeploymentStatus) string {
	connected := false
	for _, node := range nodes {
		if node.Role != state.NodeRoleMimo || node.Host != "user:"+user.UserID {
			continue
		}
		if node.Available {
			return "AVAILABLE"
		}
		connected = true
	}
	if connected {
		return "NODE_UNAVAILABLE"
	}
	if user.Status == "DAILY_LIMIT" {
		return "DAILY_LIMIT"
	}
	if !deployment.Ready {
		return deployment.Code
	}
	if user.Status == "AVAILABLE" {
		return "INSTANCE_READY"
	}
	return user.Status
}

func redactedUsers() []gin.H {
	list := make([]gin.H, 0)
	nodes := state.GetActiveNodes()
	deployment := manager.CheckDeployment()
	for _, user := range manager.GlobalManager.GetUsersList() {
		list = append(list, gin.H{"userId": user.UserID, "name": user.Name,
			"claw_status": user.Status, "api_status": accountAPIStatus(user, nodes, deployment),
			"remain_sec": user.RemainSec, "has_credentials": user.ServiceToken != "" && user.PH != "", "added_at": user.AddedAt})
	}
	return list
}

func availableMimoNodes() int {
	count := 0
	for _, node := range state.GetActiveNodes() {
		if node.Role == state.NodeRoleMimo && node.Available {
			count++
		}
	}
	return count
}

func unavailableNodeMessage() string {
	deployment := manager.CheckDeployment()
	if !deployment.Ready {
		return "Gateway Error: " + deployment.Message
	}
	return "Gateway Error: 没有可用的内网节点"
}
