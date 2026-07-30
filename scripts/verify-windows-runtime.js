const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.resolve(
  process.argv[2] || path.join(projectRoot, "vendor", "replication-runtime")
);
const required = [
  "runtime-manifest.json",
  path.join("python", "python.exe"),
  path.join("python", "LICENSE.txt"),
  path.join("ffmpeg", "ffmpeg.exe"),
  path.join("ffmpeg", "ffprobe.exe"),
  path.join("ffmpeg", "LICENSE.txt")
];
const missing = required.filter(
  (relativePath) => !fs.existsSync(path.join(runtimeRoot, relativePath))
);

if (missing.length > 0) {
  console.error(
    [
      "Windows runtime is incomplete.",
      ...missing.map((relativePath) => `- ${relativePath}`),
      "Run npm run prepare:win-runtime on Windows, then rebuild."
    ].join("\n")
  );
  process.exit(1);
}

const manifest = JSON.parse(
  fs
    .readFileSync(path.join(runtimeRoot, "runtime-manifest.json"), "utf8")
    .replace(/^\uFEFF/, "")
);
if (
  manifest.schema_version !== "replication.windows-runtime.v1" ||
  manifest.architecture !== "x64"
) {
  throw new Error("Unexpected Windows runtime manifest.");
}

if (process.platform === "win32") {
  const checks = [
    {
      command: path.join(runtimeRoot, "python", "python.exe"),
      args: ["-c", "import requests; print(requests.__version__)"],
      name: "embedded Python requests"
    },
    {
      command: path.join(runtimeRoot, "ffmpeg", "ffprobe.exe"),
      args: ["-version"],
      name: "embedded ffprobe"
    }
  ];
  for (const check of checks) {
    const result = spawnSync(check.command, check.args, { stdio: "inherit" });
    if (result.error || result.status !== 0) {
      throw result.error || new Error(`${check.name} exited ${result.status}`);
    }
  }
}

console.log(
  `Windows runtime verified: Python ${manifest.python.version}, FFmpeg ${manifest.ffmpeg.version}`
);
