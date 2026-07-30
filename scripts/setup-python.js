const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const environmentRoot = path.join(projectRoot, ".venv");
const python = process.env.REPLICATION_BOOTSTRAP_PYTHON || "python3";
const environmentPython = path.join(environmentRoot, "bin", "python");
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

if (!fs.existsSync(environmentPython)) {
  console.log(`Creating private Python environment: ${environmentRoot}`);
  run(python, ["-m", "venv", environmentRoot]);
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
