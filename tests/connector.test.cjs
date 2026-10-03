const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const crypto = require("node:crypto");
const context = vm.createContext({ URL, AbortSignal, fetch });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../extension/connector.js"), "utf8"),
  context,
);
const C = context.MimoConnector;
const token = () => crypto.randomBytes(32).toString("base64url");
const pair = () => ({
  version: 1,
  server: "https://gateway.example",
  token: token(),
  expires_at: Math.floor(Date.now() / 1000) + 300,
});
const cookie = (name, value, extra = {}) => ({
  name,
  value,
  domain: ".xiaomimimo.com",
  path: "/",
  httpOnly: true,
  secure: true,
  ...extra,
});
const fixture = () => [
  cookie("userId", "12345"),
  cookie("xiaomichatbot_serviceToken", "fixture-token=="),
  cookie("xiaomichatbot_ph", "fixture-ph"),
];
test("reads HttpOnly cookies and preserves token padding", () => {
  const result = C.selectCredentials(fixture());
  assert.equal(result.userId, "12345");
  assert.equal(result.xiaomichatbot_serviceToken, "fixture-token==");
});
test("ignores unrelated domains, expired cookies and other partitions", () => {
  assert.throws(
    () =>
      C.selectCredentials(
        fixture().map((c) => ({ ...c, domain: ".xiaomi.com" })),
      ),
    /缺少/,
  );
  assert.throws(
    () =>
      C.selectCredentials(fixture().map((c) => ({ ...c, expirationDate: 1 }))),
    /缺少/,
  );
  assert.throws(
    () =>
      C.selectCredentials(
        fixture().map((c) => ({
          ...c,
          partitionKey: { topLevelSite: "https://other.example" },
        })),
      ),
    /缺少/,
  );
  assert.throws(
    () =>
      C.selectCredentials(
        fixture().map((c) => ({ ...c, firstPartyDomain: "other.example" })),
      ),
    /缺少/,
  );
});
test("does not confuse cUserId with userId", () => {
  const cookies = fixture();
  cookies[0].name = "cUserId";
  assert.throws(() => C.selectCredentials(cookies), /userId/);
});
test("selects service-specific names and the matching cookie path", () => {
  const cookies = [
    cookie("serviceToken", "unrelated"),
    cookie("ph", "unrelated"),
    ...fixture(),
    cookie("xiaomichatbot_serviceToken", "specific", {
      domain: "aistudio.xiaomimimo.com",
      path: "/chat",
    }),
  ];
  assert.equal(
    C.selectCredentials(
      cookies,
      undefined,
      "https://aistudio.xiaomimimo.com/chat/new",
    ).xiaomichatbot_serviceToken,
    "specific",
  );
  assert.equal(
    C.selectCredentials(
      cookies,
      undefined,
      "https://aistudio.xiaomimimo.com/chatty",
    ).xiaomichatbot_serviceToken,
    "fixture-token==",
  );
});
test("accepts HTTPS and local HTTP only", () => {
  for (const url of [
    "https://gateway.example",
    "http://localhost:8088",
    "http://127.0.0.1:8088",
    "http://[::1]:8088",
  ])
    assert.equal(C.validateServer(url), url);
  for (const url of [
    "http://gateway.example",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com/?key=value",
    "https://example.com/#value",
    "file:///tmp/test",
    "javascript:alert(1)",
  ])
    assert.throws(() => C.validateServer(url));
});
test("pairing schema and expiry are validated", () => {
  assert.equal(
    C.parsePairing(JSON.stringify(pair())).server,
    "https://gateway.example",
  );
  for (const value of [
    "bad",
    JSON.stringify({ ...pair(), token: "short" }),
    JSON.stringify({ ...pair(), expires_at: 1 }),
    JSON.stringify({ ...pair(), version: 2 }),
  ])
    assert.throws(() => C.parsePairing(value));
});
test("transmits once without cookies or redirect following", async () => {
  const pairing = C.parsePairing(JSON.stringify(pair()));
  let calls = 0;
  const result = await C.send(
    pairing,
    C.selectCredentials(fixture()),
    async (url, options) => {
      calls++;
      assert.equal(url, "https://gateway.example/api/sync/import");
      assert.equal(options.redirect, "error");
      assert.equal(options.credentials, "omit");
      assert.equal(options.headers.Authorization, "Bearer " + pairing.token);
      assert.equal(JSON.parse(options.body).userId, "12345");
      return { ok: true, json: async () => ({ ok: true, userId: "12345" }) };
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.userId, "12345");
});
test("treats HTTP 200 error payloads and invalid JSON as failure", async () => {
  const pairing = C.parsePairing(JSON.stringify(pair()));
  await assert.rejects(
    C.send(pairing, {}, async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false }),
    })),
    /同步失败/,
  );
  await assert.rejects(
    C.send(pairing, {}, async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: "已过期" }),
    })),
    /已过期/,
  );
  await assert.rejects(
    C.send(pairing, {}, async () => ({
      json: async () => {
        throw Error("html");
      },
    })),
    /非 JSON/,
  );
});
test("manifest requests no browsing or broad required host permissions", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../extension/manifest.json")),
  );
  assert.deepEqual(manifest.permissions, ["cookies", "activeTab"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://aistudio.xiaomimimo.com/*",
  ]);
});
test("popup respects active Firefox container and clears pairing after sync", async () => {
  const elements = Object.fromEntries(
    ["pairing", "status", "sync", "destination"].map((id) => [
      id,
      {
        value: "",
        dataset: {},
        addEventListener(type, fn) {
          this[type] = fn;
        },
      },
    ]),
  );
  elements.pairing.value = JSON.stringify(pair());
  let filter,
    permissions = 0;
  const browser = {
    permissions: {
      request: async () => {
        permissions++;
        return true;
      },
    },
    tabs: {
      query: async () => [
        {
          url: "https://aistudio.xiaomimimo.com/",
          cookieStoreId: "firefox-container-3",
        },
      ],
    },
    cookies: {
      getAll: async (f) => {
        filter = f;
        return fixture();
      },
    },
  };
  const ctx = vm.createContext({
    browser,
    URL,
    document: { getElementById: (id) => elements[id] },
    MimoConnector: { ...C, send: async () => ({ userId: "12345" }) },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../extension/popup.js"), "utf8"),
    ctx,
  );
  await elements.sync.click();
  assert.equal(permissions, 1);
  assert.equal(filter.storeId, "firefox-container-3");
  assert.equal(elements.pairing.value, "");
  assert.equal(elements.status.dataset.kind, "success");
  assert.equal(elements.sync.disabled, false);
});
test("denied host permission prevents cookie access and network transmission", async () => {
  const elements = Object.fromEntries(
    ["pairing", "status", "sync", "destination"].map((id) => [
      id,
      {
        value: "",
        dataset: {},
        addEventListener(type, fn) {
          this[type] = fn;
        },
      },
    ]),
  );
  elements.pairing.value = JSON.stringify(pair());
  const browser = {
    permissions: { request: async () => false },
    tabs: {
      query: () => {
        throw Error("should not read tabs");
      },
    },
  };
  const ctx = vm.createContext({
    browser,
    URL,
    document: { getElementById: (id) => elements[id] },
    MimoConnector: C,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../extension/popup.js"), "utf8"),
    ctx,
  );
  await elements.sync.click();
  assert.match(elements.status.textContent, /未授予/);
  assert.equal(elements.status.dataset.kind, "error");
});
