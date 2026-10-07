import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { productionBank, seededRandom } from "./helpers/question-fixtures.mjs";

const context = {};
for (const path of ["question-sampler.js", "core-algorithm/dimension-vector.js", "core-algorithm/second-layer-normalizer.js",
  "core-algorithm/third-layer-aggregator.js", "core-algorithm/algorithm-config.js", "core-algorithm/fourth-layer-evidence.js",
  "core-algorithm/fifth-layer-mechanisms.js", "core-algorithm/sixth-layer-integration.js", "scoring.js"]) {
  vm.runInNewContext(await readFile(new URL(`../js/${path}`, import.meta.url), "utf8"), context);
}
const bankBefore = JSON.stringify(productionBank);
for (let seed = 1; seed <= 1000; seed += 1) {
  const random = seededRandom(seed);
  const questions = context.QuestionSampler.sampleStratified(productionBank.questions, 28, random).questions;
  const answers = questions.map((question) => {
    const option = question.options[Math.floor(random() * 4)];
    return { questionId: question.id, option: option.id, scores: { ...option.scores } };
  });
  const rawVector = context.DimensionVector.fromAnswers(answers, productionBank.dimensions);
  const normalized = context.DimensionNormalizer.normalize({ rawVector, dimensions: productionBank.dimensions, questions });
  const layer3 = context.HigherOrderStructure.aggregate(normalized);
  const layer4 = context.Layer4Evidence.fromLayer3(layer3);
  const layer5 = context.Layer5Mechanisms.calculate(layer4);
  const layer6 = context.Layer6Integration.calculate(layer5);
  const outcome = context.QuizScoring.calculateResult({ answers, dimensions: productionBank.dimensions, layer6Integration: layer6 });
  assert.equal(layer4.status, "complete");
  assert.equal(layer5.status, "complete");
  assert.equal(layer6.status, "complete");
  assert.equal(outcome.status, "scored");
  assert.ok(Number.isFinite(outcome.totalScore) && outcome.totalScore >= 0 && outcome.totalScore <= 100);
  assert.equal(outcome.totalScore, layer6.totalScore);
  assert.equal(outcome.stage, context.Layer6Integration.stageForScore(outcome.totalScore));
  assert.ok(layer6.paths.length <= 2);
}
assert.equal(JSON.stringify(productionBank), bankBefore);
console.log("1000组正式题库全链路通过：Raw → 第六层 → 最终分/阶段，不加入人工题。");
