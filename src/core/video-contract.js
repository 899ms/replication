const path = require("node:path");

const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);
const MAX_DURATION_SECONDS = 15.5;
const MAX_FILE_BYTES = 300 * 1024 * 1024;

function validateVideoPath(videoPath) {
  if (!videoPath || typeof videoPath !== "string" || !path.isAbsolute(videoPath)) {
    throw new Error("请选择一个本地视频文件。");
  }

  const extension = path.extname(videoPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error("当前 Demo 仅支持 MP4、MOV 或 M4V。");
  }

  return extension;
}

function normalizeProbe(probe, fileSize) {
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration || video?.duration || 0);
  const width = Number(video?.width || 0);
  const height = Number(video?.height || 0);

  if (!video || !width || !height || !duration) {
    throw new Error("无法读取有效的视频画面或时长。");
  }
  if (!audio) {
    throw new Error("视频没有可用音轨；ReplicaPilot 需要带声音的口播视频。");
  }
  if (duration > MAX_DURATION_SECONDS) {
    throw new Error(`视频时长为 ${duration.toFixed(1)} 秒；当前 Demo 最长支持 15 秒。`);
  }
  if (height <= width) {
    throw new Error("当前 Demo 只支持竖屏视频。");
  }
  if (fileSize > MAX_FILE_BYTES) {
    throw new Error("视频大于 300MB，请先压缩后再上传。");
  }

  return {
    duration,
    width,
    height,
    codec: video.codec_name || "unknown",
    audioCodec: audio.codec_name || "unknown",
    fileSize,
    ratio: `${width}:${height}`,
    outputDuration: Math.min(15, Math.max(5, Math.round(duration)))
  };
}

module.exports = {
  MAX_DURATION_SECONDS,
  MAX_FILE_BYTES,
  SUPPORTED_EXTENSIONS,
  normalizeProbe,
  validateVideoPath
};
