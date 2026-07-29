const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  importVideoFromLink,
  normalizeVideoLink
} = require("../src/main/video-link-importer");

test("normalizes only http and https video links", () => {
  assert.equal(normalizeVideoLink(" https://example.com/watch/1 "), "https://example.com/watch/1");
  assert.equal(
    normalizeVideoLink(
      "5.38 03/17 :1pm SYm:/ T@L.WM # 少女感穿搭 https://v.douyin.com/YqKAeiRO5co/ 复制此链接，打开Dou音搜索，直接观看视频!"
    ),
    "https://v.douyin.com/YqKAeiRO5co/"
  );
  assert.equal(
    normalizeVideoLink("复制 https://v.douyin.com/abc123/，打开 Douyin 搜索。"),
    "https://v.douyin.com/abc123/"
  );
  assert.throws(() => normalizeVideoLink(""), /缺少视频链接/);
  assert.throws(() => normalizeVideoLink("not-a-url"), /没有识别到/);
  assert.throws(() => normalizeVideoLink("file:///tmp/source.mp4"), /没有识别到/);
});

test("imports a linked video through the MeowLoad adapter and validates the downloaded file", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "replication-link-import-"));
  const fakeMeowload = path.join(dataRoot, "fake-meowload.js");
  fs.writeFileSync(
    fakeMeowload,
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const args = process.argv.slice(2);",
      "if (args[0] === 'info') { console.log('media: video'); process.exit(0); }",
      "if (args[0] === 'download') {",
      "  const outputDir = args[args.indexOf('--output-dir') + 1];",
      "  fs.mkdirSync(outputDir, { recursive: true });",
      "  fs.writeFileSync(path.join(outputDir, 'linked-source.mp4'), 'fake video bytes');",
      "  console.log('downloaded linked-source.mp4');",
      "  process.exit(0);",
      "}",
      "process.exit(2);"
    ].join("\n")
  );
  fs.chmodSync(fakeMeowload, 0o755);

  let probedPath = null;
  const imported = await importVideoFromLink({
    rawUrl: "https://example.com/video",
    dataRoot,
    meowloadPath: fakeMeowload,
    probeVideo: async (videoPath) => {
      probedPath = videoPath;
      return {
        duration: 12,
        outputDuration: 12,
        width: 1080,
        height: 1920,
        codec: "h264",
        audioCodec: "aac",
        fileSize: fs.statSync(videoPath).size
      };
    }
  });

  assert.equal(imported.sourceLink, "https://example.com/video");
  assert.equal(path.basename(imported.path), "linked-source.mp4");
  assert.equal(probedPath, imported.path);
  assert.equal(imported.import.adapter, "meowload");
  assert.ok(fs.existsSync(imported.import.infoLog));
  assert.ok(fs.existsSync(imported.import.downloadLog));
});
