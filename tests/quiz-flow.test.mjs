import assert from "node:assert/strict";
import { quizHarness, STATE_KEY, RESULT_KEY } from "./helpers/quiz-harness.mjs";
import { productionBank, runnableBank } from "./helpers/question-fixtures.mjs";

const first = await quizHarness();
assert.equal(first.panel.dataset.loadState, "ready");
assert.equal(first.counter.textContent, "QUESTION 1 / 28");
assert.ok(first.prompt.textContent.length > 0);
assert.ok(first.buttons.every((b) => !b.disabled));
assert.equal(first.state().selectionVersion, 4);
await first.answer();
assert.equal(first.state().currentQuestionIndex, 1);
assert.equal(first.counter.textContent, "QUESTION 2 / 28");
const saved = first.storage.get(STATE_KEY);
const refreshed = await quizHarness({ storage: new Map(first.storage), seed: 11 });
assert.equal(refreshed.state().currentQuestionIndex, 1);
assert.equal(refreshed.counter.textContent, "QUESTION 2 / 28");
assert.equal(refreshed.prompt.textContent, first.prompt.textContent);
assert.deepEqual(refreshed.state().questionIds, first.state().questionIds);
assert.deepEqual(refreshed.state().answers, first.state().answers);
assert.equal(refreshed.status.textContent, "");

for (const corrupt of [
  { ...first.state(), bankRevision: "a".repeat(64) },
  { ...first.state(), selectionVersion: 0 },
  { ...first.state(), selectionVersion: 1 },
  { ...first.state(), selectionVersion: 2 },
  { ...first.state(), selectionVersion: 3 },
  { ...first.state(), questionIds: Array(28).fill("A01") },
  { ...first.state(), answers: [{ ...first.state().answers[0], questionId: "A00" }] },
  { ...first.state(), answers: [{ ...first.state().answers[0], scores: { recognition: 999 } }] },
  { ...first.state(), currentQuestionIndex: 29 },
]) {
  const restarted = await quizHarness({ storage: new Map([[STATE_KEY, JSON.stringify(corrupt)]]) });
  assert.equal(restarted.state().currentQuestionIndex, 0);
  assert.match(restarted.status.textContent, /失效/);
  assert.equal(restarted.panel.dataset.loadState, "ready");
}
const malformed = await quizHarness({ storage: new Map([[STATE_KEY, "{broken"]]) });
assert.match(malformed.status.textContent, /失效/);
const oldQuota = first.state();
oldQuota.currentQuestionIndex = 0;
oldQuota.answers = [];
oldQuota.questionIds = runnableBank().questions.filter((q) => q.status === "valid").slice(0, 28).map((q) => q.id);
const old = await quizHarness({ storage: new Map([[STATE_KEY, JSON.stringify(oldQuota)]]) });
assert.match(old.status.textContent, /失效/);

const restart = await quizHarness({ storage: new Map([[STATE_KEY, saved], [RESULT_KEY, "old-result"]]), search: "?restart=1", seed: 91 });
assert.equal(restart.state().currentQuestionIndex, 0);
assert.equal(restart.counter.textContent, "QUESTION 1 / 28");
assert.notDeepEqual(restart.state().questionIds, first.state().questionIds);
assert.equal(restart.storage.has(RESULT_KEY), false);
const offline = await quizHarness({ storage: new Map([[STATE_KEY, saved]]), failFetch: true });
assert.equal(offline.storage.get(STATE_KEY), saved);
assert.ok(offline.buttons.every((b) => b.disabled));
assert.match(offline.status.textContent, /加载失败/);

for (const action of ["getItem", "setItem"]) {
  const broken = await quizHarness({ failStorage: (method) => method === action });
  assert.equal(broken.panel.dataset.loadState, "error");
  assert.ok(broken.buttons.every((b) => b.disabled));
  assert.match(broken.status.textContent, /存储设置/);
}
let failMidway = false;
const midway = await quizHarness({ failStorage: (method) => failMidway && method === "setItem" });
const beforeAnswer = midway.storage.get(STATE_KEY);
failMidway = true;
await midway.answer();
assert.equal(midway.storage.get(STATE_KEY), beforeAnswer);
assert.equal(midway.progressBar.value, 1);
assert.ok(midway.buttons.every((b) => b.disabled));
assert.match(midway.status.textContent, /存储设置/);

const complete = await quizHarness();
for (let i = 0; i < 28; i += 1) await complete.answer(i % 4);
assert.equal(complete.context.location.href, "result.html");
assert.equal(complete.storage.has(STATE_KEY), false);
const result = JSON.parse(complete.storage.get(RESULT_KEY));
assert.equal(result.answers.length, 28);
assert.equal(result.dimensionVector.length, 12);
assert.equal(result.layer3Structures.version, "1.1");
assert.equal(result.layer4Evidence.status, "complete");
assert.equal(result.layer5Mechanisms.status, "complete");
assert.equal(result.outcome.version, 3);
assert.equal(result.layer6Integration.status, "complete");
assert.equal(result.layer6Integration.version, "1.4");
assert.equal(result.outcome.status, "scored");
assert.equal(result.outcome.totalScore, result.layer6Integration.totalScore);
assert.ok(Number.isFinite(result.outcome.totalScore));
assert.equal(result.outcome.stage, result.layer6Integration.stage);
assert.equal(result.dimensions.length, 12);
const bank = runnableBank();
const expectedVector = Array(12).fill(0);
result.answers.forEach((answer, i) => {
  assert.equal(answer.questionId, result.questionIds[i]);
  const option = bank.questions.find((q) => q.id === answer.questionId).options.find((o) => o.id === answer.option);
  assert.deepEqual(answer.scores, option.scores);
  bank.dimensions.forEach((d, index) => { expectedVector[index] += option.scores[d.key] ?? 0; });
});
assert.deepEqual(result.dimensionVector, expectedVector);
assert.ok(Object.values(result.normalizedDimensions.debug.value).every((v) => Number.isFinite(v) && v >= 0 && v <= 1));

for (const failedStage of ["result", "cleanup"]) {
  const broken = await quizHarness({ failStorage: (action, key) => failedStage === "result"
    ? action === "setItem" && key === RESULT_KEY : action === "removeItem" && key === STATE_KEY });
  for (let i = 0; i < 28; i += 1) await broken.answer();
  assert.equal(broken.context.location.href, "text.html");
  assert.equal(broken.state().currentQuestionIndex, 28);
  assert.ok(broken.buttons.every((b) => b.disabled));
  assert.equal(broken.storage.has(RESULT_KEY), failedStage === "cleanup");
  const retry = await quizHarness({ storage: new Map(broken.storage) });
  assert.equal(retry.context.location.href, "result.html");
  assert.equal(retry.storage.has(STATE_KEY), false);
}

const invalidData = await quizHarness({ data: { ...bank, version: 3 } });
assert.match(invalidData.status.textContent, /数据无效/);
const production = await quizHarness({ data: productionBank });
assert.equal(production.panel.dataset.loadState, "ready");
assert.equal(production.state().questionIds.length, 28);
assert.equal(production.state().bankRevision, productionBank.bankRevision);
assert.equal(production.status.textContent, "");
const insufficient = structuredClone(productionBank);
insufficient.questions.forEach((q) => { if (q.dimensions.includes("manipulation")) q.status = "review"; });
const blocked = await quizHarness({ data: insufficient });
assert.equal(blocked.panel.dataset.loadState, "error");
assert.match(blocked.status.textContent, /有效题目/);
assert.equal(blocked.storage.has(STATE_KEY), false);

// 回看只移动游标，改选替换该题，后续答案保留，刷新仍能恢复。
const editable = await quizHarness();
assert.equal(editable.previous.disabled, true);
assert.equal(editable.previous.hidden, true);
assert.equal(editable.forward.hidden, true);
for (const option of [0, 1, 2]) await editable.answer(option);
assert.equal(editable.previous.hidden, false);
const originalAnswers = editable.state().answers;
editable.previous.click();
assert.equal(editable.state().currentQuestionIndex, 2);
assert.deepEqual(editable.state().answers, originalAnswers);
editable.previous.dispatch("pointerenter", { pointerType: "mouse" });
assert.equal(editable.state().currentQuestionIndex, 2, "hover must not navigate");
assert.equal(editable.buttons[2].getAttribute("aria-pressed"), "true");
assert.equal(editable.forward.hidden, false);
editable.previous.click();
assert.equal(editable.state().currentQuestionIndex, 1, "click returns exactly one question");
editable.previous.dispatch("pointerleave");
const reviewReload = await quizHarness({ storage: new Map(editable.storage) });
assert.equal(reviewReload.state().currentQuestionIndex, 1);
assert.deepEqual(reviewReload.state().answers, originalAnswers);
await reviewReload.answer(3);
const editedState = reviewReload.state();
assert.equal(editedState.currentQuestionIndex, 2);
assert.equal(editedState.answers.length, 3);
assert.deepEqual(editedState.answers[0], originalAnswers[0]);
assert.deepEqual(editedState.answers[2], originalAnswers[2]);
assert.notEqual(editedState.answers[1].option, originalAnswers[1].option);
assert.deepEqual(editedState.dimensionVector, Array.from(reviewReload.context.DimensionVector.fromAnswers(editedState.answers, bank.dimensions)));
assert.equal(reviewReload.buttons[2].getAttribute("aria-pressed"), "true");
reviewReload.forward.click();
assert.equal(reviewReload.state().currentQuestionIndex, 3);
assert.equal(reviewReload.forward.hidden, true);
assert.deepEqual(reviewReload.state().answers, editedState.answers);
assert.ok(reviewReload.buttons.every((button) => button.getAttribute("aria-pressed") === "false"));
for (let index = 3; index < 28; index += 1) await reviewReload.answer(index % 4);
const editedResult = JSON.parse(reviewReload.storage.get(RESULT_KEY));
assert.equal(editedResult.answers.length, 28);
assert.deepEqual(editedResult.dimensionVector, Array.from(reviewReload.context.DimensionVector.fromAnswers(editedResult.answers, bank.dimensions)));

let navigationStorageFails = false;
const failedBack = await quizHarness({ failStorage: (action) => navigationStorageFails && action === "setItem" });
await failedBack.answer();
const beforeBack = failedBack.storage.get(STATE_KEY);
navigationStorageFails = true;
failedBack.previous.click();
assert.equal(failedBack.storage.get(STATE_KEY), beforeBack);
assert.equal(failedBack.counter.textContent, "QUESTION 2 / 28");
assert.equal(failedBack.previous.disabled, true);
assert.match(failedBack.status.textContent, /存储设置/);

const keyboardBack = await quizHarness();
await keyboardBack.answer();
await keyboardBack.answer();
keyboardBack.previous.dispatch("pointerenter", { pointerType: "mouse" });
assert.equal(keyboardBack.state().currentQuestionIndex, 2);
keyboardBack.previous.dispatch("click", { detail: 0 });
assert.equal(keyboardBack.state().currentQuestionIndex, 1);
keyboardBack.previous.dispatch("click", { detail: 0 });
assert.equal(keyboardBack.state().currentQuestionIndex, 0);
assert.equal(keyboardBack.previous.disabled, true);
assert.equal(keyboardBack.previous.hidden, true);
assert.equal(keyboardBack.forward.hidden, false);

console.log("Quiz flow tests passed: restore, answer editing, click/keyboard back and unanswered jump, full scoring, and storage failures.");
