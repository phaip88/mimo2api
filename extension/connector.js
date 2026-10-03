/* Shared, dependency-free logic. No credentials are persisted. */
(function (root) {
  "use strict";
  const STUDIO = "https://aistudio.xiaomimimo.com/";
  function validateServer(value) {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    )
      throw new Error("网关地址必须是完整源地址，不含路径、参数或用户名");
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
      throw new Error("远程网关必须使用 HTTPS；本机地址可以使用 HTTP");
    return url.origin;
  }
  function parsePairing(value, now = Date.now()) {
    let data;
    try {
      data = JSON.parse(value);
    } catch {
      throw new Error("请粘贴控制台生成的完整配对码");
    }
    if (
      data.version !== 1 ||
      typeof data.token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(data.token)
    )
      throw new Error("配对码格式无效");
    if (!Number.isFinite(data.expires_at) || data.expires_at * 1000 <= now)
      throw new Error("配对码已过期，请重新生成");
    return {
      server: validateServer(data.server),
      token: data.token,
      expiresAt: data.expires_at,
    };
  }
  function selectCredentials(cookies, now = Date.now() / 1000, page = STUDIO) {
    const target = new URL(page);
    if (target.origin !== new URL(STUDIO).origin)
      throw new Error("请在 Xiaomi AI Studio 标签页打开连接器");
    const valid = cookies
      .filter((c) => {
        const domain = (c.domain || "").replace(/^\./, "");
        const path = c.path || "/";
        const pathMatches =
          target.pathname === path ||
          (target.pathname.startsWith(path) &&
            (path.endsWith("/") || target.pathname[path.length] === "/"));
        const partition = c.partitionKey?.topLevelSite;
        return (
          ["aistudio.xiaomimimo.com", "xiaomimimo.com"].includes(domain) &&
          pathMatches &&
          (!c.expirationDate || c.expirationDate > now) &&
          (!c.firstPartyDomain ||
            ["xiaomimimo.com", "aistudio.xiaomimimo.com"].includes(
              c.firstPartyDomain,
            )) &&
          (!partition ||
            [
              "https://xiaomimimo.com",
              "https://aistudio.xiaomimimo.com",
            ].includes(partition))
        );
      })
      .sort(
        (a, b) =>
          (b.path || "/").length - (a.path || "/").length ||
          (b.domain || "").replace(/^\./, "").length -
            (a.domain || "").replace(/^\./, "").length,
      );
    const pick = (names) => {
      for (const name of names) {
        const c = valid.find((c) => c.name === name && c.value);
        if (c) return c.value;
      }
      return "";
    };
    const result = {
      userId: pick(["userId", "uid"]),
      xiaomichatbot_serviceToken: pick([
        "xiaomichatbot_serviceToken",
        "serviceToken",
      ]),
      xiaomichatbot_ph: pick(["xiaomichatbot_ph", "ph"]),
    };
    const missing = Object.entries(result)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length)
      throw new Error(
        "未读到完整登录凭据（缺少 " +
          missing.join("、") +
          "）。请确认当前标签页已登录，容器与账号一致。",
      );
    return result;
  }
  async function send(pairing, credentials, fetcher = fetch) {
    const response = await fetcher(pairing.server + "/api/sync/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + pairing.token,
      },
      body: JSON.stringify(credentials),
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(15000),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("网关返回非 JSON 响应，请检查网关地址");
    }
    if (!response.ok || data.ok !== true)
      throw new Error(
        data.detail || "同步失败（HTTP " + response.status + "）",
      );
    return data;
  }
  root.MimoConnector = {
    STUDIO,
    validateServer,
    parsePairing,
    selectCredentials,
    send,
  };
})(globalThis);
