const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { defaultRoots, listLocalAssets } = require("../src/main/local-assets");

test("default local discovery is limited to the source video directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "replication-assets-default-roots-"));
  const sourceVideo = path.join(root, "source.mp4");
  fs.writeFileSync(sourceVideo, "video");

  const localOnlyRoots = defaultRoots(sourceVideo);
  assert.deepEqual(localOnlyRoots, [root]);
  assert.deepEqual(defaultRoots(sourceVideo, { includeGlobal: true }), [root]);
});

test("local asset discovery classifies nearby person images and voice references", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "replication-assets-"));
  const sourceDir = path.join(root, "source-folder");
  const nested = path.join(root, "Desktop", "demo");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(nested, { recursive: true });
  const sourceVideo = path.join(sourceDir, "source.mp4");
  const personImage = path.join(sourceDir, "真人口播人设.png");
  const voiceAudio = path.join(nested, "发音纠正.mp3");
  fs.writeFileSync(sourceVideo, "video");
  fs.writeFileSync(personImage, "image");
  fs.writeFileSync(voiceAudio, "audio");

  const result = listLocalAssets({
    sourceVideoPath: sourceVideo,
    roots: [sourceDir, path.join(root, "Desktop")],
    maxDepth: 2
  });

  assert.equal(result.persons[0].path, personImage);
  assert.equal(result.voices.some((candidate) => candidate.path === voiceAudio), true);
  assert.equal(result.persons[0].url.startsWith("file:"), true);
});

test("local asset discovery is bounded by depth", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "replication-assets-depth-"));
  const deep = path.join(root, "a", "b", "c");
  fs.mkdirSync(deep, { recursive: true });
  const tooDeepAudio = path.join(deep, "voice.mp3");
  fs.writeFileSync(tooDeepAudio, "audio");

  const result = listLocalAssets({
    roots: [root],
    maxDepth: 1
  });

  assert.equal(result.voices.some((candidate) => candidate.path === tooDeepAudio), false);
});
