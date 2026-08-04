const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  MinimaxH3ConnectionManager,
  normalizeApiEndpoint,
  normalizeSshConfig
} = require("../src/main/minimax-h3-connections");

const secretBox = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
  decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, "")
};

test("H3 API credentials are encrypted at rest and never returned to the renderer", async (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "replication-h3-config-"));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  let authorizationHeader = null;
  const manager = new MinimaxH3ConnectionManager({
    dataRoot,
    secretBox,
    fetcher: async (_url, options) => {
      authorizationHeader = options.headers.Authorization;
      return { ok: true, status: 200 };
    }
  });

  const publicApi = manager.saveApi({
    endpoint: "https://h3.example.com/",
    model: "MiniMax-H3",
    apiKey: "secret-value"
  });
  const storedText = fs.readFileSync(manager.configFile, "utf8");
  assert.equal(publicApi.hasApiKey, true);
  assert.equal("apiKey" in publicApi, false);
  assert.doesNotMatch(storedText, /secret-value/);
  assert.equal(fs.statSync(manager.configFile).mode & 0o777, 0o600);

  const result = await manager.testApi();
  assert.equal(result.verified, true);
  assert.equal(authorizationHeader, "Bearer secret-value");
});

test("SSH connector uses argument-safe BatchMode connection testing", async (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "replication-h3-ssh-"));
  const identityFile = path.join(dataRoot, "id_ed25519");
  fs.writeFileSync(identityFile, "fixture");
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  let invocation = null;
  const manager = new MinimaxH3ConnectionManager({
    dataRoot,
    secretBox,
    execFile: async (...args) => {
      invocation = args;
      return { stdout: "REPLICATION_H3_SSH_OK", stderr: "" };
    }
  });

  manager.saveSsh({
    host: "gpu.example.com",
    username: "root",
    port: 2202,
    workspacePath: "/root/ComfyUI",
    identityFile
  });
  const result = await manager.testSsh();
  assert.equal(result.ok, true);
  assert.equal(invocation[0], "ssh");
  assert.ok(invocation[1].includes("BatchMode=yes"));
  assert.ok(invocation[1].includes("root@gpu.example.com"));
  assert.ok(invocation[1].includes(identityFile));
});

test("connection inputs reject insecure remote API URLs and malformed SSH targets", () => {
  assert.throws(() => normalizeApiEndpoint("http://remote.example.com"), /HTTPS/);
  assert.equal(normalizeApiEndpoint("http://127.0.0.1:8000/"), "http://127.0.0.1:8000");
  assert.throws(
    () => normalizeSshConfig({ host: "-bad", username: "root", port: 22 }),
    /SSH 主机/
  );
});
