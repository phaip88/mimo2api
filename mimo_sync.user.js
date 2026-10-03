// ==UserScript==
// @name         MiMo2API 凭据同步助手
// @namespace    https://github.com/phaip88/mimo2api
// @version      2.0.0
// @description  通过一次性配对码同步凭据；Firefox 请使用项目提供的原生扩展
// @match        https://aistudio.xiaomimimo.com/*
// @grant        GM_cookie
// @grant        GM.cookie
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-end
// ==/UserScript==
(function () {
    'use strict';
    const isFirefox = /Firefox\//.test(navigator.userAgent);
    function listCookies() {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Cookie API 未响应，请使用原生扩展')), 4000);
            const finish = (cookies, error) => {
                clearTimeout(timer);
                if (error) reject(new Error('Cookie 读取权限不可用，请使用原生扩展'));
                else resolve(Array.isArray(cookies) ? cookies : []);
            };
            try {
                const legacy = typeof GM_cookie !== 'undefined' && typeof GM_cookie.list === 'function';
                const modern = typeof GM !== 'undefined' && typeof GM.cookie?.list === 'function';
                if (!legacy && !modern) { finish([], true); return; }
                const result = legacy ? GM_cookie.list({url:location.href}, finish) : GM.cookie.list({url:location.href});
                if (result?.then) result.then(cookies => finish(cookies), () => finish([], true));
            } catch { finish([], true); }
        });
    }
    const host = document.createElement('div');
    host.id = 'mimo-sync-connector';
    host.style.cssText = 'position:fixed;right:20px;bottom:24px;z-index:2147483647';
    const shadow = host.attachShadow({mode:'closed'});
    shadow.innerHTML = '<style>:host{font:13px system-ui;color:#214737}details{background:#fff;border:1px solid #d7e3d9;border-radius:12px;box-shadow:0 8px 32px #1232;width:310px}summary{padding:15px;cursor:pointer;font-weight:650}section{padding:0 15px 15px}p{line-height:1.7;color:#63766b}textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid #cad8cc;border-radius:8px;resize:vertical;font:12px monospace}button{margin-top:10px;width:100%;border:0;border-radius:8px;padding:11px;background:#24553e;color:#fff;cursor:pointer}button:disabled{opacity:.6}small{display:block;margin-top:10px;line-height:1.7;overflow-wrap:anywhere}</style><details><summary>MiMo · 同步当前账号</summary><section><p id="hint"></p><textarea rows="3" aria-label="一次性配对码" placeholder="粘贴控制台的一次性配对码" autocomplete="off" spellcheck="false"></textarea><button>确认同步</button><small role="status" aria-live="polite"></small></section></details>';
    document.body.appendChild(host);
    const hint = shadow.querySelector('#hint');
    const input = shadow.querySelector('textarea');
    const button = shadow.querySelector('button');
    const status = shadow.querySelector('small');
    hint.textContent = isFirefox ? 'Firefox 油猴环境不保证提供 HttpOnly Cookie。请从 MiMo2API 控制台下载「浏览器连接器」，使用原生扩展同步。' : '在 MiMo2API 控制台生成配对码。凭据只发送到码中指定的网关，不保存管理密码。';
    if (isFirefox) { input.hidden = true; button.hidden = true; }
    async function sync() {
        if (isFirefox) return;
        button.disabled = true;
        status.textContent = '正在读取登录凭据…';
        try {
            let pairing;
            try { pairing = JSON.parse(input.value); } catch { throw new Error('请粘贴完整配对码'); }
            if (pairing.version !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(pairing.token || '') || pairing.expires_at * 1000 <= Date.now() || !Number.isFinite(pairing.expires_at)) throw new Error('配对码无效或已过期');
            const url = new URL(pairing.server);
            if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) throw new Error('配对码中的网关地址无效，远程网关必须使用 HTTPS');
            const cookies = (await listCookies()).filter(c => c.value && (!c.expirationDate || c.expirationDate > Date.now()/1000) && ['xiaomimimo.com','aistudio.xiaomimimo.com'].includes((c.domain || '').replace(/^\./,'')));
            const pick = names => { for (const name of names) { const value=cookies.find(c=>c.name===name)?.value; if (value) return value; } return ''; };
            const payload = {userId:pick(['userId','uid']),xiaomichatbot_serviceToken:pick(['xiaomichatbot_serviceToken','serviceToken']),xiaomichatbot_ph:pick(['xiaomichatbot_ph','ph'])};
            if (Object.values(payload).some(v=>!v)) throw new Error('未读取到完整 HttpOnly 凭据。请确认已登录，或使用原生扩展；更换油猴管理器不保证解决。');
            status.textContent = '正在同步到 '+url.origin+'…';
            const request = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : typeof GM !== 'undefined' ? GM.xmlHttpRequest : null;
            if (!request) throw new Error('扩展不支持跨域请求，请使用原生扩展');
            const data = await new Promise((resolve,reject) => request({
                method:'POST', url:url.origin+'/api/sync/import', anonymous:true, timeout:15000, redirect:'error',
                headers:{'Content-Type':'application/json',Authorization:'Bearer '+pairing.token}, data:JSON.stringify(payload),
                onload:response => {
                    try { const result=JSON.parse(response.responseText); if(response.status<200 || response.status>=300 || result.ok!==true) throw new Error(result.detail || '同步失败'); resolve(result); }
                    catch(e) { reject(new Error(e instanceof SyntaxError ? '网关返回格式异常' : e.message)); }
                },
                onerror:()=>reject(new Error('无法连接网关，请检查地址或扩展访问权限')),
                ontimeout:()=>reject(new Error('请求超时，请先在控制台检查账号是否已导入')),
                onabort:()=>reject(new Error('请求已取消'))
            }));
            input.value = '';
            status.textContent = '账号 '+data.userId+' 已同步，配对码已失效。';
        } catch(e) { status.textContent = e.message; }
        finally { button.disabled = false; }
    }
    button.addEventListener('click',sync);
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('MiMo 凭据同步',()=>{shadow.querySelector('details').open=true;});
})();
