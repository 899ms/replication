const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const SUPPORTED_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);
const DEFAULT_MEOWLOAD_CANDIDATES = [
  process.env.REPLICATION_MEOWLOAD,
  "/usr/local/bin/meowload",
  "/usr/local/bin/MeowLoad",
  "/opt/homebrew/bin/meowload",
  "/opt/homebrew/bin/MeowLoad",
  "meowload.exe",
  "MeowLoad.exe",
  "meowload",
  "MeowLoad"
].filter(Boolean);

function nowCompact() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}

function extractFirstHttpUrl(rawText) {
  const value = String(rawText || "");
  const match = value.match(/https?:\/\/[^\s"'<>，。！？；、]+/i);
  if (!match) return null;
  return match[0].replace(/[)\]}）】》、，。！？；：,.!?;:]+$/u, "");
}

function normalizeVideoLink(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    throw new Error("缺少视频链接。");
  }

  const candidate = extractFirstHttpUrl(value);
  if (!candidate) {
    throw new Error("没有识别到 http/https 视频链接。");
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("视频链接格式不正确。");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("只支持 http/https 视频链接。");
  }

  return parsed.href;
}

function resolveExecutable(candidates = DEFAULT_MEOWLOAD_CANDIDATES, environment = process.env) {
  const pathEntries = String(environment.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);

  for (const candidate of candidates.filter(Boolean)) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }

    for (const entry of pathEntries) {
      const absolute = path.join(entry, candidate);
      if (fs.existsSync(absolute)) return absolute;
    }
  }

  return null;
}

function createImportId(url) {
  const digest = crypto
    .createHash("sha256")
    .update(`${url}:${Date.now()}`)
    .digest("hex")
    .slice(0, 10);
  return `${nowCompact()}-${digest}`;
}

function appendLog(logPath, text) {
  fs.appendFileSync(logPath, `${text}\n`);
}

async function runLogged(command, args, options) {
  const { cwd, logPath, label, timeout = 15 * 60 * 1000 } = options;
  appendLog(logPath, `[replication] ${new Date().toISOString()} ${label}`);
  appendLog(logPath, `$ ${command} ${args.join(" ")}`);

  try {
    const result = await execFileAsync(command, args, {
      cwd,
      timeout,
      maxBuffer: 64 * 1024 * 1024
    });
    if (result.stdout) appendLog(logPath, result.stdout.trimEnd());
    if (result.stderr) appendLog(logPath, result.stderr.trimEnd());
    appendLog(logPath, "[replication] command completed");
    return result;
  } catch (error) {
    if (error.stdout) appendLog(logPath, String(error.stdout).trimEnd());
    if (error.stderr) appendLog(logPath, String(error.stderr).trimEnd());
    appendLog(logPath, `[replication] command failed: ${error.message}`);
    throw error;
  }
}

function findVideoFiles(root) {
  if (!fs.existsSync(root)) return [];
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...findVideoFiles(absolute));
    } else if (SUPPORTED_VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(absolute);
    }
  }
  return results.sort((left, right) => fs.statSync(right).size - fs.statSync(left).size);
}

async function importVideoFromLink({
  rawUrl,
  dataRoot,
  probeVideo,
  meowloadPath = null,
  meowloadCandidates = DEFAULT_MEOWLOAD_CANDIDATES
}) {
  if (typeof probeVideo !== "function") {
    throw new Error("链接导入缺少视频预检器。");
  }

  const url = normalizeVideoLink(rawUrl);
  const meowload = meowloadPath || resolveExecutable(meowloadCandidates);
  if (!meowload) {
    throw new Error("找不到恒河猫 MeowLoad CLI；请先安装/登录恒河猫，或改用本地拖拽视频。");
  }

  const importDir = path.join(dataRoot, "link-imports", safeName(createImportId(url)));
  fs.mkdirSync(importDir, { recursive: true });
  fs.writeFileSync(path.join(importDir, "source-url.txt"), `${url}\n`);

  const infoLog = path.join(importDir, "meowload-info.log");
  const downloadLog = path.join(importDir, "meowload-download.log");
  const warnings = [];

  try {
    await runLogged(meowload, ["info", url], {
      cwd: importDir,
      logPath: infoLog,
      label: "MeowLoad info",
      timeout: 120 * 1000
    });
  } catch (error) {
    warnings.push(`info 失败：${error.message}`);
  }

  try {
    await runLogged(meowload, ["download", url, "--output-dir", importDir], {
      cwd: importDir,
      logPath: downloadLog,
      label: "MeowLoad download"
    });
  } catch (error) {
    throw new Error(`恒河猫拉取失败：${error.message}。日志：${downloadLog}`);
  }

  const candidates = findVideoFiles(importDir);
  if (candidates.length === 0) {
    throw new Error(`恒河猫已返回，但没有找到 MP4/MOV/M4V 视频文件。日志：${downloadLog}`);
  }

  let lastProbeError = null;
  for (const candidatePath of candidates) {
    try {
      const metadata = await probeVideo(candidatePath);
      return {
        path: candidatePath,
        name: path.basename(candidatePath),
        url: pathToFileURL(candidatePath).href,
        metadata,
        sourceLink: url,
        import: {
          adapter: "meowload",
          downloadDir: importDir,
          infoLog,
          downloadLog,
          warnings
        }
      };
    } catch (error) {
      lastProbeError = error;
    }
  }

  throw new Error(
    `链接视频已下载，但没有一个文件通过本地预检：${lastProbeError?.message || "未知错误"}。日志：${downloadLog}`
  );
}

module.exports = {
  extractFirstHttpUrl,
  findVideoFiles,
  importVideoFromLink,
  normalizeVideoLink,
  resolveExecutable
};
