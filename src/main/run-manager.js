const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { promisify } = require("node:util");

const { getVariants } = require("../core/variants");
const { normalizeProbe, validateVideoPath } = require("../core/video-contract");
const { importVideoFromLink } = require("./video-link-importer");

const execFileAsync = promisify(execFile);

function unpackedRuntimePath(candidate) {
  const asarSegment = `${path.sep}app.asar${path.sep}`;
  return candidate.includes(asarSegment)
    ? candidate.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`)
    : candidate;
}

const DEFAULT_SKILL_ROOT = unpackedRuntimePath(
  path.resolve(__dirname, "../../runtime/seedance-face-swap")
);
const LOCAL_VENV_PYTHON = path.resolve(__dirname, "../../.venv/bin/python");
const DEFAULT_PYTHON = fs.existsSync(LOCAL_VENV_PYTHON) ? LOCAL_VENV_PYTHON : "python3";
const DEFAULT_FFPROBE = [
  process.env.REPLICATION_FFPROBE,
  "/opt/homebrew/bin/ffprobe",
  "/usr/local/bin/ffprobe",
  "/usr/bin/ffprobe"
].find((candidate) => candidate && (path.isAbsolute(candidate) ? fs.existsSync(candidate) : true)) || "ffprobe";
const LOCAL_TRACKING_INTERRUPTED_MESSAGE =
  "APP 在任务执行期间被关闭，本地跟踪已中断；未拿到远端任务 ID 的版本无法恢复。";
const RECOVERY_STATUS_MESSAGE = "正在恢复远端任务；不会重复付费提交。";

function nowIso() {
  return new Date().toISOString();
}

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}

function createRunId(videoPath) {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const digest = crypto
    .createHash("sha256")
    .update(`${videoPath}:${Date.now()}`)
    .digest("hex")
    .slice(0, 8);
  return `${timestamp}-${digest}`;
}

function normalizePrepareInput(input) {
  if (typeof input === "string") {
    return { videoPath: input, personImagePath: null, audioReferencePath: null };
  }
  return {
    videoPath: input?.videoPath || null,
    personImagePath: input?.personImagePath || null,
    audioReferencePath: input?.audioReferencePath || null
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function findFiles(root, predicate) {
  if (!fs.existsSync(root)) return [];
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(absolute, predicate));
    } else if (predicate(absolute)) {
      results.push(absolute);
    }
  }
  return results;
}

function isActiveState(state) {
  return state === "queued" || state === "running";
}

function isLocalTrackingFailure(value) {
  return typeof value === "string" && /本地跟踪|任务执行期间被关闭|自动重连/.test(value);
}

function hasTerminalProviderFailureReport(variant) {
  if (!variant.contractPath) return false;
  const finalReportPath = path.join(path.dirname(variant.contractPath), "final_report.json");
  if (!fs.existsSync(finalReportPath)) return false;
  try {
    const report = readJson(finalReportPath);
    return (
      report.ok === false &&
      ["failed", "cancelled", "canceled"].includes(String(report.status || ""))
    );
  } catch {
    return false;
  }
}

function isRecoverableVariantFailure(variant) {
  if (variant.state !== "failed") return false;
  if (isLocalTrackingFailure(variant.error)) return true;
  return /恢复轮询退出/.test(String(variant.error || "")) && !hasTerminalProviderFailureReport(variant);
}

class RunManager extends EventEmitter {
  constructor(options) {
    super();
    this.dataRoot = options.dataRoot;
    this.assetRoot = options.assetRoot;
    this.skillRoot = options.skillRoot || process.env.REPLICATION_FACE_SWAP_SKILL || DEFAULT_SKILL_ROOT;
    this.python = options.python || process.env.REPLICATION_PYTHON || DEFAULT_PYTHON;
    this.ffprobe = options.ffprobe || DEFAULT_FFPROBE;
    this.linkImporter = options.linkImporter || importVideoFromLink;
    this.resumeScript = options.resumeScript || null;
    this.processes = new Map();
    this.outputBuffers = new Map();
    fs.mkdirSync(this.runsRoot, { recursive: true });
    this.reconcileInterruptedRuns();
  }

  get runsRoot() {
    return path.join(this.dataRoot, "runs");
  }

  runDir(runId) {
    return path.join(this.runsRoot, safeName(runId));
  }

  runFile(runId) {
    return path.join(this.runDir(runId), "run.json");
  }

  hydrateProviderEvidence(run) {
    for (const variant of run.variants || []) {
      if (!variant.contractPath) continue;
      const variantRoot = path.dirname(variant.contractPath);
      const taskFiles = findFiles(
        variantRoot,
        (filePath) => filePath.endsWith("_task_id.txt")
      );
      if (taskFiles.length > 0) {
        const taskId = fs.readFileSync(taskFiles[0], "utf8").trim();
        if (taskId) {
          variant.providerTaskId = taskId;
          variant.providerTaskFile = taskFiles[0];
        }
      }
    }
    return run;
  }

  reconcileInterruptedRuns() {
    if (!fs.existsSync(this.runsRoot)) return;
    for (const entry of fs.readdirSync(this.runsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const filePath = path.join(this.runsRoot, entry.name, "run.json");
      if (!fs.existsSync(filePath)) continue;
      const run = this.hydrateProviderEvidence(readJson(filePath));
      const runFailedByLocalInterruption =
        run.state === "failed" && isLocalTrackingFailure(run.error);
      const hasRecoverableVariantFailure = (run.variants || []).some(
        (variant) => variant.providerTaskId && isRecoverableVariantFailure(variant)
      );
      if (!isActiveState(run.state) && !runFailedByLocalInterruption && !hasRecoverableVariantFailure) {
        continue;
      }

      let recoverableCount = 0;
      for (const variant of run.variants) {
        if (variant.state === "succeeded") continue;
        const recoverableFailure = isRecoverableVariantFailure(variant);
        if ((isActiveState(variant.state) || recoverableFailure) && variant.providerTaskId) {
          variant.state = "running";
          variant.error = null;
          variant.statusMessage = RECOVERY_STATUS_MESSAGE;
          recoverableCount += 1;
        } else if (isActiveState(variant.state)) {
          variant.state = "failed";
          variant.error = "本地跟踪在获得远端任务 ID 前中断。";
          variant.statusMessage = null;
        }
      }

      if (recoverableCount > 0) {
        run.state = "running";
        run.error = null;
        run.statusMessage = RECOVERY_STATUS_MESSAGE;
      } else if (isActiveState(run.state)) {
        run.state = "failed";
        run.error = LOCAL_TRACKING_INTERRUPTED_MESSAGE;
        run.statusMessage = null;
      }

      run.updatedAt = nowIso();
      writeJsonAtomic(filePath, run);
    }
  }

  resumeScriptPath() {
    if (this.resumeScript) return this.resumeScript;
    const source = path.join(__dirname, "resume-face-swap-task.py");
    if (!source.includes(".asar")) return source;

    const binDir = path.join(this.dataRoot, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const target = path.join(binDir, "resume-face-swap-task.py");
    fs.copyFileSync(source, target);
    return target;
  }

  providerProgressMessage(event) {
    const status = String(event.status || "unknown");
    const attempt = Number(event.try || event.attempt || 0);
    if (event.phase === "submitted_once") {
      return "已提交远端任务；等待供应商开始处理。";
    }
    if (event.phase === "poll" || event.phase === "resume_poll") {
      if (status === "succeeded") {
        return "远端已完成，正在下载并校验 MP4。";
      }
      if (status === "failed" || status === "cancelled" || status === "canceled") {
        return "远端返回终态，正在整理结果。";
      }
      const prefix = event.phase === "resume_poll" ? "恢复查询远端任务" : "查询远端任务";
      return attempt > 0
        ? `${prefix}，第 ${attempt} 次，状态：${status}。`
        : `${prefix}，状态：${status}。`;
    }
    if (event.ok && (event.status === "verified" || event.status === "downloaded")) {
      return "MP4 已下载，正在登记本地结果。";
    }
    return null;
  }

  applyProviderProgress(runId, variantId, event) {
    const message = this.providerProgressMessage(event);
    if (!message) return;
    const run = this.getRun(runId);
    const variant = run.variants.find((item) => item.id === variantId);
    if (!variant || variant.state === "succeeded" || variant.state === "cancelled") return;

    if (event.phase === "submitted_once" && event.task_id) {
      variant.providerTaskId = event.task_id;
    }
    if (event.phase === "poll" || event.phase === "resume_poll") {
      variant.providerStatus = String(event.status || "unknown");
      variant.providerPollAttempt = Number(event.try || event.attempt || 0) || null;
      variant.providerPhase = event.phase;
    }
    variant.statusMessage = message;
    variant.error = null;
    if (variant.state === "queued") variant.state = "running";
    if (isActiveState(variant.state)) {
      run.state = "running";
      run.error = null;
      run.statusMessage = message;
    }
    this.save(run);
  }

  processProviderOutput(processKey, runId, variantId, chunk) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    const combined = `${this.outputBuffers.get(processKey) || ""}${text}`;
    const lines = combined.split(/\r?\n/);
    this.outputBuffers.set(processKey, lines.pop() || "");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        this.applyProviderProgress(runId, variantId, JSON.parse(trimmed));
      } catch {
        // Non-JSON provider output is already preserved in the log file.
      }
    }
  }

  shouldContinueRecovering(variant) {
    return Boolean(variant?.providerTaskId) && !hasTerminalProviderFailureReport(variant);
  }

  scheduleRecovery(runId, delayMilliseconds = 5000) {
    setTimeout(() => {
      this.recoverRun(runId).catch((error) => {
        const run = this.getRun(runId);
        if (run.state === "running") {
          run.statusMessage = `恢复查询暂时失败：${error.message}`;
          this.save(run);
        }
      });
    }, delayMilliseconds).unref?.();
  }

  save(run) {
    run.updatedAt = nowIso();
    writeJsonAtomic(this.runFile(run.id), run);
    this.emit("run-updated", run);
    return run;
  }

  getRun(runId) {
    const filePath = this.runFile(runId);
    if (!fs.existsSync(filePath)) {
      throw new Error("找不到这个生成任务。");
    }
    return this.hydrateProviderEvidence(readJson(filePath));
  }

  listRuns() {
    if (!fs.existsSync(this.runsRoot)) return [];
    return fs
      .readdirSync(this.runsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        try {
          return this.getRun(entry.name);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async probeVideo(videoPath, { enforceInputContract = true } = {}) {
    if (enforceInputContract) {
      validateVideoPath(videoPath);
    }
    const stats = fs.statSync(videoPath);
    const { stdout } = await execFileAsync(
      this.ffprobe,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name:stream=codec_type,codec_name,width,height,duration",
        "-of",
        "json",
        videoPath
      ],
      { maxBuffer: 4 * 1024 * 1024 }
    );
    const probe = JSON.parse(stdout);

    if (enforceInputContract) {
      return normalizeProbe(probe, stats.size);
    }

    const streams = probe.streams || [];
    const video = streams.find((stream) => stream.codec_type === "video");
    const audio = streams.find((stream) => stream.codec_type === "audio");
    if (!video || !audio || stats.size <= 0) {
      throw new Error("生成文件缺少有效视频流或音轨。");
    }
    return {
      duration: Number(probe.format?.duration || video.duration || 0),
      width: Number(video.width || 0),
      height: Number(video.height || 0),
      codec: video.codec_name || "unknown",
      audioCodec: audio.codec_name || "unknown",
      fileSize: stats.size
    };
  }

  async inspectVideo(videoPath) {
    const metadata = await this.probeVideo(videoPath);
    return {
      path: videoPath,
      name: path.basename(videoPath),
      url: pathToFileURL(videoPath).href,
      metadata
    };
  }

  async importVideoLink(rawUrl) {
    return this.linkImporter({
      rawUrl,
      dataRoot: this.dataRoot,
      probeVideo: (videoPath) => this.probeVideo(videoPath)
    });
  }

  async prepareRun(videoPath) {
    const input = normalizePrepareInput(videoPath);
    if (!input.videoPath) {
      throw new Error("缺少源视频。");
    }
    if (!input.personImagePath) {
      throw new Error("必须选择替换人物图；Replication 不再使用固定内置人物。");
    }
    if (!input.audioReferencePath) {
      throw new Error("必须选择音色参考；替换人物时需要同时替换音色。");
    }

    const inspection = await this.inspectVideo(input.videoPath);
    const runId = createRunId(input.videoPath);
    const runDir = this.runDir(runId);
    const inputDir = path.join(runDir, "input");
    fs.mkdirSync(inputDir, { recursive: true });

    const sourceExtension = path.extname(input.videoPath).toLowerCase();
    const sourceCopy = path.join(inputDir, `source${sourceExtension}`);
    const personExtension = path.extname(input.personImagePath).toLowerCase();
    const personCopy = path.join(inputDir, `replacement-person${personExtension}`);
    const audioExtension = path.extname(input.audioReferencePath).toLowerCase();
    const audioCopy = path.join(inputDir, `voice-reference${audioExtension}`);
    if (!fs.existsSync(input.personImagePath)) {
      throw new Error("替换人物图不存在。");
    }
    if (!fs.existsSync(input.audioReferencePath)) {
      throw new Error("音色参考不存在。");
    }
    fs.copyFileSync(input.videoPath, sourceCopy);
    fs.copyFileSync(input.personImagePath, personCopy);
    fs.copyFileSync(input.audioReferencePath, audioCopy);

    const variants = getVariants().map((variant) => ({
      id: variant.id,
      index: variant.index,
      title: variant.title,
      label: variant.label,
      accent: variant.accent,
      expressionIntensity: variant.expressionIntensity,
      state: "draft",
      contractPath: null,
      artifact: null,
      error: null,
      logPath: null
    }));

    let run = {
      id: runId,
      actionId: "video.replication.generate.v1",
      state: "draft",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      input: {
        originalPath: input.videoPath,
        copiedPath: sourceCopy,
        previewUrl: pathToFileURL(sourceCopy).href,
        name: inspection.name,
        metadata: inspection.metadata
      },
      persona: {
        id: "runtime-person",
        name: path.basename(input.personImagePath),
        kind: "runtime",
        originalPath: input.personImagePath,
        path: personCopy,
        previewUrl: pathToFileURL(personCopy).href
      },
      voice: {
        id: "runtime-voice",
        name: path.basename(input.audioReferencePath),
        kind: "runtime",
        originalPath: input.audioReferencePath,
        path: audioCopy
      },
      authorization: {
        required: true,
        provider: "Kuaizi / Seedance 2.0",
        jobCount: 3,
        grantedAt: null,
        feeDisclosure: "供应商按账户实时价格扣费；Replication 不会在授权前提交。"
      },
      variants,
      artifacts: [],
      error: null
    };
    this.save(run);

    try {
      const configuredVariants = getVariants();
      for (const variantConfig of configuredVariants) {
        run = this.getRun(runId);
        const variant = run.variants.find((item) => item.id === variantConfig.id);
        variant.state = "running";
        this.save(run);

        const variantDir = path.join(runDir, "variants", variant.id);
        fs.mkdirSync(variantDir, { recursive: true });
        const promptPath = path.join(variantDir, "final_prompt.txt");
        fs.writeFileSync(promptPath, `${variantConfig.prompt}\n`);

        const createScript = path.join(this.skillRoot, "scripts", "create_face_swap_contract.py");
        await execFileAsync(
          this.python,
          [
            createScript,
            "--reference-video",
            sourceCopy,
            "--person-image",
            personCopy,
            "--audio-reference",
            audioCopy,
            "--final-prompt-file",
            promptPath,
            "--title",
            `Replication · ${variant.title}`,
            "--row-id",
            `REPLICATION-${runId}-${variant.index}`,
            "--out-dir",
            variantDir,
            "--mode",
            "dry-run",
            "--resolution",
            "480p",
            "--ratio",
            "9:16",
            "--duration",
            String(inspection.metadata.outputDuration),
            "--expression-intensity",
            variant.expressionIntensity
          ],
          { maxBuffer: 16 * 1024 * 1024 }
        );

        run = this.getRun(runId);
        const completedVariant = run.variants.find((item) => item.id === variant.id);
        completedVariant.state = "queued";
        completedVariant.contractPath = path.join(variantDir, "request_contract.json");
        completedVariant.logPath = path.join(variantDir, "submit.log");
        this.save(run);
      }

      run = this.getRun(runId);
      run.state = "waiting_authorization";
      return this.save(run);
    } catch (error) {
      run = this.getRun(runId);
      run.state = "failed";
      run.error = error.message;
      for (const variant of run.variants) {
        if (variant.state === "running") {
          variant.state = "failed";
          variant.error = error.message;
        }
      }
      this.save(run);
      throw error;
    }
  }

  submitRun(runId) {
    let run = this.getRun(runId);
    if (run.state !== "waiting_authorization") {
      throw new Error("这个任务尚未准备好，或已经提交过。");
    }
    if (run.variants.length !== 3 || run.variants.some((variant) => !variant.contractPath)) {
      throw new Error("必须先准备完整的 3 份生成合同。");
    }

    run.authorization.grantedAt = nowIso();
    run.state = "queued";
    for (const variant of run.variants) {
      variant.state = "queued";
    }
    this.save(run);

    queueMicrotask(() => {
      this.executeRun(runId).catch((error) => {
        const failedRun = this.getRun(runId);
        failedRun.state = "failed";
        failedRun.error = error.message;
        this.save(failedRun);
      });
    });

    return this.getRun(runId);
  }

  async executeRun(runId) {
    const run = this.getRun(runId);
    await Promise.allSettled(run.variants.map((variant) => this.executeVariant(runId, variant.id)));
    return this.finalizeRun(runId);
  }

  async recoverRun(runId) {
    const run = this.getRun(runId);
    const recoverableVariants = run.variants.filter(
      (variant) => isActiveState(variant.state) && variant.providerTaskId
    );
    await Promise.allSettled(
      recoverableVariants.map((variant) => this.recoverVariant(runId, variant.id))
    );
    return this.finalizeRun(runId);
  }

  async resumeRecoverableRuns() {
    const recoverableRuns = this.listRuns().filter((run) =>
      run.state === "running" &&
      run.variants.some((variant) => isActiveState(variant.state) && variant.providerTaskId)
    );
    const results = await Promise.allSettled(
      recoverableRuns.map((run) => this.recoverRun(run.id))
    );
    return { count: recoverableRuns.length, results };
  }

  finalizeRun(runId) {
    const completed = this.getRun(runId);
    if (completed.state === "cancelled") {
      return this.save(completed);
    }
    const succeededCount = completed.variants.filter((variant) => variant.state === "succeeded").length;
    const activeCount = completed.variants.filter((variant) => isActiveState(variant.state)).length;
    completed.artifacts = completed.variants
      .map((variant) => variant.artifact)
      .filter(Boolean);
    if (activeCount > 0) {
      completed.state = "running";
      completed.error = null;
      completed.statusMessage =
        completed.variants.find((variant) => isActiveState(variant.state) && variant.statusMessage)
          ?.statusMessage || RECOVERY_STATUS_MESSAGE;
    } else if (succeededCount === completed.variants.length) {
      completed.state = "succeeded";
      completed.error = null;
      completed.statusMessage = null;
    } else if (succeededCount === 0) {
      completed.state = "failed";
      completed.error = completed.error || "3 个生成任务均未产生通过校验的 MP4。";
      completed.statusMessage = null;
    } else {
      completed.state = "failed";
      completed.error = `已生成 ${succeededCount}/3 个有效版本；失败版本需要重新授权后再提交。`;
      completed.statusMessage = null;
    }
    return this.save(completed);
  }

  async registerVariantArtifact(runId, variantId) {
    const run = this.getRun(runId);
    const finishedVariant = run.variants.find((item) => item.id === variantId);
    const variantRoot = path.dirname(finishedVariant.contractPath);
    const videoCandidates = findFiles(
      variantRoot,
      (filePath) => path.extname(filePath).toLowerCase() === ".mp4"
    ).sort((left, right) => fs.statSync(right).size - fs.statSync(left).size);
    if (videoCandidates.length === 0) {
      throw new Error("执行完成，但没有找到 MP4 产物。");
    }
    const artifactPath = videoCandidates[0];
    const metadata = await this.probeVideo(artifactPath, { enforceInputContract: false });
    const finalReportPath = path.join(variantRoot, "final_report.json");
    finishedVariant.state = "succeeded";
    finishedVariant.artifact = {
      artifactId: crypto.randomUUID(),
      runId,
      actionId: "video.replication.generate.v1",
      variantId,
      type: "video/mp4",
      path: artifactPath,
      url: pathToFileURL(artifactPath).href,
      sourceCapability: "seedance-face-swap",
      sourceSkills: ["golden-three-second-hook", "hook-only-rewriter", "seedance-face-swap"],
      providerTaskId: finishedVariant.providerTaskId || null,
      createdAt: nowIso(),
      validated: true,
      metadata,
      finalReportPath: fs.existsSync(finalReportPath) ? finalReportPath : null
    };
    finishedVariant.error = null;
    finishedVariant.statusMessage = null;
    this.save(run);
    return finishedVariant;
  }

  executeVariant(runId, variantId) {
    return new Promise((resolve, reject) => {
      let run = this.getRun(runId);
      const variant = run.variants.find((item) => item.id === variantId);
      variant.state = "running";
      variant.error = null;
      this.save(run);

      const submitScript = path.join(this.skillRoot, "scripts", "submit_face_swap_task.py");
      const child = spawn(
        this.python,
        [
          submitScript,
          "--contract",
          variant.contractPath,
          "--submit",
          "--confirm-submit-authorization",
          "--verify"
        ],
        {
          cwd: path.dirname(variant.contractPath),
          env: {
            ...process.env,
            REPLICATION_FACE_SWAP_SUBMITTER: path.join(
              this.skillRoot,
              "scripts",
              "submit_face_swap_task.py"
            )
          },
          stdio: ["ignore", "pipe", "pipe"]
        }
      );

      const processKey = `${runId}:${variantId}`;
      this.processes.set(processKey, child);
      fs.writeFileSync(variant.logPath, "");
      const append = (chunk) => {
        fs.appendFileSync(variant.logPath, chunk);
        this.processProviderOutput(processKey, runId, variantId, chunk);
        this.emit("run-log", { runId, variantId });
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);

      child.once("error", (error) => {
        this.processes.delete(processKey);
        this.outputBuffers.delete(processKey);
        run = this.getRun(runId);
        const failedVariant = run.variants.find((item) => item.id === variantId);
        if (run.state === "cancelled" || failedVariant.state === "cancelled") {
          resolve(failedVariant);
          return;
        }
        failedVariant.state = "failed";
        failedVariant.error = error.message;
        this.save(run);
        reject(error);
      });

      child.once("close", async (code) => {
        this.processes.delete(processKey);
        this.outputBuffers.delete(processKey);
        run = this.getRun(runId);
        const finishedVariant = run.variants.find((item) => item.id === variantId);
        if (run.state === "cancelled" || finishedVariant.state === "cancelled") {
          resolve(finishedVariant);
          return;
        }
        if (code !== 0) {
          finishedVariant.state = "failed";
          finishedVariant.error = `Seedance 执行退出，代码 ${code}。`;
          this.save(run);
          reject(new Error(finishedVariant.error));
          return;
        }

        try {
          resolve(await this.registerVariantArtifact(runId, variantId));
        } catch (error) {
          finishedVariant.state = "failed";
          finishedVariant.error = error.message;
          this.save(run);
          reject(error);
        }
      });
    });
  }

  recoverVariant(runId, variantId) {
    return new Promise((resolve, reject) => {
      let run = this.getRun(runId);
      const variant = run.variants.find((item) => item.id === variantId);
      if (!variant.providerTaskId) {
        reject(new Error("缺少远端任务 ID，无法恢复。"));
        return;
      }

      variant.state = "running";
      variant.error = null;
      variant.statusMessage = RECOVERY_STATUS_MESSAGE;
      run.state = "running";
      run.error = null;
      run.statusMessage = RECOVERY_STATUS_MESSAGE;
      this.save(run);

      const resumeScript = this.resumeScriptPath();
      const child = spawn(
        this.python,
        [
          resumeScript,
          "--contract",
          variant.contractPath,
          "--task-id",
          variant.providerTaskId,
          "--verify",
          "--poll-attempts",
          "240",
          "--poll-interval",
          "15"
        ],
        {
          cwd: path.dirname(variant.contractPath),
          env: {
            ...process.env,
            REPLICATION_FACE_SWAP_SUBMITTER: path.join(
              this.skillRoot,
              "scripts",
              "submit_face_swap_task.py"
            )
          },
          stdio: ["ignore", "pipe", "pipe"]
        }
      );

      const processKey = `${runId}:${variantId}`;
      this.processes.set(processKey, child);
      if (!variant.logPath) {
        variant.logPath = path.join(path.dirname(variant.contractPath), "submit.log");
        this.save(run);
      }
      fs.appendFileSync(variant.logPath, `\n[replication] ${nowIso()} 恢复远端任务 ${variant.providerTaskId}\n`);
      const append = (chunk) => {
        fs.appendFileSync(variant.logPath, chunk);
        this.processProviderOutput(processKey, runId, variantId, chunk);
        this.emit("run-log", { runId, variantId });
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);

      child.once("error", (error) => {
        this.processes.delete(processKey);
        this.outputBuffers.delete(processKey);
        run = this.getRun(runId);
        const failedVariant = run.variants.find((item) => item.id === variantId);
        if (run.state === "cancelled" || failedVariant.state === "cancelled") {
          resolve(failedVariant);
          return;
        }
        failedVariant.state = "failed";
        failedVariant.error = error.message;
        failedVariant.statusMessage = null;
        this.save(run);
        reject(error);
      });

      child.once("close", async (code) => {
        this.processes.delete(processKey);
        this.outputBuffers.delete(processKey);
        run = this.getRun(runId);
        const finishedVariant = run.variants.find((item) => item.id === variantId);
        if (run.state === "cancelled" || finishedVariant.state === "cancelled") {
          resolve(finishedVariant);
          return;
        }
        if (code !== 0) {
          if (this.shouldContinueRecovering(finishedVariant)) {
            finishedVariant.state = "running";
            finishedVariant.error = null;
            finishedVariant.statusMessage = `恢复查询暂时中断，${Math.max(
              1,
              Number(finishedVariant.providerPollAttempt || 0)
            )} 次查询后仍未拿到可校验 MP4；将继续轮询。`;
            run.state = "running";
            run.error = null;
            run.statusMessage = finishedVariant.statusMessage;
            this.save(run);
            this.scheduleRecovery(runId);
            resolve(finishedVariant);
            return;
          }
          finishedVariant.state = "failed";
          finishedVariant.error = `Seedance 恢复轮询退出，代码 ${code}。`;
          finishedVariant.statusMessage = null;
          this.save(run);
          reject(new Error(finishedVariant.error));
          return;
        }

        try {
          resolve(await this.registerVariantArtifact(runId, variantId));
        } catch (error) {
          finishedVariant.state = "failed";
          finishedVariant.error = error.message;
          finishedVariant.statusMessage = null;
          this.save(run);
          reject(error);
        }
      });
    });
  }

  cancelRun(runId) {
    const run = this.getRun(runId);
    let killed = 0;
    for (const variant of run.variants) {
      const processKey = `${runId}:${variant.id}`;
      const child = this.processes.get(processKey);
      if (child && !child.killed) {
        child.kill("SIGTERM");
        killed += 1;
      }
    }
    run.state = "cancelled";
    run.error =
      killed > 0
        ? "已停止本地进程；已经提交到远端的任务仍可能继续运行。"
        : "任务已取消。";
    for (const variant of run.variants) {
      if (variant.state === "queued" || variant.state === "running") {
        variant.state = "cancelled";
      }
    }
    return this.save(run);
  }
}

module.exports = {
  RunManager,
  createRunId
};
