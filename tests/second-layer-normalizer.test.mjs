import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(
  new URL("../js/core-algorithm/second-layer-normalizer.js", import.meta.url),
  "utf8",
);
const context = {};
vm.runInNewContext(source, context);

const dimensionKeys = [
  "recognition",
  "needed",
  "specialness",
  "scarcity",
  "calibration",
  "evidence",
  "manipulation",
  "rationalization",
  "boundaries",
  "stopLoss",
  "differentiation",
  "selfCalibration",
];
const dimensions = dimensionKeys.map((key) => ({ key }));
const questions = [
  {
    id: "T01",
    options: [
      { scores: { recognition: 0, differentiation: 0 } },
      { scores: { recognition: 1, differentiation: 1 } },
      { scores: { recognition: 2, differentiation: 2 } },
      { scores: { recognition: 3, differentiation: 3 } },
    ],
  },
  {
    id: "T02",
    options: [
      { scores: { recognition: 0, boundaries: 0 } },
      { scores: { recognition: 1, boundaries: 2 } },
      { scores: { recognition: 2, boundaries: 4 } },
      { scores: { recognition: 1, boundaries: 3 } },
    ],
  },
];
const rawVector = [4, 0, 0, 0, 0, 0, 0, 0, 3, 0, 2, 0];

const first = context.DimensionNormalizer.normalize({
  rawVector,
  dimensions,
  questions,
});
const second = context.DimensionNormalizer.normalize({
  rawVector,
  dimensions,
  questions,
});
const plainFirst = JSON.parse(JSON.stringify(first));

assert.deepEqual(plainFirst, JSON.parse(JSON.stringify(second)));
assert.equal(first.traits.recognition, 0.8);
assert.equal(first.traits.boundary, 0.75);
assert.equal(first.traits.need, null);
assert.equal(first.special.differentiation, 2 / 3);
assert.equal(first.special.selfCalibration, null);
assert.equal(first.exposure.boundary, null);
assert.equal(first.exposure.stopping, null);
assert.equal(first.debug.raw.recognition, 4);
assert.equal(first.debug.capacity.recognition, 5);
assert.equal(first.debug.capacity.boundaries, 4);
assert.equal(first.debug.dimensionMeanContribution.recognition, 2.5);
assert.deepEqual(Array.from(first.debug.warnings), []);

const clamped = context.DimensionNormalizer.normalize({
  rawVector: [6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dimensions,
  questions,
});
assert.equal(clamped.traits.recognition, 1);
assert.equal(clamped.traits.need, null);
assert.equal(clamped.debug.warnings.length, 2);
assert.match(clamped.debug.warnings[0], /clamp/u);
assert.match(clamped.debug.warnings[1], /capacity 为 0/u);

assert.throws(
  () =>
    context.DimensionNormalizer.normalize({
      rawVector: Array(11).fill(0),
      dimensions,
      questions,
    }),
  /12 个数字/u,
);

console.log("Second-layer normalizer tests passed.");
