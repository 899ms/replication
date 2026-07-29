const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const { RunManager } = require("../src/main/run-manager");

async function waitForRunUpdate(manager, predicate, timeoutMilliseconds = 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    const remaining = Math.max(1, timeoutMilliseconds - (Date.now() - startedAt));
    const updated = await Promise.race([
      once(manager, "run-updated").then(([run]) => run),
      new Promise((resolve) => setTimeout(() => resolve(null), remaining))
    ]);
    if (updated && predicate(updated)) return updated;
    if (!updated) break;
  }
  throw new Error("Timed out waiting for dynamic recovery status.");
}

test("preparing a run requires runtime replacement person and voice assets", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "replication-runtime-assets-"));
  const manager = new RunManager({
    dataRoot,
    assetRoot: path.resolve(__dirname, "..", "assets")
  });

  await assert.rejects(
    () => manager.prepareRun({ videoPath: "/tmp/source.mp4" }),
    /必须选择替换人物图/
  );
  await assert.rejects(
    () =>
      manager.prepareRun({
        videoPath: "/tmp/source.mp4",
        personImagePath: "/tmp/person.png"
      }),
    /必须选择音色参考/
  );
});

test("an interrupted paid run with provider task ids stays running for remote recovery", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "replication-recovery-"));
  const runId = "interrupted-run";
  const variantRoot = path.join(dataRoot, "runs", runId, "variants", "result_first");
  fs.mkdirSync(variantRoot, { recursive: true });
  const contractPath = path.join(variantRoot, "request_contract.json");
  fs.writeFileSync(contractPath, "{}\n");
  fs.writeFileSync(
    path.join(variantRoot, "kuaizi_seedance2_example_task_id.txt"),
    "provider-task-123"
  );
  fs.writeFileSync(
    path.join(dataRoot, "runs", runId, "run.json"),
    `${JSON.stringify(
      {
        id: runId,
        state: "running",
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
        variants: [
          {
            id: "result_first",
            state: "running",
            contractPath
          }
        ]
      },
      null,
      2
    )}\n`
  );

  const manager = new RunManager({
    dataRoot,
    assetRoot: path.resolve(__dirname, "..", "assets")
  });
  const run = manager.getRun(runId);
  assert.equal(run.state, "running");
  assert.match(run.statusMessage, /正在恢复远端任务/);
  assert.equal(run.error, null);
  assert.equal(run.variants[0].providerTaskId, "provider-task-123");
  assert.equal(run.variants[0].state, "running");
  assert.match(run.variants[0].statusMessage, /正在恢复远端任务/);
});

test("a failed run caused by a broken recovery wrapper is reclassified for recovery", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "replication-recovery-wrapper-"));
  const runId = "wrapper-failed-run";
  const variantRoot = path.join(dataRoot, "runs", runId, "variants", "result_first");
  fs.mkdirSync(variantRoot, { recursive: true });
  const contractPath = path.join(variantRoot, "request_contract.json");
  fs.writeFileSync(contractPath, "{}\n");
  fs.writeFileSync(
    path.join(variantRoot, "kuaizi_seedance2_example_task_id.txt"),
    "provider-task-456"
  );
  fs.writeFileSync(
    path.join(dataRoot, "runs", runId, "run.json"),
    `${JSON.stringify(
      {
        id: runId,
        state: "failed",
        error: "3 个生成任务均未产生通过校验的 MP4。",
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
        variants: [
          {
            id: "result_first",
            state: "failed",
            error: "Seedance 恢复轮询退出，代码 2。",
            contractPath
          }
        ]
      },
      null,
      2
    )}\n`
  );

  const manager = new RunManager({
    dataRoot,
    assetRoot: path.resolve(__dirname, "..", "assets")
  });
  const run = manager.getRun(runId);
  assert.equal(run.state, "running");
  assert.equal(run.error, null);
  assert.equal(run.variants[0].state, "running");
  assert.equal(run.variants[0].providerTaskId, "provider-task-456");
});

test("recovering a provider task writes dynamic poll state before completion", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "replication-dynamic-recovery-"));
  const runId = "dynamic-recovery-run";
  const variantRoot = path.join(dataRoot, "runs", runId, "variants", "result_first");
  fs.mkdirSync(variantRoot, { recursive: true });
  const contractPath = path.join(variantRoot, "request_contract.json");
  const fakeResumeScript = path.join(dataRoot, "fake-resume.js");
  fs.writeFileSync(contractPath, "{}\n");
  fs.writeFileSync(
    path.join(variantRoot, "kuaizi_seedance2_example_task_id.txt"),
    "provider-task-789"
  );
  fs.writeFileSync(
    fakeResumeScript,
    [
      "console.log(JSON.stringify({ phase: 'resume_poll', try: 1, status: 'running' }));",
      "setTimeout(() => {",
      "  console.log(JSON.stringify({ ok: true, status: 'verified', task_id: 'provider-task-789', video_path: process.env.REPLICATION_FAKE_OUTPUT }));",
      "  process.exit(0);",
      "}, 120);"
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(dataRoot, "runs", runId, "run.json"),
    `${JSON.stringify(
      {
        id: runId,
        state: "running",
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
        variants: [
          {
            id: "result_first",
            state: "running",
            contractPath,
            logPath: path.join(variantRoot, "submit.log"),
            providerTaskId: "provider-task-789"
          }
        ]
      },
      null,
      2
    )}\n`
  );

  const manager = new RunManager({
    dataRoot,
    assetRoot: path.resolve(__dirname, "..", "assets"),
    python: process.execPath,
    resumeScript: fakeResumeScript,
    ffprobe: process.execPath
  });

  const recovery = manager.recoverRun(runId).catch(() => null);
  const dynamicRun = await waitForRunUpdate(
    manager,
    (run) => run.variants[0].providerPollAttempt === 1
  );
  assert.equal(dynamicRun.variants[0].providerStatus, "running");
  assert.equal(dynamicRun.variants[0].providerPollAttempt, 1);
  assert.match(dynamicRun.variants[0].statusMessage, /第 1 次/);

  await recovery;
});

test("a nonterminal recovery exit keeps the run active instead of showing a static failure", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "replication-nonterminal-recovery-"));
  const runId = "nonterminal-recovery-run";
  const variantRoot = path.join(dataRoot, "runs", runId, "variants", "result_first");
  fs.mkdirSync(variantRoot, { recursive: true });
  const contractPath = path.join(variantRoot, "request_contract.json");
  const fakeResumeScript = path.join(dataRoot, "fake-resume.js");
  fs.writeFileSync(contractPath, "{}\n");
  fs.writeFileSync(
    path.join(variantRoot, "kuaizi_seedance2_example_task_id.txt"),
    "provider-task-999"
  );
  fs.writeFileSync(
    fakeResumeScript,
    "console.log(JSON.stringify({ phase: 'resume_poll', try: 3, status: 'running' })); process.exit(2);\n"
  );
  fs.writeFileSync(
    path.join(dataRoot, "runs", runId, "run.json"),
    `${JSON.stringify(
      {
        id: runId,
        state: "running",
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
        variants: [
          {
            id: "result_first",
            state: "running",
            contractPath,
            logPath: path.join(variantRoot, "submit.log"),
            providerTaskId: "provider-task-999"
          }
        ]
      },
      null,
      2
    )}\n`
  );

  const manager = new RunManager({
    dataRoot,
    assetRoot: path.resolve(__dirname, "..", "assets"),
    python: process.execPath,
    resumeScript: fakeResumeScript
  });

  await manager.recoverRun(runId);
  const run = manager.getRun(runId);
  assert.equal(run.state, "running");
  assert.equal(run.error, null);
  assert.equal(run.variants[0].state, "running");
  assert.equal(run.variants[0].error, null);
  assert.equal(run.variants[0].providerPollAttempt, 3);
});
