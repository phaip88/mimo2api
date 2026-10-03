const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const path = require("node:path");
const source = fs.readFileSync(
  path.join(__dirname, "../mimo_sync.user.js"),
  "utf8",
);
function setup({ firefox = false, modern = false, available = true } = {}) {
  const elements = {};
  for (const id of ["#hint", "textarea", "button", "small", "details"])
    elements[id] = {
      value: "",
      hidden: false,
      addEventListener(name, fn) {
        this[name] = fn;
      },
    };
  const root = { innerHTML: "", querySelector: (name) => elements[name] };
  const host = { style: {}, attachShadow: () => root };
  let calls = 0;
  const cookies = [
    { name: "userId", value: "12345" },
    { name: "serviceToken", value: "fixture==" },
    { name: "ph", value: "fixture" },
  ].map((c) => ({ ...c, domain: ".xiaomimimo.com", httpOnly: true }));
  const ctx = {
    navigator: {
      userAgent: firefox ? "Mozilla Firefox/140.0" : "Chrome/140.0",
    },
    document: { createElement: () => host, body: { appendChild() {} } },
    location: { href: "https://aistudio.xiaomimimo.com/" },
    setTimeout,
    clearTimeout,
    URL,
    Date,
    GM_xmlhttpRequest: (opts) => {
      calls++;
      assert.equal(opts.anonymous, true);
      assert.ok(opts.timeout);
      opts.onload({
        status: 200,
        responseText: '{"ok":true,"userId":"12345"}',
      });
    },
  };
  if (available) {
    if (modern) ctx.GM = { cookie: { list: async () => cookies } };
    else ctx.GM_cookie = { list: (filter, cb) => cb(cookies) };
  }
  vm.runInNewContext(source, ctx);
  elements.textarea.value = JSON.stringify({
    version: 1,
    server: "https://gateway.example",
    token: crypto.randomBytes(32).toString("base64url"),
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
  return { elements, calls: () => calls };
}
test("Firefox displays native extension instructions without misleading fallback", () => {
  const { elements, calls } = setup({ firefox: true });
  assert.equal(elements.button.hidden, true);
  assert.equal(elements.textarea.hidden, true);
  assert.match(elements["#hint"].textContent, /原生扩展/);
  assert.equal(calls(), 0);
});
for (const modern of [false, true])
  test(
    "works with " + (modern ? "Promise GM.cookie" : "callback GM_cookie"),
    async () => {
      const { elements, calls } = setup({ modern });
      await elements.button.click();
      assert.equal(calls(), 1);
      assert.equal(elements.textarea.value, "");
      assert.equal(elements.button.disabled, false);
      assert.match(elements.small.textContent, /已同步/);
    },
  );
test("missing Cookie API is an actionable failure, not a false success", async () => {
  const { elements, calls } = setup({ available: false });
  await elements.button.click();
  assert.equal(calls(), 0);
  assert.match(elements.small.textContent, /原生扩展/);
});
test("does not store admin passwords or scrape localStorage", () => {
  assert.doesNotMatch(
    source,
    /GM_setValue|localStorage|DEFAULT_KEY|X-WebUI-Password/,
  );
});
