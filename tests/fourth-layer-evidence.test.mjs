import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const configSource = await readFile(
  new URL("../js/core-algorithm/algorithm-config.js", import.meta.url),
  "utf8",
);
const layer4Source = await readFile(
  new URL("../js/core-algorithm/fourth-layer-evidence.js", import.meta.url),
  "utf8",
);
const context = {};
vm.runInNewContext(configSource, context);
vm.runInNewContext(layer4Source, context);

function input(overrides = {}) {
  return {
    recognition: 0.9,
    need: 0.6,
    specialness: 0.8,
    scarcity: 0.7,
    calibration: 0.9,
    evidence: 0.8,
    manipulation: 0.4,
    rationalization: 0.2,
    boundary: 0.9,
    stop_loss: 0.3,
    differentiation: 0.7,
    metacognition: 0.8,
    ...overrides,
  };
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

assert.equal(context.AlgorithmConfig.HIGH_START, 0.20);
assert.equal(context.AlgorithmConfig.HIGH_FULL, 0.80);
assert.equal(context.Layer4Evidence.high(0.20), 0);
close(context.Layer4Evidence.high(0.50), 0.5);
assert.equal(context.Layer4Evidence.high(0.80), 1);
close(context.Layer4Evidence.low(0.50), 0.5);
assert.ok(context.Layer4Evidence.high(0.76) < context.Layer4Evidence.high(0.96));

{
  const result = context.Layer4Evidence.calculate(input());
  assert.equal(result.version, "1.2");
  assert.equal(result.status, "complete");
  assert.equal(result.E, 0.75);
  close(result.J, 0.7);
  assert.equal(result.B, 0.9);
  assert.equal(result.T, 0.3);
  assert.equal(result.E_peak, 0.9);
  assert.equal(result.E_second, 0.8);
  close(result.E_sharp, 0.15);
  assert.equal(result.E_peak_source, "recognition");
  assert.equal(result.J_weak, 0.4);
  close(result.fuzzy.low_J_weak, 2 / 3);
  close(result.J_hole, 0.3);
  assert.equal(result.J_weak_source, "manipulation");
  close(result.BT_gap, 0.6);
  assert.equal(result.self_consistency, null);
}

{
  const result = context.Layer4Evidence.calculate(
    input({
      self_report_scores: { boundary: 0.8, evidence: 0.3 },
      behavior_scores: { boundary: 0.6, evidence: 0.7, scarcity: 0.9 },
    }),
  );
  close(result.self_consistency, 0.7);
}

{
  const result = context.Layer4Evidence.calculate(input({ manipulation: null }));
  assert.equal(result.status, "insufficient_data");
  assert.deepEqual(Array.from(result.missingDimensions), ["manipulation"]);
  assert.equal(result.J, null);
  assert.equal(result.J_weak, null);
  assert.equal(result.fuzzy.low_J, null);
  assert.equal(result.fuzzy.low_J_weak, null);
}

assert.throws(
  () => context.Layer4Evidence.calculate(input({ boundary: 1.01 })),
  /boundary 必须是 0～1/,
);

{
  const result = context.Layer4Evidence.fromLayer3({
    E: {
      subScores: {
        recognition: 90,
        need: 60,
        specialness: 80,
        scarcity: 70,
      },
    },
    J: {
      subScores: { calibration: 90, evidence: 80, manipulation: 40 },
    },
    B: { subScores: { boundary: 90, stopLoss: 30 } },
    H: 20,
    F: 70,
    M: 80,
  });

  assert.equal(result.E, 0.75);
  assert.equal(result.B, 0.9, "新 B 必须只取 boundary");
  assert.equal(result.T, 0.3, "T 必须独立取 stopLoss");
}

console.log("Fourth-layer evidence tests passed.");
