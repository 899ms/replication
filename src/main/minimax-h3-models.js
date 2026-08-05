const MODEL_REPOSITORY_URL = "https://huggingface.co/Comfy-Org/MiniMax-H3";

const MINIMAX_H3_MODELS = Object.freeze([
  Object.freeze({
    id: "diffusion",
    title: "R2V 生成模型",
    fileName: "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    relativePath: "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    targetDirectory: "ComfyUI/models/diffusion_models/",
    sizeBytes: 20970379616,
    sha256: "9255f52b6677845ad238f20dfaafa94727053694127ab7f255c048f0f9365779"
  }),
  Object.freeze({
    id: "textEncoder",
    title: "Qwen3-VL 文本编码器",
    fileName: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    relativePath: "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    targetDirectory: "ComfyUI/models/text_encoders/",
    sizeBytes: 15687142551,
    sha256: "35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6"
  }),
  Object.freeze({
    id: "videoVae",
    title: "视频 VAE",
    fileName: "minimax_h3_video_vae_fp16.safetensors",
    relativePath: "vae/minimax_h3_video_vae_fp16.safetensors",
    targetDirectory: "ComfyUI/models/vae/",
    sizeBytes: 5207808496,
    sha256: "7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522"
  }),
  Object.freeze({
    id: "audioVae",
    title: "音频 VAE",
    fileName: "minimax_h3_audio_vae_fp32.safetensors",
    relativePath: "vae/minimax_h3_audio_vae_fp32.safetensors",
    targetDirectory: "ComfyUI/models/vae/",
    sizeBytes: 605254808,
    sha256: "8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48"
  })
]);

function downloadUrl(relativePath) {
  return `${MODEL_REPOSITORY_URL}/resolve/main/${relativePath}?download=true`;
}

function listMinimaxH3Models(modelChecks = {}) {
  return MINIMAX_H3_MODELS.map((model) => ({
    ...model,
    installed: Boolean(modelChecks[model.id]),
    downloadUrl: downloadUrl(model.relativePath)
  }));
}

function resolveModelSelection(modelIds) {
  if (!Array.isArray(modelIds) || modelIds.length === 0) {
    throw new Error("请选择至少一个 MiniMax H3 模型。");
  }
  const uniqueIds = [...new Set(modelIds.map((modelId) => String(modelId || "")))];
  const models = uniqueIds.map((modelId) => {
    const model = MINIMAX_H3_MODELS.find((candidate) => candidate.id === modelId);
    if (!model) throw new Error(`不支持的 MiniMax H3 模型：${modelId}`);
    return model;
  });
  return models;
}

async function openModelDownloads(modelIds, opener) {
  if (typeof opener !== "function") throw new Error("系统下载入口不可用。");
  const models = resolveModelSelection(modelIds);
  for (const model of models) {
    await opener(downloadUrl(model.relativePath));
  }
  return {
    opened: models.map((model) => model.id),
    count: models.length
  };
}

module.exports = {
  MINIMAX_H3_MODELS,
  MODEL_REPOSITORY_URL,
  downloadUrl,
  listMinimaxH3Models,
  openModelDownloads,
  resolveModelSelection
};
