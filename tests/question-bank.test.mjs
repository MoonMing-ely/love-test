import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const questionBank = JSON.parse(
  await readFile(new URL("../data/questions.json", import.meta.url), "utf8"),
);
const expectedCounts = { A: 39, B: 21, C: 21, D: 11 };
const supportedScoringStatuses = new Set(["placeholder", "configured"]);

assert.equal(questionBank.version, 3);
assert.ok(supportedScoringStatuses.has(questionBank.scoringStatus));
assert.equal(questionBank.dimensions.length, 12);
assert.ok(
  questionBank.dimensions.every(
    (dimension) => supportedScoringStatuses.has(dimension.scoringStatus),
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
        option.scores === null ||
        (option.scores &&
          typeof option.scores === "object" &&
          !Array.isArray(option.scores) &&
          Object.entries(option.scores).every(
            ([dimensionKey, score]) =>
              dimensionKeys.has(dimensionKey) && Number.isFinite(score),
          )),
    ),
  );
  assert.ok(question.options.every((option) => option.text.length > 0));
}

console.log("Question bank tests passed.");
