import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const scoringSource = await readFile(
  new URL("../js/scoring.js", import.meta.url),
  "utf8",
);
function testScoringContract() {
  const context = {};
  vm.runInNewContext(scoringSource, context);

  const dimensions = Array.from({ length: 12 }, (_, index) => ({
    key: `dimension${index + 1}`,
    code: String(index + 1),
    label: `维度 ${index + 1}`,
  }));
  const answers = Array.from({ length: 28 }, (_, index) => ({
    questionId: `T${index + 1}`,
    option: "A",
    scores: index === 0 ? { dimension1: 2 } : null,
  }));
  const result = context.QuizScoring.calculateResult({ answers, dimensions });

  assert.equal(context.QuizScoring.DIMENSION_COUNT, 12);
  assert.equal(result.version, 3);
  assert.equal(result.status, "scoring-placeholder");
  assert.equal(result.dimensionCount, 12);
  assert.equal(result.totalScore, null);
  assert.equal(result.dimensionScores, null);
  assert.throws(
    () => context.QuizScoring.calculateResult({ answers: [], dimensions }),
    /没有可用于生成测试记录的答案/,
  );
  assert.throws(
    () =>
      context.QuizScoring.calculateResult({
        answers: [{ questionId: "T1", option: "A", scores: { unknown: 1 } }],
        dimensions,
      }),
    /不符合 AnswerRecord 接口/,
  );
}

testScoringContract();
console.log("Scoring interface tests passed.");
