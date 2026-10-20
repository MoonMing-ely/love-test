import assert from "node:assert/strict";
import { loadAlgorithm } from "./helpers/algorithm-harness.mjs";
import { seededRandom } from "./helpers/question-fixtures.mjs";

const context = await loadAlgorithm();
const algorithm = context.Layer6Integration;
const keys = context.AlgorithmConfig.LAYER6.PATHS.map((path) => path.key);
const input = (values, M = 0) => ({ status: "complete", missingDimensions: [],
  ...Object.fromEntries(keys.map((key, index) => [key, values[index]])), protection: { M, self_consistency: null } });
const calculate = (values, M = 0) => algorithm.calculate(input(values, M));
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

assert.equal(algorithm.VERSION, "1.6");
near(calculate([0, 0, 0, 0]).totalScore, 15);
near(calculate([1, 1, 1, 1]).totalScore, 85);
near(calculate([1, 1, 1, 1]).debug.evidenceScore, 90.6);
near(calculate([1, 1, 1, 1], 1).debug.evidenceScore, 82.6);
for (const [values, evidence, score] of [
  [[1, 0, 0, 0], 24, 27], [[0, 1, 0, 0], 62, 62], [[0, 0, 1, 0], 70, 70],
  [[0, 0, 0, 0.8], 60, 60], [[0.5, 0.5, 0.5, 0.5], 45.3, 45.3],
]) {
  const result = calculate(values);
  near(result.debug.evidenceScore, evidence);
  near(result.totalScore, score);
}
// Secondary evidence must affect the score even under a dominant exit pathway.
assert.ok(calculate([0.6, 0, 0, 0.85]).totalScore > calculate([0, 0, 0, 0.85]).totalScore);
// Explanation follows actual severity; equal mechanism strengths need not have equal severity.
assert.equal(calculate([1, 1, 1, 1]).paths.map((path) => path.id).join(), "E,D");
for (const result of [calculate([1, 1, 1, 1]), calculate([1, 0, 0, 0]), calculate([0, 0.7, 0.8, 0.9])]) {
  near(result.paths.reduce((sum, path) => sum + path.weight, 0), 1);
  assert.ok(result.paths.length <= 2);
}
for (const [score, stage] of [[0, 1], [29.999, 1], [30, 2], [49.999, 2], [50, 3], [69.999, 3], [70, 4], [100, 4]]) {
  assert.equal(algorithm.stageForScore(score), stage);
}
for (const score of [-1, 101, null, NaN]) assert.throws(() => algorithm.stageForScore(score), /0～100/);
for (const [evidence, score] of [[0, 15], [10, 20], [20, 25], [30, 30], [50, 50], [70, 70], [90.6, 85]]) {
  near(algorithm.scoreForEvidence(evidence), score);
}
for (const evidence of [-1, 92, null, undefined, NaN, Infinity, "0"]) {
  assert.throws(() => algorithm.scoreForEvidence(evidence), /证据分/);
}
for (const key of [...keys, "M"]) {
  for (const value of [null, undefined]) {
    const missing = input([0.5, 0.5, 0.5, 0.5], 0.5);
    if (key === "M") missing.protection.M = value; else missing[key] = value;
    const result = algorithm.calculate(missing);
    assert.equal(result.status, "insufficient_data");
    assert.equal(result.totalScore, null);
    assert.equal(result.stage, null);
  }
  for (const value of [NaN, Infinity, -0.01, 1.01, "0.5"]) {
    const invalid = input([0.5, 0.5, 0.5, 0.5], 0.5);
    if (key === "M") invalid.protection.M = value; else invalid[key] = value;
    assert.throws(() => algorithm.calculate(invalid), /0～1/);
  }
}
const upstream = algorithm.calculate({ ...input([0.5, 0.5, 0.5, 0.5]), status: "insufficient_data", missingDimensions: ["manipulation"] });
assert.equal(upstream.totalScore, null);
assert.equal(upstream.missingDimensions.join(), "manipulation");
for (const value of [null, [], {}, { status: "unknown" }]) assert.throws(() => algorithm.calculate(value), /第五层/);
const saved = input([0.4, 0.6, 0.2, 0.8], 0.5);
const before = JSON.stringify(saved);
algorithm.calculate(saved);
assert.equal(JSON.stringify(saved), before);
near(algorithm.calculate({ ...saved, protection: { M: 0.5, self_consistency: 1 } }).totalScore,
  algorithm.calculate(saved).totalScore);

// Knots, maximum-path ties, label cutoffs and protection transitions remain numerically continuous.
for (const knot of [30, 70]) near(algorithm.scoreForEvidence(knot - 1e-8), algorithm.scoreForEvidence(knot + 1e-8), 1e-7);
for (const boundary of [0, 0.2, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 1]) {
  for (let index = 0; index < 4; index += 1) {
    const left = [0.52, 0.55, 0.57, 0.54]; left[index] = Math.max(0, boundary - 1e-8);
    const right = [...left]; right[index] = Math.min(1, boundary + 1e-8);
    near(calculate(left, 0.5).totalScore, calculate(right, 0.5).totalScore, 2e-6);
  }
}
// Cross every pair of equally severe paths, rather than hoping random inputs land on a tie.
const ceilings = context.AlgorithmConfig.LAYER6.PATHS.map((path) => path.ceiling);
for (let left = 0; left < 4; left += 1) for (let right = left + 1; right < 4; right += 1) {
  for (const severity of [5, 12, 20]) {
    const values = [0, 0, 0, 0]; values[left] = severity / ceilings[left]; values[right] = severity / ceilings[right];
    const lower = [...values], higher = [...values]; lower[left] -= 1e-8; higher[left] += 1e-8;
    near(calculate(lower, 0.5).totalScore, calculate(higher, 0.5).totalScore, 2e-6);
  }
}
// The M proportional/constant transition at R0=40 is continuous.
near(calculate([0, 0, (40 - 1e-8) / 70, 0], 1).totalScore,
  calculate([0, 0, (40 + 1e-8) / 70, 0], 1).totalScore, 1e-7);
const random = seededRandom(6);
for (let iteration = 0; iteration < 10000; iteration += 1) {
  const values = Array.from({ length: 4 }, () => random()), M = random();
  const result = calculate(values, M);
  assert.ok(Number.isFinite(result.totalScore) && result.totalScore >= 15 && result.totalScore <= 85);
  near(result.debug.evidenceScore, result.debug.preScore + result.debug.protectionAdjustment);
  assert.equal(result.stage, algorithm.stageForScore(result.totalScore));
  assert.ok(result.debug.supplementarySeverity >= -1e-12 && result.debug.supplementarySeverity <= 15.6);
  assert.ok(result.debug.protectionAdjustment >= -8 && result.debug.protectionAdjustment <= 0);
  for (let index = 0; index < 4; index += 1) {
    const higher = [...values]; higher[index] = Math.min(1, higher[index] + 0.001);
    assert.ok(calculate(higher, M).totalScore >= result.totalScore - 1e-10);
    const nearby = [...values]; nearby[index] = Math.min(1, nearby[index] + 1e-8);
    near(calculate(nearby, M).totalScore, result.totalScore, 1e-6);
  }
  const protectedResult = calculate(values, Math.min(1, M + 0.001));
  assert.ok(protectedResult.totalScore <= result.totalScore + 1e-10);
  assert.equal(protectedResult.shape, result.shape);
  assert.equal(protectedResult.paths.map((path) => path.id).join(), result.paths.map((path) => path.id).join());
}
// Changing explanation thresholds/shapes cannot silently change the numeric score.
const altered = await loadAlgorithm();
altered.AlgorithmConfig = { ...altered.AlgorithmConfig, LAYER6: { ...altered.AlgorithmConfig.LAYER6,
  PATHS: altered.AlgorithmConfig.LAYER6.PATHS.map((path) => ({ ...path, threshold: 0.99 })),
  SHAPE: { ...altered.AlgorithmConfig.LAYER6.SHAPE, A_MEAN_MAX: 1, A_MAX: 1 } } };
near(altered.Layer6Integration.calculate(saved).totalScore, algorithm.calculate(saved).totalScore);
console.log("Layer 6: endpoints, dominant/secondary evidence, labels isolated from scoring, 10000 continuity/direction cases.");
