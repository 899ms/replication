const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { RunManager } = require("../src/main/run-manager");

async function main() {
  const videoPath = process.argv[2];
  if (!videoPath) {
    throw new Error(
      "Pass a vertical video path: npm run test:integration -- /absolute/path/video.mp4 [/absolute/path/person.png] [/absolute/path/voice.mp3]"
    );
  }
  const personImagePath = process.argv[3] || path.resolve(__dirname, "..", "assets", "persona-mira.png");
  const audioReferencePath = process.argv[4] || videoPath;

  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "replication-smoke-"));
  const manager = new RunManager({
    dataRoot,
    assetRoot: path.resolve(__dirname, "..", "assets")
  });
  const run = await manager.prepareRun({
    videoPath: path.resolve(videoPath),
    personImagePath: path.resolve(personImagePath),
    audioReferencePath: path.resolve(audioReferencePath)
  });
  const summary = {
    runId: run.id,
    state: run.state,
    dataRoot,
    persona: run.persona.name,
    voice: run.voice.name,
    contracts: run.variants.map((variant) => ({
      id: variant.id,
      state: variant.state,
      exists: fs.existsSync(variant.contractPath),
      contractPath: variant.contractPath
    }))
  };
  console.log(JSON.stringify(summary, null, 2));
  if (
    run.state !== "waiting_authorization" ||
    summary.contracts.some((contract) => !contract.exists)
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
