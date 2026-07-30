const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  bootstrapPythonCandidates,
  localVenvPython
} = require("../src/core/platform-runtime");

const projectRoot = path.resolve(__dirname, "..");
const environmentRoot = path.join(projectRoot, ".venv");
const environmentPython = localVenvPython(projectRoot);
const requirements = path.join(projectRoot, "requirements.txt");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function resolveBootstrapPython() {
  for (const candidate of bootstrapPythonCandidates()) {
    const result = spawnSync(
      candidate.command,
      [...candidate.prefixArgs, "--version"],
      { stdio: "ignore" }
    );
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }
  throw new Error(
    "Python 3 was not found. Install Python 3 and rerun npm run setup:python."
  );
}

if (!fs.existsSync(environmentPython)) {
  const bootstrap = resolveBootstrapPython();
  console.log(`Creating private Python environment: ${environmentRoot}`);
  run(bootstrap.command, [
    ...bootstrap.prefixArgs,
    "-m",
    "venv",
    environmentRoot
  ]);
}

run(environmentPython, [
  "-m",
  "pip",
  "install",
  "--disable-pip-version-check",
  "-r",
  requirements
]);
console.log(`Python runtime ready: ${environmentPython}`);
