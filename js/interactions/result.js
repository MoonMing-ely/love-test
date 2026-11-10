(function () {
  "use strict";

  const frame = document.querySelector(".result-frame");
  const content = document.querySelector(".result-content");
  const empty = document.querySelector(".result-empty");
  const title = document.querySelector("#result-title");
  const summary = document.querySelector("#result-summary");
  const score = document.querySelector("#result-score");
  const degree = document.querySelector("#result-degree");
  const direction = document.querySelector("#result-direction");
  const copyBody = document.querySelector("#result-copy");
  const closing = document.querySelector("#result-closing");
  const note = document.querySelector("#result-note");
  const highlights = document.querySelector("#result-highlights");
  const overview = document.querySelector("#result-overview");
  const abilities = document.querySelector("#result-abilities");
  const readingTitle = document.querySelector("#result-reading-title");
  const layout = document.querySelector("#result-layout");
  const statuses = new Set(["scoring-placeholder", "scored", "insufficient_data"]);

  function renderCopy(result) {
    const copy = globalThis.ResultCopy?.build(result);
    if (!copy || copy.status === "unavailable") {
      if (copy && !["missing_dependency", "unsupported_algorithm"].includes(copy.reason)) {
        throw new Error("结果解读所需记录无效。");
      }
      frame.dataset.copyState = "unavailable";
      summary.textContent = copy?.message || "特点说明暂时无法加载，请刷新页面重试。";
      return;
    }
    frame.dataset.copyState = copy.status;
    score.textContent = copy.scoreText;
    degree.textContent = copy.degreeText;
    direction.textContent = copy.directionText;
    summary.textContent = copy.opening;
    for (const item of copy.highlights) {
      const tag = document.createElement("li");
      tag.textContent = item.text;
      highlights.append(tag);
    }
    highlights.hidden = !copy.highlights.length;
    for (const item of copy.abilities) {
      const row = document.createElement("div");
      row.className = "result-ability";
      const label = document.createElement("span");
      label.textContent = item.label;
      const description = document.createElement("span");
      description.className = "result-ability-description";
      description.textContent = item.description;
      const meter = document.createElement("meter");
      meter.min = 0;
      meter.max = 1;
      meter.value = item.value;
      meter.setAttribute("aria-label", `${item.label}：${item.description}`);
      row.append(label, description, meter);
      abilities.append(row);
    }
    overview.hidden = !copy.abilities.length;
    readingTitle.hidden = !copy.paragraphs.length;
    layout.hidden = false;
    for (const text of copy.paragraphs) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      copyBody.append(paragraph);
    }
    closing.textContent = copy.closing;
    note.textContent = copy.note;
    degree.hidden = copyBody.hidden = note.hidden = false;
    direction.hidden = !copy.directionText;
    closing.hidden = !copy.closing;
  }

  try {
    const result = JSON.parse(sessionStorage.getItem("deceptionIndexQuizResultV3"));
    const complete = result?.completed === true && result.questionCount === 28 &&
      Array.isArray(result.questionIds) && result.questionIds.length === 28 &&
      result.questionIds.every((id) => typeof id === "string" && /^[A-D]\d{2,}$/u.test(id)) &&
      new Set(result.questionIds).size === 28 && Array.isArray(result.answers) && result.answers.length === 28 &&
      result.answers.every((answer, index) => answer?.questionId === result.questionIds[index] && /^[A-D]$/u.test(answer?.option)) &&
      result.outcome?.version === 3 && result.outcome.dimensionCount === 12 && statuses.has(result.outcome.status) &&
      typeof result.outcome.title === "string" && typeof result.outcome.summary === "string";
    if (!complete) throw new Error("测试记录不完整。");

    title.textContent = result.outcome.title;
    summary.textContent = result.outcome.summary;
    score.hidden = true;
    if (result.outcome.status === "scoring-placeholder" ||
        (result.layer6Integration && result.layer6Integration.version !== AlgorithmConfig.VERSION)) {
      frame.dataset.resultState = "legacy";
      summary.textContent = "这份记录使用旧版算法，请点击重测一次，按当前算法重新测试。";
    } else {
      const sixth = result.layer6Integration;
      if (!sixth || !["complete", "insufficient_data"].includes(sixth.status) || !Array.isArray(sixth.paths) ||
          !result.layer3Structures || !result.layer4Evidence || !result.layer5Mechanisms ||
          !Array.isArray(result.dimensions) || result.dimensions.length !== 12 ||
          !Array.isArray(result.dimensionVector) || result.dimensionVector.length !== 12) throw new Error("分层记录不完整。");
      if (result.outcome.status === "scored") {
        const anchors = AlgorithmConfig.LAYER6.SCORE_ANCHORS;
        if (sixth.status !== "complete" || !Number.isFinite(result.outcome.totalScore) ||
            result.outcome.totalScore < anchors[0].score || result.outcome.totalScore > anchors[anchors.length - 1].score ||
            result.outcome.totalScore !== sixth.totalScore || ![1, 2, 3, 4].includes(sixth.stage) ||
            result.outcome.stage !== sixth.stage ||
            sixth.stage !== [30, 50, 70].filter((bound) => result.outcome.totalScore >= bound).length + 1 ||
            !sixth.debug || sixth.debug.allPaths.length !== 4 ||
            !Number.isFinite(sixth.debug.evidenceScore) || sixth.debug.evidenceScore < anchors[0].evidence ||
            sixth.debug.evidenceScore > anchors[anchors.length - 1].evidence) {
          throw new Error("最终分记录无效。");
        }
        score.textContent = `${(Math.floor(result.outcome.totalScore * 100) / 100).toFixed(2)} 分`;
        score.hidden = false;
        frame.dataset.resultState = "complete";
        title.textContent = globalThis.ResultCopyCatalog?.pageTitle || "你的被骗指数是：";
        renderCopy(result);
      } else {
        if (sixth.status !== "insufficient_data" || result.outcome.totalScore !== null || sixth.totalScore !== null) {
          throw new Error("数据不足记录无效。");
        }
        frame.dataset.resultState = "insufficient_data";
        summary.textContent = "这次的信息还不够，请重新完成测试。";
      }
    }
    content.hidden = false;
    empty.hidden = true;
  } catch {
    frame.dataset.resultState = "empty";
    content.hidden = true;
    empty.hidden = false;
    for (const node of [score, degree, direction, copyBody, closing, note, highlights, overview, readingTitle, layout]) node.hidden = true;
  }
})();
