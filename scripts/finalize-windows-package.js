const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const packageRoot = path.resolve(
  process.argv[2] ||
    path.join(projectRoot, "dist", "Replication-win32-x64")
);
const required = [
  "Replication.exe",
  path.join("resources", "app.asar"),
  path.join(
    "resources",
    "app.asar.unpacked",
    "runtime",
    "seedance-face-swap",
    "scripts",
    "kuaizi_runtime.py"
  ),
  path.join("resources", "replication-runtime", "python", "python.exe"),
  path.join("resources", "replication-runtime", "ffmpeg", "ffmpeg.exe"),
  path.join("resources", "replication-runtime", "ffmpeg", "ffprobe.exe"),
  path.join("resources", "configure-runtime.py")
];
const missing = required.filter(
  (relativePath) => !fs.existsSync(path.join(packageRoot, relativePath))
);
if (missing.length > 0) {
  throw new Error(
    `Windows package is incomplete:\n${missing
      .map((relativePath) => `- ${relativePath}`)
      .join("\n")}`
  );
}

for (const filename of ["Configure-Account.cmd", "README-Windows.txt"]) {
  fs.copyFileSync(
    path.join(projectRoot, "windows", filename),
    path.join(packageRoot, filename)
  );
}

console.log(`Windows package finalized: ${packageRoot}`);
