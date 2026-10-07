import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { productionBank, seededRandom } from "./helpers/question-fixtures.mjs";

const context = {};
vm.runInNewContext(await readFile(new URL("../js/question-sampler.js", import.meta.url), "utf8"), context);
const sampler = context.QuestionSampler;
const bank = productionBank;
const before = JSON.stringify(bank);
const signatures = new Set();
let maximumAttempt = 0;
for (let seed = 1; seed <= 1000; seed += 1) {
  const result = sampler.sampleStratified(bank.questions, 28, seededRandom(seed));
  const ids = result.questions.map((q) => q.id);
  assert.equal(ids.length, 28);
  assert.equal(new Set(ids).size, 28);
  for (const [type, count] of Object.entries({ A: 12, B: 6, C: 6, D: 4 })) {
    assert.equal(result.questions.filter((q) => q.stratum === type).length, count);
    assert.equal(result.allocation[type], count);
  }
  for (const [key, minimum] of Object.entries(sampler.MINIMUM)) {
    const sources = new Set(result.questions.filter((q) => q.dimensions.includes(key)).map((q) => q.id));
    assert.ok(sources.size >= minimum, key);
    assert.equal(result.debug.dimension_counts[key], sources.size);
  }
  const semantics = new Map();
  result.questions.forEach((q) => {
    assert.equal(q.status, "valid");
    semantics.set(q.semantic_group, (semantics.get(q.semantic_group) ?? 0) + 1);
  });
  assert.ok([...semantics.values()].every((n) => n <= 2));
  assert.ok(sampler.validateSelection(result.questions).valid);
  assert.equal(result.debug.selected_question_ids.join(","), ids.join(","));
  maximumAttempt = Math.max(maximumAttempt, result.debug.attempt_count);
  signatures.add([...ids].sort().join(","));
}
assert.ok(signatures.size > 900, "随机性需要来自题组变化");
assert.equal(JSON.stringify(bank), before);
const sample = sampler.sampleStratified(bank.questions, 28, seededRandom(7));
assert.equal(JSON.stringify(sample), JSON.stringify(sampler.sampleStratified(bank.questions, 28, seededRandom(7))));
assert.throws(() => sampler.sampleStratified(bank.questions, 27), /只支持 28/);
assert.throws(() => sampler.sampleStratified([...bank.questions, bank.questions[0]]), /ID 重复/);
assert.throws(() => sampler.sampleStratified([{ ...bank.questions[0], dimensions: ["recognition", "recognition"] }]), /元数据/);
assert.throws(() => sampler.sampleStratified([{ ...bank.questions[0], status: undefined }]), /元数据/);

const disabled = structuredClone(bank);
disabled.questions[0].status = "disabled";
for (let seed = 1; seed <= 20; seed += 1) {
  assert.ok(sampler.sampleStratified(disabled.questions, 28, seededRandom(seed)).questions.every((q) => q.id !== disabled.questions[0].id));
}
const shortType = bank.questions.filter((q) => q.stratum !== "D");
assert.throws(() => sampler.sampleStratified(shortType), (e) => e.reason === "pool_insufficient" && e.details.some((d) => d.startsWith("D ")));
const shortDimension = bank.questions.filter((q) => !q.dimensions.includes("manipulation"));
assert.throws(() => sampler.sampleStratified(shortDimension), (e) => e.reason === "pool_insufficient" && e.details.some((d) => d.startsWith("manipulation ")));
assert.throws(() => sampler.sampleStratified(bank.questions.map((q) => ({ ...q, semantic_group: "one_group" }))), (e) => e.reason === "pool_insufficient" && e.details.some((d) => d.startsWith("语义容量")));

// 必要容量通过，但 C/D 共享三组最多六题，无法同时满足 C6+D4。
const impossible = [];
for (const [type, count] of Object.entries({ A: 24, B: 12, C: 6, D: 4 })) {
  for (let i = 0; i < count; i += 1) {
    impossible.push({ ...bank.questions[0], id: `${type}${String(i + 1).padStart(2, "0")}`, stratum: type,
      semantic_group: ["C", "D"].includes(type) ? `shared_${i % 3}` : `unique_${type.toLowerCase()}_${i}`,
      dimensions: Object.keys(sampler.MINIMUM), status: "valid",
      options: [3, 2, 1, 0].map((score, index) => ({ id: "ABCD"[index], text: `选项${index}`, scores: Object.fromEntries(Object.keys(sampler.MINIMUM).map((key) => [key, score])) })),
    });
  }
}
assert.throws(() => sampler.sampleStratified(impossible, 28, seededRandom(1)), (e) => e.reason === "attempts_exhausted" && e.details.attempt_count === 100);
// 补足四个 D 专属组后有解；种子 7 的首轮失败，第二轮成功。
const recoverable = structuredClone(impossible);
for (let i = 4; i < 8; i += 1) {
  recoverable.push({ ...structuredClone(impossible.find((q) => q.stratum === "D")),
    id: `D${String(i + 1).padStart(2, "0")}`, semantic_group: `free_d_${i}` });
}
const recovered = sampler.sampleStratified(recoverable, 28, seededRandom(7));
assert.equal(recovered.debug.attempt_count, 2);
assert.ok(sampler.validateSelection(recovered.questions).valid);
const ordinaryName = structuredClone(bank);
ordinaryName.questions[0].semantic_group = "constructor";
assert.ok(sampler.sampleStratified(ordinaryName.questions, 28, seededRandom(1)));
const bug = new Error("injected random error");
assert.throws(() => sampler.sampleStratified(bank.questions, 28, () => { throw bug; }), (e) => e === bug);

const invalidSelection = structuredClone(sample.questions);
invalidSelection[0].status = "review";
assert.equal(sampler.validateSelection(invalidSelection).valid, false);
const tooSimilar = sample.questions.map((q) => ({ ...q, semantic_group: "one_group" }));
assert.equal(sampler.validateSelection(tooSimilar).valid, false);
assert.throws(() => sampler.validateSelection([...sample.questions.slice(1), sample.questions[1]]), /ID 重复/);

const validManipulation = productionBank.questions.filter((q) => q.status === "valid" && q.dimensions.includes("manipulation"));
assert.deepEqual(validManipulation.map((q) => q.id).sort(), ["A40", "C22", "C23", "C24"]);
console.log(`1000 次正式题库生成全部合格；最多尝试 ${maximumAttempt} 次，不补入人工测试题。`);
