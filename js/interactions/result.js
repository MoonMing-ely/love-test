(function () {
  "use strict";

  const resultFrame = document.querySelector(".result-frame");
  const resultContent = document.querySelector(".result-content");
  const emptyContent = document.querySelector(".result-empty");
  const title = document.querySelector("#result-title");
  const summary = document.querySelector("#result-summary");
  const QUIZ_RESULT_KEY = "deceptionIndexQuizResultV3";
  /* 占位结果和你以后实现的正式评分结果都使用同一个结果页接口。 */
  const supportedOutcomeStatuses = new Set(["scoring-placeholder", "scored"]);

  try {
    const result = JSON.parse(sessionStorage.getItem(QUIZ_RESULT_KEY));
    const uniqueIds = new Set(result?.questionIds);
    const complete =
      result?.completed === true &&
      result?.questionCount === 28 &&
      result?.answers?.length === 28 &&
      uniqueIds.size === 28 &&
      supportedOutcomeStatuses.has(result?.outcome?.status) &&
      result?.outcome?.dimensionCount === 12 &&
      typeof result?.outcome?.title === "string" &&
      typeof result?.outcome?.summary === "string";

    resultFrame.dataset.resultState = complete ? "complete" : "empty";
    resultContent.hidden = !complete;
    emptyContent.hidden = complete;

    if (complete) {
      title.textContent = result.outcome.title;
      summary.textContent = result.outcome.summary;
    }
  } catch {
    resultFrame.dataset.resultState = "empty";
    resultContent.hidden = true;
    emptyContent.hidden = false;
  }
})();
