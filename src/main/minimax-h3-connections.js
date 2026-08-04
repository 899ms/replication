const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function normalizeApiEndpoint(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error("请输入 MiniMax H3 API 地址。");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("API 地址必须是完整的 http:// 或 https:// URL。");
  }
  const isLocal = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    throw new Error("远程 API 必须使用 HTTPS；只有本机地址允许 HTTP。");
  }
  return raw;
}

function modelProbeUrl(endpoint) {
  const parsed = new URL(endpoint);
  const cleanPath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = cleanPath.endsWith("/v1") ? `${cleanPath}/models` : `${cleanPath}/v1/models`;
  return parsed.toString();
}

function normalizeSshConfig(input = {}) {
  const host = String(input.host || "").trim();
  const username = String(input.username || "").trim();
  const port = Number(input.port || 22);
  const workspacePath = String(input.workspacePath || "").trim();
  const identityFile = String(input.identityFile || "").trim();
  if (!host || /\s/.test(host) || host.startsWith("-")) throw new Error("请输入有效的 SSH 主机地址。");
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) throw new Error("请输入有效的 SSH 用户名。");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SSH 端口必须在 1–65535 之间。");
  if (/\r|\n/.test(workspacePath)) throw new Error("远程工作目录不能包含换行符。");
  if (identityFile && (!path.isAbsolute(identityFile) || !fs.existsSync(identityFile))) {
    throw new Error("SSH 密钥文件不存在。");
  }
  return { host, username, port, workspacePath, identityFile };
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  fs.chmodSync(filePath, 0o600);
}

class MinimaxH3ConnectionManager {
  constructor(options) {
    this.dataRoot = options.dataRoot;
    this.secretBox = options.secretBox;
    this.fetcher = options.fetcher || globalThis.fetch;
    this.execFile = options.execFile || execFileAsync;
  }

  get configFile() {
    return path.join(this.dataRoot, "config", "minimax-h3-connections.json");
  }

  readStored() {
    if (!fs.existsSync(this.configFile)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.configFile, "utf8"));
    } catch {
      throw new Error("MiniMax H3 连接配置无法读取。");
    }
  }

  writeStored(value) {
    writeJsonAtomic(this.configFile, value);
  }

  canEncrypt() {
    return Boolean(this.secretBox?.isEncryptionAvailable?.());
  }

  publicConfig() {
    const stored = this.readStored();
    const hasStoredKey = Boolean(stored.api?.encryptedApiKey);
    const hasEnvironmentKey = Boolean(process.env.MINIMAX_H3_API_KEY);
    return {
      api: {
        endpoint: stored.api?.endpoint || "",
        model: stored.api?.model || "MiniMax-H3",
        hasApiKey: hasStoredKey || hasEnvironmentKey,
        credentialSource: hasStoredKey ? "secure_storage" : hasEnvironmentKey ? "environment" : null
      },
      ssh: {
        host: stored.ssh?.host || "",
        username: stored.ssh?.username || "",
        port: stored.ssh?.port || 22,
        workspacePath: stored.ssh?.workspacePath || "",
        identityFile: stored.ssh?.identityFile || ""
      }
    };
  }

  apiKey(stored = this.readStored()) {
    if (process.env.MINIMAX_H3_API_KEY) return process.env.MINIMAX_H3_API_KEY;
    const encrypted = stored.api?.encryptedApiKey;
    if (!encrypted) return null;
    if (!this.canEncrypt()) throw new Error("当前系统安全存储不可用，无法解密 H3 API Key。");
    return this.secretBox.decryptString(Buffer.from(encrypted, "base64"));
  }

  saveApi(input = {}) {
    const stored = this.readStored();
    const endpoint = normalizeApiEndpoint(input.endpoint);
    const model = String(input.model || "").trim();
    const incomingKey = String(input.apiKey || "").trim();
    if (!model) throw new Error("请输入 MiniMax H3 模型名称。");
    if (!incomingKey && !stored.api?.encryptedApiKey && !process.env.MINIMAX_H3_API_KEY) {
      throw new Error("请输入 MiniMax H3 API Key。");
    }
    let encryptedApiKey = stored.api?.encryptedApiKey || null;
    if (incomingKey) {
      if (!this.canEncrypt()) {
        throw new Error("当前系统安全存储不可用，API Key 未保存。");
      }
      encryptedApiKey = this.secretBox.encryptString(incomingKey).toString("base64");
    }
    stored.api = { endpoint, model, encryptedApiKey, updatedAt: new Date().toISOString() };
    this.writeStored(stored);
    return this.publicConfig().api;
  }

  saveSsh(input = {}) {
    const stored = this.readStored();
    stored.ssh = { ...normalizeSshConfig(input), updatedAt: new Date().toISOString() };
    this.writeStored(stored);
    return this.publicConfig().ssh;
  }

  async testApi() {
    const stored = this.readStored();
    if (!stored.api?.endpoint) throw new Error("请先保存 MiniMax H3 API 配置。");
    const apiKey = this.apiKey(stored);
    if (!apiKey) throw new Error("未找到 MiniMax H3 API Key。");
    let response;
    try {
      response = await this.fetcher(modelProbeUrl(stored.api.endpoint), {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(6000)
      });
    } catch (error) {
      throw new Error(`无法连接 MiniMax H3 API：${error.message}`);
    }
    if ([401, 403].includes(response.status)) throw new Error("MiniMax H3 API Key 验证失败。");
    if (response.ok) {
      return { ok: true, verified: true, message: "API 连接和凭据已验证。" };
    }
    if ([404, 405].includes(response.status)) {
      return {
        ok: true,
        verified: false,
        message: "API 配置已保存；该服务未提供免费模型检测端点，需在首次生成授权时验证。"
      };
    }
    throw new Error(`MiniMax H3 API 返回 HTTP ${response.status}。`);
  }

  async testSsh() {
    const stored = this.readStored();
    if (!stored.ssh) throw new Error("请先保存 SSH 服务器配置。");
    const config = normalizeSshConfig(stored.ssh);
    const args = [
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=6",
      "-o", "StrictHostKeyChecking=yes",
      "-p", String(config.port)
    ];
    if (config.identityFile) args.push("-i", config.identityFile);
    args.push(`${config.username}@${config.host}`, "printf REPLICATION_H3_SSH_OK");
    try {
      const { stdout } = await this.execFile("ssh", args, { timeout: 9000, maxBuffer: 1024 * 1024 });
      if (!String(stdout).includes("REPLICATION_H3_SSH_OK")) throw new Error("远程回应不完整。");
      return { ok: true, message: `SSH 已连接 ${config.username}@${config.host}:${config.port}。` };
    } catch (error) {
      throw new Error(`SSH 连接失败：${error.stderr?.trim() || error.message}`);
    }
  }
}

module.exports = {
  MinimaxH3ConnectionManager,
  modelProbeUrl,
  normalizeApiEndpoint,
  normalizeSshConfig
};
