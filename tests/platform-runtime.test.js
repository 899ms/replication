const test = require("node:test");
const assert = require("node:assert/strict");

const {
  bootstrapPythonCandidates,
  bundledRuntimePaths,
  defaultCredentialsPath,
  fallbackPython,
  localVenvPython
} = require("../src/core/platform-runtime");

test("Windows uses the repository venv Scripts directory", () => {
  assert.equal(
    localVenvPython("C:\\replication", "win32"),
    "C:\\replication\\.venv\\Scripts\\python.exe"
  );
  assert.equal(fallbackPython("win32"), "python");
});

test("Windows prefers py -3 when bootstrapping Python", () => {
  assert.deepEqual(
    bootstrapPythonCandidates({
      platform: "win32",
      environment: {}
    })[0],
    { command: "py", prefixArgs: ["-3"] }
  );
});

test("credential paths follow each operating system convention", () => {
  assert.equal(
    defaultCredentialsPath({
      platform: "win32",
      environment: { APPDATA: "C:\\Users\\Demo\\AppData\\Roaming" },
      homeDir: "C:\\Users\\Demo"
    }),
    "C:\\Users\\Demo\\AppData\\Roaming\\Replication\\credentials.json"
  );
  assert.equal(
    defaultCredentialsPath({
      platform: "darwin",
      environment: {},
      homeDir: "/Users/demo"
    }),
    "/Users/demo/.config/replication/credentials.json"
  );
});

test("packaged Windows tools resolve below Electron resources", () => {
  assert.deepEqual(
    bundledRuntimePaths({
      platform: "win32",
      resourcesPath: "C:\\Replication\\resources",
      projectRoot: "C:\\source"
    }),
    [
      "C:\\Replication\\resources\\replication-runtime",
      "C:\\source\\vendor\\replication-runtime"
    ]
  );
  assert.deepEqual(
    bundledRuntimePaths({
      platform: "darwin",
      resourcesPath: "/Applications/Replication.app/Contents/Resources"
    }),
    []
  );
});
