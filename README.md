# MiMo2API

<p align="center">
  <strong>轻量、高效、开箱即用的小米 MiMo 模型转 OpenAI / Anthropic 个人 API 网关</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat-square&logo=go" alt="Go Version" />
  <img src="https://img.shields.io/badge/OpenAI-Compatible-412991?style=flat-square&logo=openai" alt="OpenAI Compatible" />
  <img src="https://img.shields.io/badge/Anthropic-Compatible-D97706?style=flat-square&logo=anthropic" alt="Anthropic Compatible" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## 📖 项目简介

**MiMo2API** 是专为个人开发者与 AI 爱好者打造的小米大模型（MiMo）转接网关。通过对接底层的算力环境，提供完全兼容 **OpenAI** 与 **Anthropic (Claude)** 协议的标准接口，无缝接入各类常用客户端工具（如 NextChat、Cherry Studio、Chatbox、沉浸式翻译等）。

相比原版复杂的社区多用户体系，本项目经过全面精简与优化，移除了冗余的第三方 OAuth 与公共站逻辑，强化了凭据解析容错，并将实时监控看板完整内嵌至单页控制台中，提供纯净、快速、专注个人使用的交互体验。

---

## ✨ 核心特性

- **双协议兼容**：
  - **OpenAI 格式**：`/v1/chat/completions`、`/v1/models`
  - **Anthropic 格式**：`/anthropic/v1/messages`（支持 Claude 原生客户端直接对接）
- **极简个人控制台**：
  - 移除非个人使用的 Linux.do OAuth 等社区分发组件，页面更轻量、响应更迅捷。
  - 首屏提供**个人接入快速引导卡片**，动态呈现 Base URL 与认证格式，支持一键复制配置。
- **一体化服务监控**：
  - 核心指标看板：在线时长、请求成功率、平均响应延迟 / 首字延迟 (TTFT)、Token 吞吐量（输入与输出明细）。
  - 可用率历史轴：24 小时状态色块可视化展示服务稳定性。
  - 模型流量明细：统计各模型的请求频次（流式 / 非流式）、平均延迟与消耗。
  - 完全内嵌原生页面，不再依赖任何外部第三方监控站点。
- **智能凭证清洗与解析**：
  - 自动适配从浏览器开发者工具（F12）Cookie 表格直接复制出的制表符/空格分隔格式。
  - 自动清洗多层嵌套引号与字段别名（如自动兼容 `xiaomichatbot_serviceToken` 与 `serviceToken`）。
- **动态模型映射**：
  - 支持自定义模型路由别名（例如将客户端的 `gpt-4o`、`claude-3-5-sonnet` 自动转发至目标模型 `mimo-v2.5-pro`）。
- **纯净安全**：
  - 剔除历史硬编码调试密钥与社区外链提示，未配置密钥时自动生成高强度随机凭据，避免凭据泄漏风险。

---

## 🚀 快速上手

### 1. 本地编译与运行

#### 环境要求
- Go 1.21 或更高版本

#### 获取源码与编译
```bash
git clone https://github.com/phaip88/mimo2api.git
cd mimo2api

# 下载依赖并编译二进制
go mod tidy
go build -o mimo2api ./cmd/mimo2api
```

#### 配置环境
在同目录下创建 `.env` 文件（参考后文的配置项表格）：
```ini
SERVER_HOST=0.0.0.0
SERVER_PORT=8088
GIN_MODE=release

# 个人网关 API Key (用于客户端调用，多个用逗号隔开)
MIMO_API_KEYS=sk-mimo-my-secret-key-123456

# WebUI 管理后台凭证
MIMO_WEBUI_USERNAME=admin
MIMO_WEBUI_PASSWORD=YourStrongPassword123
```

#### 启动服务
```bash
# 直接运行
./mimo2api

# 或后台运行
nohup ./mimo2api > gateway.log 2>&1 &
```

访问 `http://127.0.0.1:8088/webui` 即可进入管理控制台。

---

## 🛠️ 客户端接入配置

### OpenAI 格式接入（NextChat / Cherry Studio / Chatbox 等）
- **接口地址 (Base URL)**: `http://<你的服务器地址>:8088/v1`（如配置了域名或反向代理填入相应域名即可）
- **API Key**: 填入你在 `.env` 中设置的 `MIMO_API_KEYS`
- **支持的模型**:
  - `mimo-v2.5-pro`
  - `mimo-v2.5`
  - `mimo-v2-pro`
  - `mimo-v2`
  - 或你在控制台配置的自定义映射别名（如 `gpt-4o`）

### Claude 格式接入
- **接口地址 (Base URL)**: `http://<你的服务器地址>:8088/anthropic`
- **API Key**: 填入 `MIMO_API_KEYS`
- **模型**: 直接填写映射至的目标模型名即可

### cURL 快速测试
```bash
curl http://127.0.0.1:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-mimo-my-secret-key-123456" \
  -d '{
    "model": "mimo-v2.5-pro",
    "messages": [{"role": "user", "content": "你好，请做个自我介绍"}],
    "stream": false
  }'
```

---

## ⚙️ 环境变量配置说明

| 环境变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `SERVER_HOST` | `0.0.0.0` | 监听的主机 IP 地址 |
| `SERVER_PORT` | `8088` | 网关服务监听端口 |
| `GIN_MODE` | `release` | 框架运行模式 (`release` / `debug`) |
| `MIMO_API_KEYS` | 空 | 客户端调用所需的 API 密钥，支持逗号分隔多个 |
| `MIMO_WEBUI_USERNAME` | `admin` | WebUI 管理界面的管理员用户名 |
| `MIMO_WEBUI_PASSWORD` | 空 | WebUI 登录密码；若留空则免密码访问 |
| `MIMO_WEBUI_SECRET` | 随机生成 | 会话 Cookie 加密密钥（若未设置将自动生成随机安全密钥） |
| `MIMO_WS_AUTH_TOKEN` | 空 | WebSocket 节点通信鉴权 Token |
| `MIMO_AISTUDIO_PROXY` | 空 | 上游网络代理（例如海外机器访问国内服务被风控时可配置 HTTP/SOCKS 代理） |
| `MIMO_MAX_ACTIVE_LIFECYCLE_SLOTS` | `4` | 最大并发维护的运行账号槽位数 |
| `MIMO_METRICS_DB_PATH` | `gateway_metrics.db` | 本地监控指标 SQLite 存储路径 |

---

## 🔑 小米凭据导入说明

在 WebUI 控制台的「运行账号」面板中点击 **「导入凭证 Cookie」**，系统支持直接识别以下格式：

1. **标准 Cookie 格式**：
   ```text
   userId=123456789; serviceToken="vjQ3..."; xiaomichatbot_ph="abcd...";
   ```
2. **浏览器开发者工具（F12）复制格式**：
   支持直接从 Network 或 Application -> Cookies 表格中复制包含名称和内容的多行文本，系统内置智能清洗器，会自动提取并对齐关键凭据。

> **提示**：若添加账号后控制台出现节点无法建立或风控警告，属于小米官方安全策略拦截。可通过配置国内代理（`MIMO_AISTUDIO_PROXY`）或更换未受风控的正常小米账号解决。

---

## 📄 开源许可

本项目基于 [MIT 许可证](LICENSE) 分发与开源。仅供个人技术研究、网络代理学习交流使用，严禁用于任何商业用途或违反相关服务条款的场景。