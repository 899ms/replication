const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "src", "renderer", "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(projectRoot, "src", "renderer", "app.js"), "utf8");

test("run history navigation is actionable and backed by persisted run IPC", () => {
  assert.match(
    html,
    /<button class="rail-nav-item" data-rail-view="history" type="button">/,
    "history must be a real button instead of a decorative navigation item"
  );
  assert.match(html, /id="historyView"/);
  assert.match(html, /id="historyList"/);
  assert.match(renderer, /historyNav\.addEventListener\("click", showHistoryView\)/);
  assert.match(renderer, /window\.replication\.listRuns\(\)/);
  assert.match(renderer, /window\.replication\.getRun\(runId\)/);
  assert.match(renderer, /openButton\.addEventListener\("click", \(\) => openHistoryRun\(run\.id\)\)/);
  assert.doesNotMatch(renderer, /const\s+fakeHistory|const\s+mockRuns/i);
});
