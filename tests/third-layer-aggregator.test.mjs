import { runnableBank } from "./helpers/question-fixtures.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const thirdLayerSource = await readFile(
  new URL("../js/core-algorithm/third-layer-aggregator.js", import.meta.url),
  "utf8",
);
const dimensionVectorSource = await readFile(
  new URL("../js/core-algorithm/dimension-vector.js", import.meta.url),
  "utf8",
);
const dimensionNormalizerSource = await readFile(
  new URL("../js/core-algorithm/second-layer-normalizer.js", import.meta.url),
  "utf8",
);
const questionSamplerSource = await readFile(
  new URL("../js/question-sampler.js", import.meta.url),
  "utf8",
);
const questionData = JSON.parse(
  await readFile(new URL("../data/questions.json", import.meta.url), "utf8"),
);
const context = {};
vm.runInNewContext(dimensionVectorSource, context);
vm.runInNewContext(dimensionNormalizerSource, context);
vm.runInNewContext(questionSamplerSource, context);
vm.runInNewContext(thirdLayerSource, context);

function createNormalizedDimensions(overrides = {}) {
  return {
    traits: {
      recognition: 0.25,
      need: 0.35,
      specialness: 0.85,
      scarcity: 0.83,
      calibration: 0.85,
      evidence: 0.8,
      manipulation: 0.35,
      rationalization: 0.42,
      boundary: 0.9,
      stopping: 0.3,
      ...overrides.traits,
    },
    special: {
      differentiation: 0.73,
      selfCalibration: 0.64,
      ...overrides.special,
    },
    exposure: {
      boundary: null,
      stopping: null,
    },
    debug: {},
  };
}

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-10,
    `期望 ${actual} 接近 ${expected}`,
  );
}

{
  const input = createNormalizedDimensions();
  const snapshot = structuredClone(input);
  const result = context.HigherOrderStructure.aggregate(input);

  assert.equal(context.HigherOrderStructure.VERSION, "1.1");
  assert.equal(result.version, "1.1");
  assert.equal(result.E.summary, 57);
  assert.equal(result.E.peak.value, 85);
  assert.deepEqual(Array.from(result.E.peak.sources), ["specialness"]);
  assert.equal(result.E.peak.gap, 28);
  assert.ok(result.E.dispersion > 0);
  assertClose(result.J.summary, 200 / 3);
  assert.equal(result.J.weak.value, 35);
  assert.deepEqual(Array.from(result.J.weak.sources), ["manipulation"]);
  assertClose(result.J.weak.gap, 95 / 3);
  assertClose(
    result.J.dispersion,
    Math.sqrt(
      ((85 - 200 / 3) ** 2 +
        (80 - 200 / 3) ** 2 +
        (35 - 200 / 3) ** 2) /
        3,
    ),
  );
  assert.equal(result.B.summary, 60);
  assert.equal(result.B.weak.value, 30);
  assert.deepEqual(Array.from(result.B.weak.sources), ["stopLoss"]);
  assert.equal(result.B.imbalance, 60);
  assert.equal(result.H, 42);
  assert.equal(result.F, 73);
  assert.equal(result.M, 64);
  assert.equal(result.R, null);
  assert.deepEqual(input, snapshot, "第三层不应修改第二层输入");
  assert.equal("diagnostics" in result, false);
  assert.equal("totalScore" in result, false);
}

{
  const uniform = context.HigherOrderStructure.aggregate(
    createNormalizedDimensions({
      traits: {
        recognition: 0.55,
        need: 0.55,
        specialness: 0.55,
        scarcity: 0.55,
      },
    }),
  );
  const peaked = context.HigherOrderStructure.aggregate(
    createNormalizedDimensions({
      traits: {
        recognition: 0.2,
        need: 0.3,
        specialness: 0.85,
        scarcity: 0.85,
      },
    }),
  );

  assertClose(uniform.E.summary, peaked.E.summary);
  assert.equal(uniform.E.dispersion, 0);
  assert.equal(uniform.E.peak.gap, 0);
  assert.deepEqual(Array.from(peaked.E.peak.sources), [
    "specialness",
    "scarcity",
  ]);
  assertClose(peaked.E.peak.gap, 30);
  assert.ok(peaked.E.dispersion > 0);
}

{
  const imbalanced = context.HigherOrderStructure.aggregate(
    createNormalizedDimensions(),
  );
  const balanced = context.HigherOrderStructure.aggregate(
    createNormalizedDimensions({
      traits: { boundary: 0.6, stopping: 0.6 },
    }),
  );

  assert.equal(imbalanced.B.summary, balanced.B.summary);
  assert.equal(imbalanced.B.imbalance, 60);
  assert.equal(balanced.B.imbalance, 0);
  assert.deepEqual(Array.from(balanced.B.weak.sources), [
    "boundary",
    "stopLoss",
  ]);
}

{
  const result = context.HigherOrderStructure.aggregate(
    createNormalizedDimensions({
      traits: { need: null, rationalization: null },
      special: { selfCalibration: null },
    }),
  );

  assert.equal(result.E.summary, null);
  assert.equal(result.E.subScores.recognition, 25);
  assert.equal(result.E.subScores.need, null);
  assert.equal(result.E.peak, null);
  assert.equal(result.E.dispersion, null);
  assert.notEqual(result.J.summary, null);
  assert.equal(result.H, null);
  assert.equal(result.M, null);
}

{
  const result = context.HigherOrderStructure.aggregate(
    createNormalizedDimensions({
      traits: {
        recognition: 0,
        need: 1,
        specialness: 0,
        scarcity: 1,
        calibration: 1,
        evidence: 0,
        manipulation: 1,
        rationalization: 0,
        boundary: 0,
        stopping: 1,
      },
      special: {
        differentiation: 0,
        selfCalibration: 1,
      },
    }),
  );
  const derivedValues = [
    result.E.summary,
    result.E.peak.value,
    result.E.peak.gap,
    result.E.dispersion,
    result.J.summary,
    result.J.weak.value,
    result.J.weak.gap,
    result.J.dispersion,
    result.B.summary,
    result.B.weak.value,
    result.B.imbalance,
    result.H,
    result.F,
    result.M,
  ];

  derivedValues.forEach((value) => {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0 && value <= 100);
  });
}

assert.throws(
  () => context.HigherOrderStructure.aggregate(null),
  /需要第二层 normalizedDimensions 对象/,
);

{
  let randomState = 7;
  const random = () => {
    randomState = (randomState * 1664525 + 1013904223) % 2 ** 32;
    return randomState / 2 ** 32;
  };
  const sample = context.QuestionSampler.sampleStratified(
    runnableBank().questions,
    28,
    random,
  );
  const rawVector = context.DimensionVector.create();
  sample.questions.forEach((question, index) => {
    const option = question.options[index % question.options.length];
    context.DimensionVector.addOption(
      rawVector,
      option.scores,
      questionData.dimensions,
    );
  });
  const normalizedDimensions = context.DimensionNormalizer.normalize({
    rawVector,
    dimensions: questionData.dimensions,
    questions: sample.questions,
  });
  const result = context.HigherOrderStructure.aggregate(normalizedDimensions);

  assert.equal(sample.questions.length, 28);
  assert.equal(rawVector.length, 12);
  [
    result.E.summary,
    result.E.peak.value,
    result.E.peak.gap,
    result.E.dispersion,
    result.J.summary,
    result.J.weak.value,
    result.J.weak.gap,
    result.J.dispersion,
    result.B.summary,
    result.B.weak.value,
    result.B.imbalance,
    result.H,
    result.F,
    result.M,
  ].forEach((value) => {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0 && value <= 100);
  });
}

console.log("Third-layer aggregator tests passed.");
