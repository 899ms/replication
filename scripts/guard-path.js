const fs = require("node:fs");
const path = require("node:path");

const expected = fs.realpathSync(path.resolve(__dirname, ".."));
const actual = fs.realpathSync(process.cwd());
const packagePath = path.join(expected, "package.json");

if (actual !== expected || !fs.existsSync(packagePath)) {
  console.error(`Replication path guard failed.\nExpected: ${expected}\nActual:   ${actual}`);
  process.exit(1);
}

console.log(`Replication source guard passed: ${expected}`);
