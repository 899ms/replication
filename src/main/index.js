const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");

const { listLocalAssets } = require("./local-assets");
const { MinimaxH3ConnectionManager } = require("./minimax-h3-connections");
const {
  MODEL_REPOSITORY_URL,
  listMinimaxH3Models,
  openModelDownloads
} = require("./minimax-h3-models");
const { getMinimaxH3Status } = require("./minimax-h3-runtime");
const { RunManager } = require("./run-manager");
const { VideoInterfaceConnectionManager } = require("./video-interface-connections");

let mainWindow;
let h3ConnectionManager;
let runManager;
let videoInterfaceManager;

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
    width: 1500,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    title: "ReplicaPilot",
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
        if (["history", "history-detail"].includes(process.env.REPLICATION_CAPTURE_ACTION)) {
          await mainWindow.webContents.executeJavaScript(
            "document.querySelector('[data-rail-view=\"history\"]').click(); true"
          );
          await waitForRendererCondition(
            "!document.querySelector('#historyView').classList.contains('hidden') && !document.querySelector('#historySummary').textContent.includes('正在读取')"
          );
        }
        if (["video-interface", "minimax-h3", "minimax-h3-models", "minimax-h3-connections", "minimax-h3-ssh"].includes(process.env.REPLICATION_CAPTURE_ACTION)) {
          await mainWindow.webContents.executeJavaScript(
            "document.querySelector('[data-rail-view=\"minimax-h3\"]').click(); true"
          );
          await waitForRendererCondition(
            "!document.querySelector('#minimaxH3View').classList.contains('hidden') && document.querySelector('#h3LiveBadge').dataset.state !== 'checking'"
          );
          if (process.env.REPLICATION_CAPTURE_ACTION === "minimax-h3-models") {
            await waitForRendererCondition(
              "document.querySelectorAll('#h3ModelList .h3-model-item').length === 4"
            );
            await mainWindow.webContents.executeJavaScript(
              "document.querySelector('.workspace').scrollTo({ top: document.querySelector('.h3-model-download-card').offsetTop - 38, behavior: 'instant' }); true"
            );
          }
          if (["minimax-h3-connections", "minimax-h3-ssh"].includes(process.env.REPLICATION_CAPTURE_ACTION)) {
            if (process.env.REPLICATION_CAPTURE_ACTION === "minimax-h3-ssh") {
              await mainWindow.webContents.executeJavaScript(
                "document.querySelector('[data-h3-connector=\"ssh\"]').click(); true"
              );
            }
            await mainWindow.webContents.executeJavaScript(
              "document.querySelector('.workspace').scrollTo({ top: document.querySelector('.workspace').scrollHeight, behavior: 'instant' }); true"
            );
          }
        }
        if (process.env.REPLICATION_CAPTURE_ACTION === "history-detail") {
          await mainWindow.webContents.executeJavaScript(
            "document.querySelector('[data-history-run-id] .history-open-button')?.click(); true"
          );
          await waitForRendererCondition(
            "!document.querySelector('#resultsSection').classList.contains('hidden')"
          );
        }
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
    initialView: process.env.REPLICATION_INITIAL_VIEW || "replication",
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
  ipcMain.handle("replication:video-interface", () =>
    videoInterfaceManager.publicConfig()
  );
  ipcMain.handle("replication:save-video-interface", (_event, input) =>
    videoInterfaceManager.save(input)
  );
  ipcMain.handle("replication:test-video-interface", () =>
    videoInterfaceManager.testConnection()
  );
  ipcMain.handle("replication:minimax-h3-status", () => getMinimaxH3Status());
  ipcMain.handle("replication:minimax-h3-models", async () => {
    const status = await getMinimaxH3Status();
    const models = listMinimaxH3Models(status.modelChecks);
    return {
      repositoryUrl: MODEL_REPOSITORY_URL,
      totalSizeBytes: models.reduce((total, model) => total + model.sizeBytes, 0),
      models
    };
  });
  ipcMain.handle("replication:open-minimax-h3-model-repository", async () => {
    await shell.openExternal(MODEL_REPOSITORY_URL);
    return { opened: MODEL_REPOSITORY_URL };
  });
  ipcMain.handle("replication:open-minimax-h3-model-downloads", (_event, input = {}) =>
    openModelDownloads(input.modelIds, (url) => shell.openExternal(url))
  );
  ipcMain.handle("replication:minimax-h3-connections", () =>
    h3ConnectionManager.publicConfig()
  );
  ipcMain.handle("replication:save-minimax-h3-api", (_event, input) =>
    h3ConnectionManager.saveApi(input)
  );
  ipcMain.handle("replication:test-minimax-h3-api", () =>
    h3ConnectionManager.testApi()
  );
  ipcMain.handle("replication:save-minimax-h3-ssh", (_event, input) =>
    h3ConnectionManager.saveSsh(input)
  );
  ipcMain.handle("replication:test-minimax-h3-ssh", () =>
    h3ConnectionManager.testSsh()
  );
  ipcMain.handle("replication:select-minimax-h3-identity", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择 SSH 私钥文件",
      properties: ["openFile", "showHiddenFiles"]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("replication:open-minimax-h3", async () => {
    const status = await getMinimaxH3Status();
    if (status.connection?.endpoint) {
      await shell.openExternal(status.connection.endpoint);
      return { opened: "endpoint", target: status.connection.endpoint };
    }
    if (status.comfyRoot) {
      const error = await shell.openPath(status.comfyRoot);
      if (error) throw new Error(error);
      return { opened: "workspace", target: status.comfyRoot };
    }
    throw new Error("未找到本机 ComfyUI 工作区，请先设置 REPLICATION_MINIMAX_H3_COMFY_ROOT。");
  });
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
  const dataRoot = resolveDataRoot();
  videoInterfaceManager = new VideoInterfaceConnectionManager({
    dataRoot,
    secretBox: safeStorage
  });
  runManager = new RunManager({
    dataRoot,
    assetRoot: path.join(projectRoot(), "assets"),
    videoInterfaceManager
  });
  h3ConnectionManager = new MinimaxH3ConnectionManager({
    dataRoot,
    secretBox: safeStorage
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
