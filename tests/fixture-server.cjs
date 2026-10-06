// Local-only UI fixture server. Never used by the gateway or production build.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
let users = [],
  mappings = {},
  lastImport = "",
  errorPath = "",
  requests = 0,
  deployment = { ready: true, code: "READY" };
const token = () => crypto.randomBytes(32).toString("base64url");
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (data, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body = {};
  try {
    body = JSON.parse(raw || "{}");
  } catch {}
  if (url.pathname === "/__test/reset") {
    users = [];
    mappings = {};
    lastImport = "";
    errorPath = "";
    requests = 0;
    deployment = { ready: true, code: "READY" };
    return json({ ok: true });
  }
  if (url.pathname === "/__test/state") {
    if (req.method === "POST") {
      if (body.users) users = body.users;
      if (body.deployment) deployment = body.deployment;
      if (body.mappings) mappings = body.mappings;
      if (body.errorPath !== undefined) errorPath = body.errorPath;
      requests = body.requests || 0;
    }
    return json({ users, mappings, lastImport });
  }
  if (url.pathname === errorPath)
    return json({ detail: "fixture failure" }, 503);
  if (url.pathname === "/api/auth/session")
    return json({
      enabled: true,
      authenticated: (req.headers.cookie || "").includes("fixture_session="),
      username: "admin",
      ai_auth_enabled: true,
    });
  if (url.pathname === "/api/auth/login") {
    if (body.password !== "fixture-only")
      return json({ detail: "用户名或密码错误" }, 401);
    res.setHeader(
      "Set-Cookie",
      "fixture_session=" + token() + "; HttpOnly; SameSite=Strict; Path=/",
    );
    return json({ ok: true });
  }
  if (url.pathname === "/api/auth/logout") {
    res.setHeader("Set-Cookie", "fixture_session=; Max-Age=0; Path=/");
    return json({ ok: true });
  }
  if (
    url.pathname.startsWith("/api/") &&
    !(req.headers.cookie || "").includes("fixture_session=")
  )
    return json({ detail: "unauthorized" }, 401);
  if (url.pathname === "/api/system/status")
    return json({
      active_clients: users.filter((u) => u.api_status === "AVAILABLE").length,
      available_clients: users.filter((u) => u.api_status === "AVAILABLE")
        .length,
      deployment,
    });
  if (url.pathname === "/api/users/list") return json({ users });
  if (url.pathname === "/api/users/add") {
    lastImport = body.raw_text;
    users.push({
      userId: "12345",
      name: "新连接账号",
      claw_status: "QUEUED",
      remain_sec: 0,
      has_credentials: true,
    });
    return json({ ok: true, userId: "12345" });
  }
  if (url.pathname.startsWith("/api/users/delete/")) {
    users = users.filter(
      (u) => u.userId !== decodeURIComponent(url.pathname.split("/").pop()),
    );
    return json({ ok: true });
  }
  if (url.pathname === "/api/sync/pairing")
    return json(
      {
        token: token(),
        expires_at: Math.floor(Date.now() / 1000) + 300,
        expires_in: 300,
      },
      201,
    );
  if (url.pathname === "/api/rebuild") return json({ ok: true });
  if (url.pathname === "/api/model_mapping") {
    if (req.method === "PUT") mappings = body;
    return json(mappings);
  }
  if (url.pathname.startsWith("/api/model_mapping/")) {
    delete mappings[
      decodeURIComponent(url.pathname.slice("/api/model_mapping/".length))
    ];
    return json({ ok: true });
  }
  if (url.pathname === "/api/stats")
    return json({
      uptime_seconds: 9813,
      requests: { total: requests, succeeded: requests, failed: 0 },
      latency: { avg_ms: requests ? 258.4 : 0 },
      first_byte_latency: { avg_ms: requests ? 134.6 : 0 },
      routes: requests
        ? {
            "mimo-v2.5-pro": {
              requests: { total: requests, succeeded: requests },
              avg_latency_ms: 258.4,
              avg_first_byte_latency_ms: 134.6,
              tokens: {
                total_tokens: 126804,
                prompt_tokens: 73100,
                completion_tokens: 53704,
              },
            },
          }
        : {},
    });
  if (url.pathname === "/api/status/history") return json({ components: [] });
  let file;
  if (url.pathname === "/" || url.pathname === "/webui") file = "webui.html";
  else if (url.pathname.startsWith("/assets/"))
    file = "web/" + url.pathname.slice(8);
  else if (url.pathname === "/mimo_sync.user.js") file = "mimo_sync.user.js";
  if (!file || !path.resolve(root, file).startsWith(root + path.sep)) {
    res.writeHead(404);
    return res.end();
  }
  try {
    const data = fs.readFileSync(path.join(root, file));
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      }[path.extname(file)] || "text/plain",
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(18089, "127.0.0.1", () =>
  console.log("UI fixture listening on 127.0.0.1:18089"),
);
