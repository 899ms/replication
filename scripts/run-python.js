const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  bootstrapPythonCandidates,
  localVenvPython
} = require("../src/core/platform-runtime");

const projectRoot = path.resolve(__dirname, "..");
const forwardedArgs = process.argv.slice(2);

if (forwardedArgs.length === 0) {
  console.error("Usage: node scripts/run-python.js <script.py> [args...]");
  process.exit(2);
}

const localPython = localVenvPython(projectRoot);
const candidates = [
  process.env.REPLICATION_PYTHON
    ? { command: process.env.REPLICATION_PYTHON, prefixArgs: [] }
    : null,
  fs.existsSync(localPython)
    ? { command: localPython, prefixArgs: [] }
    : null,
  ...bootstrapPythonCandidates()
].filter(Boolean);

for (const candidate of candidates) {
  const probe = spawnSync(
    candidate.command,
    [...candidate.prefixArgs, "--version"],
    { stdio: "ignore" }
  );
  if (probe.error || probe.status !== 0) continue;
  const result = spawnSync(
    candidate.command,
    [...candidate.prefixArgs, ...forwardedArgs],
    {
      cwd: projectRoot,
      stdio: "inherit"
    }
  );
  if (result.error) throw result.error;
  process.exit(result.status || 0);
}

console.error("Python 3 was not found. Run npm run setup:python first.");
process.exit(1);
