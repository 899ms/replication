const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "src", "renderer", "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(projectRoot, "src", "renderer", "app.js"), "utf8");
const preload = fs.readFileSync(path.join(projectRoot, "src", "preload", "index.js"), "utf8");
const main = fs.readFileSync(path.join(projectRoot, "src", "main", "index.js"), "utf8");

test("MiniMax H3 is an actionable workbench module backed by runtime IPC", () => {
  assert.match(html, /data-rail-view="minimax-h3"/);
  assert.match(html, /id="minimaxH3View"/);
  assert.match(html, /id="refreshH3Button"/);
  assert.match(html, /id="openH3Button"/);
  assert.match(html, /id="h3ApiKey"/);
  assert.match(html, /id="h3ModelList"/);
  assert.match(html, /id="downloadH3ModelsButton"/);
  assert.match(html, /一键下载缺失模型/);
  assert.match(html, /huggingface\.co\/Comfy-Org\/MiniMax-H3/);
  assert.match(html, /在此处输入 MiniMax H3 \/ 3\.0 API/);
  assert.match(html, /data-h3-connector="ssh"/);
  assert.match(html, /id="h3SshHost"/);
  assert.match(renderer, /h3Nav\.addEventListener\("click", showH3View\)/);
  assert.match(renderer, /window\.replication\.getMinimaxH3Status\(\)/);
  assert.match(preload, /replication:minimax-h3-status/);
  assert.match(preload, /replication:minimax-h3-models/);
  assert.match(preload, /replication:open-minimax-h3-model-downloads/);
  assert.match(preload, /replication:save-minimax-h3-api/);
  assert.match(preload, /replication:test-minimax-h3-ssh/);
  assert.match(main, /getMinimaxH3Status\(\)/);
  assert.match(main, /openModelDownloads/);
});

test("the left rail exposes a provider-neutral video interface used by generation", () => {
  assert.match(html, /<strong>视频接口<\/strong>/);
  assert.match(html, /<h2>输入视频 API<\/h2>/);
  assert.match(html, /id="videoApiProviderName"/);
  assert.match(html, /id="videoApiEndpoint"/);
  assert.match(html, /id="videoApiUploadEndpoint"/);
  assert.match(html, /id="videoApiModel"/);
  assert.match(html, /id="videoApiKey"/);
  assert.match(html, /id="authorizationProvider"/);
  assert.doesNotMatch(html, /<dd>Kuaizi \/ Seedance 2\.0<\/dd>/);
  assert.match(renderer, /window\.replication\.saveVideoInterface/);
  assert.match(preload, /replication:save-video-interface/);
  assert.match(main, /VideoInterfaceConnectionManager/);
});

test("desktop workbench opens at the enlarged dimensions", () => {
  assert.match(main, /width:\s*1500/);
  assert.match(main, /height:\s*940/);
  assert.match(main, /minWidth:\s*1180/);
});

test("2.0.2 product version keeps the 2.0 workbench branding", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.equal(pkg.version, "2.0.2");
  assert.match(html, /<title>工作台复刻 2\.0<\/title>/);
  assert.match(html, /DESKTOP WORKBENCH · 2\.0/);
  assert.match(main, /title:\s*"工作台复刻 2\.0"/);
});
