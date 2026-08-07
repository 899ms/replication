const fs = require("node:fs");
const path = require("node:path");

function normalizeEndpoint(value, label) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error(`请输入${label}。`);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label}必须是完整的 http:// 或 https:// URL。`);
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error(`${label}必须使用 HTTPS；只有本机地址允许 HTTP。`);
  }
  return raw;
}

function normalizeTaskPath(value) {
  const raw = String(value || "/contents/generations/tasks").trim();
  if (!raw.startsWith("/") || /\s/.test(raw)) {
    throw new Error("任务路径必须以 / 开头，且不能包含空格。");
  }
  return raw.replace(/\/+$/, "");
}

function modelProbeUrl(apiBase) {
  return `${apiBase.replace(/\/+$/, "")}/models`;
}

class VideoInterfaceConnectionManager {
  constructor(options) {
    this.dataRoot = options.dataRoot;
    this.secretBox = options.secretBox;
    this.fetcher = options.fetcher || globalThis.fetch;
    fs.mkdirSync(this.dataRoot, { recursive: true });
  }

  get configPath() {
    return path.join(this.dataRoot, "video-interface.json");
  }

  canEncrypt() {
    return Boolean(this.secretBox?.isEncryptionAvailable?.());
  }

  readStored() {
    if (!fs.existsSync(this.configPath)) return {};
    try {
      const value = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  writeStored(value) {
    const temporary = `${this.configPath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.configPath);
    fs.chmodSync(this.configPath, 0o600);
  }

  encrypt(value) {
    if (!this.canEncrypt()) throw new Error("当前系统安全存储不可用，密钥未保存。");
    return this.secretBox.encryptString(value).toString("base64");
  }

  decrypt(encoded) {
    if (!encoded) return "";
    if (!this.canEncrypt()) throw new Error("当前系统安全存储不可用，无法读取视频接口密钥。");
    return this.secretBox.decryptString(Buffer.from(encoded, "base64"));
  }

  publicConfig() {
    const stored = this.readStored();
    const hasEnvironmentKey = Boolean(process.env.VIDEO_API_KEY);
    const hasApiKey = Boolean(stored.encryptedApiKey) || hasEnvironmentKey;
    const hasUploadToken = Boolean(stored.encryptedUploadToken) || Boolean(process.env.VIDEO_UPLOAD_TOKEN);
    const apiBase = process.env.VIDEO_API_BASE || stored.apiBase || "";
    const uploadBase = process.env.VIDEO_UPLOAD_BASE || stored.uploadBase || apiBase;
    const providerName = process.env.VIDEO_INTERFACE_NAME || stored.providerName || "自定义视频接口";
    const model = process.env.VIDEO_API_MODEL || stored.model || "doubao-seedance-2-0-260128";
    const taskPath = process.env.VIDEO_TASK_PATH || stored.taskPath || "/contents/generations/tasks";
    return {
      protocol: "replication-seedance-compatible",
      providerName,
      apiBase,
      uploadBase,
      model,
      taskPath,
      hasApiKey,
      hasUploadToken,
      configured: Boolean(apiBase && model && hasApiKey),
      credentialSource: hasEnvironmentKey ? "environment" : hasApiKey ? "safeStorage" : null,
      updatedAt: stored.updatedAt || null
    };
  }

  save(input = {}) {
    const stored = this.readStored();
    const providerName = String(input.providerName || "").trim();
    if (!providerName) throw new Error("请输入接口名称，方便在授权时识别供应商。");
    const apiBase = normalizeEndpoint(input.apiBase, "视频 API 地址");
    const uploadBase = normalizeEndpoint(input.uploadBase || input.apiBase, "素材上传地址");
    const model = String(input.model || "").trim();
    if (!model) throw new Error("请输入视频模型名称。");
    const taskPath = normalizeTaskPath(input.taskPath);
    const incomingApiKey = String(input.apiKey || "").trim();
    const incomingUploadToken = String(input.uploadToken || "").trim();
    if (!incomingApiKey && !stored.encryptedApiKey && !process.env.VIDEO_API_KEY) {
      throw new Error("请输入视频接口 API Key。");
    }

    const next = {
      schemaVersion: 1,
      providerName,
      apiBase,
      uploadBase,
      model,
      taskPath,
      encryptedApiKey: incomingApiKey ? this.encrypt(incomingApiKey) : stored.encryptedApiKey,
      encryptedUploadToken: incomingUploadToken
        ? this.encrypt(incomingUploadToken)
        : stored.encryptedUploadToken || null,
      updatedAt: new Date().toISOString()
    };
    this.writeStored(next);
    return this.publicConfig();
  }

  runtimeEnvironment({ requireConfigured = false } = {}) {
    const stored = this.readStored();
    const config = this.publicConfig();
    if (requireConfigured && !config.configured) {
      throw new Error("请先在左侧“视频接口”中保存可用的接口地址、模型和 API Key。");
    }
    const apiKey = process.env.VIDEO_API_KEY || this.decrypt(stored.encryptedApiKey);
    const uploadToken = process.env.VIDEO_UPLOAD_TOKEN || this.decrypt(stored.encryptedUploadToken) || apiKey;
    const tasksEndpoint = config.apiBase
      ? `${config.apiBase.replace(/\/+$/, "")}${normalizeTaskPath(config.taskPath)}`
      : "";
    return {
      VIDEO_INTERFACE_NAME: config.providerName,
      VIDEO_API_BASE: config.apiBase,
      VIDEO_UPLOAD_BASE: config.uploadBase,
      VIDEO_API_MODEL: config.model,
      VIDEO_TASKS_ENDPOINT: tasksEndpoint,
      VIDEO_API_KEY: apiKey,
      VIDEO_UPLOAD_TOKEN: uploadToken,
      // Legacy aliases keep existing packaged adapters working while the public seam stays generic.
      SEEDANCE_API_BASE: config.apiBase,
      SEEDANCE_TASKS_ENDPOINT: tasksEndpoint,
      KUAIZI_API_KEY: apiKey,
      KUAIZI_CONSOLE_TOKEN: uploadToken
    };
  }

  async testConnection() {
    const config = this.publicConfig();
    const environment = this.runtimeEnvironment({ requireConfigured: true });
    let response;
    try {
      response = await this.fetcher(modelProbeUrl(config.apiBase), {
        headers: {
          Authorization: `Bearer ${environment.VIDEO_API_KEY}`,
          Accept: "application/json"
        }
      });
    } catch (error) {
      throw new Error(`无法连接视频接口：${error.message}`);
    }
    if ([401, 403].includes(response.status)) throw new Error("视频接口 API Key 验证失败。");
    if (response.ok) {
      return { ok: true, verified: true, message: `${config.providerName} 已连接，凭据验证通过。` };
    }
    if ([404, 405].includes(response.status)) {
      return {
        ok: true,
        verified: false,
        message: `${config.providerName} 已保存；该接口未提供免费模型检测端点，将在首次生成授权后验证。`
      };
    }
    throw new Error(`视频接口返回 HTTP ${response.status}。`);
  }
}

module.exports = {
  VideoInterfaceConnectionManager,
  modelProbeUrl,
  normalizeEndpoint,
  normalizeTaskPath
};
