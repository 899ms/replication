const os = require("node:os");
const path = require("node:path");

function pathApi(platform) {
  return platform === "win32" ? path.win32 : path;
}

function localVenvPython(projectRoot, platform = process.platform) {
  const platformPath = pathApi(platform);
  return platform === "win32"
    ? platformPath.join(projectRoot, ".venv", "Scripts", "python.exe")
    : platformPath.join(projectRoot, ".venv", "bin", "python");
}

function fallbackPython(platform = process.platform) {
  return platform === "win32" ? "python" : "python3";
}

function bootstrapPythonCandidates(options = {}) {
  const platform = options.platform || process.platform;
  const environment = options.environment || process.env;
  const candidates = [];
  if (environment.REPLICATION_BOOTSTRAP_PYTHON) {
    candidates.push({
      command: environment.REPLICATION_BOOTSTRAP_PYTHON,
      prefixArgs: []
    });
  }
  if (platform === "win32") {
    candidates.push(
      { command: "py", prefixArgs: ["-3"] },
      { command: "python", prefixArgs: [] },
      { command: "python3", prefixArgs: [] }
    );
  } else {
    candidates.push(
      { command: "python3", prefixArgs: [] },
      { command: "python", prefixArgs: [] }
    );
  }
  return candidates.filter(
    (candidate, index, list) =>
      list.findIndex(
        (item) =>
          item.command === candidate.command &&
          item.prefixArgs.join("\0") === candidate.prefixArgs.join("\0")
      ) === index
  );
}

function defaultCredentialsPath(options = {}) {
  const platform = options.platform || process.platform;
  const environment = options.environment || process.env;
  const homeDir = options.homeDir || os.homedir();
  const platformPath = pathApi(platform);
  if (platform === "win32") {
    const appData =
      environment.APPDATA ||
      platformPath.join(homeDir, "AppData", "Roaming");
    return platformPath.join(appData, "Replication", "credentials.json");
  }
  const configRoot =
    environment.XDG_CONFIG_HOME || platformPath.join(homeDir, ".config");
  return platformPath.join(configRoot, "replication", "credentials.json");
}

function bundledRuntimePaths(options = {}) {
  const platform = options.platform || process.platform;
  const resourcesPath = options.resourcesPath || process.resourcesPath;
  const projectRoot = options.projectRoot;
  if (platform !== "win32") return [];
  const platformPath = pathApi(platform);
  return [
    resourcesPath
      ? platformPath.join(resourcesPath, "replication-runtime")
      : null,
    projectRoot
      ? platformPath.join(projectRoot, "vendor", "replication-runtime")
      : null
  ].filter(Boolean);
}

module.exports = {
  bootstrapPythonCandidates,
  bundledRuntimePaths,
  defaultCredentialsPath,
  fallbackPython,
  localVenvPython
};
