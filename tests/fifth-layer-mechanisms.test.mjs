import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const sources = await Promise.all(
  [
    "../js/core-algorithm/dimension-vector.js",
    "../js/core-algorithm/second-layer-normalizer.js",
    "../js/question-sampler.js",
    "../js/core-algorithm/third-layer-aggregator.js",
    "../js/core-algorithm/algorithm-config.js",
    "../js/core-algorithm/fourth-layer-evidence.js",
    "../js/core-algorithm/fifth-layer-mechanisms.js",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);
const context = {};
sources.forEach((source) => vm.runInNewContext(source, context));
const questionData = JSON.parse(
  await readFile(new URL("../data/questions.json", import.meta.url), "utf8"),
);

function input(overrides = {}) {
  return {
    recognition: 0.2,
    need: 0.2,
    specialness: 0.2,
    scarcity: 0.2,
    calibration: 0.9,
    evidence: 0.9,
    manipulation: 0.9,
    rationalization: 0.2,
    boundary: 0.9,
    stop_loss: 0.9,
    differentiation: 0.9,
    metacognition: 0.5,
    ...overrides,
  };
}

function calculate(overrides = {}) {
  return context.Layer5Mechanisms.calculate(
    context.Layer4Evidence.calculate(input(overrides)),
  );
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

// P1 frozen boundary cases.
assert.equal(
  calculate({ recognition: 1 }).P1_relation_value_amplification,
  0.8,
);
assert.equal(
  calculate({ recognition: 1, need: 1 }).P1_relation_value_amplification,
  1,
);
assert.equal(
  calculate({ recognition: 0, need: 0, specialness: 0, scarcity: 0 })
    .P1_relation_value_amplification,
  0,
);
close(
  calculate({ recognition: 0.55, need: 0.55, specialness: 0.55, scarcity: 0.55 })
    .P1_relation_value_amplification,
  0.5,
);

// P2: relationship pull AND weak judgment; support cannot create the core.
assert.equal(
  calculate({
    recognition: 0.9,
    need: 0.9,
    specialness: 0.9,
    scarcity: 0.9,
    calibration: 0.9,
    evidence: 0.9,
    manipulation: 0.9,
    rationalization: 1,
  }).P2_judgment_shift,
  0,
);
assert.equal(
  calculate({
    recognition: 0.9,
    need: 0.9,
    specialness: 0.9,
    scarcity: 0.9,
    calibration: 0.2,
    evidence: 0.2,
    manipulation: 0.2,
  }).P2_judgment_shift,
  1,
);
assert.equal(
  calculate({
    calibration: 0.2,
    evidence: 0.2,
    manipulation: 0.2,
    rationalization: 1,
  }).P2_judgment_shift,
  0,
);

// P3 uses J/B and is independent from T.
assert.equal(
  calculate({ boundary: 0.1, stop_loss: 0.1 }).P3_action_failure,
  1,
);
assert.equal(
  calculate({
    calibration: 0.1,
    evidence: 0.1,
    manipulation: 0.1,
    boundary: 0.1,
  }).P3_action_failure,
  0,
);
assert.equal(calculate({ boundary: 0.9 }).P3_action_failure, 0);
assert.equal(
  calculate({ boundary: 0.1, stop_loss: 0 }).P3_action_failure,
  calculate({ boundary: 0.1, stop_loss: 1 }).P3_action_failure,
);

// P4 uses T/F and is independent from B.
assert.equal(
  calculate({ stop_loss: 0, differentiation: 1 }).debug.core4,
  0.8,
);
assert.equal(
  calculate({ stop_loss: 0, differentiation: 0 }).debug.core4,
  1,
);
assert.equal(calculate({ stop_loss: 1, differentiation: 1 }).P4_exit_difficulty, 0);
assert.equal(
  calculate({ boundary: 0, stop_loss: 0, differentiation: 1 }).debug.core4,
  calculate({ boundary: 1, stop_loss: 0, differentiation: 1 }).debug.core4,
);

// M and self-consistency are protection outputs only.
{
  const lowM = calculate({ metacognition: 0 });
  const highM = calculate({ metacognition: 1 });
  assert.deepEqual(
    [
      lowM.P1_relation_value_amplification,
      lowM.P2_judgment_shift,
      lowM.P3_action_failure,
      lowM.P4_exit_difficulty,
    ],
    [
      highM.P1_relation_value_amplification,
      highM.P2_judgment_shift,
      highM.P3_action_failure,
      highM.P4_exit_difficulty,
    ],
  );
  assert.equal(lowM.protection.M, 0);
  assert.equal(highM.protection.M, 1);
}

// Integration profiles A-E from the frozen specification.
{
  const profileA = calculate({
    recognition: 0.9,
    need: 0.6,
    specialness: 0.8,
    scarcity: 0.7,
    boundary: 0.9,
    stop_loss: 0.9,
    differentiation: 0.9,
    metacognition: 0.8,
  });
  assert.ok(profileA.P1_relation_value_amplification > 0.8);
  assert.equal(profileA.P2_judgment_shift, 0);
  assert.equal(profileA.P3_action_failure, 0);
  assert.equal(profileA.P4_exit_difficulty, 0);

  const profileB = calculate({ boundary: 0.15, stop_loss: 0.8, differentiation: 0.8 });
  assert.equal(profileB.P2_judgment_shift, 0);
  assert.ok(profileB.P3_action_failure > 0.8);
  assert.equal(profileB.P4_exit_difficulty, 0);

  const profileC = calculate({
    recognition: 0.9,
    need: 0.9,
    specialness: 0.9,
    scarcity: 0.9,
    calibration: 0.15,
    evidence: 0.15,
    manipulation: 0.15,
    rationalization: 0.9,
    boundary: 0.1,
    stop_loss: 0.1,
    differentiation: 0.1,
  });
  assert.ok(profileC.P1_relation_value_amplification > 0.8);
  assert.ok(profileC.P2_judgment_shift > 0.8);
  assert.equal(profileC.P3_action_failure, 0);
  assert.ok(profileC.P4_exit_difficulty > 0.8);

  const profileD = calculate({ stop_loss: 0.1, differentiation: 0.2 });
  assert.equal(profileD.P1_relation_value_amplification, 0);
  assert.equal(profileD.P2_judgment_shift, 0);
  assert.equal(profileD.P3_action_failure, 0);
  assert.ok(profileD.P4_exit_difficulty > 0.8);

  const profileE = calculate({
    recognition: 0.8,
    need: 0.8,
    specialness: 0.8,
    scarcity: 0.8,
    calibration: 0.8,
    evidence: 0.8,
    manipulation: 0.8,
    boundary: 0.2,
    stop_loss: 0.9,
    differentiation: 0.9,
  });
  assert.ok(profileE.P1_relation_value_amplification > 0.8);
  assert.equal(profileE.P2_judgment_shift, 0);
  assert.ok(profileE.P3_action_failure > 0.8);
  assert.equal(profileE.P4_exit_difficulty, 0);
}

// Frozen monotonic invariants over the transition region.
for (let step = 0; step <= 10; step += 1) {
  const value = step / 10;
  const next = Math.min(1, value + 0.05);
  const p2 = (judgment) =>
    calculate({
      recognition: 0.7,
      need: 0.7,
      specialness: 0.7,
      scarcity: 0.7,
      calibration: judgment,
      evidence: judgment,
      manipulation: judgment,
    }).P2_judgment_shift;
  const p3ByJ = (judgment) =>
    calculate({
      calibration: judgment,
      evidence: judgment,
      manipulation: judgment,
      boundary: 0.1,
    }).P3_action_failure;
  const p3ByB = (boundary) => calculate({ boundary }).P3_action_failure;
  const p4ByT = (stopLoss) => calculate({ stop_loss: stopLoss }).P4_exit_difficulty;
  const p4ByF = (differentiation) =>
    calculate({ differentiation }).P4_exit_difficulty;

  assert.ok(p2(next) <= p2(value) + 1e-12, "J 上升时 P2 不得上升");
  assert.ok(p3ByJ(next) + 1e-12 >= p3ByJ(value), "B 弱时 J 上升可增强 P3");
  assert.ok(p3ByB(next) <= p3ByB(value) + 1e-12, "B 上升时 P3 不得上升");
  assert.ok(p4ByT(next) <= p4ByT(value) + 1e-12, "T 上升时 P4 不得上升");
  assert.ok(p4ByF(next) <= p4ByF(value) + 1e-12, "F 上升时 P4 不得上升");
}

{
  const incomplete = context.Layer5Mechanisms.calculate(
    context.Layer4Evidence.calculate(input({ manipulation: null })),
  );
  assert.equal(incomplete.status, "insufficient_data");
  assert.equal(incomplete.P2_judgment_shift, null);
}

// Actual 28-question data crosses the complete Raw -> Layer 5 boundary.
{
  let randomState = 7;
  const random = () => {
    randomState = (randomState * 1664525 + 1013904223) % 2 ** 32;
    return randomState / 2 ** 32;
  };
  const sample = context.QuestionSampler.sampleStratified(
    questionData.questions,
    28,
    random,
  );
  const rawVector = context.DimensionVector.create();
  sample.questions.forEach((question, index) => {
    context.DimensionVector.addOption(
      rawVector,
      question.options[index % question.options.length].scores,
      questionData.dimensions,
    );
  });
  const normalized = context.DimensionNormalizer.normalize({
    rawVector,
    dimensions: questionData.dimensions,
    questions: sample.questions,
  });
  const layer3 = context.HigherOrderStructure.aggregate(normalized);
  const layer4 = context.Layer4Evidence.fromLayer3(layer3);
  const layer5 = context.Layer5Mechanisms.calculate(layer4);

  assert.equal(layer4.status, "complete");
  assert.equal(layer5.status, "complete");
  [
    layer5.P1_relation_value_amplification,
    layer5.P2_judgment_shift,
    layer5.P3_action_failure,
    layer5.P4_exit_difficulty,
  ].forEach((value) => {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0 && value <= 1);
  });
}

console.log("Fifth-layer mechanism tests passed.");
