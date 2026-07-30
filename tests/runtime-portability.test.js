const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("production runtime is packaged in the repository", () => {
  const scripts = [
    "runtime/seedance-face-swap/scripts/inspect_inputs.py",
    "runtime/seedance-face-swap/scripts/create_face_swap_contract.py",
    "runtime/seedance-face-swap/scripts/submit_face_swap_task.py",
    "runtime/seedance-face-swap/scripts/final_qa.py",
    "runtime/seedance-face-swap/scripts/kuaizi_runtime.py"
  ];
  for (const script of scripts) {
    assert.equal(fs.existsSync(path.join(projectRoot, script)), true, script);
  }
});

test("production bindings do not reference abo's machine", () => {
  const files = [
    "src/main/run-manager.js",
    "src/main/resume-face-swap-task.py",
    "capabilities/video.replication.generate.v1.json",
    "runtime/seedance-face-swap/scripts/create_face_swap_contract.py",
    "runtime/seedance-face-swap/scripts/submit_face_swap_task.py"
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /\/Users\/abo\//, file);
  }
});

test("desktop builds keep the packaged runtime", () => {
  const pkg = JSON.parse(read("package.json"));
  for (const target of ["build:mac", "build:win"]) {
    assert.doesNotMatch(pkg.scripts[target], /\(runtime\|/);
    assert.match(pkg.scripts[target], /--asar\.unpackDir=runtime/);
    assert.match(pkg.scripts[target], /\\\.venv/);
  }
  assert.match(pkg.scripts["build:win"], /--platform=win32/);
  assert.match(pkg.scripts["build:win"], /--arch=x64/);
  assert.match(pkg.scripts["build:win"], /--extra-resource=vendor\/replication-runtime/);
  assert.match(pkg.scripts["build:win"], /--extra-resource=scripts\/configure-runtime\.py/);
  assert.doesNotMatch(read(".gitignore"), /^runtime\/$/m);
  assert.match(read(".gitignore"), /^\.venv\/$/m);
});

test("Windows release includes a first-run credential helper without secrets", () => {
  const helper = read("windows/Configure-Account.cmd");
  const instructions = read("windows/README-Windows.txt");
  assert.match(helper, /replication-runtime\\python\\python\.exe/);
  assert.match(helper, /configure-runtime\.py/);
  assert.match(instructions, /不会包含/);
  assert.doesNotMatch(
    `${helper}\n${instructions}`,
    /KUAIZI_(API_KEY|PASSWORD|CONSOLE_TOKEN)\s*=\s*["'][^"']+/
  );
});
