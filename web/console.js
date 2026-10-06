"use strict";
const $ = (id) => document.getElementById(id);
const iconPaths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  route:
    '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M5 7v8a4 4 0 0 0 4 4h8M19 17V9a4 4 0 0 0-4-4H9m3-3L9 5l3 3"/>',
  activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-16-2 20"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  github:
    '<path d="M9 19c-4 1-4-2-6-2m12 5v-4c0-1 .1-2-1-2 4-.4 6-2 6-6 0-1-.3-2-1-3 .3-1 .3-3-.2-4 0 0-2-.1-4 2a13 13 0 0 0-6 0C7 3 5 3 5 3c-.5 1-.5 3-.2 4C4 8 4 9 4 10c0 4 2 5.6 6 6-1 0-1 1-1 2v4"/>',
  logout: '<path d="M9 21H4V3h5m5 4 5 5-5 5m-7-5h12"/>',
  refresh:
    '<path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5m-3 9a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  link: '<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 0 6 6l3-3a4 4 0 0 0 0-6M9 10a4 4 0 0 1 0-6l3-3a4 4 0 0 1 6 6l-2 2" transform="translate(1 0) scale(.9)"/>',
  server:
    '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6h.01M7 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9zm-10 12 10 6 10-6M2 12l10 6 10-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
};
function icons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    if (el.firstChild) return;
    const path = iconPaths[el.dataset.icon];
    if (path)
      el.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        path +
        "</svg>";
  });
}
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (value) =>
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const compact = (value) =>
  new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number(value));
const milliseconds = (value) =>
  number(value) > 0
    ? number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 }) +
      " ms"
    : "—";
const titles = {
  overview: [
    "服务概览",
    "统一管理账号连接、模型路由与网关运行状态。",
    "OVERVIEW",
  ],
  accounts: [
    "账号管理",
    "查看账号运行状态，管理浏览器同步的凭据。",
    "ACCOUNTS",
  ],
  mappings: [
    "模型映射",
    "将客户端模型名称映射到可用的 MiMo 模型。",
    "MODEL ROUTING",
  ],
  monitor: [
    "运行监控",
    "观察请求流量、响应时间与服务可用率。",
    "OBSERVABILITY",
  ],
  access: ["接入配置", "复制协议地址，连接你常用的 AI 客户端。", "API ACCESS"],
};
let authenticated = false,
  activeTab = "overview",
  refreshing = false,
  refreshAgain = false,
  epoch = 0;
let users = [],
  usersUpdated = Date.now(),
  pairingExpires = 0,
  toastTimer,
  pollTimer,
  requestController = new AbortController();
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").className = "toast show" + (error ? " error" : "");
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 4000);
}
async function copy(text) {
  try {
    if (navigator.clipboard?.writeText)
      await navigator.clipboard.writeText(text);
    else {
      const field = document.createElement("textarea");
      field.value = text;
      // Keep the fallback inside the modal; focus outside a native dialog is inert.
      (document.querySelector("dialog[open]") || document.body).appendChild(
        field,
      );
      field.select();
      let copied;
      try {
        copied = document.execCommand("copy");
      } finally {
        field.remove();
      }
      if (!copied) throw new Error("clipboard unavailable");
    }
    toast("已复制");
  } catch {
    toast("复制失败，请选中文本手动复制", true);
  }
}
function stopSession() {
  authenticated = false;
  epoch++;
  clearTimeout(pollTimer);
  requestController.abort();
  requestController = new AbortController();
  $("appShell").classList.add("hidden");
  $("loadingShell").classList.add("hidden");
  $("authShell").classList.remove("hidden");
  document.querySelectorAll("dialog[open]").forEach((el) => el.close());
  $("loginPassword").value = "";
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.any([
      requestController.signal,
      AbortSignal.timeout(15000),
    ]),
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let result = {};
  try {
    result = await response.json();
  } catch {
    throw new Error("网关返回格式异常");
  }
  if (response.status === 401) {
    if (authenticated) {
      stopSession();
      toast("登录已过期，请重新登录", true);
    }
    throw new Error("请先登录");
  }
  if (!response.ok)
    throw new Error(
      result.detail || result.error || "请求失败（" + response.status + "）",
    );
  return result;
}
async function busy(button, task) {
  if (button.disabled) return;
  button.disabled = true;
  try {
    await task();
  } catch (error) {
    if (error.name !== "AbortError")
      toast(
        error.name === "TimeoutError"
          ? "请求超时，请检查网关连接"
          : error.message,
        true,
      );
  } finally {
    button.disabled = false;
  }
}
function switchTab(tab) {
  if (!titles[tab]) return;
  activeTab = tab;
  document
    .querySelectorAll(".tab-pane")
    .forEach((el) => el.classList.toggle("hidden", el.id !== "tab-" + tab));
  document.querySelectorAll(".nav-item[data-tab]").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tab);
    if (el.dataset.tab === tab) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  const [title, desc, slug] = titles[tab];
  $("pageTitle").textContent = title;
  $("breadcrumbTitle").textContent = title;
  $("pageDescription").textContent = desc;
  $("pageEyebrow").textContent = "WORKSPACE / " + slug;
  document.title = title + " · MiMo";
  location.hash = tab;
  if (authenticated) refresh();
}
function statusFor(user) {
  const raw = String(
    user.api_status ||
      (user.claw_status === "AVAILABLE"
        ? "INSTANCE_READY"
        : user.claw_status) ||
      "QUEUED",
  );
  const labels = {
    AVAILABLE: "API 可用",
    INSTANCE_READY: "实例就绪 · 节点未连接",
    NODE_UNAVAILABLE: "节点暂不可用",
    BRIDGE_MISSING: "缺少桥接文件",
    BRIDGE_INVALID: "桥接文件无效",
    BRIDGE_UNREADABLE: "桥接文件不可读",
    QUEUED: "排队中",
    SCHEDULED: "已调度",
    CREATING: "创建中",
    CONNECTING: "连接中",
    RUNNING: "运行中",
    EXPIRED: "已过期",
    ERROR: "异常",
    DAILY_LIMIT: "今日限额",
  };
  const kind =
    raw === "AVAILABLE"
      ? "success"
      : /401|EXPIRED|ERROR|FAIL|BRIDGE_/i.test(raw)
        ? "danger"
        : "warning";
  return (
    '<span class="badge ' +
    kind +
    '">' +
    escapeHTML(labels[raw] || raw) +
    "</span>"
  );
}
function duration(value) {
  const sec = number(value);
  if (!sec) return "等待环境";
  return (
    Math.floor(sec / 3600) + " 小时 " + Math.floor((sec % 3600) / 60) + " 分"
  );
}
function emptyAccounts() {
  return '<div class="empty-state"><span class="empty-icon" data-icon="users"></span><strong>还没有连接账号</strong><p>连接已登录的浏览器，即可导入你的第一个账号。</p><button class="text-button" data-action="connect">连接第一个账号 <span>→</span></button></div>';
}
function renderUsers(data) {
  users = Array.isArray(data.users) ? data.users : [];
  usersUpdated = Date.now();
  $("navAccountCount").textContent = users.length;
  $("accountCount").textContent = users.length;
  $("metricAccounts").textContent = "已连接 " + users.length + " 个账号";
  $("overviewAccounts").innerHTML = users.length
    ? users
        .slice(0, 5)
        .map(
          (u) =>
            '<div class="account-line"><span class="account-letter">M</span><div><strong>' +
            escapeHTML(u.name || "MiMo 账号") +
            '</strong><small class="mono">' +
            escapeHTML(u.userId) +
            "</small></div>" +
            statusFor(u) +
            '<span class="account-time">' +
            duration(u.remain_sec) +
            "</span></div>",
        )
        .join("")
    : emptyAccounts();
  $("usersBody").innerHTML = users.length
    ? users
        .map(
          (u, i) =>
            "<tr><td><strong>" +
            escapeHTML(u.name || "MiMo 账号") +
            '</strong><small class="mono">' +
            escapeHTML(u.userId) +
            "</small></td><td>" +
            statusFor(u) +
            '</td><td><span data-countdown="' +
            i +
            '">' +
            duration(u.remain_sec) +
            '</span><div class="progress"><div class="progress-bar" data-progress="' +
            i +
            '"></div></div></td><td><span class="badge ' +
            (u.has_credentials ? "success" : "warning") +
            '">' +
            (u.has_credentials ? "已安全保存" : "待补充") +
            '</span></td><td class="align-right"><button class="icon-button" data-delete-user="' +
            escapeHTML(u.userId) +
            '" aria-label="删除账号 ' +
            escapeHTML(u.userId) +
            '" title="删除账号"><span data-icon="trash"></span></button></td></tr>',
        )
        .join("")
    : '<tr><td colspan="5">' + emptyAccounts() + "</td></tr>";
  updateCountdowns();
  icons($("overviewAccounts"));
  icons($("usersBody"));
}
function updateCountdowns() {
  const elapsed = Math.floor((Date.now() - usersUpdated) / 1000);
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    const u = users[el.dataset.countdown];
    if (u)
      el.textContent = duration(Math.max(0, number(u.remain_sec) - elapsed));
  });
  document.querySelectorAll("[data-progress]").forEach((el) => {
    const u = users[el.dataset.progress];
    if (u)
      el.style.width =
        Math.min(100, Math.max(0, (number(u.remain_sec) - elapsed) / 864)) +
        "%";
  });
}
function renderStatus(data) {
  const connected = number(data.active_clients);
  const available = number(data.available_clients);
  $("metricNodes").textContent = available;
  if (available > 0) {
    $("heroState").textContent = "服务运行中";
    $("statusTitle").textContent = "网关已就绪";
    $("statusText").textContent = available + " 个 MiMo 节点可接收 API 请求。";
  } else if (data.deployment && !data.deployment.ready) {
    $("heroState").textContent = "部署不完整";
    $("statusTitle").textContent = "桥接组件未就绪";
    $("statusText").textContent = data.deployment.message;
  } else {
    $("heroState").textContent = connected ? "节点暂不可用" : "等待连接";
    $("statusTitle").textContent = connected
      ? "暂无可用的模型节点"
      : "模型节点尚未连接";
    $("statusText").textContent =
      "账号凭据已保存或实例就绪，不代表 API 可用。请检查节点连接状态。";
  }
}
function renderStats(data) {
  const total = number(data.requests?.total),
    succeeded = number(data.requests?.succeeded),
    failed = number(data.requests?.failed);
  $("metricRate").innerHTML = total
    ? ((succeeded / total) * 100).toFixed(1) + "<em>%</em>"
    : "—";
  $("metricRequests").textContent = total
    ? "累计 " + compact(total) + " 次请求"
    : "暂无请求，不计算成功率";
  $("metricLatency").textContent = milliseconds(data.latency?.avg_ms);
  $("metricTTFT").textContent =
    "首字延迟 " + milliseconds(data.first_byte_latency?.avg_ms);
  const routes = data.routes || {};
  let input = 0,
    output = 0,
    tokens = 0;
  Object.values(routes).forEach((r) => {
    input += number(r.tokens?.prompt_tokens);
    output += number(r.tokens?.completion_tokens);
    tokens += number(r.tokens?.total_tokens);
  });
  $("metricTokens").textContent = compact(tokens);
  $("metricTokenDetail").textContent =
    "输入 " + compact(input) + " · 输出 " + compact(output);
  const uptime = number(data.uptime_seconds);
  $("monUptime").textContent =
    Math.floor(uptime / 86400) +
    "天 " +
    Math.floor((uptime % 86400) / 3600) +
    "小时 " +
    Math.floor((uptime % 3600) / 60) +
    "分";
  $("monStartedAt").textContent =
    "启动于 " +
    new Date(Date.now() - uptime * 1000).toLocaleString("zh-CN", {
      hour12: false,
    });
  $("monRequests").textContent = compact(total);
  $("monFailures").textContent =
    "成功 " + compact(succeeded) + " · 失败 " + compact(failed);
  $("monRoutesBody").innerHTML = Object.keys(routes).length
    ? Object.entries(routes)
        .map(
          ([name, r]) =>
            '<tr><td class="mono">' +
            escapeHTML(name) +
            "</td><td>" +
            compact(r.requests?.total) +
            "</td><td>" +
            (number(r.requests?.total)
              ? (
                  (number(r.requests.succeeded) / r.requests.total) *
                  100
                ).toFixed(1) + "%"
              : "—") +
            "</td><td>" +
            milliseconds(r.avg_latency_ms) +
            "</td><td>" +
            milliseconds(r.avg_first_byte_latency_ms) +
            "</td><td>" +
            compact(r.tokens?.total_tokens) +
            "</td></tr>",
        )
        .join("")
    : '<tr><td colspan="6" class="empty-state">暂无模型请求，完成客户端接入后将自动记录。</td></tr>';
}
function renderHistory(data) {
  const component = data.components?.[0];
  const history = Array.isArray(component?.history)
    ? component.history.slice(-48)
    : [];
  const hasRequests = history.some((item) => number(item.requests_total) > 0);
  $("monUptimePercent").textContent =
    hasRequests && Number.isFinite(component.uptime_percentage)
      ? component.uptime_percentage.toFixed(1) + "% 可用率"
      : "暂无请求数据";
  const bars = Array.from(
    { length: 48 },
    (_, i) => history[i - (48 - history.length)] || {},
  );
  $("monUptimeBars").innerHTML = bars
    .map((b) => {
      const state = ["operational", "degraded", "outage"].includes(b.status)
        ? b.status
        : "";
      const title =
        (b.timestamp
          ? new Date(b.timestamp * 1000).toLocaleTimeString("zh-CN") + " · "
          : "") +
        ({ operational: "正常", degraded: "波动", outage: "故障" }[state] ||
          "无请求") +
        " · " +
        number(b.requests_total) +
        " 次请求";
      return (
        '<div class="uptime-bar ' +
        state +
        '" title="' +
        escapeHTML(title) +
        '" aria-label="' +
        escapeHTML(title) +
        '"></div>'
      );
    })
    .join("");
}
function renderMappings(data) {
  const entries = Object.entries(data);
  $("mappingsBody").innerHTML = entries.length
    ? entries
        .map(
          ([source, target]) =>
            '<tr><td class="mono">' +
            escapeHTML(source) +
            '</td><td class="mono">' +
            escapeHTML(target) +
            '</td><td class="align-right"><button class="icon-button" data-delete-mapping="' +
            escapeHTML(source) +
            '" aria-label="删除映射 ' +
            escapeHTML(source) +
            '" title="删除映射"><span data-icon="trash"></span></button></td></tr>',
        )
        .join("")
    : '<tr><td colspan="3" class="empty-state">暂无映射，客户端可直接使用 MiMo 模型名称。</td></tr>';
  icons($("mappingsBody"));
}
async function refresh() {
  if (!authenticated || document.hidden) return;
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  refreshing = true;
  const current = epoch;
  $("refreshBtn").disabled = true;
  const tasks = [
    ["/api/system/status", renderStatus],
    ["/api/stats", renderStats],
    ["/api/users/list", renderUsers],
  ];
  if (activeTab === "mappings")
    tasks.push(["/api/model_mapping", renderMappings]);
  if (activeTab === "monitor")
    tasks.push(["/api/status/history", renderHistory]);
  try {
    const outcomes = await Promise.allSettled(
      tasks.map(async ([path, render]) => {
        const data = await api(path);
        if (authenticated && epoch === current) render(data);
      }),
    );
    if (!authenticated || current !== epoch) return;
    const failures = outcomes.filter((o) => o.status === "rejected");
    $("connectionNotice").classList.toggle("hidden", failures.length === 0);
    $("connectionNotice").textContent = failures.length
      ? "部分数据未更新，请检查网关连接后刷新。"
      : "";
    if (outcomes[0].status === "rejected") {
      $("heroState").textContent = "连接异常";
      $("statusTitle").textContent = "暂时无法连接网关";
      $("statusText").textContent =
        "正在等待后端响应，显示的数据可能不是最新状态。";
    }
    $("lastUpdated").textContent = failures.length
      ? "刷新失败 · 部分数据未更新"
      : "更新于 " + new Date().toLocaleTimeString("zh-CN", { hour12: false });
  } finally {
    refreshing = false;
    $("refreshBtn").disabled = false;
    if (refreshAgain) {
      refreshAgain = false;
      queueMicrotask(refresh);
    }
  }
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (authenticated)
    pollTimer = setTimeout(async () => {
      await refresh();
      schedulePoll();
    }, 10000);
}
async function enter(session) {
  epoch++;
  authenticated = true;
  $("loadingShell").classList.add("hidden");
  $("authShell").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("adminName").textContent = session.username || "管理员";
  $("webAuthBadge").textContent = session.enabled
    ? "管理会话已认证"
    : "管理认证未启用";
  $("logoutBtn").classList.toggle("hidden", !session.enabled);
  $("aiAuthBadge").textContent = session.ai_auth_enabled
    ? "API 已保护"
    : "API 未配置认证";
  switchTab(
    titles[location.hash.slice(1)] ? location.hash.slice(1) : "overview",
  );
  await refresh();
  schedulePoll();
}
function connect() {
  if (!authenticated) return;
  $("connectDialog").showModal();
}
function confirmAction(title, message) {
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  const dialog = $("confirmDialog");
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "confirm"),
      { once: true },
    ),
  );
}
async function removeUser(id, button) {
  if (
    !(await confirmAction(
      "删除账号",
      "删除账号 " + id + " 后，对应运行环境将停止。",
    ))
  )
    return;
  await busy(button, async () => {
    await api("/api/users/delete/" + encodeURIComponent(id), {
      method: "DELETE",
    });
    toast("账号已删除");
    await refresh();
  });
}
async function removeMapping(name, button) {
  if (!(await confirmAction("删除映射", "删除 " + name + " 的路由规则？")))
    return;
  await busy(button, async () => {
    await api("/api/model_mapping/" + encodeURIComponent(name), {
      method: "DELETE",
    });
    toast("映射已删除");
    await refresh();
  });
}
function updatePairing() {
  if (!pairingExpires) return;
  const remaining = Math.max(0, pairingExpires - Math.floor(Date.now() / 1000));
  $("pairingExpiry").textContent = remaining
    ? "剩余 " +
      Math.floor(remaining / 60) +
      ":" +
      String(remaining % 60).padStart(2, "0")
    : "配对码已过期";
  $("copyPairingBtn").disabled = !remaining;
  if (!remaining) {
    $("pairingCode").value = "";
    pairingExpires = 0;
    $("pairingStatus").textContent = "配对码已过期，请重新生成。";
  }
}
document.addEventListener("click", (event) => {
  const el = event.target.closest("button,a");
  if (!el) return;
  if (el.dataset.tab) {
    event.preventDefault();
    switchTab(el.dataset.tab);
  }
  if (el.dataset.action === "connect") connect();
  if (el.dataset.close) $(el.dataset.close).close();
  if (el.dataset.copy)
    copy(
      location.origin + (el.dataset.copy === "openai" ? "/v1" : "/anthropic"),
    );
  if (el.dataset.deleteUser) removeUser(el.dataset.deleteUser, el);
  if (el.dataset.deleteMapping) removeMapping(el.dataset.deleteMapping, el);
});
$("refreshBtn").addEventListener("click", refresh);
$("loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  busy($("loginBtn"), async () => {
    $("loginError").textContent = "";
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: $("loginUsername").value.trim(),
          password: $("loginPassword").value,
        }),
      });
      $("loginPassword").value = "";
      await enter(await api("/api/auth/session"));
    } catch (error) {
      $("loginError").textContent =
        error.message === "请先登录" ? "用户名或密码错误" : error.message;
    }
  });
});
$("logoutBtn").addEventListener("click", () =>
  busy($("logoutBtn"), async () => {
    await api("/api/auth/logout", { method: "POST" });
    stopSession();
    toast("已退出登录");
  }),
);
$("rebuildBtn").addEventListener("click", async () => {
  if (
    !(await confirmAction(
      "重建运行节点",
      "将重新调度全部账号的运行环境，当前请求可能中断。",
    ))
  )
    return;
  busy($("rebuildBtn"), async () => {
    await api("/api/rebuild", { method: "POST" });
    toast("重建请求已提交");
    await refresh();
  });
});
$("mappingForm").addEventListener("submit", (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const source = $("mappingSource").value.trim(),
      target = $("mappingTarget").value.trim();
    if (!source || !target) throw new Error("请填写完整的模型名称");
    const current = await api("/api/model_mapping");
    // Use a computed property rather than assigning through Object.prototype.
    await api("/api/model_mapping", {
      method: "PUT",
      body: JSON.stringify({ ...current, [source]: target }),
    });
    $("mappingForm").reset();
    toast("映射已保存");
    await refresh();
  });
});
$("generatePairingBtn").addEventListener("click", () =>
  busy($("generatePairingBtn"), async () => {
    const url = new URL(location.origin);
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      throw new Error("请通过 HTTPS 访问远程网关后生成配对码");
    const data = await api("/api/sync/pairing", { method: "POST", body: "{}" });
    if (!$("connectDialog").open || !authenticated) return;
    pairingExpires = data.expires_at;
    $("pairingCode").value = JSON.stringify({
      version: 1,
      server: location.origin,
      token: data.token,
      expires_at: data.expires_at,
    });
    $("pairingResult").classList.remove("hidden");
    $("pairingStatus").textContent = "在扩展中核对目标地址：" + location.origin;
    $("copyPairingBtn").disabled = false;
    updatePairing();
  }),
);
$("copyPairingBtn").addEventListener("click", () => {
  updatePairing();
  if (pairingExpires) copy($("pairingCode").value);
});
$("connectDialog").addEventListener("close", () => {
  $("pairingCode").value = "";
  $("cookieInput").value = "";
  $("pairingResult").classList.add("hidden");
  $("pairingStatus").textContent = "";
  pairingExpires = 0;
  refresh();
});
$("importForm").addEventListener("submit", (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const raw = $("cookieInput").value.trim();
    if (!raw) throw new Error("请粘贴完整凭据");
    const result = await api("/api/users/add", {
      method: "POST",
      body: JSON.stringify({ raw_text: raw }),
    });
    $("cookieInput").value = "";
    $("connectDialog").close();
    toast("账号 " + result.userId + " 已导入");
    await refresh();
  });
});
$("copyConfigBtn").addEventListener("click", () =>
  copy(
    "OpenAI Base URL: " +
      location.origin +
      "/v1\nAnthropic Base URL: " +
      location.origin +
      "/anthropic\nAuthorization: Bearer <API_KEY>",
  ),
);
window.addEventListener("hashchange", () => {
  const tab = location.hash.slice(1);
  if (tab !== activeTab && titles[tab]) switchTab(tab);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refresh();
    schedulePoll();
  } else clearTimeout(pollTimer);
});
window.addEventListener("pagehide", () => {
  clearTimeout(pollTimer);
  requestController.abort();
  $("pairingCode").value = "";
  $("cookieInput").value = "";
  $("loginPassword").value = "";
  pairingExpires = 0;
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
setInterval(() => {
  if (!document.hidden) {
    updateCountdowns();
    updatePairing();
  }
}, 1000);
icons();
renderHistory({});
$("heroEndpoint").textContent = location.origin + "/v1";
$("quickBaseUrl").textContent = location.origin + "/v1";
$("quickClaudeUrl").textContent = location.origin + "/anthropic";
(async () => {
  try {
    const session = await api("/api/auth/session");
    $("loginUsername").value = session.username || "admin";
    if (session.authenticated) await enter(session);
    else stopSession();
  } catch {
    stopSession();
    $("loginError").textContent = "无法连接网关，请检查服务状态后重新登录。";
  }
})();
