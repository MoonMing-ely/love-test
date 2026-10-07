import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { productionBank, seededRandom } from "./helpers/question-fixtures.mjs";

const context = {};
for (const path of ["question-sampler.js", "core-algorithm/dimension-vector.js", "core-algorithm/second-layer-normalizer.js",
  "core-algorithm/third-layer-aggregator.js", "core-algorithm/algorithm-config.js", "core-algorithm/fourth-layer-evidence.js",
  "core-algorithm/fifth-layer-mechanisms.js"]) {
  vm.runInNewContext(await readFile(new URL(`../js/${path}`, import.meta.url), "utf8"), context);
}

const selected = context.QuestionSampler.sampleStratified(productionBank.questions, 28, seededRandom(7)).questions;
const manipulationQuestions = selected.filter((q) => q.dimensions.includes("manipulation"));
assert.ok(manipulationQuestions.length >= 2);
assert.ok(manipulationQuestions.every((q) => ["A40", "C22", "C23", "C24"].includes(q.id)));

for (const maximum of [false, true]) {
  const raw = context.DimensionVector.create();
  for (const q of selected) {
    const option = q.dimensions.includes("manipulation")
      ? q.options.find((o) => o.scores.manipulation === (maximum ? 3 : 0))
      : q.options[0];
    context.DimensionVector.addOption(raw, option.scores, productionBank.dimensions);
  }
  const normalized = context.DimensionNormalizer.normalize({ rawVector: raw, dimensions: productionBank.dimensions, questions: selected });
  const capacity = manipulationQuestions.length * 3;
  assert.equal(normalized.debug.capacity.manipulation, capacity);
  assert.equal(normalized.debug.raw.manipulation, maximum ? capacity : 0);
  assert.equal(normalized.traits.manipulation, maximum ? 1 : 0);
  // 零分答案不使题目失去覆盖资格，也不会产生零 Capacity。
  assert.ok(context.QuestionSampler.validateSelection(selected).valid);
  const layer3 = context.HigherOrderStructure.aggregate(normalized);
  assert.equal(layer3.J.subScores.manipulation, maximum ? 100 : 0);
  const layer4 = context.Layer4Evidence.fromLayer3(layer3);
  const layer5 = context.Layer5Mechanisms.calculate(layer4);
  assert.equal(layer4.status, "complete");
  assert.equal(layer5.status, "complete");
  assert.ok(Number.isFinite(layer5.P2_judgment_shift));
}

console.log("Manipulation pipeline passed: formal questions -> actual Capacity -> normalized 0/1 -> J -> P2.");
