// Native Firefox test with a new geckodriver profile and synthetic cookies only.
// Start geckodriver --allow-system-access --port 18444 first.
const path = require("node:path");
const assert = require("node:assert/strict");
const base = process.env.GECKODRIVER_URL || "http://127.0.0.1:18444";
async function wd(route, body, method = "POST") {
  const response = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok) throw Error(JSON.stringify(data));
  return data.value;
}
(async () => {
  let id;
  try {
    const options = {
      args: ["-headless"],
      prefs: {
        "browser.startup.page": 0,
        "browser.startup.homepage": "about:blank",
        "datareporting.policy.dataSubmissionEnabled": false,
      },
    };
    if (process.env.FIREFOX_BINARY) options.binary = process.env.FIREFOX_BINARY;
    const session = await wd("/session", {
      capabilities: {
        alwaysMatch: { browserName: "firefox", "moz:firefoxOptions": options },
      },
    });
    id = session.sessionId;
    await wd("/session/" + id + "/moz/addon/install", {
      path: path.resolve("extension"),
      temporary: true,
    });
    await wd("/session/" + id + "/moz/context", { context: "chrome" });
    const uuid = await wd("/session/" + id + "/execute/sync", {
      script:
        'return JSON.parse(Services.prefs.getCharPref("extensions.webextensions.uuids"))["mimo-connector@mimo2api.local"];',
      args: [],
    });
    await wd("/session/" + id + "/moz/context", { context: "content" });
    await wd("/session/" + id + "/url", {
      url: "moz-extension://" + uuid + "/popup.html",
    });
    const result = await wd("/session/" + id + "/execute/async", {
      script: `
   const done=arguments[arguments.length-1];
   (async()=>{
    for(const [name,value] of [['userId','12345'],['xiaomichatbot_serviceToken','fixture-http-only=='],['xiaomichatbot_ph','fixture-ph']])await browser.cookies.set({url:'https://aistudio.xiaomimimo.com/',name,value,httpOnly:true,secure:true,path:'/'});
    const cookies=await browser.cookies.getAll({url:'https://aistudio.xiaomimimo.com/'});
    const result=MimoConnector.selectCredentials(cookies);
    return {count:cookies.filter(c=>c.httpOnly).length,tokenMatches:result.xiaomichatbot_serviceToken==='fixture-http-only==',userId:result.userId,notExposedToDocument:!document.cookie.includes('fixture-http-only')};
   })().then(done,error=>done({error:String(error)}));
  `,
      args: [],
    });
    assert.equal(result.count, 3);
    assert.equal(result.tokenMatches, true);
    assert.equal(result.userId, "12345");
    assert.equal(result.notExposedToDocument, true);
    console.log(
      "PASS: Firefox " +
        session.capabilities.browserVersion +
        " native HttpOnly Cookie API, three fields, padding preserved.",
    );
  } finally {
    if (id) await wd("/session/" + id, undefined, "DELETE");
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
