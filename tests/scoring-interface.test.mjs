import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const scoringSource = await readFile(
  new URL("../js/scoring.js", import.meta.url),
  "utf8",
);
async function testScoringContract() {
  const context = {};
  for (const path of ["algorithm-config.js", "sixth-layer-integration.js"]) {
    vm.runInNewContext(await readFile(new URL(`../js/core-algorithm/${path}`, import.meta.url), "utf8"), context);
  }
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
  const layer6Integration = context.Layer6Integration.calculate({ status: "complete", missingDimensions: [],
    P1_relation_value_amplification: 1, P2_judgment_shift: 1, P3_action_failure: 1, P4_exit_difficulty: 1, protection: { M: 0 } });
  const result = context.QuizScoring.calculateResult({ answers, dimensions, layer6Integration });

  assert.equal(context.QuizScoring.DIMENSION_COUNT, 12);
  assert.equal(result.version, 3);
  assert.equal(result.status, "scored");
  assert.equal(result.dimensionCount, 12);
  assert.equal(result.totalScore, 85);
  assert.equal(result.dimensionScores, null);
  assert.equal(result.stage, 4);
  assert.throws(() => context.QuizScoring.calculateResult({ answers, dimensions }), /第六层/);
  assert.throws(() => context.QuizScoring.calculateResult({ answers, dimensions,
    layer6Integration: { ...layer6Integration, totalScore: NaN } }), /最终分/);
  const incomplete = context.QuizScoring.calculateResult({ answers, dimensions,
    layer6Integration: { ...layer6Integration, status: "insufficient_data", totalScore: null, stage: null } });
  assert.equal(incomplete.status, "insufficient_data");
  assert.equal(incomplete.totalScore, null);
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

await testScoringContract();
console.log("Scoring interface tests passed.");
