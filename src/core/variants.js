const SOURCE_SKILLS = Object.freeze([
  "golden-three-second-hook",
  "hook-only-rewriter"
]);

const VARIANTS = Object.freeze([
  Object.freeze({
    id: "golden_opening",
    index: 1,
    title: "黄金三秒起手",
    label: "Golden 0-3s",
    accent: "#7DA2FF",
    expressionIntensity: "expressive",
    hookEngine:
      "Start in the middle of one visible event. The first frame must already show the trigger or consequence. Build subject + scene + conflict into one causal change.",
    hookTimeline:
      "0.0-0.7s event is already happening; 0.7-1.8s the scene changes from A to B; 1.8-3.0s the replacement creator reacts; after 3.0s bridge back to the source video's main content.",
    endingDirection:
      "End with the same product meaning and a clean human reaction beat. Do not add platform CTA, price, extra claims, or generated text."
  }),
  Object.freeze({
    id: "impact_chain",
    index: 2,
    title: "冲击链起手",
    label: "Impact Chain",
    accent: "#FF9F8C",
    expressionIntensity: "high-energy",
    hookEngine:
      "Use the hook-only-rewriter impact chain: uncontrolled trigger -> visible loss -> sound or physical cue -> instant human reaction -> product/method enters late as the bridge.",
    hookTimeline:
      "Keep the first 0-3 seconds to one load-bearing accident/rescue or giant-feedback chain. The product or method should not enter before the conflict is visually established unless it is the proof itself.",
    endingDirection:
      "Close by resolving the visible pressure and returning to the source video's original payoff. Keep factual claims unchanged."
  }),
  Object.freeze({
    id: "abnormal_turn",
    index: 3,
    title: "反常转折起手",
    label: "Abnormal Turn",
    accent: "#B49CFF",
    expressionIntensity: "expressive",
    hookEngine:
      "Use a single abnormal behavior, social collision, exposure, or rule-pressure turn that fits the source scene. The opening must be understandable without subtitles.",
    hookTimeline:
      "Show the abnormal turn first, then the scene's A-to-B consequence, then the replacement creator's decision or recovery move, then reconnect to the source story.",
    endingDirection:
      "End with a concise remembered gesture or reaction that matches the new creator identity and voice delivery, while preserving the original meaning."
  })
]);

const BASE_PROMPT = `OUTPUT LOCK:
Generate one vertical short-form video at the requested duration and ratio. Keep the source video's central meaning, product context, scene continuity, and language. This is a disclosed synthetic creator remake, not an endorsement by the source presenter.

LOCAL SKILL BINDING:
This prompt is governed by the local skills golden-three-second-hook and hook-only-rewriter. Do not use generic Result First / Tension First / POV templates. The opening must be a production-ready 起手 event compiled from subject + scene + conflict.

IDENTITY LOCK:
Use @Image 1 as the replacement creator identity throughout the entire video. The same face, hair, age impression, facial structure, visible styling, body type impression, and persona must remain stable in every shot. @Image 1 always wins if any other reference conflicts. Do not preserve, reconstruct, or return the original presenter's face or identity marks from @Video 1.

VOICE / TIMBRE LOCK:
Use @Audio 1 as the replacement voice reference for timbre, accent, pace, pauses, emotional temperature, and delivery feel. Keep mouth motion natural and synchronized with the generated speech. Do not preserve the original source presenter's voice identity when @Audio 1 is supplied.

REFERENCE BINDING:
Use @Video 1 only for shot order, camera movement, body action, lighting rhythm, framing, pacing, scene continuity, and content meaning. Do not keep the original person's face, voice identity, or identity marks from @Video 1.

BACKGROUND / SCENE LOCK:
Preserve @Video 1's background, product images, layout, existing source-video text or UI, lighting, object positions, and spatial relationships. Only replace the foreground creator identity and generated voice/timbre. Do not use @Image 1's background as the scene. Do not add new text or UI.

PERFORMANCE LOCK:
The replacement creator should feel natural and camera-aware. Preserve the source timing and rough gesture path while adding restrained eye contact, eyebrow movement, smile changes, small head nods, and purposeful micro-gestures. The acting must support the local hook event, not become random dancing or unrelated emphasis.

NEGATIVE CONSTRAINTS:
No original source face, no original source voice identity, no identity mixing, no face morphing, no duplicate person, no plastic skin, no waxy face, no frozen expression, no scene replacement, no new subtitle, no new caption, no new platform UI, no watermark, no username, no readable generated text, no unrelated gesture, and no invented product claim.`;

function buildPrompt(variant) {
  return `${BASE_PROMPT}

GOLDEN THREE SECOND HOOK CONTRACT:
- Start from the middle of a visible event, not from setup, empty scene, sitting down, holding product, or looking at camera.
- Build one causal chain only: trigger -> visible A-to-B scene change -> instant creator reaction -> bridge back to main story after 3 seconds.
- The first frame must already show the trigger or consequence.
- The conflict must change the scene reality: tidy to messy, hidden to exposed, safe to urgent, owned to lost, quiet to disrupted, or rule-following to broken.
- Product/method normally enters after the problem exists, unless the product itself is the visual proof.

HOOK ONLY REWRITER CONTRACT:
- Change only the opening hook/event unit and the minimal bridge back into the source story.
- Keep original product, scene, persona input, factual claims, payoff, downstream beats, and later proof points stable.
- Prefer a unique event card from this source scene rather than rotating abstract labels.
- Impact chain for rescue/feedback openings: uncontrolled trigger -> visible loss -> sound/physical cue -> instant human reaction -> late product/method bridge.

VERSION HOOK ENGINE:
${variant.hookEngine}

0-3 SECOND TIMELINE:
${variant.hookTimeline}

ENDING DIRECTION:
${variant.endingDirection}

Return a coherent complete video. The opening and ending may be re-staged, but the middle story, factual meaning, replacement person identity, and replacement voice/timbre must remain recognizable and faithful to @Video 1, @Image 1, and @Audio 1.`;
}

function getVariants() {
  return VARIANTS.map((variant) => ({
    ...variant,
    sourceSkills: [...SOURCE_SKILLS],
    prompt: buildPrompt(variant)
  }));
}

module.exports = {
  BASE_PROMPT,
  buildPrompt,
  getVariants
};
