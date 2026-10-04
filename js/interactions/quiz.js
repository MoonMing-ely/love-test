(function () {
  "use strict";

  const quizPanel = document.querySelector("[data-result-page]");
  const questionSlot = document.querySelector(".question-slot");
  const optionButtons = Array.from(
    document.querySelectorAll("[data-option-index]"),
  );
  const optionsGrid = document.querySelector(".options-grid");
  const resultPage = quizPanel?.dataset.resultPage || "result.html";
  const progressLabel = document.querySelector("#progress-label");
  const progressBar = document.querySelector("#quiz-progress");
  const statusLabel = document.querySelector("#quiz-status");
  /* 测试的固定特征量。修改这些值时，需要同步检查题库校验和结果页。 */
  const SAMPLE_SIZE = 28;
  const QUIZ_STATE_KEY = "deceptionIndexQuizStateV3";
  const QUIZ_RESULT_KEY = "deceptionIndexQuizResultV3";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const selectionLeadInDuration = reduceMotion.matches ? 50 : 110;
  const selectionFeedbackDuration = reduceMotion.matches ? 110 : 276;

  let questionBank = [];
  let dimensionDefinitions = [];
  let questions = [];
  let currentQuestionIndex = 0;
  let answers = [];
  let dimensionVector = window.DimensionVector.create();
  let bankRevision = "";
  let isChangingQuestion = false;

  function setOptionsDisabled(disabled) {
    optionButtons.forEach((button) => {
      button.disabled = disabled;
    });
  }

  function useStorage(action, key, value) {
    try {
      return sessionStorage[action](key, value);
    } catch (cause) {
      const error = new Error("浏览器无法读取或保存测试进度。", { cause });
      error.reason = "storage_unavailable";
      throw error;
    }
  }

  function showError(error, phase) {
    setOptionsDisabled(true);
    isChangingQuestion = true;
    quizPanel.dataset.loadState = "error";
    let message = "测试暂时无法继续，请重新打开页面。";
    if (error.reason === "storage_unavailable") message = "无法读取或保存测试进度，请检查浏览器存储设置后重试。";
    else if (error.reason === "pool_insufficient") message = "有效题目尚未满足测试要求，暂时无法开始测试。";
    else if (error.reason === "attempts_exhausted") message = "暂时无法生成问卷，请重新开始。";
    else if (phase === "load") message = "题库加载失败，请检查网络并通过本地服务器打开页面。";
    else if (phase === "data") message = "题库数据无效，暂时无法开始测试。";
    statusLabel.textContent = message;
    progressLabel.textContent = "测试已暂停";
    console.error(error);
  }

  function readSavedState() {
    const raw = useStorage("getItem", QUIZ_STATE_KEY);
    if (raw === null) return null;
    try { return JSON.parse(raw) ?? { invalid: true }; }
    catch { return { invalid: true }; }
  }

  function saveState(next = { currentQuestionIndex, answers, dimensionVector }) {
    useStorage("setItem", QUIZ_STATE_KEY, JSON.stringify({
      ...next,
      questionIds: questions.map((question) => question.id),
      selectionVersion: window.QuestionSampler.SELECTION_VERSION,
      bankRevision,
    }));
  }

  function scoresMatch(saved, current) {
    return saved && typeof saved === "object" && !Array.isArray(saved)
      && Object.keys(saved).length === Object.keys(current).length
      && Object.entries(current).every(([key, score]) => saved[key] === score);
  }

  function restoreOrSampleQuestions(saved) {
    if (saved && saved.selectionVersion === window.QuestionSampler.SELECTION_VERSION
      && saved.bankRevision === bankRevision
      && Array.isArray(saved.questionIds) && saved.questionIds.length === SAMPLE_SIZE
      && new Set(saved.questionIds).size === SAMPLE_SIZE
      && Number.isInteger(saved.currentQuestionIndex) && saved.currentQuestionIndex >= 0
      && saved.currentQuestionIndex <= SAMPLE_SIZE
      && Array.isArray(saved.answers) && saved.answers.length === saved.currentQuestionIndex) {
      const questionMap = new Map(questionBank.map((question) => [question.id, question]));
      const restored = saved.questionIds.map((id) => questionMap.get(id));
      if (restored.every(Boolean) && window.QuestionSampler.validateSelection(restored).valid
        && saved.answers.every((answer, index) => {
          const option = restored[index].options.find((item) => item.id === answer?.option);
          return answer?.questionId === restored[index].id && option && scoresMatch(answer.scores, option.scores);
        })) {
        questions = restored;
        currentQuestionIndex = saved.currentQuestionIndex;
        answers = saved.answers;
        return;
      }
    }
    const sample = window.QuestionSampler.sampleStratified(questionBank, SAMPLE_SIZE);
    questions = sample.questions;
    currentQuestionIndex = 0;
    answers = [];
    if (saved) statusLabel.textContent = "原测试进度已失效，已为你重新生成问卷。";
  }

  function renderQuestion() {
    const question = questions[currentQuestionIndex];

    if (!question) {
      finishQuiz();
      return;
    }

    quizPanel.dataset.questionId = question.id;
    quizPanel.dataset.questionType = question.stratum;
    progressLabel.textContent = `第 ${currentQuestionIndex + 1} / ${questions.length} 题`;
    progressBar.max = questions.length;
    progressBar.value = currentQuestionIndex + 1;
    questionSlot.textContent = question.prompt;
    questionSlot.setAttribute(
      "aria-label",
      `第 ${currentQuestionIndex + 1} 题：${question.prompt}`,
    );

    questionSlot.classList.remove("is-muted");
    optionsGrid.classList.remove("is-answering");
    optionButtons.forEach((button, optionIndex) => {
      const option = question.options[optionIndex];
      button.classList.remove("is-selected");
      button.textContent = option.text;
      button.dataset.option = option.id;
      button.setAttribute("aria-label", `${option.id}：${option.text}`);
    });

    isChangingQuestion = false;
    setOptionsDisabled(false);
  }

  function finishQuiz() {
    const normalizedDimensions = window.DimensionNormalizer.normalize({
      rawVector: dimensionVector,
      dimensions: dimensionDefinitions,
      questions,
    });
    const layer3Structures =
      window.HigherOrderStructure.aggregate(normalizedDimensions);
    const layer4Evidence = window.Layer4Evidence.fromLayer3(layer3Structures);
    const layer5Mechanisms = window.Layer5Mechanisms.calculate(layer4Evidence);
    /*
     * 这里是答题流程调用评分模块的唯一位置。
     * calculateResult 不读取 DOM，也不重新查询题库，只依赖明确传入的数据。
     */
    const outcome = window.QuizScoring.calculateResult({
      answers,
      dimensions: dimensionDefinitions,
    });
    /*
     * result 是写入 sessionStorage 的结果信封：
     * answers 保留原始选择；各层算法数据和 outcome 分字段保存，便于追踪。
     */
    const result = {
      completed: true,
      questionCount: questions.length,
      questionIds: questions.map((question) => question.id),
      answers,
      dimensionVector: [...dimensionVector],
      normalizedDimensions,
      layer3Structures,
      layer4Evidence,
      layer5Mechanisms,
      outcome,
      completedAt: new Date().toISOString(),
    };

    useStorage("setItem", QUIZ_RESULT_KEY, JSON.stringify(result));
    useStorage("removeItem", QUIZ_STATE_KEY);
    window.location.href = resultPage;
  }

  async function selectOption(optionIndex) {
    if (isChangingQuestion || !questions[currentQuestionIndex]) return;

    const question = questions[currentQuestionIndex];
    const option = question.options[optionIndex];
    if (!option) return;

    isChangingQuestion = true;
    setOptionsDisabled(true);
    const selectedButton = optionButtons[optionIndex];

    await new Promise((resolve) => {
      window.setTimeout(resolve, selectionLeadInDuration);
    });

    selectedButton.classList.add("is-selected");
    questionSlot.classList.add("is-muted");
    optionsGrid.classList.add("is-answering");
    selectedButton.setAttribute("aria-label", `${option.id}：${option.text}，已选择`);

    await new Promise((resolve) => {
      window.setTimeout(resolve, selectionFeedbackDuration);
    });

    try {
      const answer = {
        questionId: question.id,
        option: option.id,
        scores: { ...option.scores },
      };
      const next = {
        answers: [...answers, answer],
        dimensionVector: [...dimensionVector],
        currentQuestionIndex: currentQuestionIndex + 1,
      };
      window.DimensionVector.addOption(next.dimensionVector, answer.scores, dimensionDefinitions);
      saveState(next);
      answers = next.answers;
      dimensionVector = next.dimensionVector;
      currentQuestionIndex = next.currentQuestionIndex;
      if (currentQuestionIndex >= questions.length) finishQuiz();
      else renderQuestion();
    } catch (error) {
      showError(error, "answer");
    }
  }

  async function startQuiz() {
    const params = new URLSearchParams(window.location.search);
    setOptionsDisabled(true);
    let phase = "load";
    try {
      const response = await fetch("../data/questions.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`题库加载失败：HTTP ${response.status}`);
      const data = await response.json();
      phase = "data";
      window.QuestionSampler.assertQuestionBank(data);
      questionBank = data.questions;
      dimensionDefinitions = data.dimensions;
      bankRevision = data.bankRevision;
      let saved = null;
      if (params.get("restart") === "1") {
        useStorage("removeItem", QUIZ_STATE_KEY);
        useStorage("removeItem", QUIZ_RESULT_KEY);
        window.history.replaceState({}, "", "text.html");
      } else {
        saved = readSavedState();
      }
      phase = "generate";
      restoreOrSampleQuestions(saved);
      dimensionVector = window.DimensionVector.fromAnswers(answers, dimensionDefinitions);
      saveState();
      quizPanel.dataset.loadState = "ready";
      if (currentQuestionIndex >= questions.length) finishQuiz();
      else renderQuestion();
    } catch (error) {
      showError(error, phase);
    }
  }

  optionButtons.forEach((button, optionIndex) => {
    button.addEventListener("click", () => selectOption(optionIndex));
  });

  startQuiz();
})();
