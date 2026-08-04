const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { getMinimaxH3Status, inspectModelFiles } = require("../src/main/minimax-h3-runtime");

function createH3Fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "replication-h3-"));
  const files = [
    ["diffusion_models", "minimax_h3_ref2va_pruned_int8_convrot.safetensors"],
    ["text_encoders", "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"],
    ["vae", "minimax_h3_video_vae_fp16.safetensors"],
    ["vae", "minimax_h3_audio_vae_fp32.safetensors"]
  ];
  for (const [directory, name] of files) {
    const targetDirectory = path.join(root, "models", directory);
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.writeFileSync(path.join(targetDirectory, name), "fixture");
  }
  return root;
}

test("MiniMax H3 runtime becomes ready only with a live ComfyUI endpoint and all model groups", async (t) => {
  const root = createH3Fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const status = await getMinimaxH3Status({
    comfyRoots: [root],
    endpoints: ["http://127.0.0.1:8188/"],
    fetcher: async () => ({
      ok: true,
      json: async () => ({
        system: { comfyui_version: "0.30.0" },
        devices: [{ name: "Test GPU" }]
      })
    })
  });

  assert.equal(status.state, "ready");
  assert.equal(status.ready, true);
  assert.equal(status.connection.endpoint, "http://127.0.0.1:8188");
  assert.deepEqual(status.modelChecks, {
    diffusion: true,
    textEncoder: true,
    videoVae: true,
    audioVae: true
  });
});

test("MiniMax H3 model inspection reports incomplete installs truthfully", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "replication-h3-partial-"));
  fs.mkdirSync(path.join(root, "models", "vae"), { recursive: true });
  fs.writeFileSync(path.join(root, "models", "vae", "minimax_h3_video_vae_fp16.safetensors"), "fixture");
  try {
    const models = inspectModelFiles([root]);
    assert.equal(models.complete, false);
    assert.equal(Boolean(models.matches.videoVae), true);
    assert.equal(Boolean(models.matches.audioVae), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
