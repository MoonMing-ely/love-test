// Offline behavioral audit. Answers and samples are frozen before either scorer runs.
// Usage: node scripts/audit-algorithm.mjs --baseline-dir /tmp/old-source --output /tmp/report.json
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { algorithmPaths, loadAlgorithm, scoreAnswers, scoreDimensions, stableDimensions, riskKeys, protectionKeys } from "../tests/helpers/algorithm-harness.mjs";
import { productionBank as bank, seededRandom } from "../tests/helpers/question-fixtures.mjs";

const args = process.argv.slice(2);
const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const baselineDirectory = option("--baseline-dir");
const models = { current: await loadAlgorithm() };
if (baselineDirectory) models.baseline = await loadAlgorithm({ directory: pathToFileURL(`${baselineDirectory}/`) });
const sourceHashes = Object.fromEntries(await Promise.all(Object.keys(models).map(async (name) => {
  const directory = name === "current" ? new URL("../", import.meta.url) : pathToFileURL(`${baselineDirectory}/`);
  return [name, Object.fromEntries(await Promise.all(algorithmPaths.map(async (path) => {
    const bytes = await readFile(new URL(`js/${path}`, directory));
    return [`js/${path}`, createHash("sha256").update(bytes).digest("hex")];
  })))];
})));
const sampler = models.current.QuestionSampler;
const frozenProfiles = [
  ["稳健", {}], ["容易被打动但行为稳健", { recognition: 0.9, need: 0.9 }],
  ["正常心动且行为稳健", { recognition: 0.6, need: 0.5, specialness: 0.4, scarcity: 0.3 }],
  ["情感强且判断弱", { recognition: 0.9, need: 0.9, specialness: 0.9, scarcity: 0.9, calibration: 0.2, evidence: 0.2, manipulation: 0.2, rationalization: 0.8 }],
  ["边界弱但判断好", { boundary: 0.1 }], ["边界和判断都弱", { boundary: 0.1, calibration: 0.2, evidence: 0.2, manipulation: 0.2 }],
  ["难实际停止", { stop_loss: 0.1 }], ["内心纠缠但能停止", { differentiation: 0.1 }],
  ["反复合理化", { rationalization: 0.9 }],
  ["各方面持续失守", Object.fromEntries([...riskKeys, ...protectionKeys].map((key) => [key, riskKeys.includes(key) ? 1 : 0]))],
].map(([name, patch]) => ({ name, dimensions: { ...stableDimensions, ...patch } }));
const aliases = { needed: "need", boundaries: "boundary", stopLoss: "stop_loss", selfCalibration: "metacognition" };
function answer(question, chosen) { return { questionId: question.id, option: chosen.id, scores: chosen.scores }; }
function chooseAnswers(target, random, bias = 0) {
  return new Map(bank.questions.map((question) => {
    const goals = Object.fromEntries(question.dimensions.map((key) => [key, Math.min(1, Math.max(0, target[aliases[key] ?? key] + (random() - 0.5) * bias))]));
    const options = question.options.map((o) => ({ o, loss: question.dimensions.reduce((sum, key) => {
      const capacity = Math.max(...question.options.map((v) => v.scores[key] ?? 0));
      return sum + ((o.scores[key] ?? 0) / capacity - goals[key]) ** 2;
    }, 0) + random() * bias / 8 }));
    options.sort((left, right) => left.loss - right.loss);
    return [question.id, answer(question, options[0].o)];
  }));
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1), min: sorted[0] };
}
function summary(result) { return { score: result.totalScore, stage: result.stage, shape: result.shapeLabel, paths: result.paths.map((p) => p.id) }; }
// Two independent seed blocks; the holdout block is not used to tune coefficients.
const blocks = { development: [1, 200], holdout: [40001, 40200] };
const forms = Object.fromEntries(Object.entries(blocks).map(([name, [first, last]]) => [name,
  Array.from({ length: last - first + 1 }, (_, index) => {
    const seed = first + index, random = seededRandom(seed);
    const questions = sampler.sampleStratified(bank.questions, 28, random).questions;
    return { seed, questions, answers: questions.map((q) => answer(q, q.options[Math.floor(random() * 4)])) };
  })]));
const profiles = frozenProfiles.map((profile, index) => ({ ...profile,
  answers: chooseAnswers(profile.dimensions, seededRandom(33000 + index)),
  forms: Array.from({ length: 100 }, (_, i) => sampler.sampleStratified(bank.questions, 28, seededRandom(50000 + i)).questions),
}));
const people = Array.from({ length: 128 }, (_, index) => {
  const random = seededRandom(70000 + index);
  const target = Object.fromEntries(Object.keys(stableDimensions).map((key) => [key, random()]));
  return { answers: chooseAnswers(target, random, 0.3), forms: Array.from({ length: 20 }, (_, run) =>
    sampler.sampleStratified(bank.questions, 28, seededRandom(80000 + index * 20 + run)).questions) };
});
const report = { bankRevision: bank.bankRevision, baselineDirectory: baselineDirectory ?? null,
  baselineRef: option("--baseline-ref") ?? null, sourceHashes,
  frozenInputHash: createHash("sha256").update(JSON.stringify({ forms, people: people.map((p) => [...p.answers]) })).digest("hex"),
  note: "Constructed responses, not real respondents; random-option frequencies are stress-test frequencies, not population rates.", models: {} };
for (const [name, context] of Object.entries(models)) {
  const result = { version: context.AlgorithmConfig.VERSION, stress: {}, profiles: {}, direction: {}, repeatedForms: {} };
  for (const [block, samples] of Object.entries(forms)) {
    const small = [], all = [];
    let flips = 0, multiStage = 0, smallMultiStage = 0, largest = null;
    for (const sample of samples) {
      const original = scoreAnswers(context, bank, sample.questions, sample.answers);
      for (let j = 0; j < sample.questions.length; j += 1) {
        const q = sample.questions[j], previous = sample.answers[j];
        for (const chosen of q.options) {
          if (chosen.id === previous.option) continue;
          const answers = [...sample.answers]; answers[j] = answer(q, chosen);
          const next = scoreAnswers(context, bank, sample.questions, answers);
          const delta = Math.abs(original.totalScore - next.totalScore);
          const isSmall = Object.keys({ ...previous.scores, ...chosen.scores }).every((key) =>
            Math.abs((previous.scores[key] ?? 0) - (chosen.scores[key] ?? 0)) <= 1);
          all.push(delta); if (isSmall) small.push(delta);
          if (original.stage !== next.stage) flips += 1;
          if (Math.abs(original.stage - next.stage) >= 2) { multiStage += 1; if (isSmall) smallMultiStage += 1; }
          if (!largest || delta > largest.delta) largest = { seed: sample.seed, questionId: q.id, from: previous.option, to: chosen.id, delta, before: summary(original), after: summary(next) };
        }
      }
    }
    result.stress[block] = { all: stats(all), small: stats(small), flips, multiStage, smallMultiStage, largest };
  }
  for (const profile of profiles) {
    result.profiles[profile.name] = {
      direct: summary(scoreDimensions(context, profile.dimensions)),
      fullForms: stats(profile.forms.map((questions) => scoreAnswers(context, bank, questions, questions.map((q) => profile.answers.get(q.id))).totalScore)),
    };
  }
  let reversals = 0, directionChecks = 0, maxStep = 0, maxEpsilon = 0;
  const random = seededRandom(987654);
  for (let n = 0; n < 1000; n += 1) {
    const dimensions = Object.fromEntries(Object.keys(stableDimensions).map((key) => [key, random()]));
    const base = scoreDimensions(context, dimensions).totalScore;
    for (const key of [...riskKeys, ...protectionKeys]) {
      const next = scoreDimensions(context, { ...dimensions, [key]: Math.min(1, dimensions[key] + 0.01) }).totalScore;
      const nearby = scoreDimensions(context, { ...dimensions, [key]: Math.min(1, dimensions[key] + 1e-8) }).totalScore;
      directionChecks += 1;
      if (riskKeys.includes(key) ? next < base - 1e-9 : next > base + 1e-9) reversals += 1;
      maxStep = Math.max(maxStep, Math.abs(next - base)); maxEpsilon = Math.max(maxEpsilon, Math.abs(nearby - base));
    }
  }
  // Axis sweeps expose valleys and label/maximum-path boundary artifacts.
  const sweeps = [];
  for (const key of Object.keys(stableDimensions)) {
    const values = Array.from({ length: 101 }, (_, i) => scoreDimensions(context, { ...stableDimensions, [key]: i / 100 }).totalScore);
    sweeps.push({ key, values });
  }
  const judgmentSweep = Array.from({ length: 101 }, (_, i) => ({ judgment: i / 100,
    score: scoreDimensions(context, { ...stableDimensions, boundary: 0.1, calibration: i / 100, evidence: i / 100, manipulation: i / 100 }).totalScore }));
  const pairedDifferences = [], ranges = []; let repeatedStageChanges = 0, repeatedPairs = 0;
  for (const person of people) {
    const scores = person.forms.map((questions) => scoreAnswers(context, bank, questions, questions.map((q) => person.answers.get(q.id))));
    ranges.push(Math.max(...scores.map((s) => s.totalScore)) - Math.min(...scores.map((s) => s.totalScore)));
    for (let a = 0; a < scores.length; a += 1) for (let b = a + 1; b < scores.length; b += 1) {
      pairedDifferences.push(Math.abs(scores[a].totalScore - scores[b].totalScore)); repeatedPairs += 1;
      if (scores[a].stage !== scores[b].stage) repeatedStageChanges += 1;
    }
  }
  result.repeatedForms = { people: people.length, rounds: 20, pairs: stats(pairedDifferences), ranges: stats(ranges), stageChanges: repeatedStageChanges, stageChangeRate: repeatedStageChanges / repeatedPairs };
  // Replay the same historical form even when the production sampler changes.
  const fixture = JSON.parse(await readFile(new URL("../tests/fixtures/b03-v14-case.json", import.meta.url), "utf8"));
  assert.equal(fixture.bankRevision, bank.bankRevision);
  const questions = fixture.answers.map((a) => bank.questions.find((q) => q.id === a.questionId));
  const answers = fixture.answers.map((a, i) => answer(questions[i], questions[i].options.find((o) => o.id === a.option)));
  const before = scoreAnswers(context, bank, questions, answers), index = questions.findIndex((q) => q.id === "B03");
  assert.equal(answers[index].option, "C"); answers[index] = answer(questions[index], questions[index].options[1]);
  const after = scoreAnswers(context, bank, questions, answers);
  result.b03 = { before: summary(before), after: summary(after), delta: Math.abs(before.totalScore - after.totalScore) };
  result.direction = { directionChecks, reversals, maxOnePercentStep: maxStep, maxEpsilonStep: maxEpsilon, sweeps, judgmentSweep };
  report.models[name] = result;
  console.log(`${name}: ${JSON.stringify({ stress: result.stress, repeatedForms: result.repeatedForms, b03: result.b03, direction: { directionChecks, reversals, maxStep, maxEpsilon } })}`);
}
const current = report.models.current;
assert.equal(current.direction.reversals, 0);
assert.ok(current.direction.maxOnePercentStep <= 1.1);
assert.ok(current.direction.maxEpsilonStep <= 1.1e-6);
for (const block of Object.values(current.stress)) {
  assert.ok(block.small.max <= 12, "Small score-vector changes must not dominate the final score");
  assert.equal(block.smallMultiStage, 0);
}
assert.ok(current.b03.delta < 10);
const output = option("--output");
if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log("Behavior audit passed. Results are synthetic checks, not real-world validity estimates.");
