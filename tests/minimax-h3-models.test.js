const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MODEL_REPOSITORY_URL,
  listMinimaxH3Models,
  openModelDownloads,
  resolveModelSelection
} = require("../src/main/minimax-h3-models");

test("official MiniMax H3 catalog exposes the four ComfyUI R2V files", () => {
  const models = listMinimaxH3Models({ diffusion: true });
  assert.equal(models.length, 4);
  assert.equal(models[0].installed, true);
  assert.equal(models[1].installed, false);
  assert.equal(models.reduce((total, model) => total + model.sizeBytes, 0), 42470585471);
  for (const model of models) {
    assert.match(model.downloadUrl, /^https:\/\/huggingface\.co\/Comfy-Org\/MiniMax-H3\/resolve\/main\//);
    assert.match(model.downloadUrl, /\?download=true$/);
    assert.match(model.sha256, /^[a-f0-9]{64}$/);
    assert.match(model.targetDirectory, /^ComfyUI\/models\//);
  }
  assert.equal(MODEL_REPOSITORY_URL, "https://huggingface.co/Comfy-Org/MiniMax-H3");
});

test("model download action only opens allowlisted official URLs", async () => {
  const opened = [];
  const result = await openModelDownloads(["videoVae", "audioVae", "videoVae"], async (url) => {
    opened.push(url);
  });
  assert.deepEqual(result.opened, ["videoVae", "audioVae"]);
  assert.equal(result.count, 2);
  assert.equal(opened.length, 2);
  assert.ok(opened.every((url) => url.startsWith(`${MODEL_REPOSITORY_URL}/resolve/main/vae/`)));
});

test("unknown model ids are rejected instead of becoming arbitrary URLs", async () => {
  assert.throws(() => resolveModelSelection(["../../malicious"]), /不支持的 MiniMax H3 模型/);
  await assert.rejects(openModelDownloads(["unknown"], async () => {}), /不支持的 MiniMax H3 模型/);
});
