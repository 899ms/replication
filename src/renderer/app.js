const ui = {
  actionHint: document.querySelector("#actionHint"),
  actionTitle: document.querySelector("#actionTitle"),
  assetDiscoveryHint: document.querySelector("#assetDiscoveryHint"),
  authorizationCheckbox: document.querySelector("#authorizationCheckbox"),
  authorizationModal: document.querySelector("#authorizationModal"),
  cancelAuthorizationButton: document.querySelector("#cancelAuthorizationButton"),
  changeVideoButton: document.querySelector("#changeVideoButton"),
  choosePersonButton: document.querySelector("#choosePersonButton"),
  chooseH3IdentityButton: document.querySelector("#chooseH3IdentityButton"),
  chooseVoiceButton: document.querySelector("#chooseVoiceButton"),
  chooseVideoButton: document.querySelector("#chooseVideoButton"),
  cancelLinkButton: document.querySelector("#cancelLinkButton"),
  closeLinkModalButton: document.querySelector("#closeLinkModalButton"),
  closeModalButton: document.querySelector("#closeModalButton"),
  confirmAuthorizationButton: document.querySelector("#confirmAuthorizationButton"),
  dropZone: document.querySelector("#dropZone"),
  editH3InputsButton: document.querySelector("#editH3InputsButton"),
  h3AudioName: document.querySelector("#h3AudioName"),
  h3ApiEndpoint: document.querySelector("#h3ApiEndpoint"),
  h3ApiKey: document.querySelector("#h3ApiKey"),
  h3ApiModel: document.querySelector("#h3ApiModel"),
  h3ApiStatus: document.querySelector("#h3ApiStatus"),
  h3CheckList: document.querySelector("#h3CheckList"),
  h3DeviceValue: document.querySelector("#h3DeviceValue"),
  h3EndpointValue: document.querySelector("#h3EndpointValue"),
  h3LiveBadge: document.querySelector("#h3LiveBadge"),
  h3LocalConnectorStatus: document.querySelector("#h3LocalConnectorStatus"),
  h3LocalConnectorDot: document.querySelector("#h3LocalConnectorDot"),
  h3ModelList: document.querySelector("#h3ModelList"),
  h3ModelSummary: document.querySelector("#h3ModelSummary"),
  h3Nav: document.querySelector('[data-rail-view="minimax-h3"]'),
  h3PersonName: document.querySelector("#h3PersonName"),
  h3StatusLabel: document.querySelector("#h3StatusLabel"),
  h3StatusText: document.querySelector("#h3StatusText"),
  h3SshHost: document.querySelector("#h3SshHost"),
  h3SshIdentity: document.querySelector("#h3SshIdentity"),
  h3SshPort: document.querySelector("#h3SshPort"),
  h3SshStatus: document.querySelector("#h3SshStatus"),
  h3SshUsername: document.querySelector("#h3SshUsername"),
  h3SshWorkspace: document.querySelector("#h3SshWorkspace"),
  h3VideoName: document.querySelector("#h3VideoName"),
  historyList: document.querySelector("#historyList"),
  historySummary: document.querySelector("#historySummary"),
  historyView: document.querySelector("#historyView"),
  importLinkButton: document.querySelector("#importLinkButton"),
  linkInput: document.querySelector("#linkInput"),
  linkModal: document.querySelector("#linkModal"),
  linkStatus: document.querySelector("#linkStatus"),
  openLinkButton: document.querySelector("#openLinkButton"),
  openH3Button: document.querySelector("#openH3Button"),
  openH3ButtonLabel: document.querySelector("#openH3ButtonLabel"),
  openH3ModelRepositoryButton: document.querySelector("#openH3ModelRepositoryButton"),
  personName: document.querySelector("#personName"),
  personCandidateList: document.querySelector("#personCandidateList"),
  personPreview: document.querySelector("#personPreview"),
  primaryButton: document.querySelector("#primaryButton"),
  primaryButtonLabel: document.querySelector("#primaryButtonLabel"),
  refreshHistoryButton: document.querySelector("#refreshHistoryButton"),
  refreshH3Button: document.querySelector("#refreshH3Button"),
  detectH3LocalButton: document.querySelector("#detectH3LocalButton"),
  refreshAssetsButton: document.querySelector("#refreshAssetsButton"),
  replicationContent: document.querySelector("#replicationContent"),
  replicationHeader: document.querySelector("#replicationHeader"),
  replicationNav: document.querySelector('[data-rail-view="replication"]'),
  minimaxH3View: document.querySelector("#minimaxH3View"),
  resultGrid: document.querySelector("#resultGrid"),
  resultSummary: document.querySelector("#resultSummary"),
  resultsSection: document.querySelector("#resultsSection"),
  saveH3ApiButton: document.querySelector("#saveH3ApiButton"),
  saveH3SshButton: document.querySelector("#saveH3SshButton"),
  downloadH3ModelsButton: document.querySelector("#downloadH3ModelsButton"),
  sourceCard: document.querySelector("#sourceCard"),
  sourceCodec: document.querySelector("#sourceCodec"),
  sourceDuration: document.querySelector("#sourceDuration"),
  sourceName: document.querySelector("#sourceName"),
  sourceRatio: document.querySelector("#sourceRatio"),
  sourceSize: document.querySelector("#sourceSize"),
  sourceVideo: document.querySelector("#sourceVideo"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toastMessage"),
  historyNav: document.querySelector('[data-rail-view="history"]'),
  voiceCandidateList: document.querySelector("#voiceCandidateList"),
  voiceName: document.querySelector("#voiceName")
};

const state = {
  activeView: "replication",
  audioReferencePath: null,
  busy: false,
  inspection: null,
  historyRuns: [],
  h3Connections: null,
  h3ConnectorMode: "api",
  h3Models: [],
  h3Status: null,
  localAssets: null,
  personImagePath: null,
  pollTimer: null,
  run: null,
  scanningAssets: false,
  selectedPath: null
};

const VARIANT_LABELS = {
  golden_opening: "黄金三秒起手",
  impact_chain: "冲击链起手",
  abnormal_turn: "反常转折起手"
};

const CURRENT_VARIANT_IDS = new Set(Object.keys(VARIANT_LABELS));

const STATUS_LABELS = {
  draft: "待准备",
  waiting_input: "等待输入",
  waiting_authorization: "等待授权",
  queued: "已排队",
  running: "执行中",
  succeeded: "已完成",
  no_result: "无有效结果",
  unsupported: "不支持",
  failed: "失败",
  cancelled: "已取消"
};

const HISTORY_MARKS = {
  succeeded: "OK",
  running: "RUN",
  queued: "WAIT",
  waiting_authorization: "AUTH",
  failed: "!",
  cancelled: "×"
};

const H3_STATUS_COPY = {
  ready: {
    label: "已就绪",
    text: "ComfyUI 已连接，H3 生成模型、文本编码器和视音频 VAE 齐全。"
  },
  service_offline: {
    label: "未启动",
    text: "已找到本机 ComfyUI，但 H3 服务尚未启动。打开工作区后启动 6006 或 8188 端口。"
  },
  models_missing: {
    label: "缺少模型",
    text: "ComfyUI 已连接，但 H3 必需模型文件尚未齐全。"
  },
  not_installed: {
    label: "待配置",
    text: "尚未找到 ComfyUI 工作区或可用的 H3 服务。"
  }
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  return `${seconds.toFixed(1)}s`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function baseName(filePath) {
  if (!filePath) return "未选择";
  return filePath.split(/[\\/]/).filter(Boolean).pop() || filePath;
}

function toFileUrl(filePath) {
  if (!filePath) return "";
  const encodedPath = filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `file://${encodedPath}`;
}

function canPrepareRun() {
  return Boolean(state.selectedPath && state.personImagePath && state.audioReferencePath);
}

function runPrimaryEnabled(run) {
  return Boolean(run && ["waiting_authorization", "queued", "running"].includes(run.state));
}

function showError(error) {
  ui.toastMessage.textContent = error?.message || String(error);
  ui.toast.classList.remove("hidden");
  window.clearTimeout(showError.timeout);
  showError.timeout = window.setTimeout(() => ui.toast.classList.add("hidden"), 5200);
}

function setBusy(isBusy, label) {
  state.busy = isBusy;
  if (label) ui.primaryButtonLabel.textContent = label;
  if (isBusy) {
    ui.primaryButton.disabled = true;
    return;
  }
  if (state.run) {
    ui.primaryButton.disabled = !runPrimaryEnabled(state.run);
    return;
  }
  updatePrepareAvailability();
}

function setSteps(activeStep) {
  const order = ["source", "prepare", "results"];
  const activeIndex = order.indexOf(activeStep);
  for (const item of document.querySelectorAll(".step-item")) {
    const index = order.indexOf(item.dataset.step);
    item.classList.toggle("is-active", index === activeIndex);
    item.classList.toggle("is-complete", index < activeIndex);
  }
}

function setRailView(activeView) {
  state.activeView = activeView;
  for (const item of document.querySelectorAll("[data-rail-view]")) {
    const active = item.dataset.railView === activeView;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
}

function showReplicationView({ focusResults = false } = {}) {
  setRailView("replication");
  ui.historyView.classList.add("hidden");
  ui.minimaxH3View.classList.add("hidden");
  ui.replicationHeader.classList.remove("hidden");
  ui.replicationContent.classList.remove("hidden");
  ui.resultsSection.classList.toggle("hidden", !state.run);
  if (focusResults && state.run) {
    window.setTimeout(() => ui.resultsSection.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
  }
}

async function showHistoryView() {
  setRailView("history");
  ui.replicationHeader.classList.add("hidden");
  ui.replicationContent.classList.add("hidden");
  ui.resultsSection.classList.add("hidden");
  ui.minimaxH3View.classList.add("hidden");
  ui.historyView.classList.remove("hidden");
  await refreshHistory();
}

function renderH3References() {
  ui.h3VideoName.textContent = baseName(state.selectedPath);
  ui.h3PersonName.textContent = baseName(state.personImagePath);
  ui.h3AudioName.textContent = baseName(state.audioReferencePath);
  const values = {
    video: state.selectedPath,
    person: state.personImagePath,
    audio: state.audioReferencePath
  };
  for (const item of document.querySelectorAll("[data-h3-reference]")) {
    item.classList.toggle("is-ready", Boolean(values[item.dataset.h3Reference]));
  }
}

function setH3Connector(mode) {
  state.h3ConnectorMode = mode;
  for (const tab of document.querySelectorAll("[data-h3-connector]")) {
    const active = tab.dataset.h3Connector === mode;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of document.querySelectorAll("[data-h3-connector-panel]")) {
    panel.classList.toggle("hidden", panel.dataset.h3ConnectorPanel !== mode);
  }
}

function renderH3Connections(config) {
  state.h3Connections = config;
  ui.h3ApiEndpoint.value = config.api?.endpoint || "";
  ui.h3ApiModel.value = config.api?.model || "MiniMax-H3";
  ui.h3ApiKey.value = "";
  ui.h3ApiKey.placeholder = config.api?.hasApiKey
    ? "API Key 已安全保存；留空则保持不变"
    : "在此处输入 API";
  ui.h3ApiStatus.textContent = config.api?.hasApiKey
    ? `API 凭据已保存（${config.api.credentialSource === "environment" ? "环境变量" : "系统加密存储"}）。`
    : "尚未配置 API。";

  ui.h3SshHost.value = config.ssh?.host || "";
  ui.h3SshPort.value = config.ssh?.port || 22;
  ui.h3SshUsername.value = config.ssh?.username || "";
  ui.h3SshWorkspace.value = config.ssh?.workspacePath || "";
  ui.h3SshIdentity.value = config.ssh?.identityFile || "";
  ui.h3SshStatus.textContent = config.ssh?.host
    ? `SSH 配置已保存：${config.ssh.username}@${config.ssh.host}:${config.ssh.port}`
    : "尚未配置 SSH 服务器。";
}

function renderH3Models(catalog) {
  state.h3Models = Array.isArray(catalog.models) ? catalog.models : [];
  const installedCount = state.h3Models.filter((model) => model.installed).length;
  const missingModels = state.h3Models.filter((model) => !model.installed);
  ui.h3ModelSummary.textContent = missingModels.length === 0
    ? `4/4 已安装 · 官方 R2V 组合 ${formatBytes(catalog.totalSizeBytes)}`
    : `${installedCount}/4 已安装 · 缺失 ${missingModels.length} 项 · 全套 ${formatBytes(catalog.totalSizeBytes)}`;
  ui.downloadH3ModelsButton.disabled = missingModels.length === 0;
  ui.downloadH3ModelsButton.textContent = missingModels.length === 0
    ? "模型已齐全"
    : `一键下载缺失模型（${missingModels.length}）`;
  ui.h3ModelList.replaceChildren();

  for (const model of state.h3Models) {
    const item = document.createElement("article");
    item.className = "h3-model-item";
    item.classList.toggle("is-installed", model.installed);

    const mark = document.createElement("span");
    mark.className = "h3-model-mark";
    mark.textContent = model.installed ? "✓" : "↓";

    const copy = document.createElement("div");
    copy.className = "h3-model-copy";
    const title = document.createElement("strong");
    title.textContent = model.title;
    const file = document.createElement("span");
    file.textContent = model.fileName;
    const path = document.createElement("small");
    path.textContent = `${formatBytes(model.sizeBytes)} · ${model.targetDirectory}`;
    copy.append(title, file, path);

    const button = document.createElement("button");
    button.type = "button";
    button.className = model.installed ? "h3-model-installed-button" : "h3-model-download-button";
    button.dataset.h3ModelDownload = model.id;
    button.disabled = model.installed;
    button.textContent = model.installed ? "已安装" : "一键下载";
    item.append(mark, copy, button);
    ui.h3ModelList.append(item);
  }
}

async function loadH3Models() {
  try {
    renderH3Models(await window.replication.getMinimaxH3Models());
  } catch (error) {
    ui.h3ModelSummary.textContent = "官方模型目录读取失败。";
    showError(error);
  }
}

async function downloadH3Models(modelIds) {
  const ids = [...new Set(modelIds)].filter(Boolean);
  if (ids.length === 0) return;
  const buttons = [...ui.h3ModelList.querySelectorAll("[data-h3-model-download]")];
  ui.downloadH3ModelsButton.disabled = true;
  for (const button of buttons) button.disabled = true;
  try {
    const result = await window.replication.openMinimaxH3ModelDownloads(ids);
    ui.h3ModelSummary.textContent = `已在默认浏览器打开 ${result.count} 个官方下载；完成后放入标注目录。`;
  } catch (error) {
    showError(error);
  } finally {
    for (const button of buttons) {
      const model = state.h3Models.find((item) => item.id === button.dataset.h3ModelDownload);
      button.disabled = Boolean(model?.installed);
    }
    ui.downloadH3ModelsButton.disabled = state.h3Models.every((model) => model.installed);
  }
}

async function openH3ModelRepository() {
  try {
    await window.replication.openMinimaxH3ModelRepository();
  } catch (error) {
    showError(error);
  }
}

async function loadH3Connections() {
  try {
    renderH3Connections(await window.replication.getMinimaxH3Connections());
  } catch (error) {
    showError(error);
  }
}

async function saveAndTestH3Api() {
  ui.saveH3ApiButton.disabled = true;
  ui.saveH3ApiButton.textContent = "正在安全保存…";
  let saved = false;
  try {
    await window.replication.saveMinimaxH3Api({
      endpoint: ui.h3ApiEndpoint.value,
      model: ui.h3ApiModel.value,
      apiKey: ui.h3ApiKey.value
    });
    saved = true;
    ui.h3ApiKey.value = "";
    ui.h3ApiStatus.textContent = "API 凭据已安全保存，正在检测连接…";
    const result = await window.replication.testMinimaxH3Api();
    await loadH3Connections();
    ui.h3ApiStatus.textContent = result.message;
  } catch (error) {
    ui.h3ApiStatus.textContent = saved
      ? `API 已保存，但检测未通过：${error.message}`
      : error.message;
    showError(error);
  } finally {
    ui.saveH3ApiButton.disabled = false;
    ui.saveH3ApiButton.textContent = "保存并检测";
  }
}

async function chooseH3Identity() {
  try {
    const selected = await window.replication.selectMinimaxH3Identity();
    if (selected) ui.h3SshIdentity.value = selected;
  } catch (error) {
    showError(error);
  }
}

async function saveAndTestH3Ssh() {
  ui.saveH3SshButton.disabled = true;
  ui.saveH3SshButton.textContent = "正在测试 SSH…";
  let saved = false;
  try {
    await window.replication.saveMinimaxH3Ssh({
      host: ui.h3SshHost.value,
      port: ui.h3SshPort.value,
      username: ui.h3SshUsername.value,
      workspacePath: ui.h3SshWorkspace.value,
      identityFile: ui.h3SshIdentity.value
    });
    saved = true;
    const result = await window.replication.testMinimaxH3Ssh();
    await loadH3Connections();
    ui.h3SshStatus.textContent = result.message;
  } catch (error) {
    ui.h3SshStatus.textContent = saved
      ? `SSH 已保存，但连接失败：${error.message}`
      : error.message;
    showError(error);
  } finally {
    ui.saveH3SshButton.disabled = false;
    ui.saveH3SshButton.textContent = "保存并测试 SSH";
  }
}

function renderH3Status(status) {
  state.h3Status = status;
  const copy = H3_STATUS_COPY[status.state] || H3_STATUS_COPY.not_installed;
  ui.h3LiveBadge.dataset.state = status.state;
  ui.h3StatusLabel.textContent = copy.label;
  ui.h3StatusText.textContent = copy.text;
  ui.h3EndpointValue.textContent = status.connection?.endpoint || "未连接";
  ui.h3DeviceValue.textContent = status.connection?.device || "等待服务";
  ui.h3LocalConnectorStatus.textContent = status.ready
    ? `本机 H3 已就绪：${status.connection?.endpoint}`
    : H3_STATUS_COPY[status.state]?.label || "本机 H3 未就绪";
  ui.h3LocalConnectorDot.parentElement.classList.toggle("is-ready", Boolean(status.ready));
  for (const item of ui.h3CheckList.querySelectorAll("[data-check]")) {
    item.classList.toggle("is-ready", Boolean(status.modelChecks?.[item.dataset.check]));
  }
  const canOpen = Boolean(status.connection?.endpoint || status.comfyRoot);
  ui.openH3Button.disabled = !canOpen;
  ui.openH3ButtonLabel.textContent = status.connection?.endpoint
    ? "打开 H3 工作台"
    : status.comfyRoot
      ? "打开 ComfyUI 工作区"
      : "需要先配置 ComfyUI";
}

async function refreshH3Status() {
  ui.refreshH3Button.disabled = true;
  ui.h3LiveBadge.dataset.state = "checking";
  ui.h3StatusLabel.textContent = "检测中";
  ui.h3StatusText.textContent = "正在检测 ComfyUI 和 H3 模型…";
  try {
    renderH3Status(await window.replication.getMinimaxH3Status());
    await loadH3Models();
  } catch (error) {
    renderH3Status({ state: "not_installed", modelChecks: {} });
    showError(error);
  } finally {
    ui.refreshH3Button.disabled = false;
  }
}

async function showH3View() {
  setRailView("minimax-h3");
  ui.replicationHeader.classList.add("hidden");
  ui.replicationContent.classList.add("hidden");
  ui.resultsSection.classList.add("hidden");
  ui.historyView.classList.add("hidden");
  ui.minimaxH3View.classList.remove("hidden");
  renderH3References();
  setH3Connector(state.h3ConnectorMode);
  await Promise.all([refreshH3Status(), loadH3Connections()]);
}

async function openH3Workspace() {
  ui.openH3Button.disabled = true;
  try {
    await window.replication.openMinimaxH3();
  } catch (error) {
    showError(error);
  } finally {
    ui.openH3Button.disabled = !Boolean(state.h3Status?.connection?.endpoint || state.h3Status?.comfyRoot);
  }
}

function historyArtifactCount(run) {
  const variantArtifacts = (run.variants || []).filter((variant) => variant.artifact?.path).length;
  return Math.max(variantArtifacts, Array.isArray(run.artifacts) ? run.artifacts.length : 0);
}

function renderHistory(runs) {
  state.historyRuns = runs;
  const succeeded = runs.filter((run) => run.state === "succeeded").length;
  const active = runs.filter((run) => ["queued", "running"].includes(run.state)).length;
  const failed = runs.filter((run) => ["failed", "cancelled"].includes(run.state)).length;
  const summary = [`${runs.length} 条真实运行`];
  if (succeeded) summary.push(`${succeeded} 条完成`);
  if (active) summary.push(`${active} 条进行中`);
  if (failed) summary.push(`${failed} 条失败/取消`);
  ui.historySummary.textContent = summary.join(" · ");
  ui.historyList.replaceChildren();

  if (runs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "还没有真实运行记录";
    const hint = document.createElement("span");
    hint.textContent = "完成源视频预检并准备 3 份本地合同后，任务才会保存在这里；这里不会显示假的示例数据。";
    copy.append(title, hint);
    empty.append(copy);
    ui.historyList.append(empty);
    return;
  }

  for (const run of runs) {
    const card = document.createElement("article");
    card.className = "history-card";
    card.dataset.historyRunId = run.id;

    const mark = document.createElement("span");
    mark.className = "history-run-mark";
    mark.dataset.state = run.state;
    mark.textContent = HISTORY_MARKS[run.state] || "RUN";

    const copy = document.createElement("div");
    copy.className = "history-run-copy";
    const titleRow = document.createElement("div");
    titleRow.className = "history-run-title";
    const title = document.createElement("h3");
    title.textContent = run.input?.name || run.id;
    titleRow.append(title);

    const metadata = run.input?.metadata || {};
    const meta = document.createElement("p");
    meta.className = "history-run-meta";
    const dimensions = metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : "画幅未知";
    meta.textContent = `${formatDateTime(run.createdAt)} · ${formatDuration(Number(metadata.duration))} · ${dimensions} · ${historyArtifactCount(run)} 个已登记产物`;

    const assets = document.createElement("p");
    assets.className = "history-run-assets";
    assets.textContent = `人物：${run.persona?.name || "未记录"} · 音色：${run.voice?.name || "未记录"}`;

    const variants = document.createElement("div");
    variants.className = "history-variant-states";
    for (const variant of run.variants || []) {
      const variantState = document.createElement("span");
      variantState.className = "history-variant-state";
      variantState.dataset.state = variant.state;
      variantState.textContent = `${String(variant.index || "").padStart(2, "0")} ${STATUS_LABELS[variant.state] || variant.state}`;
      variants.append(variantState);
    }
    copy.append(titleRow, meta, assets, variants);

    const actions = document.createElement("div");
    actions.className = "history-card-actions";
    const status = document.createElement("span");
    status.className = "variant-state";
    status.textContent = STATUS_LABELS[run.state] || run.state;
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "history-open-button";
    openButton.textContent = "查看记录";
    openButton.addEventListener("click", () => openHistoryRun(run.id));
    actions.append(status, openButton);

    card.append(mark, copy, actions);
    ui.historyList.append(card);
  }
}

async function refreshHistory() {
  ui.refreshHistoryButton.disabled = true;
  ui.historySummary.textContent = "正在读取本机记录…";
  try {
    const runs = await window.replication.listRuns();
    renderHistory(runs);
  } catch (error) {
    ui.historySummary.textContent = "历史记录读取失败";
    showError(error);
  } finally {
    ui.refreshHistoryButton.disabled = false;
  }
}

async function openHistoryRun(runId) {
  try {
    const run = await window.replication.getRun(runId);
    stopPolling();
    setPersonAsset(null);
    setVoiceAsset(null);
    state.inspection = null;
    state.run = null;
    showReplicationView();
    renderRun(run);
    showReplicationView({ focusResults: true });
    if (["queued", "running"].includes(run.state)) startPolling();
  } catch (error) {
    showError(error);
  }
}

function updateVariantStates(variants = []) {
  for (const element of document.querySelectorAll("[data-state-for]")) {
    const variant = variants.find((item) => item.id === element.dataset.stateFor);
    const variantState = variant?.state || "draft";
    element.textContent = STATUS_LABELS[variantState] || variantState;
    element.classList.toggle("is-running", variantState === "running" || variantState === "queued");
    element.classList.toggle(
      "is-ready",
      variantState === "succeeded" || (variantState === "queued" && state.run?.state === "waiting_authorization")
    );
    element.classList.toggle("is-failed", variantState === "failed" || variantState === "cancelled");
  }
}

function updatePrepareAvailability() {
  if (state.busy || state.run) return;
  if (!state.selectedPath) {
    ui.actionTitle.textContent = "等待源视频";
    ui.actionHint.textContent = "拖入/选择本地视频，或复制链接导入；预检阶段不会产生费用。";
    ui.primaryButton.disabled = true;
    ui.primaryButtonLabel.textContent = "生成 3 个复刻版本";
    return;
  }
  if (!state.personImagePath) {
    ui.actionTitle.textContent = "需要替换人物";
    ui.actionHint.textContent = "Replication 不再使用固定内置人物；必须为本次运行选择人物图。";
    ui.primaryButton.disabled = true;
    ui.primaryButtonLabel.textContent = "先选择人物图";
    return;
  }
  if (!state.audioReferencePath) {
    ui.actionTitle.textContent = "需要音色参考";
    ui.actionHint.textContent = "替换人物时必须同步替换音色；选择一段音频作为 @Audio 1。";
    ui.primaryButton.disabled = true;
    ui.primaryButtonLabel.textContent = "先选择音色参考";
    return;
  }
  ui.actionTitle.textContent = "素材已齐";
  ui.actionHint.textContent = "下一步只创建 3 份本地 Seedance 合同；授权前不会上传或扣费。";
  ui.primaryButton.disabled = false;
  ui.primaryButtonLabel.textContent = "准备 3 份本地合同";
}

function setPersonAsset(filePath, previewUrl = null) {
  state.personImagePath = filePath || null;
  ui.personName.textContent = baseName(filePath);
  ui.choosePersonButton.classList.toggle("is-selected", Boolean(filePath));
  ui.personPreview.style.backgroundImage = previewUrl || filePath ? `url("${previewUrl || toFileUrl(filePath)}")` : "";
  ui.personPreview.textContent = filePath ? "" : "人";
  updateCandidateSelections();
  updatePrepareAvailability();
}

function setVoiceAsset(filePath) {
  state.audioReferencePath = filePath || null;
  ui.voiceName.textContent = baseName(filePath);
  ui.chooseVoiceButton.classList.toggle("is-selected", Boolean(filePath));
  updateCandidateSelections();
  updatePrepareAvailability();
}

function updateCandidateSelections() {
  for (const button of document.querySelectorAll("[data-asset-path]")) {
    const selected =
      (button.dataset.assetType === "person" && button.dataset.assetPath === state.personImagePath) ||
      (button.dataset.assetType === "voice" && button.dataset.assetPath === state.audioReferencePath);
    button.classList.toggle("is-selected", selected);
  }
}

function renderCandidateList(type, candidates) {
  const list = type === "person" ? ui.personCandidateList : ui.voiceCandidateList;
  list.replaceChildren();
  if (!candidates || candidates.length === 0) {
    const empty = document.createElement("span");
    empty.className = "candidate-empty";
    empty.textContent = type === "person" ? "未扫到人物图，点上方手动选一次。" : "未扫到音频，点上方手动选一次。";
    list.append(empty);
    return;
  }

  for (const candidate of candidates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "candidate-card";
    button.dataset.assetType = type;
    button.dataset.assetPath = candidate.path;

    const preview = document.createElement("span");
    preview.className = type === "person" ? "candidate-thumb" : "candidate-thumb candidate-thumb-audio";
    if (type === "person") {
      preview.style.backgroundImage = `url("${candidate.url}")`;
    } else {
      preview.textContent = "声";
    }

    const copy = document.createElement("span");
    copy.className = "candidate-copy";
    const name = document.createElement("strong");
    name.textContent = candidate.name;
    const meta = document.createElement("small");
    meta.textContent = candidate.reason ? `来自 ${candidate.reason}` : "本地候选";
    copy.append(name, meta);

    button.append(preview, copy);
    button.addEventListener("click", () => {
      if (type === "person") setPersonAsset(candidate.path, candidate.url);
      else setVoiceAsset(candidate.path);
    });
    list.append(button);
  }
  updateCandidateSelections();
}

function renderLocalAssets(assets) {
  state.localAssets = assets;
  const personCount = assets?.persons?.length || 0;
  const voiceCount = assets?.voices?.length || 0;
  const rootCount = assets?.roots?.length || 0;
  if (rootCount === 0) {
    ui.assetDiscoveryHint.textContent = "选择或导入源视频后，会先扫描源视频同目录。";
  } else {
    ui.assetDiscoveryHint.textContent = `已扫描 ${rootCount} 个位置，找到 ${personCount} 张人物图候选、${voiceCount} 个音色候选。`;
  }
  renderCandidateList("person", assets?.persons || []);
  renderCandidateList("voice", assets?.voices || []);
}

async function refreshLocalAssets({ includeGlobal = false } = {}) {
  if (state.scanningAssets) return;
  state.scanningAssets = true;
  ui.assetDiscoveryHint.textContent = "正在扫描源视频同目录…";
  renderCandidateList("person", []);
  renderCandidateList("voice", []);
  try {
    const assets = await window.replication.listLocalAssets({
      sourceVideoPath: state.selectedPath,
      includeGlobal
    });
    renderLocalAssets(assets);
  } catch (error) {
    ui.assetDiscoveryHint.textContent = "源视频同目录扫描失败；仍可点上方卡片手动选择。";
    showError(error);
  } finally {
    state.scanningAssets = false;
  }
}

function renderInspection(inspection) {
  state.inspection = inspection;
  state.selectedPath = inspection.path;
  ui.dropZone.classList.add("hidden");
  ui.sourceCard.classList.remove("hidden");
  ui.changeVideoButton.classList.remove("hidden");
  ui.sourceVideo.src = inspection.url;
  ui.sourceName.textContent = inspection.name;
  ui.sourceDuration.textContent = formatDuration(inspection.metadata.duration);
  ui.sourceRatio.textContent = `${inspection.metadata.width} × ${inspection.metadata.height}`;
  ui.sourceCodec.textContent = `${inspection.metadata.codec.toUpperCase()} + ${inspection.metadata.audioCodec.toUpperCase()}`;
  ui.sourceSize.textContent = formatBytes(inspection.metadata.fileSize);
  setSteps("prepare");
  updatePrepareAvailability();
}

async function loadVideo(videoPath) {
  if (!videoPath || state.busy) return;
  setBusy(true, "正在检查视频…");
  try {
    const inspection = await window.replication.inspectVideo(videoPath);
    state.run = null;
    ui.resultsSection.classList.add("hidden");
    updateVariantStates();
    renderInspection(inspection);
    await refreshLocalAssets();
  } catch (error) {
    state.selectedPath = null;
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function chooseVideo() {
  try {
    const videoPath = await window.replication.selectVideo();
    if (videoPath) await loadVideo(videoPath);
  } catch (error) {
    showError(error);
  }
}

function openLinkModal() {
  if (state.busy) return;
  ui.linkInput.value = "";
  ui.linkStatus.textContent = "这里只导入源视频，不会提交 Seedance，也不会产生生成费用。";
  ui.linkModal.classList.remove("hidden");
  ui.linkModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => ui.linkInput.focus(), 0);
}

function closeLinkModal({ force = false } = {}) {
  if (state.busy && !force) return;
  ui.linkModal.classList.add("hidden");
  ui.linkModal.setAttribute("aria-hidden", "true");
}

async function importVideoLink() {
  if (state.busy) return;
  const url = ui.linkInput.value.trim();
  if (!url) {
    ui.linkStatus.textContent = "先粘贴一个视频链接。";
    return;
  }

  setBusy(true, "正在拉取链接…");
  ui.importLinkButton.disabled = true;
  ui.linkStatus.textContent = "正在通过恒河猫 / MeowLoad 拉取视频，并写入本地缓存…";
  try {
    const inspection = await window.replication.importVideoLink(url);
    state.run = null;
    ui.resultsSection.classList.add("hidden");
    updateVariantStates();
    renderInspection(inspection);
    closeLinkModal({ force: true });
    await refreshLocalAssets();
  } catch (error) {
    ui.linkStatus.textContent = error.message;
    showError(error);
  } finally {
    ui.importLinkButton.disabled = false;
    setBusy(false);
  }
}

async function choosePerson() {
  try {
    const personPath = await window.replication.selectPersonImage();
    if (personPath) setPersonAsset(personPath);
  } catch (error) {
    showError(error);
  }
}

async function chooseVoice() {
  try {
    const voicePath = await window.replication.selectAudioReference();
    if (voicePath) setVoiceAsset(voicePath);
  } catch (error) {
    showError(error);
  }
}

function openAuthorization() {
  ui.authorizationCheckbox.checked = false;
  ui.confirmAuthorizationButton.disabled = true;
  ui.authorizationModal.classList.remove("hidden");
  ui.authorizationModal.setAttribute("aria-hidden", "false");
}

function closeAuthorization() {
  ui.authorizationModal.classList.add("hidden");
  ui.authorizationModal.setAttribute("aria-hidden", "true");
}

function isVariantActive(variant) {
  return variant.state === "queued" || variant.state === "running";
}

function shouldAutoRestoreRun(run) {
  const usesCurrentRuntimeAssets =
    run?.persona?.kind === "runtime" &&
    run?.voice?.kind === "runtime" &&
    Array.isArray(run?.variants) &&
    run.variants.length === 3 &&
    run.variants.every((variant) => CURRENT_VARIANT_IDS.has(variant.id));
  return usesCurrentRuntimeAssets && ["waiting_authorization", "queued", "running"].includes(run?.state);
}

function providerMeta(variant) {
  const parts = [];
  if (variant.providerPollAttempt) parts.push(`第 ${variant.providerPollAttempt} 次轮询`);
  if (variant.providerStatus) parts.push(`远端：${variant.providerStatus}`);
  return parts.join(" · ");
}

function renderResults(run) {
  ui.resultsSection.classList.remove("hidden");
  const succeeded = run.variants.filter((variant) => variant.state === "succeeded").length;
  const running = run.variants.filter(isVariantActive).length;
  if (run.state === "waiting_authorization") {
    ui.resultSummary.textContent = "3 份合同已通过本地预检，尚未产生费用。";
  } else if (run.state === "succeeded") {
    ui.resultSummary.textContent = "3/3 个真实 MP4 已通过基础音视频校验。";
  } else if (running > 0) {
    ui.resultSummary.textContent =
      `${succeeded}/3 已通过 · ${running}/3 正在轮询；${run.statusMessage || "状态来自远端任务轮询。"}`;
  } else {
    ui.resultSummary.textContent = `${succeeded}/3 个有效 MP4；${run.error || "等待状态更新。"}`;
  }

  ui.resultGrid.replaceChildren(
    ...run.variants.map((variant) => {
      const card = document.createElement("article");
      const active = isVariantActive(variant);
      card.className = "result-card";
      card.dataset.active = String(active);
      card.dataset.providerStatus = variant.providerStatus || variant.state;

      const media = document.createElement("div");
      media.className = "result-media";
      if (variant.artifact?.url) {
        const video = document.createElement("video");
        video.src = variant.artifact.url;
        video.controls = true;
        video.playsInline = true;
        media.append(video);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "result-placeholder";
        const ring = document.createElement("span");
        ring.className = "real-state-ring";
        const label = document.createElement("span");
        label.textContent =
          run.state === "waiting_authorization"
            ? "合同已准备，等待授权"
            : variant.statusMessage || variant.error || STATUS_LABELS[variant.state] || variant.state;
        placeholder.append(ring, label);
        if (active) {
          const progress = document.createElement("div");
          progress.className = "result-progress";
          const meta = document.createElement("small");
          meta.textContent = providerMeta(variant) || "等待远端状态返回";
          const pulse = document.createElement("span");
          pulse.className = "result-pulse";
          pulse.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
          progress.append(meta, pulse);
          placeholder.append(progress);
        }
        media.append(placeholder);
      }

      const body = document.createElement("div");
      body.className = "result-body";
      const titleRow = document.createElement("div");
      titleRow.className = "result-title-row";
      const title = document.createElement("h3");
      title.textContent = `${String(variant.index).padStart(2, "0")} · ${VARIANT_LABELS[variant.id] || variant.title || variant.label || variant.id}`;
      const status = document.createElement("span");
      status.className = "variant-state";
      status.textContent = STATUS_LABELS[variant.state] || variant.state;
      titleRow.append(title, status);
      const description = document.createElement("p");
      description.textContent =
        variant.state === "succeeded"
          ? `${formatDuration(variant.artifact.metadata.duration)} · ${variant.artifact.metadata.width} × ${variant.artifact.metadata.height} · 已校验`
          : variant.statusMessage || variant.error || "状态来自真实 Seedance 合同与执行结果。";
      body.append(titleRow, description);

      if (variant.artifact?.path) {
        const actions = document.createElement("div");
        actions.className = "result-actions";
        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.textContent = "打开视频";
        openButton.addEventListener("click", () => window.replication.openFile(variant.artifact.path));
        const revealButton = document.createElement("button");
        revealButton.type = "button";
        revealButton.textContent = "显示文件";
        revealButton.addEventListener("click", () => window.replication.showFile(variant.artifact.path));
        actions.append(openButton, revealButton);
        body.append(actions);
      }

      card.append(media, body);
      return card;
    })
  );
}

function renderRun(run) {
  state.run = run;
  updateVariantStates(run.variants);
  renderResults(run);
  ui.changeVideoButton.classList.remove("hidden");

  if (run.input) {
    renderInspection({
      path: run.input.originalPath,
      name: run.input.name,
      url: run.input.previewUrl,
      metadata: run.input.metadata
    });
  }

  if (run.persona?.kind === "runtime") {
    setPersonAsset(run.persona.originalPath || run.persona.path, run.persona.previewUrl);
  }

  if (run.voice?.kind === "runtime") {
    setVoiceAsset(run.voice.originalPath || run.voice.path);
  }

  if (run.state === "waiting_authorization") {
    setSteps("prepare");
    ui.actionTitle.textContent = "3 份任务合同已准备";
    ui.actionHint.textContent = "需要确认当前 3 个付费 Seedance 任务，确认前不会上传或扣费。";
    ui.primaryButton.disabled = false;
    ui.primaryButtonLabel.textContent = "确认费用并开始生成";
  } else if (run.state === "queued" || run.state === "running") {
    setSteps("results");
    ui.actionTitle.textContent = "真实任务执行中";
    ui.actionHint.textContent = run.statusMessage || "状态来自本地 Runner 和供应商任务；关闭后会按远端任务 ID 恢复跟踪。";
    ui.primaryButton.disabled = false;
    ui.primaryButtonLabel.textContent = "停止本地跟踪";
  } else if (run.state === "succeeded") {
    setSteps("results");
    ui.actionTitle.textContent = "3 个版本已通过校验";
    ui.actionHint.textContent = "可以逐个打开或在 Finder 中查看真实 MP4。";
    ui.primaryButton.disabled = true;
    ui.primaryButtonLabel.textContent = "生成完成";
  } else if (run.state === "failed") {
    setSteps("results");
    ui.actionTitle.textContent = "生成未全部完成";
    ui.actionHint.textContent = run.error || "查看每个版本的真实失败状态。";
    ui.primaryButton.disabled = true;
    ui.primaryButtonLabel.textContent = "需要重新准备";
  } else if (run.state === "cancelled") {
    setSteps("results");
    ui.actionTitle.textContent = "已停止本地跟踪";
    ui.actionHint.textContent = run.error || "远端任务可能仍在执行。";
    ui.primaryButton.disabled = true;
    ui.primaryButtonLabel.textContent = "已取消";
  }
}

async function prepareCurrentVideo() {
  if (!canPrepareRun() || state.busy) {
    updatePrepareAvailability();
    return;
  }
  setBusy(true, "正在准备真实合同…");
  ui.actionTitle.textContent = "正在检查人物、音色并创建 3 份合同";
  ui.actionHint.textContent = "每个版本都会绑定内置起手策略、替换人物图和 @Audio 1 音色。";
  try {
    const run = await window.replication.prepareRun({
      videoPath: state.selectedPath,
      personImagePath: state.personImagePath,
      audioReferencePath: state.audioReferencePath
    });
    renderRun(run);
    openAuthorization();
  } catch (error) {
    showError(error);
    ui.actionTitle.textContent = "任务准备失败";
    ui.actionHint.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function confirmAndSubmit() {
  if (!state.run || !ui.authorizationCheckbox.checked || state.busy) return;
  setBusy(true, "正在提交 3 个真实任务…");
  try {
    const run = await window.replication.submitRun(state.run.id);
    closeAuthorization();
    renderRun(run);
    startPolling();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function pollRun() {
  if (!state.run?.id) return;
  try {
    const run = await window.replication.getRun(state.run.id);
    renderRun(run);
    if (!["queued", "running"].includes(run.state)) {
      stopPolling();
    }
  } catch (error) {
    stopPolling();
    showError(error);
  }
}

function startPolling() {
  stopPolling();
  pollRun();
  state.pollTimer = window.setInterval(pollRun, 2000);
}

function stopPolling() {
  if (state.pollTimer) window.clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function handlePrimaryAction() {
  if (state.busy) return;
  if (!state.run) {
    await prepareCurrentVideo();
    return;
  }
  if (state.run.state === "waiting_authorization") {
    openAuthorization();
    return;
  }
  if (state.run.state === "queued" || state.run.state === "running") {
    try {
      const run = await window.replication.cancelRun(state.run.id);
      renderRun(run);
      stopPolling();
    } catch (error) {
      showError(error);
    }
  }
}

function resetForNewVideo() {
  stopPolling();
  setPersonAsset(null);
  setVoiceAsset(null);
  state.inspection = null;
  state.run = null;
  state.selectedPath = null;
  ui.sourceVideo.removeAttribute("src");
  ui.sourceVideo.load();
  ui.sourceCard.classList.add("hidden");
  ui.dropZone.classList.remove("hidden");
  ui.resultsSection.classList.add("hidden");
  ui.changeVideoButton.classList.add("hidden");
  updateVariantStates();
  setSteps("source");
  updatePrepareAvailability();
  refreshLocalAssets();
}

function bindEvents() {
  ui.replicationNav.addEventListener("click", () => showReplicationView());
  ui.historyNav.addEventListener("click", showHistoryView);
  ui.h3Nav.addEventListener("click", showH3View);
  ui.refreshH3Button.addEventListener("click", refreshH3Status);
  ui.openH3Button.addEventListener("click", openH3Workspace);
  ui.openH3ModelRepositoryButton.addEventListener("click", openH3ModelRepository);
  ui.downloadH3ModelsButton.addEventListener("click", () => {
    downloadH3Models(state.h3Models.filter((model) => !model.installed).map((model) => model.id));
  });
  ui.h3ModelList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-h3-model-download]");
    if (button && !button.disabled) downloadH3Models([button.dataset.h3ModelDownload]);
  });
  ui.editH3InputsButton.addEventListener("click", () => showReplicationView());
  for (const connectorTab of document.querySelectorAll("[data-h3-connector]")) {
    connectorTab.addEventListener("click", () => setH3Connector(connectorTab.dataset.h3Connector));
  }
  ui.saveH3ApiButton.addEventListener("click", saveAndTestH3Api);
  ui.saveH3SshButton.addEventListener("click", saveAndTestH3Ssh);
  ui.chooseH3IdentityButton.addEventListener("click", chooseH3Identity);
  ui.detectH3LocalButton.addEventListener("click", refreshH3Status);
  ui.refreshHistoryButton.addEventListener("click", refreshHistory);
  ui.chooseVideoButton.addEventListener("click", (event) => {
    event.stopPropagation();
    chooseVideo();
  });
  ui.openLinkButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openLinkModal();
  });
  ui.choosePersonButton.addEventListener("click", choosePerson);
  ui.chooseVoiceButton.addEventListener("click", chooseVoice);
  ui.refreshAssetsButton.addEventListener("click", refreshLocalAssets);
  ui.dropZone.addEventListener("click", chooseVideo);
  ui.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") chooseVideo();
  });
  ui.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    ui.dropZone.classList.add("is-dragging");
  });
  ui.dropZone.addEventListener("dragleave", () => {
    ui.dropZone.classList.remove("is-dragging");
  });
  ui.dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    ui.dropZone.classList.remove("is-dragging");
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const videoPath = window.replication.getPathForFile(file);
    await loadVideo(videoPath);
  });

  ui.primaryButton.addEventListener("click", handlePrimaryAction);
  ui.changeVideoButton.addEventListener("click", resetForNewVideo);
  ui.closeLinkModalButton.addEventListener("click", closeLinkModal);
  ui.cancelLinkButton.addEventListener("click", closeLinkModal);
  ui.importLinkButton.addEventListener("click", importVideoLink);
  ui.linkInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      importVideoLink();
    }
  });
  ui.linkModal.addEventListener("click", (event) => {
    if (event.target === ui.linkModal) closeLinkModal();
  });
  ui.closeModalButton.addEventListener("click", closeAuthorization);
  ui.cancelAuthorizationButton.addEventListener("click", closeAuthorization);
  ui.authorizationModal.addEventListener("click", (event) => {
    if (event.target === ui.authorizationModal) closeAuthorization();
  });
  ui.authorizationCheckbox.addEventListener("change", () => {
    ui.confirmAuthorizationButton.disabled = !ui.authorizationCheckbox.checked;
  });
  ui.confirmAuthorizationButton.addEventListener("click", confirmAndSubmit);
}

async function bootstrap() {
  bindEvents();
  try {
    const [config, runs] = await Promise.all([
      window.replication.bootstrap(),
      window.replication.listRuns()
    ]);
    state.historyRuns = runs;
    if (config.demoPersonImagePath) setPersonAsset(config.demoPersonImagePath);
    if (config.demoAudioReferencePath) setVoiceAsset(config.demoAudioReferencePath);
    if (config.initialView === "minimax-h3") {
      await showH3View();
      return;
    }
    if (config.demoVideoPath) {
      await loadVideo(config.demoVideoPath);
      return;
    }
    await refreshLocalAssets();
    const restorableRun = runs.find(shouldAutoRestoreRun);
    if (restorableRun) {
      renderRun(restorableRun);
      if (restorableRun.state === "queued" || restorableRun.state === "running") startPolling();
    }
  } catch (error) {
    showError(error);
  }
}

bootstrap();
