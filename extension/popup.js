"use strict";
const api = globalThis.browser || globalThis.chrome;
const input = document.getElementById("pairing");
const status = document.getElementById("status");
const button = document.getElementById("sync");
input.addEventListener("input", () => {
  try {
    document.getElementById("destination").textContent =
      MimoConnector.parsePairing(input.value).server;
  } catch {
    document.getElementById("destination").textContent = "等待有效配对码";
  }
});
button.addEventListener("click", async () => {
  button.disabled = true;
  status.dataset.kind = "";
  status.textContent = "正在读取当前标签页的登录凭据…";
  try {
    const pairing = MimoConnector.parsePairing(input.value);
    // Must run directly within the click gesture, before any await (Firefox).
    const granted = await api.permissions.request({
      origins: [pairing.server + "/*"],
    });
    if (!granted) throw new Error("未授予网关访问权限，本次未发送凭据");
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (
      !tab?.url ||
      new URL(tab.url).origin !== new URL(MimoConnector.STUDIO).origin
    )
      throw new Error(
        "请先切换到已登录的 Xiaomi AI Studio 标签页，再打开本扩展",
      );
    const filter = { url: tab.url };
    if (tab.cookieStoreId) filter.storeId = tab.cookieStoreId;
    // FPI may require an explicit firstPartyDomain in Firefox.
    let cookies;
    try {
      cookies = await api.cookies.getAll(filter);
    } catch (error) {
      if (!/firstPartyDomain/i.test(String(error))) throw error;
      cookies = await api.cookies.getAll({
        ...filter,
        firstPartyDomain: "xiaomimimo.com",
      });
    }
    const payload = MimoConnector.selectCredentials(
      cookies,
      undefined,
      tab.url,
    );
    const result = await MimoConnector.send(pairing, payload);
    input.value = "";
    status.dataset.kind = "success";
    status.textContent =
      "账号 " + result.userId + " 已同步。配对码已失效，可返回控制台查看状态。";
  } catch (error) {
    status.dataset.kind = "error";
    status.textContent = ["TimeoutError", "AbortError"].includes(error.name)
      ? "请求超时。先查看控制台是否已导入，再生成新配对码。"
      : error.message;
  } finally {
    button.disabled = false;
  }
});
