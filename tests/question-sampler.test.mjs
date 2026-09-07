import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const samplerSource = await readFile(
  new URL("../js/question-sampler.js", import.meta.url),
  "utf8",
);
const questionBank = JSON.parse(
  await readFile(new URL("../data/questions.json", import.meta.url), "utf8"),
);
const context = {};
vm.runInNewContext(samplerSource, context);

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const signatures = new Set();

for (let seed = 1; seed <= 100; seed += 1) {
  const sample = context.QuestionSampler.sampleStratified(
    questionBank.questions,
    28,
    seededRandom(seed),
  );
  const ids = sample.questions.map((question) => question.id);
  const counts = Object.fromEntries(
    ["A", "B", "C", "D"].map((stratum) => [
      stratum,
      sample.questions.filter((question) => question.stratum === stratum).length,
    ]),
  );

  assert.equal(ids.length, 28);
  assert.equal(new Set(ids).size, 28);
  assert.equal(counts.A, 12);
  assert.equal(counts.D, 3);
  assert.deepEqual([counts.B, counts.C].sort(), [6, 7]);
  signatures.add([...ids].sort().join(","));
}

assert.ok(signatures.size > 90, "不同随机种子应产生不同题组");
assert.throws(
  () => context.QuestionSampler.sampleStratified(questionBank.questions, 93),
  /不能超过题库总数/,
);

console.log("Question sampler tests passed.");
