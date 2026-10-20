import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadAlgorithm, scoreAnswers } from "./helpers/algorithm-harness.mjs";
import { productionBank as bank, seededRandom } from "./helpers/question-fixtures.mjs";

const context = await loadAlgorithm();
const fixture = JSON.parse(await readFile(new URL("./fixtures/semantic-profiles.json", import.meta.url), "utf8"));
const profiles = Object.fromEntries(fixture.profiles.map((profile) => [profile.id, profile]));
const references = JSON.parse(await readFile(new URL("./fixtures/semantic-reference-forms.json", import.meta.url), "utf8"));
const before = JSON.stringify(fixture);
function score(questions, profile) {
  const answers = questions.map((question) => {
    const chosen = question.options.find((option) => option.id === profile.answers[question.id]);
    return { questionId: question.id, option: chosen.id, scores: chosen.scores };
  });
  return scoreAnswers(context, bank, questions, answers).totalScore;
}
for (const profile of fixture.profiles) {
  assert.equal(Object.keys(profile.answers).length, bank.questions.length);
  for (const question of bank.questions) assert.ok(question.options.some((option) => option.id === profile.answers[question.id]));
}
// Historical same-form counterexample: actual trust failures were almost equal to ordinary sensitivity.
const historical = references.forms.trust_comparison.questionIds.map((id) => bank.questions.find((question) => question.id === id));
assert.ok(score(historical, profiles.blindtrust) > score(historical, profiles.sensitive) + 8);
// New production forms must retain the content distinction rather than merely fix the one old form.
const timeScores = [], commitmentScores = [], overloadScores = [];
const heldout = JSON.parse(await readFile(new URL("./fixtures/semantic-holdout-profiles.json", import.meta.url), "utf8"));
const overload = heldout.profiles.find((profile) => profile.id === "needoverload");
for (let seed = 200001; seed <= 200100; seed += 1) {
  const questions = context.QuestionSampler.sampleStratified(bank.questions, 28, seededRandom(seed)).questions;
  const sensitive = score(questions, profiles.sensitive), blind = score(questions, profiles.blindtrust);
  assert.ok(sensitive < 30, "情感敏感但守得住不应仅因此进入中高档");
  assert.ok(blind > sensitive + 5, "实际轻信应与正常心动有可感差别");
  timeScores.push(score(questions, profiles.timepressure));
  commitmentScores.push(score(questions, profiles.pressurecommit));
  overloadScores.push(score(questions, overload));
}
assert.ok(Math.max(...timeScores) - Math.min(...timeScores) < 15, "固定时间边界短板不能因换题跨越三十多分");
// 仅限制普通换题中可感的大幅漂移，不要求所有题组完全一致，也不规定画像目标分。
function middleRange(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] - sorted[Math.floor(sorted.length * 0.05)];
}
assert.ok(middleRange(commitmentScores) < 15, "承诺心软画像的常见换题分差不应回到二十多分");
assert.ok(middleRange(overloadScores) < 12, "不能以普遍放大过度承担画像的漂移换取改善");
assert.equal(JSON.stringify(fixture), before, "不按得分回改语义画像答案");
console.log("Content consistency: historical same-form contrast and 100 fresh production forms preserve frozen answer meanings.");
