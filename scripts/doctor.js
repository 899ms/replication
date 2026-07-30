const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  bootstrapPythonCandidates,
  defaultCredentialsPath,
  localVenvPython
} = require("../src/core/platform-runtime");

const projectRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(projectRoot, "runtime", "seedance-face-swap", "scripts");
const requiredScripts = [
  "inspect_inputs.py",
  "create_face_swap_contract.py",
  "submit_face_swap_task.py",
  "final_qa.py",
  "kuaizi_runtime.py"
];

function commandWorks(command, args = []) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function resolveExecutable(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
    } else if (commandWorks(candidate, ["-version"])) {
      return candidate;
    }
  }
  return null;
}

function credentialsState() {
  const configured =
    process.env.REPLICATION_CREDENTIALS_FILE ||
    defaultCredentialsPath({
      environment: process.env,
      homeDir: os.homedir()
    });
  const hasEnvironment =
    Boolean(process.env.KUAIZI_CONSOLE_TOKEN && process.env.KUAIZI_API_KEY) ||
    Boolean(process.env.KUAIZI_USERNAME && process.env.KUAIZI_PASSWORD);
  return { configured, ready: hasEnvironment || fs.existsSync(configured) };
}

const checks = [];
const nodeVersion = process.versions.node.split(".").map(Number);
const nodeReady =
  nodeVersion[0] > 22 ||
  (nodeVersion[0] === 22 && (nodeVersion[1] > 12 || (nodeVersion[1] === 12 && nodeVersion[2] >= 0)));
checks.push({ name: "Node.js >= 22.12", required: true, ok: nodeReady });
const localPython = localVenvPython(projectRoot);
const pythonCandidates = [
  process.env.REPLICATION_PYTHON
    ? { command: process.env.REPLICATION_PYTHON, prefixArgs: [] }
    : null,
  fs.existsSync(localPython)
    ? { command: localPython, prefixArgs: [] }
    : null,
  ...bootstrapPythonCandidates()
].filter(Boolean);
const pythonEntry = pythonCandidates.find((candidate) =>
  commandWorks(candidate.command, [...candidate.prefixArgs, "--version"])
);
const python = pythonEntry?.command || "";
const pythonPrefixArgs = pythonEntry?.prefixArgs || [];
checks.push({
  name: "packaged runtime",
  required: true,
  ok: requiredScripts.every((name) => fs.existsSync(path.join(runtimeRoot, name)))
});
checks.push({ name: "Python 3", required: true, ok: Boolean(pythonEntry) });
checks.push({
  name: "Python requests",
  required: true,
  ok:
    Boolean(pythonEntry) &&
    commandWorks(python, [...pythonPrefixArgs, "-c", "import requests"])
});
const ffprobe = resolveExecutable([
  process.env.REPLICATION_FFPROBE,
  "/opt/homebrew/bin/ffprobe",
  "/usr/local/bin/ffprobe",
  "/usr/bin/ffprobe",
  "ffprobe"
]);
checks.push({ name: "ffprobe", required: true, ok: Boolean(ffprobe) });
const credentials = credentialsState();
checks.push({ name: "Kuaizi credentials", required: false, ok: credentials.ready });
const meowload = resolveExecutable([
  process.env.REPLICATION_MEOWLOAD,
  "/opt/homebrew/bin/MeowLoad",
  "/opt/homebrew/bin/meowload",
  "/usr/local/bin/MeowLoad",
  "/usr/local/bin/meowload",
  "MeowLoad.exe",
  "meowload.exe"
]);
checks.push({ name: "MeowLoad (link import only)", required: false, ok: Boolean(meowload) });

for (const check of checks) {
  const marker = check.ok ? "PASS" : check.required ? "FAIL" : "WARN";
  console.log(`${marker}  ${check.name}`);
}

if (!credentials.ready) {
  console.log(`INFO  Run npm run configure before paid generation (${credentials.configured}).`);
}
if (!meowload) {
  console.log("INFO  Local video import still works without MeowLoad.");
}

const failed = checks.filter((check) => check.required && !check.ok);
process.exitCode = failed.length > 0 ? 1 : 0;
