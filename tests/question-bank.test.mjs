import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const questionBank = JSON.parse(
  await readFile(new URL("../data/questions.json", import.meta.url), "utf8"),
);
const expectedCounts = { A: 39, B: 21, C: 21, D: 11 };
assert.equal(questionBank.version, 3);
assert.equal(questionBank.scoringStatus, "configured");
assert.equal(questionBank.dimensions.length, 12);
assert.ok(
  questionBank.dimensions.every(
    (dimension) => dimension.scoringStatus === "configured",
  ),
);
const dimensionKeys = new Set(questionBank.dimensions.map(({ key }) => key));
assert.equal(questionBank.questions.length, 92);
assert.equal(new Set(questionBank.questions.map(({ id }) => id)).size, 92);

for (const [stratum, expectedCount] of Object.entries(expectedCounts)) {
  assert.equal(
    questionBank.questions.filter((question) => question.stratum === stratum)
      .length,
    expectedCount,
  );
}

for (const question of questionBank.questions) {
  assert.match(question.id, /^[A-D]\d{2}$/u);
  assert.equal(question.stratum, question.id[0]);
  assert.ok(question.prompt.length > 0);
  assert.equal(question.dimensionJudgement, null);
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

console.log("Question bank tests passed.");
