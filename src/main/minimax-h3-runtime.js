const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_ENDPOINTS = ["http://127.0.0.1:6006", "http://127.0.0.1:8188"];
const MODEL_MATCHERS = {
  diffusion: /minimax_h3_(?:ref2va|fl2va).*\.(?:safetensors|gguf)$/i,
  textEncoder: /qwen3vl_32b_minimax_h3.*\.(?:safetensors|gguf)$/i,
  videoVae: /minimax_h3_video_vae.*\.(?:safetensors|gguf)$/i,
  audioVae: /minimax_h3_audio_vae.*\.(?:safetensors|gguf)$/i
};

function normalizeEndpoint(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function uniqueExistingDirectories(candidates) {
  return [...new Set(candidates.filter(Boolean).map((candidate) => path.resolve(candidate)))]
    .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
}

function defaultComfyRoots() {
  const home = os.homedir();
  return uniqueExistingDirectories([
    process.env.REPLICATION_MINIMAX_H3_COMFY_ROOT,
    process.env.COMFYUI_ROOT,
    path.join(home, "Desktop", "土豆大王", "ComfyUI"),
    path.join(home, "ComfyUI"),
    path.join(home, "Documents", "ComfyUI")
  ]);
}

function listFiles(root, maxDepth = 3, depth = 0) {
  if (!root || depth > maxDepth || !fs.existsSync(root)) return [];
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...listFiles(absolute, maxDepth, depth + 1));
    } else {
      output.push(absolute);
    }
  }
  return output;
}

function inspectModelFiles(comfyRoots = defaultComfyRoots()) {
  const files = comfyRoots.flatMap((root) => listFiles(path.join(root, "models"), 3));
  const matches = {};
  for (const [key, matcher] of Object.entries(MODEL_MATCHERS)) {
    matches[key] = files.find((filePath) => matcher.test(path.basename(filePath))) || null;
  }
  return {
    files: Object.values(matches).filter(Boolean),
    matches,
    complete: Object.values(matches).every(Boolean)
  };
}

async function probeEndpoint(endpoint, fetcher = globalThis.fetch) {
  const normalized = normalizeEndpoint(endpoint);
  if (!normalized || typeof fetcher !== "function") {
    return { endpoint: normalized, connected: false, error: "未配置可用的网络请求器。" };
  }
  try {
    const response = await fetcher(`${normalized}/system_stats`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(1800)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const device = Array.isArray(payload.devices) ? payload.devices[0] : null;
    return {
      endpoint: normalized,
      connected: true,
      version: payload.system?.comfyui_version || payload.comfyui_version || null,
      device: device?.name || device?.type || null
    };
  } catch (error) {
    return { endpoint: normalized, connected: false, error: error.message };
  }
}

async function getMinimaxH3Status(options = {}) {
  const comfyRoots = options.comfyRoots || defaultComfyRoots();
  const endpoints = options.endpoints || [
    process.env.REPLICATION_MINIMAX_H3_URL,
    ...DEFAULT_ENDPOINTS
  ].filter(Boolean);
  const probes = await Promise.all(
    [...new Set(endpoints.map(normalizeEndpoint))].map((endpoint) =>
      probeEndpoint(endpoint, options.fetcher)
    )
  );
  const connection = probes.find((probe) => probe.connected) || null;
  const models = inspectModelFiles(comfyRoots);
  const ready = Boolean(connection && models.complete);
  let state = "ready";
  if (!connection && comfyRoots.length === 0) state = "not_installed";
  else if (!connection) state = "service_offline";
  else if (!models.complete) state = "models_missing";

  return {
    state,
    ready,
    connection,
    probes,
    comfyRoot: comfyRoots[0] || null,
    modelChecks: {
      diffusion: Boolean(models.matches.diffusion),
      textEncoder: Boolean(models.matches.textEncoder),
      videoVae: Boolean(models.matches.videoVae),
      audioVae: Boolean(models.matches.audioVae)
    },
    modelFiles: models.files
  };
}

module.exports = {
  DEFAULT_ENDPOINTS,
  getMinimaxH3Status,
  inspectModelFiles,
  normalizeEndpoint,
  probeEndpoint
};
