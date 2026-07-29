const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);
const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".svn",
  ".Trash",
  "node_modules",
  "dist",
  "runtime",
  "Library",
  "__MACOSX"
]);

const PERSON_KEYWORDS = [
  "person",
  "persona",
  "avatar",
  "face",
  "portrait",
  "headshot",
  "人物",
  "人设",
  "头像",
  "口播",
  "博主",
  "真人"
];

const VOICE_KEYWORDS = [
  "voice",
  "audio",
  "sound",
  "timbre",
  "reference",
  "音色",
  "声音",
  "发音",
  "配音",
  "口播",
  "旁白",
  "参考"
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function shouldSkipDirectory(entryName) {
  return (
    EXCLUDED_DIRECTORY_NAMES.has(entryName) ||
    entryName.endsWith(".app") ||
    entryName.endsWith(".asar") ||
    entryName.startsWith(".")
  );
}

function defaultRoots(sourceVideoPath, options = {}) {
  const roots = [];
  if (sourceVideoPath) roots.push(path.dirname(sourceVideoPath));
  void options;
  return unique(roots.map((root) => path.resolve(root)));
}

function keywordScore(name, keywords) {
  const lower = name.toLowerCase();
  return keywords.reduce((score, keyword) => (lower.includes(keyword.toLowerCase()) ? score + 16 : score), 0);
}

function rootScore(filePath, roots, sourceVideoPath) {
  if (sourceVideoPath && path.dirname(sourceVideoPath) === path.dirname(filePath)) return 28;
  const index = roots.findIndex((root) => filePath.startsWith(root));
  return Math.max(0, 8 - index);
}

function classifyCandidate(filePath, roots, sourceVideoPath) {
  const extension = path.extname(filePath).toLowerCase();
  const stats = safeStat(filePath);
  if (!stats || !stats.isFile() || stats.size <= 0) return null;

  let type = null;
  let keywordBonus = 0;
  if (IMAGE_EXTENSIONS.has(extension)) {
    type = "person";
    keywordBonus = keywordScore(path.basename(filePath), PERSON_KEYWORDS);
  } else if (AUDIO_EXTENSIONS.has(extension)) {
    type = "voice";
    keywordBonus = keywordScore(path.basename(filePath), VOICE_KEYWORDS);
  } else {
    return null;
  }

  const recencyBonus = Math.min(32, Math.max(0, stats.mtimeMs / Date.now()) * 20);
  const score = keywordBonus + rootScore(filePath, roots, sourceVideoPath) + recencyBonus;
  const hash = crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 12);
  const root = roots.find((candidateRoot) => filePath.startsWith(candidateRoot));
  return {
    id: `${type}-${hash}`,
    type,
    path: filePath,
    name: path.basename(filePath),
    directory: path.dirname(filePath),
    url: pathToFileURL(filePath).href,
    size: stats.size,
    modifiedAt: new Date(stats.mtimeMs).toISOString(),
    score,
    reason: root ? path.basename(root) || root : "本地"
  };
}

function walkDirectory(root, maxDepth, visitFile) {
  const seen = new Set();
  function walk(current, depth) {
    let real = null;
    try {
      real = fs.realpathSync.native?.(current) || fs.realpathSync(current);
    } catch {
      return;
    }
    if (seen.has(real)) return;
    seen.add(real);
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) walk(absolute, depth + 1);
      } else if (entry.isFile()) {
        visitFile(absolute);
      }
    }
  }

  if (fs.existsSync(root)) walk(root, 0);
}

function listLocalAssets(options = {}) {
  const sourceVideoPath = options.sourceVideoPath ? path.resolve(options.sourceVideoPath) : null;
  const roots = unique(
    (options.roots || defaultRoots(sourceVideoPath, { includeGlobal: options.includeGlobal === true }))
      .map((root) => path.resolve(root))
  );
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 2;
  const maxPerType = Number.isFinite(options.maxPerType) ? options.maxPerType : 12;
  const candidates = [];

  for (const root of roots) {
    walkDirectory(root, maxDepth, (filePath) => {
      const candidate = classifyCandidate(filePath, roots, sourceVideoPath);
      if (candidate) candidates.push(candidate);
    });
  }

  const byPath = new Map();
  for (const candidate of candidates) {
    const existing = byPath.get(candidate.path);
    if (!existing || candidate.score > existing.score) byPath.set(candidate.path, candidate);
  }

  const sorted = [...byPath.values()].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return String(right.modifiedAt).localeCompare(String(left.modifiedAt));
  });

  return {
    roots,
    persons: sorted.filter((candidate) => candidate.type === "person").slice(0, maxPerType),
    voices: sorted.filter((candidate) => candidate.type === "voice").slice(0, maxPerType)
  };
}

module.exports = {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  defaultRoots,
  listLocalAssets
};
