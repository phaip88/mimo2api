package server

import (
	"github.com/gin-gonic/gin"
	"mimo2api/internal/manager"
)

func redactedUsers() []gin.H {
	list := make([]gin.H, 0)
	for _, user := range manager.GlobalManager.GetUsersList() {
		list = append(list, gin.H{"userId": user.UserID, "name": user.Name, "claw_status": user.Status, "remain_sec": user.RemainSec, "has_credentials": user.ServiceToken != "" && user.PH != "", "added_at": user.AddedAt})
	}
	return list
}
