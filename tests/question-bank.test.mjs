import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildQuestionBank } from "../scripts/build-question-bank.mjs";

const questionBank = JSON.parse(
  await readFile(new URL("../data/questions.json", import.meta.url), "utf8"),
);
assert.equal(questionBank.version, 4);
assert.match(questionBank.bankRevision, /^[a-f0-9]{64}$/u);
assert.equal(questionBank.scoringStatus, "configured");
assert.equal(questionBank.dimensions.length, 12);
assert.ok(
  questionBank.dimensions.every(
    (dimension) => dimension.scoringStatus === "configured",
  ),
);
const dimensionKeys = new Set(questionBank.dimensions.map(({ key }) => key));
assert.ok(questionBank.questions.length >= 28);
assert.equal(new Set(questionBank.questions.map(({ id }) => id)).size, questionBank.questions.length);

for (const question of questionBank.questions) {
  assert.match(question.id, /^[A-D]\d{2,}$/u);
  assert.equal(question.stratum, question.id[0]);
  assert.ok(question.prompt.length > 0);
  assert.equal(question.dimensionJudgement, null);
  assert.ok(["valid", "review", "disabled"].includes(question.status));
  assert.match(question.semantic_group, /^[a-z][a-z0-9_]*$/u);
  assert.deepEqual([...question.dimensions].sort(), [...new Set(question.options.flatMap((option) => Object.keys(option.scores)))].sort());
  assert.equal(question.options.length, 4);
  assert.deepEqual(
    question.options.map((option) => option.id),
    ["A", "B", "C", "D"],
  );
  assert.ok(
    question.options.every(
      (option) =>
        option.scores &&
        typeof option.scores === "object" &&
        !Array.isArray(option.scores) &&
        Object.keys(option.scores).length > 0 &&
        Object.entries(option.scores).every(
          ([dimensionKey, score]) =>
            dimensionKeys.has(dimensionKey) &&
            Number.isInteger(score) &&
            score >= 0 &&
            score <= 4,
        ),
    ),
  );
  assert.ok(question.options.every((option) => option.text.length > 0));
}

const questionsById = new Map(
  questionBank.questions.map((question) => [question.id, question]),
);
assert.deepEqual(questionsById.get("A01").options[0].scores, {
  recognition: 3,
});
assert.deepEqual(questionsById.get("A02").options[0].scores, {
  differentiation: 3,
  stopLoss: 1,
});
assert.deepEqual(questionsById.get("C03").options[2].scores, {
  scarcity: 3,
});
assert.deepEqual(questionsById.get("D08").options[0].scores, {
  selfCalibration: 3,
  boundaries: 2,
});

const markdown = await readFile(new URL("../data/question-bank-source.md", import.meta.url), "utf8");
assert.deepEqual(buildQuestionBank(markdown), questionBank, "维护源与运行题库必须一致");
assert.equal(buildQuestionBank(markdown).bankRevision, questionBank.bankRevision);
for (const changed of [
  markdown.replace("我会更想了解TA。", "我会更想进一步了解TA。"),
  markdown.replace("〔认+3〕", "〔认+4〕"),
  markdown.replace('"status":"valid"', '"status":"review"'),
  markdown.replace('"semantic_group":"being_understood"', '"semantic_group":"being_understood_new"'),
]) assert.notEqual(buildQuestionBank(changed).bankRevision, questionBank.bankRevision);
assert.throws(() => buildQuestionBank(markdown.replace(/<!-- selection: .+? -->/u, "")), /缺少 selection/);
assert.throws(() => buildQuestionBank(markdown.replace('"dimensions":["recognition"]', '"dimensions":["needed"]')), /计分维度不一致/);
const expandedSource = markdown + '\n### A100\n\n<!-- selection: {"dimensions":["recognition"],"status":"review","semantic_group":"test_future_id"} -->\n\n测试未来编号\n\n**甲** 〔认+3〕 · **乙** 〔认+2〕 · **丙** 〔认+1〕 · **丁** 〔认+0〕\n';
assert.ok(buildQuestionBank(expandedSource).questions.some((q) => q.id === "A100"));
assert.equal(questionsById.get("A29").status, "review");
assert.equal(questionsById.get("C05").status, "review");
console.log("Question bank tests passed.");
