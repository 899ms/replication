const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("replication", {
  bootstrap: () => ipcRenderer.invoke("replication:bootstrap"),
  selectVideo: () => ipcRenderer.invoke("replication:select-video"),
  selectPersonImage: () => ipcRenderer.invoke("replication:select-person-image"),
  selectAudioReference: () => ipcRenderer.invoke("replication:select-audio-reference"),
  listLocalAssets: (input) => ipcRenderer.invoke("replication:list-local-assets", input),
  inspectVideo: (videoPath) => ipcRenderer.invoke("replication:inspect-video", videoPath),
  importVideoLink: (url) => ipcRenderer.invoke("replication:import-video-link", { url }),
  prepareRun: (input) => ipcRenderer.invoke("replication:prepare-run", input),
  getRun: (runId) => ipcRenderer.invoke("replication:get-run", runId),
  listRuns: () => ipcRenderer.invoke("replication:list-runs"),
  submitRun: (runId) => ipcRenderer.invoke("replication:submit-run", runId),
  cancelRun: (runId) => ipcRenderer.invoke("replication:cancel-run", runId),
  showFile: (filePath) => ipcRenderer.invoke("replication:show-file", filePath),
  openFile: (filePath) => ipcRenderer.invoke("replication:open-file", filePath),
  getPathForFile: (file) => webUtils.getPathForFile(file)
});
