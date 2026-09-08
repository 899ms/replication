const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPrompt, getVariants } = require("../src/core/variants");

test("ReplicaPilot exposes three local-skill hook strategies", () => {
  const variants = getVariants();
  assert.equal(variants.length, 3);
  assert.deepEqual(
    variants.map((variant) => variant.id),
    ["golden_opening", "impact_chain", "abnormal_turn"]
  );
  assert.deepEqual(
    variants.map((variant) => variant.title),
    ["黄金三秒起手", "冲击链起手", "反常转折起手"]
  );
});

test("every variant prompt locks local hook skills, identity, scene, audio, opening, and ending", () => {
  for (const variant of getVariants()) {
    const prompt = buildPrompt(variant);
    assert.equal(variant.sourceSkills.includes("golden-three-second-hook"), true);
    assert.equal(variant.sourceSkills.includes("hook-only-rewriter"), true);
    assert.match(prompt, /@Image 1/);
    assert.match(prompt, /@Audio 1/);
    assert.match(prompt, /@Video 1/);
    assert.match(prompt, /BACKGROUND \/ SCENE LOCK/);
    assert.match(prompt, /GOLDEN THREE SECOND HOOK CONTRACT/);
    assert.match(prompt, /HOOK ONLY REWRITER CONTRACT/);
    assert.match(prompt, /ENDING DIRECTION/);
    assert.match(prompt, /No original source face/);
  }
});
