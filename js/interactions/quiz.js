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
  /* 测试的固定特征量。修改这些值时，需要同步检查题库校验和结果页。 */
  const QUESTION_BANK_SIZE = 92;
  const SAMPLE_SIZE = 28;
  const DIMENSION_COUNT = 12;
  const OPTION_IDS = Object.freeze(["A", "B", "C", "D"]);
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
  let savedQuestionIds = [];
  let isChangingQuestion = false;

  function setOptionsDisabled(disabled) {
    optionButtons.forEach((button) => {
      button.disabled = disabled;
    });
  }

  function readSavedState() {
    try {
      const savedState = JSON.parse(sessionStorage.getItem(QUIZ_STATE_KEY));

      if (
        savedState &&
        Number.isInteger(savedState.currentQuestionIndex) &&
        savedState.currentQuestionIndex >= 0 &&
        savedState.currentQuestionIndex <= SAMPLE_SIZE &&
        Array.isArray(savedState.answers) &&
        savedState.answers.length === savedState.currentQuestionIndex &&
        Array.isArray(savedState.questionIds)
      ) {
        currentQuestionIndex = savedState.currentQuestionIndex;
        answers = savedState.answers;
        savedQuestionIds = savedState.questionIds;
      }
    } catch {
      sessionStorage.removeItem(QUIZ_STATE_KEY);
    }
  }

  function saveState() {
    sessionStorage.setItem(
      QUIZ_STATE_KEY,
      JSON.stringify({
        currentQuestionIndex,
        answers,
        dimensionVector,
        questionIds: questions.map((question) => question.id),
      }),
    );
  }

  function validateQuestionBank(data) {
    const questionsToValidate = data?.questions;
    const ids = new Set(questionsToValidate?.map((question) => question.id));
    const dimensionKeys = new Set(
      data?.dimensions?.map((dimension) => dimension.key),
    );

    /*
     * scores 是稀疏的 12 维分值向量，例如 { recognition: 2 }。
     * null 用于兼容未配置分数；未出现的维度按 0 理解。
     */
    const hasValidScores = (scores) =>
      scores === null ||
      (scores &&
        typeof scores === "object" &&
        !Array.isArray(scores) &&
        Object.entries(scores).every(
          ([dimensionKey, score]) =>
            dimensionKeys.has(dimensionKey) && Number.isFinite(score),
        ));

    return (
      data?.version === 3 &&
      ["placeholder", "configured"].includes(data?.scoringStatus) &&
      Array.isArray(data?.dimensions) &&
      data.dimensions.length === DIMENSION_COUNT &&
      dimensionKeys.size === DIMENSION_COUNT &&
      Array.isArray(questionsToValidate) &&
      questionsToValidate.length === QUESTION_BANK_SIZE &&
      ids.size === QUESTION_BANK_SIZE &&
      questionsToValidate.every(
        (question) =>
          /^[A-D]\d{2}$/u.test(question.id) &&
          question.stratum === question.id[0] &&
          typeof question.prompt === "string" &&
          Array.isArray(question.options) &&
          question.options.length === 4 &&
          question.options.every(
            (option, optionIndex) =>
              option.id === OPTION_IDS[optionIndex] &&
              typeof option.text === "string" &&
              hasValidScores(option.scores),
          ),
      )
    );
  }

  function restoreOrSampleQuestions() {
    if (savedQuestionIds.length === SAMPLE_SIZE) {
      const questionMap = new Map(
        questionBank.map((question) => [question.id, question]),
      );
      const restored = savedQuestionIds.map((id) => questionMap.get(id));
      if (
        restored.every(Boolean) &&
        new Set(savedQuestionIds).size === SAMPLE_SIZE
      ) {
        questions = restored;
        return;
      }
    }

    const sample = window.QuestionSampler.sampleStratified(
      questionBank,
      SAMPLE_SIZE,
    );
    questions = sample.questions;
    currentQuestionIndex = 0;
    answers = [];
    saveState();
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

    sessionStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify(result));
    sessionStorage.removeItem(QUIZ_STATE_KEY);
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

    const answer = {
      questionId: question.id,
      option: option.id,
      /* 保存所选分值的快照，避免题库变化影响本轮结果。 */
      scores: option.scores === null ? null : { ...option.scores },
    };
    answers[currentQuestionIndex] = answer;
    window.DimensionVector.addOption(
      dimensionVector,
      answer.scores,
      dimensionDefinitions,
    );
    currentQuestionIndex += 1;
    saveState();

    if (currentQuestionIndex >= questions.length) {
      finishQuiz();
      return;
    }

    renderQuestion();
  }

  async function startQuiz() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("restart") === "1") {
      sessionStorage.removeItem(QUIZ_STATE_KEY);
      sessionStorage.removeItem(QUIZ_RESULT_KEY);
      window.history.replaceState({}, "", "text.html");
    } else {
      readSavedState();
    }

    setOptionsDisabled(true);

    try {
      const response = await fetch("../data/questions.json", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`题库加载失败：HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!validateQuestionBank(data)) {
        throw new Error("题库必须包含 92 道唯一题目、12 个占位维度和四个选项。");
      }

      questionBank = data.questions;
      dimensionDefinitions = data.dimensions;
      restoreOrSampleQuestions();
      /* 刷新页面后，根据已保存的答案重新建立第一层 12 维累计数据。 */
      dimensionVector = window.DimensionVector.fromAnswers(
        answers,
        dimensionDefinitions,
      );
      saveState();

      if (currentQuestionIndex >= questions.length) {
        finishQuiz();
        return;
      }

      renderQuestion();
    } catch (error) {
      quizPanel.dataset.loadState = "error";
      questionSlot.setAttribute("aria-label", "题库加载失败");
      questionSlot.textContent = "题目加载失败，请通过本地服务器打开页面后重试。";
      console.error(error);
    }
  }

  optionButtons.forEach((button, optionIndex) => {
    button.addEventListener("click", () => selectOption(optionIndex));
  });

  startQuiz();
})();
