import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const scoringSource = await readFile(
  new URL("../js/scoring.js", import.meta.url),
  "utf8",
);
const quizSource = await readFile(
  new URL("../js/interactions/quiz.js", import.meta.url),
  "utf8",
);
const dimensionVectorSource = await readFile(
  new URL("../js/core-algorithm/dimension-vector.js", import.meta.url),
  "utf8",
);
const dimensionNormalizerSource = await readFile(
  new URL("../js/core-algorithm/second-layer-normalizer.js", import.meta.url),
  "utf8",
);
const higherOrderStructureSource = await readFile(
  new URL("../js/core-algorithm/third-layer-aggregator.js", import.meta.url),
  "utf8",
);
const algorithmConfigSource = await readFile(
  new URL("../js/core-algorithm/algorithm-config.js", import.meta.url),
  "utf8",
);
const layer4EvidenceSource = await readFile(
  new URL("../js/core-algorithm/fourth-layer-evidence.js", import.meta.url),
  "utf8",
);
const layer5MechanismsSource = await readFile(
  new URL("../js/core-algorithm/fifth-layer-mechanisms.js", import.meta.url),
  "utf8",
);
const questionData = JSON.parse(
  await readFile(new URL("../data/questions.json", import.meta.url), "utf8"),
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

function createElement(dataset = {}) {
  const listeners = new Map();
  return {
    dataset,
    disabled: false,
    textContent: "",
    classList: {
      add() {},
      remove() {},
    },
    setAttribute() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    click() {
      listeners.get("click")?.();
    },
  };
}

async function testQuizToScoringBoundary() {
  const data = structuredClone(questionData);
  data.questions.forEach((question) => {
    question.options.forEach((option) => {
      option.scores = null;
    });
  });
  data.questions[0].options[0].scores = { recognition: 2 };

  const quizPanel = createElement({ resultPage: "result.html" });
  const questionSlot = createElement();
  const optionButtons = Array.from({ length: 4 }, () => createElement());
  const optionsGrid = createElement();
  const progressLabel = createElement();
  const progressBar = createElement();
  const storage = new Map();
  let scoringInput = null;

  const context = vm.createContext({
    URLSearchParams,
    console,
    document: {
      querySelector(selector) {
        return {
          "[data-result-page]": quizPanel,
          ".question-slot": questionSlot,
          ".options-grid": optionsGrid,
          "#progress-label": progressLabel,
          "#quiz-progress": progressBar,
        }[selector];
      },
      querySelectorAll() {
        return optionButtons;
      },
    },
    fetch: async () => ({
      ok: true,
      json: async () => data,
    }),
    history: { replaceState() {} },
    location: { href: "text.html", search: "" },
    matchMedia: () => ({ matches: false }),
    QuestionSampler: {
      sampleStratified(questions, sampleSize) {
        return { questions: questions.slice(0, sampleSize), allocation: {} };
      },
    },
    QuizScoring: {
      calculateResult(input) {
        scoringInput = input;
        return {
          version: 3,
          status: "scoring-placeholder",
          dimensionCount: 12,
          totalScore: null,
          dimensionScores: null,
          title: "完成",
          summary: "未计分",
        };
      },
    },
    sessionStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    setTimeout(callback) {
      callback();
    },
  });
  context.window = context;

  vm.runInContext(dimensionVectorSource, context);
  vm.runInContext(dimensionNormalizerSource, context);
  vm.runInContext(higherOrderStructureSource, context);
  vm.runInContext(algorithmConfigSource, context);
  vm.runInContext(layer4EvidenceSource, context);
  vm.runInContext(layer5MechanismsSource, context);
  vm.runInContext(quizSource, context);

  async function flushPromises() {
    for (let pass = 0; pass < 6; pass += 1) {
      await Promise.resolve();
    }
  }

  await flushPromises();
  for (let index = 0; index < 28; index += 1) {
    optionButtons[0].click();
    await flushPromises();
  }

  assert.ok(scoringInput, "完成28题后应调用评分接口");
  assert.equal(scoringInput.answers.length, 28);
  assert.equal(scoringInput.dimensions.length, 12);
  assert.deepEqual(
    JSON.parse(JSON.stringify(scoringInput.answers[0].scores)),
    { recognition: 2 },
  );
  const storedResult = JSON.parse(storage.get("deceptionIndexQuizResultV3"));
  assert.equal(storedResult.dimensionVector.length, 12);
  assert.deepEqual(storedResult.dimensionVector, [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(storedResult.normalizedDimensions.traits.recognition, 1);
  assert.equal(storedResult.normalizedDimensions.special.differentiation, null);
  assert.equal(storedResult.normalizedDimensions.exposure.boundary, null);
  assert.equal(storedResult.layer3Structures.version, "1.1");
  assert.equal(storedResult.layer3Structures.E.summary, null);
  assert.equal(storedResult.layer3Structures.E.subScores.recognition, 100);
  assert.equal(storedResult.layer3Structures.E.subScores.need, null);
  assert.equal(storedResult.layer3Structures.E.peak, null);
  assert.equal(storedResult.layer3Structures.R, null);
  assert.equal("diagnostics" in storedResult.layer3Structures, false);
  assert.equal("totalScore" in storedResult.layer3Structures, false);
  assert.equal(storedResult.layer4Evidence.version, "1.0");
  assert.equal(storedResult.layer4Evidence.status, "insufficient_data");
  assert.equal(storedResult.layer4Evidence.recognition, 1);
  assert.equal(storedResult.layer4Evidence.need, null);
  assert.equal(storedResult.layer5Mechanisms.version, "1.0");
  assert.equal(storedResult.layer5Mechanisms.status, "insufficient_data");
  assert.equal(
    storedResult.layer5Mechanisms.P1_relation_value_amplification,
    null,
  );
  assert.equal(context.location.href, "result.html");
}

testScoringContract();
await testQuizToScoringBoundary();

console.log("Scoring interface tests passed.");
