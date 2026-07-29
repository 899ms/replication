const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_DURATION_SECONDS,
  normalizeProbe,
  validateVideoPath
} = require("../src/core/video-contract");

function validProbe() {
  return {
    format: { duration: "12.4" },
    streams: [
      { codec_type: "video", codec_name: "h264", width: 1080, height: 1920 },
      { codec_type: "audio", codec_name: "aac" }
    ]
  };
}

test("accepts an absolute supported local video path", () => {
  assert.equal(validateVideoPath("/tmp/demo.mp4"), ".mp4");
});

test("rejects unsupported or relative video paths", () => {
  assert.throws(() => validateVideoPath("demo.mp4"), /本地视频/);
  assert.throws(() => validateVideoPath("/tmp/demo.avi"), /仅支持/);
});

test("normalizes a vertical video with an audio stream", () => {
  const metadata = normalizeProbe(validProbe(), 1024);
  assert.equal(metadata.duration, 12.4);
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);
  assert.equal(metadata.outputDuration, 12);
});

test("rejects long, landscape, silent, and oversized inputs", () => {
  const longProbe = validProbe();
  longProbe.format.duration = String(MAX_DURATION_SECONDS + 1);
  assert.throws(() => normalizeProbe(longProbe, 1024), /最长支持/);

  const landscape = validProbe();
  landscape.streams[0].width = 1920;
  landscape.streams[0].height = 1080;
  assert.throws(() => normalizeProbe(landscape, 1024), /竖屏/);

  const silent = validProbe();
  silent.streams = silent.streams.filter((stream) => stream.codec_type !== "audio");
  assert.throws(() => normalizeProbe(silent, 1024), /音轨/);

  assert.throws(
    () => normalizeProbe(validProbe(), 301 * 1024 * 1024),
    /300MB/
  );
});
