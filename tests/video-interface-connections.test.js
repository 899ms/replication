const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  VideoInterfaceConnectionManager,
  normalizeEndpoint,
  normalizeTaskPath
} = require("../src/main/video-interface-connections");

function secretBox() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`sealed:${value}`),
    decryptString: (value) => value.toString().replace(/^sealed:/, "")
  };
}

test("video interface credentials stay encrypted and produce a generic runtime environment", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "replication-video-interface-"));
  const manager = new VideoInterfaceConnectionManager({
    dataRoot,
    secretBox: secretBox(),
    fetcher: async () => ({ ok: true, status: 200 })
  });

  const saved = manager.save({
    providerName: "我的视频云",
    apiBase: "https://video.example.com/v1",
    uploadBase: "https://upload.example.com/v1",
    taskPath: "/generations/tasks",
    model: "video-model-v2",
    apiKey: "api-secret",
    uploadToken: "upload-secret"
  });
  assert.equal(saved.configured, true);
  assert.equal("apiKey" in saved, false);
  assert.doesNotMatch(fs.readFileSync(manager.configPath, "utf8"), /api-secret|upload-secret/);

  const environment = manager.runtimeEnvironment({ requireConfigured: true });
  assert.equal(environment.VIDEO_INTERFACE_NAME, "我的视频云");
  assert.equal(environment.VIDEO_TASKS_ENDPOINT, "https://video.example.com/v1/generations/tasks");
  assert.equal(environment.VIDEO_API_KEY, "api-secret");
  assert.equal(environment.VIDEO_UPLOAD_TOKEN, "upload-secret");

  const result = await manager.testConnection();
  assert.equal(result.verified, true);
  assert.match(result.message, /我的视频云/);
});

test("video interface rejects unsafe remote URLs and malformed task paths", () => {
  assert.throws(() => normalizeEndpoint("http://video.example.com", "视频 API 地址"), /HTTPS/);
  assert.equal(normalizeEndpoint("http://127.0.0.1:8080/", "视频 API 地址"), "http://127.0.0.1:8080");
  assert.equal(normalizeTaskPath("/contents/generations/tasks/"), "/contents/generations/tasks");
  assert.throws(() => normalizeTaskPath("contents with spaces"), /任务路径/);
});
