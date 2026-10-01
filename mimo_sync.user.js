// ==UserScript==
// @name         mimo2api 小米凭证自动同步助手
// @namespace    https://github.com/phaip88/mimo2api
// @version      1.1.0
// @description  一键自动获取 Xiaomi AI Studio 登录凭证并同步至 mimo2api 服务端
// @author       mimo2api
// @match        https://aistudio.xiaomimimo.com/*
// @match        https://*.xiaomimimo.com/*
// @grant        GM_cookie
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 默认配置（可通过脚本菜单或浮窗随时修改）
    const DEFAULT_SERVER = "http://localhost:8088";
    const DEFAULT_KEY = "";

    function getServer() {
        return (GM_getValue('mimo_server_url', DEFAULT_SERVER) || location.origin).replace(/\/+$/, '');
    }
    function getApiKey() {
        return GM_getValue('mimo_api_key', DEFAULT_KEY) || '';
    }

    // 页面提示 Toast
    function showToast(msg, type = 'info') {
        const id = 'mimo-sync-toast';
        let toast = document.getElementById(id);
        if (!toast) {
            toast = document.createElement('div');
            toast.id = id;
            toast.style.cssText = 'position:fixed;top:24px;right:24px;z-index:999999;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.18);display:flex;align-items:center;gap:10px;transition:all 0.3s ease;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
            document.body.appendChild(toast);
        }
        if (type === 'success') {
            toast.style.background = '#10b981';
            toast.style.color = '#ffffff';
        } else if (type === 'error') {
            toast.style.background = '#ef4444';
            toast.style.color = '#ffffff';
        } else {
            toast.style.background = '#3b82f6';
            toast.style.color = '#ffffff';
        }
        toast.innerHTML = msg;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
        }, 4000);
    }

    // 获取 Cookie（支持 HttpOnly）
    async function getCookies() {
        const cookieMap = {};

        const getByFilter = (filter) => new Promise((resolve) => {
            if (typeof GM_cookie !== 'undefined' && GM_cookie.list) {
                GM_cookie.list(filter, (cookies, error) => {
                    if (!error && Array.isArray(cookies)) {
                        resolve(cookies);
                    } else {
                        resolve([]);
                    }
                });
            } else {
                resolve([]);
            }
        });

        const [cUrl, cDomain, cDotDomain] = await Promise.all([
            getByFilter({ url: window.location.href }),
            getByFilter({ domain: 'xiaomimimo.com' }),
            getByFilter({ domain: '.xiaomimimo.com' })
        ]);

        [...cUrl, ...cDomain, ...cDotDomain].forEach(c => {
            if (c && c.name && c.value) {
                cookieMap[c.name] = c.value;
            }
        });

        if (document.cookie) {
            document.cookie.split(';').forEach(item => {
                const idx = item.indexOf('=');
                if (idx > -1) {
                    const k = item.slice(0, idx).trim();
                    const v = item.slice(idx + 1).trim();
                    if (!cookieMap[k]) cookieMap[k] = v;
                }
            });
        }

        return cookieMap;
    }

    // 执行凭证提取与同步
    async function doSync() {
        const btn = document.getElementById('mimo-sync-btn');
        if (btn) {
            btn.innerText = '🔄 同步中...';
            btn.style.opacity = '0.7';
            btn.style.pointerEvents = 'none';
        }

        try {
            const cookies = await getCookies();
            let userId = cookies['userId'] || cookies['cUserId'] || cookies['uid'] || '';
            let st = cookies['xiaomichatbot_serviceToken'] || cookies['serviceToken'] || '';
            let ph = cookies['xiaomichatbot_ph'] || cookies['ph'] || '';

            if (!userId) {
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        const val = localStorage.getItem(key);
                        if (val && (key.includes('user') || val.includes('userId'))) {
                            const m = val.match(/"userId"\s*:\s*"?(\d+)"?/i) || val.match(/userId[=:]\s*"?(\d+)"?/i);
                            if (m) {
                                userId = m[1];
                                break;
                            }
                        }
                    }
                } catch (e) {}
            }

            if (!st || !ph) {
                showToast('⚠️ 未检测到有效登录凭据，请先在当前页面登录小米账号！', 'error');
                return;
            }

            const server = getServer();
            const key = getApiKey();
            const targetUrl = server + '/api/users/add';

            const payload = {
                userId: userId,
                xiaomichatbot_serviceToken: st,
                xiaomichatbot_ph: ph,
                raw_text: 'userId=' + userId + '; xiaomichatbot_serviceToken=' + st + '; xiaomichatbot_ph=' + ph + ';'
            };

            const headers = {
                'Content-Type': 'application/json'
            };
            if (key) {
                headers['Authorization'] = 'Bearer ' + key;
                headers['X-API-Key'] = key;
                headers['X-WebUI-Password'] = key;
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: targetUrl,
                headers: headers,
                data: JSON.stringify(payload),
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        showToast('✅ 凭据同步成功！用户ID: ' + (userId || '已解析'), 'success');
                    } else {
                        let errMsg = response.responseText;
                        try {
                            const parsed = JSON.parse(response.responseText);
                            errMsg = parsed.detail || parsed.error || response.responseText;
                        } catch(e) {}
                        showToast('❌ 同步失败 [' + response.status + ']: ' + errMsg, 'error');
                    }
                },
                onerror: function() {
                    showToast('❌ 无法连接到 mimo2api (' + server + ')，请检查网络或配置', 'error');
                }
            });

        } catch (err) {
            showToast('❌ 执行异常: ' + err.message, 'error');
        } finally {
            if (btn) {
                btn.innerText = '⚡ 同步到 mimo2api';
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            }
        }
    }

    function openConfigDialog() {
        const curServer = getServer();
        const curKey = getApiKey();
        const newServer = prompt('请输入 mimo2api 服务端地址 (例如 https://your-domain.com):', curServer);
        if (newServer !== null) {
            GM_setValue('mimo_server_url', newServer.trim());
            const newKey = prompt('请输入 mimo2api 访问密钥 (API Key 或 WebUI 密码):', curKey);
            if (newKey !== null) {
                GM_setValue('mimo_api_key', newKey.trim());
                showToast('✅ 配置已更新', 'success');
            }
        }
    }

    function createFloatUI() {
        if (document.getElementById('mimo-sync-container')) return;

        const container = document.createElement('div');
        container.id = 'mimo-sync-container';
        container.style.cssText = 'position:fixed;bottom:30px;right:30px;z-index:999990;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.96);backdrop-filter:blur(10px);padding:6px 12px;border-radius:30px;box-shadow:0 6px 20px rgba(0,0,0,0.15);border:1px solid rgba(0,0,0,0.08);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

        const btn = document.createElement('button');
        btn.id = 'mimo-sync-btn';
        btn.innerHTML = '⚡ 同步到 mimo2api';
        btn.style.cssText = 'background:linear-gradient(135deg,#ff6700 0%,#ff8533 100%);color:#ffffff;border:none;padding:7px 15px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;outline:none;box-shadow:0 2px 8px rgba(255,103,0,0.35);transition:all 0.2s ease;';
        btn.onmouseover = () => { btn.style.transform = 'translateY(-1px)'; btn.style.boxShadow = '0 4px 12px rgba(255,103,0,0.45)'; };
        btn.onmouseout = () => { btn.style.transform = 'none'; btn.style.boxShadow = '0 2px 8px rgba(255,103,0,0.35)'; };
        btn.onclick = doSync;

        const cfgBtn = document.createElement('button');
        cfgBtn.title = '设置服务端地址与凭证';
        cfgBtn.innerHTML = '⚙️';
        cfgBtn.style.cssText = 'background:transparent;border:none;font-size:16px;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;opacity:0.7;transition:opacity 0.2s;';
        cfgBtn.onmouseover = () => { cfgBtn.style.opacity = '1'; };
        cfgBtn.onmouseout = () => { cfgBtn.style.opacity = '0.7'; };
        cfgBtn.onclick = openConfigDialog;

        container.appendChild(btn);
        container.appendChild(cfgBtn);
        document.body.appendChild(container);
    }

    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('⚡ 立即同步账号凭据到 mimo2api', doSync);
        GM_registerMenuCommand('⚙️ 配置 mimo2api 地址与凭证', openConfigDialog);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createFloatUI);
    } else {
        createFloatUI();
    }
})();
