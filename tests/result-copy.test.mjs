import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { loadAlgorithm } from "./helpers/algorithm-harness.mjs";
import { quizHarness, RESULT_KEY } from "./helpers/quiz-harness.mjs";
import { productionBank, seededRandom } from "./helpers/question-fixtures.mjs";

const root = new URL("../", import.meta.url);
const catalogSource = await readFile(new URL("js/result-copy/catalog.js", root), "utf8");
const selectorSource = await readFile(new URL("js/result-copy/selector.js", root), "utf8");
const source = JSON.parse(await readFile(new URL("data/result-copy.json", root), "utf8"));
const context = await loadAlgorithm();
vm.runInNewContext(catalogSource, context);
vm.runInNewContext(selectorSource, context);
const build = context.ResultCopy.build;
const plain = (value) => JSON.parse(JSON.stringify(value));
const han = (value) => (value.match(/[\u4e00-\u9fff]/gu) ?? []).length;

function fromDimensions(dimensions = Object.fromEntries(source.dimensions.map(({ key }) => [key, 0.5]))) {
  const normalized = { traits: {}, special: {} };
  for (const definition of source.dimensions) {
    const [group, key] = definition.source;
    normalized[group][key] = dimensions[definition.key];
  }
  const third = context.HigherOrderStructure.aggregate(normalized);
  const fourth = context.Layer4Evidence.fromLayer3(third);
  const fifth = context.Layer5Mechanisms.calculate(fourth);
  const sixth = context.Layer6Integration.calculate(fifth);
  return { normalizedDimensions: normalized, layer6Integration: sixth,
    outcome: { version: 3, status: "scored", dimensionCount: 12,
      totalScore: sixth.totalScore, stage: sixth.stage } };
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("浏览器文案目录与单一源一致且深度冻结", () => {
  assert.deepEqual(plain(context.ResultCopyCatalog), source);
  assert.ok(Object.isFrozen(context.ResultCopyCatalog.examples[0].paragraphs));
});

test("七份样稿：当前算法计分、压缩约 20%、结语保持、证据逐项可核查", () => {
  for (const example of source.examples) {
    const input = freeze(fromDimensions(example.dimensions));
    const before = JSON.stringify(input);
    const copy = build(input);
    assert.equal(copy.profileId, example.id);
    assert.equal(copy.stage, context.Layer6Integration.stageForScore(input.outcome.totalScore));
    assert.deepEqual(plain(copy.paragraphs), example.paragraphs);
    assert.equal(copy.closing, example.closing);
    assert.equal(copy.type, null);
    const reduction = 1 - han(copy.paragraphs.join("")) / example.baselineHan;
    assert.ok(reduction >= 0.17 && reduction <= 0.23, `${example.id}: ${reduction}`);
    assert.doesNotMatch(copy.paragraphs.join(""), /既有|又有|希望|愿你|你可以/u);
    for (const item of copy.evidence) {
      assert.equal(item.value, example.dimensions[item.key]);
      assert.ok(item.side === "high" ? item.value >= 0.65 : item.value <= 0.35);
    }
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(plain(build(input)), plain(copy));
    copy.paragraphs[0] = "测试调用者修改返回数据";
    assert.deepEqual(plain(build(input).paragraphs), example.paragraphs);
  }
  assert.equal(source.examples.find((item) => item.id === "multiple").closing,
    "希望你认真给出的喜欢能得到温柔的回应，让你慢慢相信，自己也可以被好好爱着。");
});

test("不按最近画像套全文；一般组合限制主题重复，并保留风险与保护", () => {
  const values = Object.fromEntries(source.dimensions.map(({ key }) => [key, 0.5]));
  Object.assign(values, { recognition: 0.9, needed: 0.9, calibration: 0.3,
    evidence: 0.3, manipulation: 0.3, rationalization: 0.8,
    boundaries: 0.8, stopLoss: 0.8, differentiation: 0.8, selfCalibration: 0.8 });
  const result = build(fromDimensions(values));
  assert.equal(result.profileId, null);
  assert.equal(result.status, "ready");
  assert.ok(result.opening.length > source.stageOpenings[result.stage - 1].length);
  assert.equal(result.evidence.length, 6);
  const counts = new Map();
  for (const item of result.evidence) counts.set(item.theme, (counts.get(item.theme) ?? 0) + 1);
  assert.ok([...counts.values()].every((count) => count <= 2));
  assert.ok(result.evidence.some((item) => item.role === "protection"));
  assert.ok(result.evidence.some((item) => item.role === "risk"));
  assert.equal(result.sentences.join(""), result.paragraphs.join(""));

  // 只改一个必要字段，完整段落立刻失效，不能漏条件套用。
  for (const pattern of source.patterns) {
    const example = source.examples.find((item) => item.id === pattern.id);
    for (const condition of pattern.conditions) {
      const changed = { ...example.dimensions, [condition.key]: 0.5 };
      assert.notEqual(build(fromDimensions(changed)).profileId, pattern.id);
    }
  }
});

test("高低门槛与保护方向准确，中间值不制造特点", () => {
  const middle = Object.fromEntries(source.dimensions.map(({ key }) => [key, 0.5]));
  for (const [key, value, id] of [
    ["recognition", 0.65, "recognition.high"], ["recognition", 0.649999, null],
    ["boundaries", 0.35, "boundaries.low"], ["boundaries", 0.350001, null],
    ["boundaries", 0.65, "boundaries.high"], ["boundaries", 0.649999, null],
    ["recognition", 0, null],
  ]) {
    const copy = build(fromDimensions({ ...middle, [key]: value }));
    if (id) assert.ok(copy.selectedIds.includes(id));
    else assert.equal(copy.reason, "no_prominent_features");
  }
  const neutral = build(fromDimensions(middle));
  assert.equal(neutral.status, "fallback");
  assert.equal(neutral.profileId, "flat");
  assert.deepEqual(plain(neutral.evidence), []);
});

test("分数截断与 Stage 临界值一致，文案不暗中改分", () => {
  for (const score of [15, 29.999, 30, 49.999, 50, 69.999, 70, 85]) {
    const input = fromDimensions();
    const stage = context.Layer6Integration.stageForScore(score);
    input.outcome.totalScore = input.layer6Integration.totalScore = score;
    input.outcome.stage = input.layer6Integration.stage = stage;
    const copy = build(input);
    const shown = Number.parseFloat(copy.scoreText);
    assert.equal(context.Layer6Integration.stageForScore(shown), stage);
    assert.equal(copy.degreeText, ["不容易被骗", "可能被骗", "容易被骗", "超容易被骗"][stage - 1]);
    assert.equal(input.outcome.totalScore, score);
  }
});

test("缺失、非法记录、旧版本、缺模块均明确回退，不把 null 解释成低分", () => {
  const valid = fromDimensions();
  const variants = [
    (r) => { r.outcome.stage = 4; },
    (r) => { r.outcome.totalScore += 1; },
    (r) => { r.outcome.version = 2; },
    (r) => { r.layer6Integration.version = "1.4"; },
    (r) => { r.layer6Integration.paths = [{ id: "X" }]; },
    (r) => { r.layer6Integration.paths = [{ id: "B" }, { id: "B" }]; },
    (r) => { delete r.normalizedDimensions.traits.boundary; },
    (r) => { r.normalizedDimensions.traits.boundary = 2; },
    (r) => { r.normalizedDimensions.special.selfCalibration = "0.8"; },
    (r) => { r.normalizedDimensions.traits.evidence = "<script>alert(1)</script>"; },
    (r) => { r.normalizedDimensions.traits.need = NaN; },
    (r) => { r.normalizedDimensions.traits.need = Infinity; },
    (r) => { r.outcome.totalScore = r.layer6Integration.totalScore = 0; },
  ];
  for (const change of variants) {
    const input = structuredClone(valid); change(input);
    const copy = build(input);
    assert.equal(copy.status, "unavailable");
    assert.equal(copy.scoreText, null);
    assert.deepEqual(plain(copy.paragraphs), []);
    assert.equal(copy.closing, "");
  }
  const missing = structuredClone(valid);
  missing.normalizedDimensions.traits.recognition = null;
  const fallback = build(missing);
  assert.equal(fallback.reason, "insufficient_dimensions");
  assert.equal(fallback.status, "fallback");
  assert.deepEqual(plain(fallback.evidence), []);
  assert.equal(fallback.closing, "");
  assert.ok(fallback.scoreText);
  const insufficient = structuredClone(valid);
  for (const target of [insufficient.outcome, insufficient.layer6Integration]) {
    target.status = "insufficient_data"; target.totalScore = null; target.stage = null;
  }
  assert.equal(build(insufficient).reason, "insufficient_data");
  const withoutCatalog = {};
  vm.runInNewContext(selectorSource, withoutCatalog);
  assert.equal(withoutCatalog.ResultCopy.build(valid).reason, "missing_dependency");
  const future = { AlgorithmConfig: { ...context.AlgorithmConfig, VERSION: "future" } };
  vm.runInNewContext(catalogSource, future);
  vm.runInNewContext(selectorSource, future);
  assert.equal(future.ResultCopy.build(valid).reason, "unsupported_algorithm");
});

test("真实 28 题流程保存的记录可直接引用，且 200 组正式抽题全链路无文案错误", async () => {
  const quiz = await quizHarness();
  for (let i = 0; i < 28; i += 1) await quiz.answer(i % 4);
  const record = JSON.parse(quiz.storage.get(RESULT_KEY));
  assert.ok(["ready", "fallback"].includes(build(record).status));
  const used = new Set();
  for (let seed = 1; seed <= 200; seed += 1) {
    const random = seededRandom(seed);
    const questions = context.QuestionSampler.sampleStratified(productionBank.questions, 28, random).questions;
    const answers = questions.map((question) => {
      const option = question.options[Math.floor(random() * question.options.length)];
      return { questionId: question.id, option: option.id, scores: { ...option.scores } };
    });
    const rawVector = context.DimensionVector.fromAnswers(answers, productionBank.dimensions);
    const normalizedDimensions = context.DimensionNormalizer.normalize({ rawVector, dimensions: productionBank.dimensions, questions });
    const layer3 = context.HigherOrderStructure.aggregate(normalizedDimensions);
    const layer4 = context.Layer4Evidence.fromLayer3(layer3);
    const layer5 = context.Layer5Mechanisms.calculate(layer4);
    const layer6Integration = context.Layer6Integration.calculate(layer5);
    const outcome = context.QuizScoring.calculateResult({ answers, dimensions: productionBank.dimensions, layer6Integration });
    const copy = build({ outcome, layer6Integration, normalizedDimensions });
    assert.ok(["ready", "fallback"].includes(copy.status), `${seed}: ${copy.reason}`);
    assert.ok(copy.paragraphs.length && copy.closing);
    copy.selectedIds.forEach((id) => used.add(id));
  }
  // 静态单项必须有语义来源；不能出现没有引用途径的游离 ID。
  assert.ok(used.size > 6);
});
