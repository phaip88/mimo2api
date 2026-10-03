const { test, expect } = require("@playwright/test");
async function login(page) {
  await page.goto("/webui");
  await page.getByLabel("用户名", { exact: true }).fill("admin");
  await page.getByLabel("管理密码", { exact: true }).fill("fixture-only");
  await page.getByRole("button", { name: "登录", exact: false }).click();
  await expect(page.locator("#appShell")).toBeVisible();
  await expect(page.locator("#metricNodes")).not.toHaveText("—");
}
test.beforeEach(async ({ request }) => {
  await request.post("/__test/reset");
});
test("login, empty states and no third-party resources", async ({ page }) => {
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:18089")) external.push(r.url());
  });
  await login(page);
  await expect(page.locator("#metricRate")).toHaveText("—");
  await expect(page.getByText("还没有连接账号").first()).toBeVisible();
  await expect(page.locator("#heroState")).toHaveText("等待连接");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await page.screenshot({
    path: "test-results/overview-empty.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.locator("#authShell")).toBeVisible();
});
test("pairing modal, expiry and raw manual import", async ({
  page,
  request,
}) => {
  await page.clock.install();
  await login(page);
  await page.getByRole("button", { name: "连接账号", exact: true }).click();
  await page.getByRole("button", { name: "生成配对码", exact: true }).click();
  await expect(page.locator("#pairingCode")).not.toHaveValue("");
  const pairing = JSON.parse(await page.locator("#pairingCode").inputValue());
  expect(pairing.server).toBe("http://127.0.0.1:18089");
  expect(pairing.token).toHaveLength(43);
  await page.screenshot({ path: "test-results/connect-dialog.png" });
  await page.clock.fastForward(301000);
  await expect(page.locator("#pairingCode")).toHaveValue("");
  await expect(page.locator("#copyPairingBtn")).toBeDisabled();
  await page.locator(".manual-import summary").click();
  const raw =
    "userId\t12345\t.example\nserviceToken\tfixture\t.example\nph\tfixture\t.example";
  await page.getByLabel("Cookie、cURL、浏览器表格或 JSON").fill(raw);
  await page.getByRole("button", { name: "导入凭据", exact: true }).click();
  await expect(page.locator("#connectDialog")).not.toBeVisible();
  await expect(page.locator("#overviewAccounts")).toContainText("12345");
  expect((await (await request.get("/__test/state")).json()).lastImport).toBe(
    raw,
  );
  expect(await page.locator("#cookieInput").inputValue()).toBe("");
  expect(await page.locator("#pairingCode").inputValue()).toBe("");
});
test("mapping create/delete and tab navigation", async ({ page }) => {
  await login(page);
  await page.locator('.nav-item[data-tab="mappings"]').click();
  await page.getByLabel("客户端模型名称").fill("gpt-4o");
  await page.getByLabel("目标模型", { exact: true }).fill("mimo-v2.5-pro");
  await page.getByRole("button", { name: "保存映射" }).click();
  await expect(page.locator("#mappingsBody")).toContainText("gpt-4o");
  await page
    .getByRole("button", { name: "删除映射 gpt-4o", exact: true })
    .click();
  await page.locator("#confirmBtn").click();
  await expect(page.locator("#mappingsBody")).not.toContainText("gpt-4o");
  await page.locator('.nav-item[data-tab="monitor"]').click();
  await expect(page.locator("#monUptimeBars .uptime-bar")).toHaveCount(48);
  await expect(page.locator("#monUptimePercent")).toHaveText("暂无请求数据");
});
test("populated dashboard, escaped account text and mobile layout", async ({
  page,
  request,
}) => {
  await request.post("/__test/state", {
    data: {
      users: [
        {
          userId: "100001",
          name: "主要账号",
          claw_status: "AVAILABLE",
          remain_sec: 65000,
          has_credentials: true,
        },
        {
          userId: "100002",
          name: "<img src=x onerror=alert(1)>",
          claw_status: "<script>bad()</script>",
          remain_sec: 0,
          has_credentials: true,
        },
      ],
      requests: 1284,
    },
  });
  await login(page);
  await expect(page.locator("#metricNodes")).toHaveText("1");
  await expect(page.locator("#overviewAccounts img")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.locator('.nav-item[data-tab="accounts"]').click();
  await expect(
    page.getByRole("button", { name: "删除账号 100001" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "删除账号 100001" }).click();
  await page.locator("#confirmBtn").click();
  await expect(page.locator("#usersBody")).not.toContainText("100001");
});
test("API failures stay visible rather than showing false healthy state", async ({
  page,
  request,
}) => {
  await login(page);
  await request.post("/__test/state", {
    data: { errorPath: "/api/system/status" },
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.locator("#connectionNotice")).toBeVisible();
  await expect(page.locator("#heroState")).toHaveText("连接异常");
});
