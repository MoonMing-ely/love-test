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
const approvedQuestions = [
  [
    "A40",
    "relationship_pressure",
    "当别人用“如果你真的在乎我，就应该……”来要求我做某件事时，我偏向清晰地保持自己的判断。",
    [
      "80%–90%",
      "60%–70%",
      "30%–40%",
      "10%–20%"
    ],
    [
      3,
      2,
      1,
      0
    ]
  ],
  [
    "C22",
    "responsibility_shift",
    "如果对方做错事后反过来说“都是因为你让我没有安全感”，你更倾向怎样回应？",
    [
      "先判断自己的问题，淡化对方原本的行为",
      "觉得双方都有责任，很难再单独判断那件事",
      "听他的解释，单独判断他的行为是否合理",
      "明确区分“为什么这样做”和“这样做是否合理”"
    ],
    [
      0,
      1,
      2,
      3
    ]
  ],
  [
    "C23",
    "care_justifies_control",
    "一个人总说：“我不是要控制你，我只是太在乎你，所以才希望你少和那些人来往。”你更倾向认为：",
    [
      "只是很在乎这段关系",
      "可能缺安全感，所以可以理解",
      "在乎是真的，但也在合理化限制行为",
      "“在乎”不能证明合理，需单独判断是否限制对方"
    ],
    [
      0,
      1,
      2,
      3
    ]
  ],
  [
    "C24",
    "relationship_pressure",
    "某个人在你拒绝一件事后说：“没事，你不愿意就算了，我只是没想到我们关系这么好，你还是会这么对我。”你更倾向怎么理解？",
    [
      "只是受伤了，我应该再考虑一下",
      "在表达失望，我可能真的有点过分",
      "可能真的难过，但这句话会给我额外的压力",
      "分开他的失望和我的决定，不因这种话重新判断原来回答"
    ],
    [
      0,
      1,
      2,
      3
    ]
  ]
];
for (const [id, group, prompt, options, scores] of approvedQuestions) {
  const q = questionsById.get(id);
  assert.equal(q.prompt, prompt);
  assert.equal(q.stratum, id[0]);
  assert.equal(q.status, "valid");
  assert.equal(q.semantic_group, group);
  assert.deepEqual(q.dimensions, ["manipulation"]);
  assert.deepEqual(q.options.map((o) => o.text), options);
  assert.deepEqual(q.options.map((o) => o.scores), scores.map((score) => ({ manipulation: score })));
}
assert.equal(questionBank.questions.length, 96);
assert.equal(questionBank.questions.filter((q) => q.status === "valid").length, 77);
assert.equal(questionBank.questions.filter((q) => q.status === "review").length, 19);
assert.deepEqual(Object.fromEntries(questionBank.strata.map((s) => [s.key, s.questionCount])), { A: 40, B: 21, C: 24, D: 11 });
console.log("Question bank tests passed.");
