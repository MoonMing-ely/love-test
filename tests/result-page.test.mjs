import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { quizHarness, RESULT_KEY } from "./helpers/quiz-harness.mjs";

const source = await readFile(new URL("../js/interactions/result.js", import.meta.url), "utf8");
const catalogSource = await readFile(new URL("../js/result-copy/catalog.js", import.meta.url), "utf8");
const selectorSource = await readFile(new URL("../js/result-copy/selector.js", import.meta.url), "utf8");
const configSource = await readFile(new URL("../js/core-algorithm/algorithm-config.js", import.meta.url), "utf8");
function element(tag = "div") {
  let text = "";
  return { tag, dataset: {}, hidden: true, children: [], attributes: {},
    get textContent() { return text + this.children.map((child) => child.textContent).join(""); },
    set textContent(value) { text = String(value); this.children = []; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { text = ""; this.children = nodes; },
    setAttribute(key, value) { this.attributes[key] = value; },
  };
}
function render(raw, storageFails = false, loadCopy = true) {
  const nodes = Object.fromEntries([".result-frame", ".result-content", ".result-empty", "#result-title", "#result-summary", "#result-score", "#result-degree", "#result-direction", "#result-copy", "#result-closing", "#result-note", "#result-highlights", "#result-overview", "#result-abilities", "#result-reading-title", "#result-layout"]
    .map((key) => [key, element()]));
  const context = { document: { querySelector: (key) => nodes[key], createElement: element }, sessionStorage: {
    getItem() { if (storageFails) throw new Error("storage unavailable"); return raw; },
  } };
  vm.runInNewContext(configSource, context);
  if (loadCopy) {
    vm.runInNewContext(catalogSource, context);
    vm.runInNewContext(selectorSource, context);
  }
  vm.runInNewContext(source, context);
  return nodes;
}
const quiz = await quizHarness();
for (let i = 0; i < 28; i += 1) await quiz.answer(i % 4);
const record = JSON.parse(quiz.storage.get(RESULT_KEY));
const completed = render(JSON.stringify(record));
assert.equal(completed[".result-frame"].dataset.resultState, "complete");
assert.equal(completed[".result-content"].hidden, false);
assert.equal(completed[".result-empty"].hidden, true);
const copyContext = {};
for (const script of [configSource, catalogSource, selectorSource]) vm.runInNewContext(script, copyContext);
const expected = copyContext.ResultCopy.build(record);
assert.equal(completed["#result-title"].textContent, "你的被骗指数是：");
assert.equal(completed["#result-summary"].textContent, expected.opening);
assert.equal(completed["#result-score"].textContent, expected.scoreText);
assert.equal(completed["#result-degree"].textContent, expected.degreeText);
assert.equal(completed["#result-direction"].textContent, expected.directionText);
assert.equal(completed["#result-copy"].children.length, expected.paragraphs.length);
assert.equal(completed["#result-copy"].textContent, expected.paragraphs.join(""));
assert.equal(completed["#result-closing"].textContent, expected.closing);
assert.equal(completed["#result-note"].textContent, expected.note);
assert.equal(completed["#result-highlights"].children.length, expected.highlights.length);
assert.equal(completed["#result-highlights"].hidden, !expected.highlights.length);
assert.equal(completed["#result-overview"].hidden, false);
assert.equal(completed["#result-abilities"].children.length, 4);
for (const [index, row] of completed["#result-abilities"].children.entries()) {
  assert.equal(row.children[2].value, expected.abilities[index].value);
  assert.equal(row.children[2].max, 1);
  assert.equal(row.children[2].attributes["aria-label"],
    `${expected.abilities[index].label}：${expected.abilities[index].description}`);
}
assert.equal(completed[".result-frame"].dataset.copyState, expected.status);
assert.doesNotMatch(completed["#result-summary"].textContent, /Stage|Path|Shape/u);
assert.equal(completed["#result-score"].hidden, false);

const zero = structuredClone(record);
zero.outcome.totalScore = zero.layer6Integration.totalScore = 15;
zero.layer6Integration.debug.evidenceScore = 0;
zero.outcome.stage = zero.layer6Integration.stage = 1;
assert.equal(render(JSON.stringify(zero))["#result-score"].textContent, "15.00 分");
const legacy = structuredClone(record);
legacy.outcome.status = "scoring-placeholder";
legacy.outcome.totalScore = null;
delete legacy.layer6Integration;
const old = render(JSON.stringify(legacy));
assert.equal(old[".result-frame"].dataset.resultState, "legacy");
assert.equal(old["#result-score"].hidden, true);
assert.match(old["#result-summary"].textContent, /重测一次/);
const previousAlgorithm = structuredClone(record);
previousAlgorithm.layer6Integration.version = "1.5";
const previous = render(JSON.stringify(previousAlgorithm));
assert.equal(previous[".result-frame"].dataset.resultState, "legacy");
assert.equal(previous["#result-score"].hidden, true);
assert.match(previous["#result-summary"].textContent, /旧版算法.*重测一次/);
const partial = structuredClone(record);
partial.outcome.status = "insufficient_data";
partial.outcome.totalScore = partial.outcome.stage = null;
partial.layer6Integration = { version: "1.6", status: "insufficient_data", totalScore: null, stage: null,
  shape: null, shapeLabel: null, paths: [], diagnostics: null, debug: null };
const incomplete = render(JSON.stringify(partial));
assert.equal(incomplete[".result-frame"].dataset.resultState, "insufficient_data");
assert.equal(incomplete["#result-score"].hidden, true);
assert.match(incomplete["#result-summary"].textContent, /信息还不够/);

const variants = [];
for (const change of [
  (r) => { r.answers[1].questionId = r.answers[0].questionId; },
  (r) => { r.answers[0].option = "X"; },
  (r) => { r.questionIds.push(r.questionIds[0]); },
  (r) => { r.questionIds[0] = 1; },
  (r) => { r.answers = { length: 28 }; },
  (r) => { r.outcome.version = 2; },
  (r) => { r.completed = false; },
  (r) => { r.outcome.totalScore = NaN; },
  (r) => { r.outcome.totalScore = 101; },
  (r) => { r.outcome.totalScore = r.layer6Integration.totalScore = 0; },
  (r) => { delete r.layer6Integration.debug.evidenceScore; },
  (r) => { r.outcome.stage = 0; },
  (r) => { r.outcome.stage = r.layer6Integration.stage = 4; },
  (r) => { delete r.normalizedDimensions.traits.boundary; },
  (r) => { r.normalizedDimensions.traits.recognition = "<script>bad</script>"; },
  (r) => { r.layer6Integration.totalScore += 1; },
  (r) => { delete r.layer6Integration; },
  (r) => { r.layer6Integration.debug = null; },
  (r) => { r.dimensions = []; },
  (r) => { r.layer3Structures = null; },
]) {
  const altered = structuredClone(record); change(altered); variants.push(JSON.stringify(altered));
}
for (const raw of [null, "{broken", ...variants]) {
  const nodes = render(raw);
  assert.equal(nodes[".result-frame"].dataset.resultState, "empty");
  assert.equal(nodes[".result-content"].hidden, true);
  assert.equal(nodes[".result-empty"].hidden, false);
}
assert.equal(render(JSON.stringify(record), true)[".result-frame"].dataset.resultState, "empty");
// 两位小数不能在临界点把显示分数推到另一档。
for (const [value, stage, shown] of [[29.999, 1, "29.99 分"], [30, 2, "30.00 分"],
  [49.999, 2, "49.99 分"], [50, 3, "50.00 分"], [69.999, 3, "69.99 分"], [70, 4, "70.00 分"]]) {
  const boundary = structuredClone(record);
  boundary.outcome.totalScore = boundary.layer6Integration.totalScore = value;
  boundary.outcome.stage = boundary.layer6Integration.stage = stage;
  const nodes = render(JSON.stringify(boundary));
  assert.equal(nodes["#result-score"].textContent, shown);
  assert.equal(nodes["#result-degree"].textContent, ["不容易被骗", "可能被骗", "容易被骗", "超容易被骗"][stage - 1]);
}
const missingDimension = structuredClone(record);
missingDimension.normalizedDimensions.traits.recognition = null;
const missingCopy = render(JSON.stringify(missingDimension));
assert.equal(missingCopy[".result-frame"].dataset.copyState, "fallback");
assert.match(missingCopy["#result-copy"].textContent, /信息还不够/);
assert.equal(missingCopy["#result-closing"].hidden, true);
assert.equal(missingCopy["#result-score"].hidden, false);
const noModule = render(JSON.stringify(record), false, false);
assert.equal(noModule[".result-frame"].dataset.resultState, "complete");
assert.equal(noModule[".result-frame"].dataset.copyState, "unavailable");
assert.equal(noModule["#result-score"].hidden, false);
assert.match(noModule["#result-summary"].textContent, /刷新页面重试/);
assert.equal(noModule["#result-copy"].hidden, true);
assert.equal(noModule["#result-closing"].hidden, true);

const html = await readFile(new URL("../html/result.html", import.meta.url), "utf8");
assert.match(html, /aria-controls="result-content"/u);
assert.match(html, /id="result-content"/u);
assert.ok(html.indexOf('id="result-copy"') < html.indexOf('id="result-closing"'));
assert.doesNotMatch(html, /result-details|result-layers|查看计算明细/u);
assert.equal(completed["#result-note"].textContent, "结果仅供参考，不代表真实概率");
console.log("Result page tests passed: real copy integration, stage boundaries, legacy, missing modules and invalid records.");
