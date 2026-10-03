# MiMo 浏览器连接器

- Firefox 142+ / Chromium Manifest V3。
- 控制台下载 ZIP 后解压；Firefox 通过 about:debugging 临时加载 manifest.json。未签名版本重启后需要重新加载。
- 在当前已登录的 AI Studio 标签页打开扩展；支持 Firefox 的当前容器 Cookie 存储。
- 配对码只保存在弹窗内存中。关闭弹窗需要重新粘贴；同步成功后会清空。
- 仅将 userId、xiaomichatbot_serviceToken、xiaomichatbot_ph 发送到用户确认的网关。无后台抓取、无自动上传、无统计服务。
- 下载不等于发布到 Mozilla 附加组件商店；长期安装需要签名。
