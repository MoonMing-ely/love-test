// Content-level audit on frozen literal choices. No score-distance answer generation.
// Optional baseline is an exported source directory, not a second runtime scoring path.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { algorithmPaths, loadAlgorithm, scoreAnswers } from "../tests/helpers/algorithm-harness.mjs";
import { productionBank as bank, seededRandom } from "../tests/helpers/question-fixtures.mjs";

const args = process.argv.slice(2), argument = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const readFixture = async (name) => JSON.parse(await readFile(new URL(`../tests/fixtures/${name}.json`, import.meta.url), "utf8"));
const core = await readFixture("semantic-profiles");
const extended = await readFixture("semantic-extended-profiles");
const heldout = await readFixture("semantic-holdout-profiles");
const references = (await readFixture("semantic-reference-forms")).forms;
const profiles = [...core.profiles, ...extended.profiles, ...heldout.profiles];
for (const profile of profiles) {
  assert.equal(Object.keys(profile.answers).length, bank.questions.length);
  for (const question of bank.questions) assert.ok(question.options.some((o) => o.id === profile.answers[question.id]));
}
const current = await loadAlgorithm();
const directory = argument("--baseline-dir");
const baseline = directory ? await loadAlgorithm({ directory: pathToFileURL(`${directory}/`) }) : null;
const samplers = baseline ? { baseline: baseline.QuestionSampler, current: current.QuestionSampler } : { current: current.QuestionSampler };
const scorers = baseline ? { baseline, current } : { current };
const inputHash = createHash("sha256").update(JSON.stringify(profiles)).digest("hex");
const sourceHashes = {};
for (const name of Object.keys(scorers)) {
  const root = name === "current" ? new URL("../", import.meta.url) : pathToFileURL(`${directory}/`);
  sourceHashes[name] = Object.fromEntries(await Promise.all(algorithmPaths.map(async (path) => [path,
    createHash("sha256").update(await readFile(new URL(`js/${path}`, root))).digest("hex")])));
}
const answersFor = (questions, profile) => questions.map((question) => {
  const option = question.options.find((o) => o.id === profile.answers[question.id]);
  return { questionId: question.id, option: option.id, scores: option.scores };
});
const score = (context, questions, profile) => scoreAnswers(context, bank, questions, answersFor(questions, profile)).totalScore;
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    min: sorted[0], p05: sorted[Math.floor(sorted.length * 0.05)], p95: sorted[Math.floor(sorted.length * 0.95)],
    max: sorted.at(-1), range: sorted.at(-1) - sorted[0] };
}
const report = { algorithmVersion: current.AlgorithmConfig.VERSION, selectionVersion: current.QuestionSampler.SELECTION_VERSION,
  bankRevision: bank.bankRevision, profileInputHash: inputHash, sourceHashes,
  note: "Literal authored scenarios, not human respondents. Expanded profiles were used in candidate comparisons; the final four were frozen afterward. Fresh form seeds test transfer, not independent human validity.",
  profileDefinitions: profiles.map(({ answers, ...definition }) => definition), blocks: {}, references: {} };
for (const [block, first, count] of [["development", 91001, 300], ["freshForms", 120001, 500]]) {
  const forms = Object.fromEntries(Object.entries(samplers).map(([name, sampler]) => [name,
    Array.from({ length: count }, (_, i) => sampler.sampleStratified(bank.questions, 28, seededRandom(first + i)).questions)]));
  const result = {};
  for (const [samplerName, sampled] of Object.entries(forms)) for (const [scorerName, context] of Object.entries(scorers)) {
    const condition = `${scorerName}Score_${samplerName}Forms`, rows = {}, valuesByProfile = {};
    for (const profile of profiles) {
      const values = sampled.map((questions) => score(context, questions, profile));
      valuesByProfile[profile.id] = values;
      rows[profile.id] = { name: profile.name, expected: profile.expectation, ...stats(values) };
    }
    const gaps = valuesByProfile.blindtrust.map((value, i) => value - valuesByProfile.sensitive[i]);
    result[condition] = { profiles: rows, blindTrustMinusSensitive: stats(gaps) };
  }
  report.blocks[block] = result;
}
for (const [name, form] of Object.entries(references)) {
  const questions = form.questionIds.map((id) => bank.questions.find((q) => q.id === id));
  report.references[name] = { ...form, scores: Object.fromEntries(Object.entries(scorers).map(([name, context]) => [name,
    Object.fromEntries(core.profiles.map((profile) => [profile.id, score(context, questions, profile)]))])) };
}
const now = report.blocks.freshForms.currentScore_currentForms;
assert.ok(now.blindTrustMinusSensitive.min > 5, "Repeated concrete trust failures must be distinguishable from normal emotional sensitivity");
assert.ok(now.profiles.timepressure.range < 15, "Changing the form must not randomly omit an entire boundary facet");
const ref = report.references.trust_comparison.scores.current;
assert.ok(ref.blindtrust - ref.sensitive > 8, "The previous same-form near-equal-score counterexample must improve");
const output = argument("--output");
if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
for (const [block, conditions] of Object.entries(report.blocks)) {
  const now = conditions.currentScore_currentForms;
  console.log(block, JSON.stringify({ gap: now.blindTrustMinusSensitive, time: now.profiles.timepressure,
    commitment: now.profiles.pressurecommit, withheld: Object.fromEntries(heldout.profiles.map((p) => [p.id, now.profiles[p.id]])) }));
}
console.log("Content consistency audit passed; partial improvements are not real-world score validation.");
