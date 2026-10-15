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
});
assert.deepEqual(questionsById.get("C03").options[2].scores, {
  scarcity: 0,
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
assert.equal(questionsById.get("A29").status, "valid");
assert.equal(questionsById.get("C05").status, "valid");
const approvedQuestions = [
  [
    "A40",
    "relationship_pressure",
    "当别人用“如果你真的在乎我，就应该……”来要求我做某件事时，我能保持自己的判断。",
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
    "恋人背着你和别人暧昧，被发现后说：“都是因为你让我没有安全感。”你如何回应？",
    [
      "我没让你安心，以后会多关心你。",
      "我们都有问题，这件事就别互相怪了。",
      "缺安全感可以说，不能背着我和别人暧昧。",
      "你跟别人暧昧，还怪我？"
    ],
    [
      0,
      1,
      3,
      3
    ]
  ],
  [
    "C23",
    "care_justifies_control",
    "恋人希望你少和朋友来往，说：“我不是要控制你，只是太在乎你。”你会怎么回应？",
    [
      "你在乎我，我少和他们来往就是了。",
      "你可能没安全感，我先少联系朋友让你放心。",
      "担心可以说，但我不想疏远朋友。",
      "在乎我，就可以管我和谁来往吗？"
    ],
    [
      0,
      1,
      3,
      3
    ]
  ],
  [
    "C24",
    "relationship_pressure",
    "朋友找你帮忙，你因有事拒绝。TA说：“没想到我们关系这么好，你还这么对我。”你会怎么回应？",
    [
      "我改下安排，还是来帮你吧。",
      "看能不能挤点时间，尽量帮你。",
      "这次真的没空，不是不把你当朋友。",
      "关系好就不能拒绝吗？这次帮不了。"
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
assert.equal(questionBank.questions.length, 85);
assert.equal(questionBank.questions.filter((q) => q.status === "valid").length, 85);
assert.equal(questionBank.questions.filter((q) => q.status === "review").length, 0);
assert.deepEqual(Object.fromEntries(questionBank.strata.map((s) => [s.key, s.questionCount])), { A: 35, B: 15, C: 24, D: 11 });
for (const [id, group, prompt, scores] of [
  ["C25", "post_breakup_care", "你已和TA分开，原来的问题也没改善。TA深夜又来诉苦，你会怎么做？", [3, 1, 0, 3]],
  ["C26", "explicit_rejection_exit", "TA明确说只想做朋友，你仍喜欢TA。接下来你更可能怎么做？", [3, 0, 3, 1]],
]) {
  const question = questionsById.get(id);
  assert.equal(question.prompt, prompt);
  assert.equal(question.status, "valid");
  assert.equal(question.semantic_group, group);
  assert.deepEqual(question.dimensions, ["stopLoss"]);
  assert.deepEqual(question.options.map((option) => option.scores), scores.map((score) => ({ stopLoss: score })));
}
console.log("Question bank tests passed.");
