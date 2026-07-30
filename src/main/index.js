const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");

const { listLocalAssets } = require("./local-assets");
const { RunManager } = require("./run-manager");

let mainWindow;
let runManager;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForRendererCondition(expression, timeoutMilliseconds = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    const ready = await mainWindow.webContents.executeJavaScript(Boolean(expression) ? expression : "false");
    if (ready) return;
    await delay(120);
  }
  throw new Error(`Timed out waiting for renderer condition: ${expression}`);
}

function projectRoot() {
  return path.resolve(__dirname, "..", "..");
}

function resolveDataRoot() {
  if (process.env.REPLICATION_DATA_DIR) {
    return path.resolve(process.env.REPLICATION_DATA_DIR);
  }
  if (!app.isPackaged) {
    return path.join(projectRoot(), "runtime");
  }
  return path.join(app.getPath("userData"), "Replication");
}

function createWindow() {
  const windowOptions = {
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: "Replication",
    backgroundColor: "#F3F2EC",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };
  if (process.platform === "darwin") {
    windowOptions.titleBarStyle = "hiddenInset";
    windowOptions.trafficLightPosition = { x: 20, y: 18 };
  }
  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  const capturePath = process.env.REPLICATION_CAPTURE_PATH;
  if (capturePath) {
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        const captureWithSource =
          Boolean(process.env.REPLICATION_DEMO_VIDEO) ||
          process.env.REPLICATION_CAPTURE_ACTION === "prepare";
        await waitForRendererCondition(captureWithSource
          ? "!document.querySelector('#sourceCard').classList.contains('hidden')"
          : "!document.querySelector('#dropZone').classList.contains('hidden')");
        if (process.env.REPLICATION_CAPTURE_ACTION === "prepare") {
          await mainWindow.webContents.executeJavaScript(
            "document.querySelector('#primaryButton').click(); true"
          );
          await waitForRendererCondition(
            "!document.querySelector('#authorizationModal').classList.contains('hidden')"
          );
        }
        await delay(240);
        const image = await mainWindow.webContents.capturePage();
        fs.writeFileSync(path.resolve(capturePath), image.toPNG());
        app.quit();
      } catch (error) {
        console.error(error);
        app.exit(1);
      }
    });
  }
}

function registerIpc() {
  ipcMain.handle("replication:bootstrap", () => ({
    demoVideoPath: process.env.REPLICATION_DEMO_VIDEO || null,
    demoPersonImagePath: process.env.REPLICATION_DEMO_PERSON_IMAGE || null,
    demoAudioReferencePath: process.env.REPLICATION_DEMO_AUDIO_REFERENCE || null,
    appVersion: app.getVersion(),
    packaged: app.isPackaged
  }));

  ipcMain.handle("replication:select-video", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择要复刻的视频",
      properties: ["openFile"],
      filters: [
        { name: "Video", extensions: ["mp4", "mov", "m4v"] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("replication:select-person-image", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择替换人物图",
      properties: ["openFile"],
      filters: [
        { name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("replication:select-audio-reference", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择音色参考",
      properties: ["openFile"],
      filters: [
        { name: "Audio", extensions: ["mp3", "wav", "m4a", "aac", "flac", "ogg"] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("replication:list-local-assets", (_event, input = {}) =>
    listLocalAssets({
      sourceVideoPath: input.sourceVideoPath || null,
      includeGlobal: input.includeGlobal === true
    })
  );

  ipcMain.handle("replication:inspect-video", (_event, videoPath) =>
    runManager.inspectVideo(videoPath)
  );
  ipcMain.handle("replication:import-video-link", (_event, input = {}) =>
    runManager.importVideoLink(input.url)
  );
  ipcMain.handle("replication:prepare-run", (_event, input) =>
    runManager.prepareRun(input)
  );
  ipcMain.handle("replication:get-run", (_event, runId) => runManager.getRun(runId));
  ipcMain.handle("replication:list-runs", () => runManager.listRuns());
  ipcMain.handle("replication:submit-run", (_event, runId) => runManager.submitRun(runId));
  ipcMain.handle("replication:cancel-run", (_event, runId) => runManager.cancelRun(runId));

  ipcMain.handle("replication:show-file", async (_event, filePath) => {
    if (!path.isAbsolute(filePath) || !fs.existsSync(filePath)) {
      throw new Error("文件不存在。");
    }
    shell.showItemInFolder(filePath);
    return true;
  });

  ipcMain.handle("replication:open-file", async (_event, filePath) => {
    if (!path.isAbsolute(filePath) || !fs.existsSync(filePath)) {
      throw new Error("文件不存在。");
    }
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
    return true;
  });
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.abo.replication");
  }
  runManager = new RunManager({
    dataRoot: resolveDataRoot(),
    assetRoot: path.join(projectRoot(), "assets")
  });
  registerIpc();
  createWindow();
  runManager.resumeRecoverableRuns().catch((error) => {
    console.error("[replication] resume recoverable runs failed", error);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
