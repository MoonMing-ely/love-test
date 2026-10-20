import assert from "node:assert/strict";
import { loadAlgorithm, scoreDimensions, stableDimensions, riskKeys, protectionKeys } from "./helpers/algorithm-harness.mjs";
import { seededRandom } from "./helpers/question-fixtures.mjs";

const context = await loadAlgorithm();
const neutral = Object.fromEntries(Object.keys(stableDimensions).map((key) => [key, riskKeys.includes(key) ? 0 : 1]));
const calculate = (overrides = {}) => context.Layer5Mechanisms.calculate(context.Layer4Evidence.calculate({ ...neutral, ...overrides }));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
assert.equal(context.Layer5Mechanisms.VERSION, "1.3");
assert.equal(calculate().P1_relation_value_amplification, 0);
near(calculate({ recognition: 1 }).P1_relation_value_amplification, 0.8);
assert.equal(calculate({ recognition: 1, need: 1 }).P1_relation_value_amplification, 1);
// Judgment weakness and avoidance still count even without emotional amplification.
near(calculate({ calibration: 0, evidence: 0, manipulation: 0 }).P2_judgment_shift, 1);
near(calculate({ evidence: 0 }).P2_judgment_shift, 0.8);
near(calculate({ rationalization: 1 }).P2_judgment_shift, 0.6);
// Strong feeling cannot create action/exit failure when behavior is sound.
const feeling = calculate({ recognition: 1, need: 1, specialness: 1, scarcity: 1 });
assert.equal(feeling.P2_judgment_shift, 0);
assert.equal(feeling.P3_action_failure, 0);
assert.equal(feeling.P4_exit_difficulty, 0);
// Weak boundaries remain visible at any judgment level; no P2/P3 handoff valley.
for (const judgment of [0, 0.25, 0.5, 0.75, 1]) {
  assert.equal(calculate({ boundary: 0, calibration: judgment, evidence: judgment, manipulation: judgment }).P3_action_failure, 1);
}
assert.equal(calculate({ boundary: 0, stop_loss: 0 }).P3_action_failure,
  calculate({ boundary: 0, stop_loss: 1 }).P3_action_failure);
// Being unable to stop weighs more than internal entanglement alone, without ignoring either.
const stopping = calculate({ stop_loss: 0 });
const entangled = calculate({ differentiation: 0 });
near(stopping.P4_exit_difficulty, 0.8);
near(entangled.P4_exit_difficulty, 0.5);
assert.equal(calculate({ stop_loss: 0, differentiation: 0 }).P4_exit_difficulty, 1);
assert.equal(calculate({ stop_loss: 0, boundary: 0 }).P4_exit_difficulty,
  calculate({ stop_loss: 0, boundary: 1 }).P4_exit_difficulty);
const lowM = calculate({ metacognition: 0 });
const highM = calculate({ metacognition: 1 });
for (const key of context.AlgorithmConfig.LAYER6.PATHS.map((path) => path.key)) assert.equal(lowM[key], highM[key]);
assert.equal(lowM.protection.M, 0);
assert.equal(highM.protection.M, 1);
// Check individual dimensions, not merely the averaged J: the old J_hole support reversed direction.
const random = seededRandom(314159);
for (let sample = 0; sample < 1000; sample += 1) {
  const values = Object.fromEntries(Object.keys(stableDimensions).map((key) => [key, random()]));
  const before = scoreDimensions(context, values).totalScore;
  for (const key of [...riskKeys, ...protectionKeys]) {
    const next = { ...values, [key]: Math.min(1, values[key] + 0.01) };
    const after = scoreDimensions(context, next).totalScore;
    assert.ok(riskKeys.includes(key) ? after >= before - 1e-9 : after <= before + 1e-9, `${key} direction reversed`);
    assert.ok(Math.abs(after - before) <= 1.1, `${key}: 1% input change affected score too much`);
  }
}
for (const key of Object.keys(stableDimensions)) {
  const result = calculate({ [key]: null });
  assert.equal(result.status, "insufficient_data");
  for (const path of context.AlgorithmConfig.LAYER6.PATHS) assert.equal(result[path.key], null);
}
console.log("Layer 5: independent behavior evidence, asymmetric exit difficulty, 12000 dimension-direction checks.");
