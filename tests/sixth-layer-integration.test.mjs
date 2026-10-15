import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { seededRandom } from "./helpers/question-fixtures.mjs";

const context = {};
for (const path of ["algorithm-config.js", "sixth-layer-integration.js"]) {
  vm.runInNewContext(await readFile(new URL(`../js/core-algorithm/${path}`, import.meta.url), "utf8"), context);
}
const algorithm = context.Layer6Integration;
const keys = context.AlgorithmConfig.LAYER6.PATHS.map((path) => path.key);
const input = (values, M = 0) => ({ status: "complete", missingDimensions: [],
  ...Object.fromEntries(keys.map((key, index) => [key, values[index]])), protection: { M, self_consistency: null } });
const calculate = (values, M = 0) => algorithm.calculate(input(values, M));
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

for (const [values, M, shape, paths, evidence, expected] of [
  [[0, 0, 0, 0], 0, "A", [], 0.0, 15.0],
  [[0.2, 0.2, 0.2, 0.2], 0.8, "A", [], 11.76, 20.88],
  [[0.82, 0.25, 0.30, 0.28], 0.5, "F", ["B"], 41.2181775147929, 41.2181775147929],
  [[0.52, 0.55, 0.57, 0.54], 0.5, "G", ["D", "C"], 42.215467910787424, 42.215467910787424],
  [[0.75, 0.72, 0.68, 0.78], 0, "H", ["E", "B"], 84.5776527082385, 80.41260907731322],
  [[0.75, 0.72, 0.68, 0.78], 1, "H", ["E", "B"], 76.5776527082385, 74.6983233630275],
  [[0, 0, 0, 0.85], 0, "F", ["E"], 71.25, 70.89285714285714],
  [[0.55, 0, 0, 0.85], 0, "F", ["E"], 71.25, 70.89285714285714],
  [[1, 1, 1, 1], 0, "H", ["B", "C"], 91.0, 85.0],
  [[0.55, 0.1, 0.15, 0.2], 0, null, ["B"], 21.60616750113792, 25.80308375056896],
]) {
  const result = calculate(values, M);
  assert.equal(result.status, "complete");
  assert.equal(result.shape, shape);
  assert.equal(result.paths.map((path) => path.id).join(","), paths.join(","));
  near(result.debug.evidenceScore, evidence);
  near(result.totalScore, expected);
  if (result.paths.length) near(result.paths.reduce((sum, path) => sum + path.weight, 0), 1);
}
// 所有解释锚点保持原文取值；单路径充分激活时等于 Anchor+DepthAdjustment。
for (const [index, anchor] of [40, 52, 60, 65].entries()) {
  const values = [0, 0, 0, 0]; values[index] = index === 0 ? 0.85 : 0.8;
  const result = calculate(values);
  near(result.totalScore, anchor + (index === 0 ? 6.25 : 5));
  near(result.diagnostics.pathAnchor, anchor);
  near(result.diagnostics.depth, values[index]);
  near(result.diagnostics.depthAdjustment, index === 0 ? 6.25 : 5);
}
const dual = calculate([0.75, 0.72, 0.68, 0.78]);
assert.equal(dual.version, "1.4");
near(calculate([1, 1, 1, 1], 0).totalScore, 85);
near(calculate([1, 1, 1, 1], 1).totalScore, 79.28571428571429);
const [first, second] = dual.paths;
near(first.weight, first.match ** 2 / (first.match ** 2 + second.match ** 2));
const fallback = calculate([0.1, 0.2, 0.3, 0.4]);
assert.equal(fallback.paths.length, 0);
assert.equal(fallback.diagnostics.pathAnchor, null);
near(fallback.debug.evidenceScore, 19.799726900318614);
near(fallback.totalScore, 24.899863450159307);
assert.equal(algorithm.stageForScore(0), 1);
for (const [score, expected] of [[29.999, 1], [30, 2], [49.999, 2], [50, 3], [69.999, 3], [70, 4], [100, 4]]) {
  assert.equal(algorithm.stageForScore(score), expected);
}
for (const score of [-1, 101, null, NaN]) assert.throws(() => algorithm.stageForScore(score), /0～100/);
for (const [evidence, score] of [[0.0, 15.0], [10, 20], [20, 25], [30, 30], [50, 50], [70, 70], [91.0, 85.0]]) {
  near(algorithm.scoreForEvidence(evidence), score);
}
for (const evidence of [-1, 92, null, undefined, NaN, Infinity, "0"]) {
  assert.throws(() => algorithm.scoreForEvidence(evidence), /证据分/);
}
for (const knot of [30, 70]) {
  near(algorithm.scoreForEvidence(knot - 1e-8), algorithm.scoreForEvidence(knot + 1e-8), 1e-7);
}
near(algorithm.smooth(0.5, 0, 1), 0.5);
near(algorithm.smooth(-1, 0, 1), 0);
near(algorithm.smooth(2, 0, 1), 1);

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
const consistent = { ...saved, protection: { M: 0.5, self_consistency: 1 } };
near(algorithm.calculate(consistent).totalScore, algorithm.calculate(saved).totalScore);

// 原型标签可以离散切换；连续计分公式不读取 Shape/Path 标签。
for (const boundary of [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.85]) {
  for (let index = 0; index < 4; index += 1) {
    const left = [0.52, 0.55, 0.57, 0.54]; left[index] = boundary - 1e-8;
    const right = [...left]; right[index] = boundary + 1e-8;
    near(calculate(left, 0.5).totalScore, calculate(right, 0.5).totalScore, 1e-4);
  }
}
const random = seededRandom(6);
for (let iteration = 0; iteration < 10000; iteration += 1) {
  const values = Array.from({ length: 4 }, () => random());
  const M = random();
  const result = calculate(values, M);
  assert.ok(Number.isFinite(result.totalScore) && result.totalScore >= 15 && result.totalScore <= 85);
  const evidence = result.debug.evidenceScore;
  near(evidence, result.debug.preScore + result.debug.protectionAdjustment);
  assert.equal(result.stage, algorithm.stageForScore(evidence));
  const otherEvidence = random() * 91;
  assert.ok(Math.abs(algorithm.scoreForEvidence(otherEvidence) - result.totalScore) <=
    Math.abs(otherEvidence - evidence) + 1e-10);
  assert.ok(result.debug.shapeAdjustment >= 0 && result.debug.shapeAdjustment <= 16);
  assert.ok(result.debug.protectionAdjustment >= -8 && result.debug.protectionAdjustment <= 0);
  for (let index = 0; index < 4; index += 1) {
    const higher = [...values]; higher[index] = Math.min(1, higher[index] + 0.001);
    assert.ok(calculate(higher, M).totalScore >= result.totalScore - 1e-10);
    const nearby = [...values]; nearby[index] = Math.min(1, nearby[index] + 1e-8);
    near(calculate(nearby, M).totalScore, result.totalScore, 1e-4);
  }
  const protectedResult = calculate(values, Math.min(1, M + 0.001));
  assert.ok(protectedResult.totalScore <= result.totalScore + 1e-10);
  assert.equal(protectedResult.shape, result.shape);
  assert.equal(protectedResult.paths.map((path) => path.id).join(), result.paths.map((path) => path.id).join());
}
console.log("第六层通过：公式、原型、缺失、阶段与10000组连续性/方向测试。");
