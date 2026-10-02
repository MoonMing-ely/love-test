import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(
  new URL("../js/core-algorithm/dimension-vector.js", import.meta.url),
  "utf8",
);
const context = {};
vm.runInNewContext(source, context);

const dimensions = Array.from({ length: 12 }, (_, index) => ({
  key: `dimension${index + 1}`,
}));
const vector = context.DimensionVector.create();

assert.equal(vector.length, 12);
assert.deepEqual(Array.from(vector), Array(12).fill(0));

context.DimensionVector.addOption(
  vector,
  { dimension1: 2, dimension12: -1 },
  dimensions,
);
context.DimensionVector.addOption(vector, { dimension1: 3 }, dimensions);

assert.deepEqual(Array.from(vector), [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1]);
assert.throws(
  () =>
    context.DimensionVector.addOption(
      vector,
      { unknownDimension: 1 },
      dimensions,
    ),
  /无效维度/,
);

const rebuilt = context.DimensionVector.fromAnswers(
  [
    { scores: { dimension2: 1 } },
    { scores: null },
    { scores: { dimension2: 2, dimension3: 4 } },
  ],
  dimensions,
);
assert.deepEqual(Array.from(rebuilt), [0, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

console.log("Dimension vector tests passed.");
