package manager

import "os"

const BridgePayloadPath = "bridge/node-metrics-agent-linux-amd64.gif"

type DeploymentStatus struct {
	Ready   bool   `json:"ready"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// CheckDeployment checks local prerequisites only; it never creates upstream instances.
func CheckDeployment() DeploymentStatus {
	info, err := os.Stat(BridgePayloadPath)
	if os.IsNotExist(err) {
		return DeploymentStatus{false, "BRIDGE_MISSING", "部署缺少桥接文件，已暂停实例创建。仅导入 Cookie 不能恢复模型服务。"}
	}
	if err != nil {
		return DeploymentStatus{false, "BRIDGE_UNREADABLE", "桥接文件无法读取，已暂停实例创建。"}
	}
	if !info.Mode().IsRegular() || info.Size() == 0 {
		return DeploymentStatus{false, "BRIDGE_INVALID", "桥接文件为空或不是普通文件，已暂停实例创建。"}
	}
	file, err := os.Open(BridgePayloadPath)
	if err != nil {
		return DeploymentStatus{false, "BRIDGE_UNREADABLE", "桥接文件无法读取，已暂停实例创建。"}
	}
	file.Close()
	return DeploymentStatus{true, "READY", "本地桥接文件存在；模型服务是否可用以实际节点连接为准。"}
}

func (m *AccountManager) checkDeploymentBeforeScheduling() bool {
	status := CheckDeployment()
	if status.Ready {
		return true
	}
	changed := false
	m.mu.Lock()
	for id, user := range m.Users {
		if user.DailyLimitAt >= beijingMidnightToday() {
			user.Status = "DAILY_LIMIT"
		} else if user.Status != status.Code {
			user.Status = status.Code
			changed = true
		}
		m.Users[id] = user
	}
	m.mu.Unlock()
	if changed {
		managerLogf("%s: %s", status.Code, status.Message)
	}
	return false
}
