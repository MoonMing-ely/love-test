import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadAlgorithm, scoreAnswers, scoreDimensions, stableDimensions, riskKeys, protectionKeys } from "./helpers/algorithm-harness.mjs";
import { productionBank as bank } from "./helpers/question-fixtures.mjs";

const context = await loadAlgorithm();
// Reproduce the reported real-bank B03 counterexample, without constructing new questions.
const fixture = JSON.parse(await readFile(new URL("./fixtures/b03-v14-case.json", import.meta.url), "utf8"));
assert.equal(fixture.bankRevision, bank.bankRevision);
const questions = fixture.answers.map((a) => bank.questions.find((q) => q.id === a.questionId));
const answers = fixture.answers.map((a, i) => ({ ...a, scores: questions[i].options.find((o) => o.id === a.option).scores }));
const index = questions.findIndex((q) => q.id === "B03");
assert.equal(answers[index].option, "C");
const original = scoreAnswers(context, bank, questions, answers);
const edited = [...answers];
edited[index] = { questionId: "B03", option: "B", scores: questions[index].options[1].scores };
const updated = scoreAnswers(context, bank, questions, edited);
assert.ok(original.totalScore >= updated.totalScore);
assert.ok(original.totalScore - updated.totalScore < 10, "B03: 偶尔/有过几次不能让总分相差二十多分");
assert.ok(Math.abs(original.stage - updated.stage) <= 1);
// The original boundary-weak/J sweep fell into a low-risk valley, then rose again.
let previous = Infinity;
for (let step = 0; step <= 100; step += 1) {
  const judgment = step / 100;
  const current = scoreDimensions(context, { ...stableDimensions, boundary: 0.1,
    calibration: judgment, evidence: judgment, manipulation: judgment });
  assert.ok(current.totalScore <= previous + 1e-10, "判断增强不能增加整体风险");
  assert.ok(current.totalScore >= 50, "明确的边界困难不应在中等判断区漏掉");
  previous = current.totalScore;
}
const emotional = scoreDimensions(context, { ...stableDimensions, recognition: 0.9, need: 0.9 });
const stopping = scoreDimensions(context, { ...stableDimensions, stop_loss: 0.1 });
const entangled = scoreDimensions(context, { ...stableDimensions, differentiation: 0.1 });
assert.ok(emotional.totalScore < 35, "情感敏感但行为稳健，不应独自进入中高档");
assert.ok(stopping.totalScore > entangled.totalScore + 10, "实际无法停止与内心纠缠应有可感差别");
// All 4096 extreme combinations, including max/min ties: valid range and continuous one-axis approach.
const keys = [...riskKeys, ...protectionKeys];
for (let mask = 0; mask < 2 ** keys.length; mask += 1) {
  const dimensions = Object.fromEntries(keys.map((key, index) => [key, (mask >>> index) & 1]));
  const base = scoreDimensions(context, dimensions).totalScore;
  assert.ok(Number.isFinite(base) && base >= 15 && base <= 85);
  for (const key of keys) {
    const nextValue = dimensions[key] === 0 ? 1e-8 : 1 - 1e-8;
    const next = scoreDimensions(context, { ...dimensions, [key]: nextValue }).totalScore;
    assert.ok(Math.abs(base - next) <= 1.1e-6, `${key}: corner discontinuity`);
    const riskIncreases = (nextValue > dimensions[key]) === riskKeys.includes(key);
    assert.ok(riskIncreases ? next >= base - 1e-9 : next <= base + 1e-9, `${key}: corner direction`);
  }
}
console.log("Experience regressions: B03, judgment valley, feeling vs behavior, 4096 corners and 49152 continuity checks.");
