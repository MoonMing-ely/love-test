import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { productionBank, seededRandom } from "./helpers/question-fixtures.mjs";

const context = {};
vm.runInNewContext(await readFile(new URL("../js/question-sampler.js", import.meta.url), "utf8"), context);
const sampler = context.QuestionSampler;
assert.equal(sampler.SELECTION_VERSION, 6);
for (const key of ["recognition", "needed", "specialness", "scarcity"]) {
  assert.equal(sampler.MINIMUM[key], 2);
}
assert.equal(sampler.MINIMUM.stopLoss, 3);
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
  const concrete = result.questions.filter((question) => question.dimensions.includes("boundaries") &&
    sampler.BOUNDARY_EXECUTION.semanticGroups.includes(question.semantic_group));
  assert.ok(concrete.length >= 2, "具体边界题至少两道");
  const capacity = (question) => Math.max(...question.options.map((option) => option.scores.boundaries ?? 0));
  const concreteCapacity = concrete.reduce((sum, question) => sum + capacity(question), 0);
  const totalCapacity = result.questions.reduce((sum, question) => sum + capacity(question), 0);
  assert.ok(2 * concreteCapacity >= totalCapacity, "具体边界题应覆盖至少一半边界容量");
  assert.equal(result.debug.boundary_execution.question_count, concrete.length);
  assert.equal(result.debug.boundary_execution.capacity, concreteCapacity);
  assert.equal(result.debug.boundary_execution.total_capacity, totalCapacity);
  for (const rule of sampler.CONTENT_COVERAGE) {
    const coverage = result.debug.content_coverage[rule.id];
    assert.ok(coverage.count >= (rule.minimumCount ?? 1), rule.id);
    assert.ok(coverage.capacity >= rule.minimumShare * coverage.totalCapacity, rule.id);
    assert.ok(coverage.capacity <= (rule.maximumShare ?? 1) * coverage.totalCapacity, rule.id);
  }
  assert.ok(sampler.validateSelection(result.questions).valid);
  assert.equal(result.debug.selected_question_ids.join(","), ids.join(","));
  maximumAttempt = Math.max(maximumAttempt, result.debug.attempt_count);
  signatures.add([...ids].sort().join(","));
}
assert.ok(signatures.size > 900, "随机性需要来自题组变化");
assert.equal(JSON.stringify(bank), before);
// 扩大到止损至少3题后曾耗尽100次尝试的种子：不得挤占稀缺维度必选来源的题型名额。
for (const seed of [13942, 14931, 16106, 16877, 18019, 412158]) {
  const result = sampler.sampleStratified(bank.questions, 28, seededRandom(seed));
  assert.ok(sampler.validateSelection(result.questions).valid);
  for (const key of Object.keys(sampler.MINIMUM)) {
    const sources = bank.questions.filter((question) => question.status === "valid" && question.dimensions.includes(key));
    if (sources.length === sampler.MINIMUM[key]) {
      assert.ok(sources.every((question) => result.questions.some((selected) => selected.id === question.id)));
    }
  }
}
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
// 止损来源不足三道应明确报错；扩充题池不能替代每轮覆盖约束。
const stopLossIds = bank.questions.filter((question) => question.dimensions.includes("stopLoss")).map((question) => question.id);
assert.equal(stopLossIds.length, 7);
const shortStopLoss = bank.questions.filter((question) => !stopLossIds.slice(2).includes(question.id));
assert.throws(() => sampler.sampleStratified(shortStopLoss), (error) =>
  error.reason === "pool_insufficient" && error.details.some((detail) => detail === "stopLoss 2/3"));

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
// 保留C/D共享组不可行的结构；明确提供新版内容方面，容量检查应通过。
const contentSources = { A01: ["unwanted_intimacy", "boundaries"], A02: ["boundary_request", "boundaries"],
  A03: ["relationship_imbalance", "boundaries"], A04: ["private_disclosure_trust", "calibration"],
  A06: ["trust_first_step", "calibration"], A05: ["apology_without_change", "evidence"],
  A07: ["behavior_inconsistency", "evidence"], A08: ["pressure_to_commit", "boundaries"],
  A09: ["overresponsibility", "boundaries"], A10: ["one_sided_maintenance", "boundaries"] };
for (const question of impossible) {
  const source = contentSources[question.id];
  if (source) question.semantic_group = source[0];
  for (const key of ["boundaries", "calibration", "evidence"]) if (source?.[1] !== key) {
    question.dimensions = question.dimensions.filter((dimension) => dimension !== key);
    question.options.forEach((option) => { delete option.scores[key]; });
  }
}
assert.throws(() => sampler.sampleStratified(impossible, 28, seededRandom(1)), (e) => e.reason === "attempts_exhausted" && e.details.attempt_count === 100);
// 补足四个 D 专属组后有解，仍保留100次重试上限。
const recoverable = structuredClone(impossible);
for (let i = 4; i < 8; i += 1) {
  recoverable.push({ ...structuredClone(impossible.find((q) => q.stratum === "D")),
    id: `D${String(i + 1).padStart(2, "0")}`, semantic_group: `free_d_${i}` });
}
const recovered = sampler.sampleStratified(recoverable, 28, seededRandom(7));
assert.ok(recovered.debug.attempt_count >= 1 && recovered.debug.attempt_count <= 100);
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

// 具体执行证据不足的题池应尽早报告，不靠100次重试掩盖。
const shortExecution = bank.questions.filter((question) =>
  !sampler.BOUNDARY_EXECUTION.semanticGroups.includes(question.semantic_group));
assert.throws(() => sampler.sampleStratified(shortExecution), (error) =>
  error.reason === "pool_insufficient" && error.details.some((detail) => detail.startsWith("boundary_execution ")));

// 旧规则可用但内容覆盖不足的正式题组应被拒绝。
{
  const questions = ["C23", "B04", "B09", "C13", "D01", "C05", "D04", "B14", "A05", "C17", "A19", "A18", "A08", "B03", "C22", "C03", "B12", "D05", "D03", "B15", "A06", "A09", "A10", "A39", "A20", "A25", "A15", "A22"].map((id) => bank.questions.find((question) => question.id === id));
  const result = sampler.validateSelection(questions);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("具体边界执行来源不足")));
}
{
  const questions = ["A05", "A31", "D07", "A27", "C17", "A08", "A39", "C24", "A04", "B03", "D01", "C03", "A29", "D06", "C23", "B09", "C13", "B18", "A16", "B13", "A13", "A10", "B16", "B06", "A25", "C02", "D10", "A36"].map((id) => bank.questions.find((question) => question.id === id));
  const result = sampler.validateSelection(questions);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("边界总容量的 50%")));
}

// 新内容规则同时用于新抽题与旧进度验证，不能恢复覆盖缺失的题组。
for (const rule of sampler.CONTENT_COVERAGE) {
  const missing = sample.questions.map((q) => rule.groups.includes(q.semantic_group) && q.dimensions.includes(rule.dimension)
    ? { ...q, semantic_group: `unclassified_${q.id.toLowerCase()}` } : q);
  const checked = sampler.validateSelection(missing);
  assert.ok(!checked.valid && checked.errors.some((error) => error.includes(rule.id)), rule.id);
  const pool = bank.questions.filter((q) => !(rule.groups.includes(q.semantic_group) && q.dimensions.includes(rule.dimension)));
  assert.throws(() => sampler.sampleStratified(pool), (error) => error.reason === "pool_insufficient" &&
    error.details.some((detail) => detail.startsWith(`${rule.id} `)));
}

// 单一个人界限来源不够；缺题时尽早失败，恢复时也拒绝同版本的旧单题组。
{
  const rule = sampler.CONTENT_COVERAGE.find((entry) => entry.id === "personal_boundary");
  const sources = bank.questions.filter((q) => q.dimensions.includes(rule.dimension) && rule.groups.includes(q.semantic_group));
  assert.equal(sources.length, 2);
  const shortPool = bank.questions.filter((q) => q.id !== sources[0].id);
  assert.throws(() => sampler.sampleStratified(shortPool), (error) =>
    error.reason === "pool_insufficient" && error.details.includes("personal_boundary 1/2"));
  const oneSource = sample.questions.map((q) => q.id === sources[0].id
    ? { ...q, semantic_group: "unclassified_personal" } : q);
  const checked = sampler.validateSelection(oneSource);
  assert.equal(checked.debug.content_coverage.personal_boundary.count, 1);
  assert.ok(!checked.valid && checked.errors.some((error) => error.includes("personal_boundary")));
}
