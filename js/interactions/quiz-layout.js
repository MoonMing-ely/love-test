(function () {
  "use strict";

  const page = document.querySelector(".quiz-page");
  const frame = document.querySelector(".quiz-frame");
  const panel = document.querySelector(".quiz-panel");
  const question = document.querySelector(".question-slot");
  const prompt = document.querySelector(".question-prompt");
  const options = document.querySelector(".options-grid");
  const status = document.querySelector("#quiz-status");
  const gap = document.querySelector(".quiz-divider:not(.quiz-bottom-divider)");
  const bottomGap = document.querySelector(".quiz-bottom-divider");
  const footer = document.querySelector(".quiz-footer");
  const topActions = document.querySelector(".quiz-header .top-actions");
  let scheduled = false;
  let referenceSpacing = null;
  let wrappedText = null;
  let wrappedPromptNode = null;
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh-CN", { granularity: "word" }) : null;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const number = (style, property) => parseFloat(style.getPropertyValue(property));

  function wrapPrompt() {
    const text = prompt.textContent;
    if (text === wrappedText && prompt.firstChild === wrappedPromptNode) return;
    wrappedText = text;
    if (segmenter) {
      const nodes = [];
      for (const { segment } of segmenter.segment(text)) {
        // 仅保护简短数字或拉丁字母组合；普通中文允许逐字自然断行。
        if (!/^[\p{Script=Latin}\p{N}]{2,4}$/u.test(segment)) {
          nodes.push(segment);
          continue;
        }
        const word = document.createElement("span");
        word.className = "question-word";
        word.textContent = segment;
        nodes.push(word);
      }
      prompt.replaceChildren(...nodes);
    }
    wrappedPromptNode = prompt.firstChild;
  }

  function getReferenceSpacing() {
    if (referenceSpacing) return referenceSpacing;
    // 让浏览器解析原 svh/clamp 基准，避免把动态视口高度误当作小视口高度。
    // 临时测量节点不参与文档流，读取后立即移除，不留下空白占位元素。
    const frameStyle = getComputedStyle(frame);
    const strokeScale = number(getComputedStyle(page), "--stroke-scale");
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;width:0;box-sizing:content-box;height:var(--quiz-reference-page-bottom);padding-bottom:var(--quiz-reference-frame-bottom);border-style:solid;";
    // 宽度读取题框最低高度基准，不测量当前长题的实际高度。
    probe.style.width = getComputedStyle(question).getPropertyValue("--question-min-height");
    // 使用独立节点读取两种边框，避免复用时沿用已取整的像素值。
    probe.style.borderWidth = `calc(${frameStyle.getPropertyValue("--quiz-frame-stroke")} / ${strokeScale})`;
    frame.append(probe);
    probe.getBoundingClientRect();
    const style = getComputedStyle(probe);
    referenceSpacing = { pageBottom: number(style, "height"), frameBottom: number(style, "padding-bottom"), frameBorder: number(style, "border-top-width"), questionMinHeight: number(style, "width") };
    const optionProbe = probe.cloneNode();
    optionProbe.style.borderWidth = getComputedStyle(options.firstElementChild).getPropertyValue("--quiz-option-stroke-reference");
    frame.append(optionProbe);
    optionProbe.getBoundingClientRect();
    referenceSpacing.optionBorder = number(getComputedStyle(optionProbe), "border-top-width");
    optionProbe.remove();
    probe.remove();
    return referenceSpacing;
  }

  function setLength(element, property, value) {
    const length = `${Math.round(value * 1000) / 1000}px`;
    if (element.style.getPropertyValue(property) !== length) element.style.setProperty(property, length);
  }

  function updateLayout() {
    wrapPrompt();
    setLength(question, "--question-prompt-offset", question.getBoundingClientRect().height * 0.02);
    const reference = getReferenceSpacing();
    const frameBorder = number(getComputedStyle(frame), "border-bottom-width");
    const optionBorder = number(getComputedStyle(options.firstElementChild), "border-top-width");
    setLength(frame, "--quiz-frame-stroke-reference-used", reference.frameBorder);
    setLength(frame, "--quiz-frame-stroke-used", frameBorder);
    setLength(panel, "--quiz-option-border-reference-used", reference.optionBorder);
    setLength(panel, "--quiz-option-border-used", optionBorder);
    const pageStyle = getComputedStyle(page);
    const frameStyle = getComputedStyle(frame);
    const panelStyle = getComputedStyle(panel);
    // 底部基准只依赖视口与四个短按钮，不能随题干或选项长度漂移。
    const referenceOptionHeight = number(pageStyle, "--quiz-option-min-height") * options.childElementCount +
      number(pageStyle, "--quiz-option-gap-base") * (options.childElementCount - 1);
    const reserved = number(pageStyle, "padding-top") + reference.pageBottom +
      number(frameStyle, "padding-top") - reference.frameBorder + frameBorder + reference.frameBottom +
      reference.frameBorder * 2;
    const oldFooterHeight = 36;
    const referenceProgressHeight = number(pageStyle, "--quiz-progress-reference-height");
    const hiddenFooterSpace = (oldFooterHeight - referenceProgressHeight) / 2;
    const available = window.innerHeight - reserved - oldFooterHeight -
      reference.questionMinHeight - referenceOptionHeight;
    const aMin = number(panelStyle, "--quiz-reference-a-min");
    const aMax = number(panelStyle, "--quiz-reference-a-max");
    const bMin = number(panelStyle, "--quiz-reference-b-min");
    const bMax = number(panelStyle, "--quiz-reference-b-max");
    // 原预算只用于还原底部基准；实际剩余高度再按统一比例在 A 轨道与底部区域分配。
    const budget = Math.round(clamp(available, aMin + bMin, aMax + bMax) * 100) / 100;
    const a = clamp(budget * 2 / 3, Math.max(aMin, budget - bMax), Math.min(aMax, budget - bMin));
    const b = budget - a;
    // 未注册自定义属性保留 calc 表达式，从伪元素读取实际使用的长度。
    const usedLineHeight = number(getComputedStyle(bottomGap, "::before"), "height");
    const referenceLineHeight = usedLineHeight / number(pageStyle, "--stroke-scale");
    const scale = number(pageStyle, "--quiz-bottom-space-scale");
    setLength(panel, "--quiz-bottom-before-line", (b - usedLineHeight) / 2);
    setLength(panel, "--quiz-line-progress-space", (b / 2 + hiddenFooterSpace - referenceLineHeight / 2) * scale + (referenceLineHeight - usedLineHeight) / 2);
    setLength(frame, "--quiz-frame-bottom-space", (reference.frameBottom + reference.frameBorder + hiddenFooterSpace) * scale - frameBorder);

    // 将原题目→选项实际留白的一半转入选项→进度区域，保持底部锚点。
    // 以最低外框高度和自然内容高度计算，不读取已转移后的 A 轨道，避免反馈循环。
    const gapScale = number(panelStyle, "--quiz-gap-scale");
    const previousTransfer = number(panelStyle, "--quiz-gap-transfer");
    const bottomSpace = number(getComputedStyle(bottomGap), "height") - previousTransfer;
    const minimumGap = number(getComputedStyle(gap), "min-height") / gapScale;
    const targetHeight = number(frameStyle, "min-height") - number(frameStyle, "padding-top") -
      number(frameStyle, "padding-bottom") - frameBorder * 2;
    const statusStyle = getComputedStyle(status);
    const statusHeight = statusStyle.display === "none" ? 0 : status.getBoundingClientRect().height +
      number(statusStyle, "margin-top") + number(statusStyle, "margin-bottom");
    // 按钮间距加宽仅向组尾展开，组首位置沿用加宽前的留白预算。
    const optionGapScale = number(pageStyle, "--quiz-option-gap-scale");
    const extraOptionGap = number(getComputedStyle(options), "row-gap") * (1 - 1 / optionGapScale) *
      (options.childElementCount - 1);
    const fixedHeight = question.getBoundingClientRect().height + options.getBoundingClientRect().height - extraOptionGap +
      statusHeight + footer.getBoundingClientRect().height + bottomSpace;
    const originalGap = Math.max(minimumGap, targetHeight - fixedHeight);
    setLength(panel, "--quiz-gap-transfer", Math.max(0, originalGap * (1 - gapScale) - extraOptionGap));
    if (topActions) {
      // 以未动画的正文顶边定位上栏，避免前卡入场时带动横线。
      const pageTop = page.getBoundingClientRect().top;
      const circlesBottom = topActions.getBoundingClientRect().bottom - pageTop;
      const questionTop = frame.getBoundingClientRect().top - pageTop +
        number(frameStyle, "padding-top") + frameBorder;
      setLength(page, "--quiz-topbar-bottom", (circlesBottom + questionTop) / 2);
    }
  }

  function scheduleLayout() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      updateLayout();
    });
  }

  const observer = new ResizeObserver(scheduleLayout);
  for (const element of [question, prompt, options, status, footer]) observer.observe(element, { box: "border-box" });
  if (topActions) observer.observe(topActions, { box: "border-box" });
  const promptObserver = new MutationObserver(records => {
    if (records.some(record => record.type === "attributes") ||
      prompt.textContent !== wrappedText || prompt.firstChild !== wrappedPromptNode) scheduleLayout();
  });
  promptObserver.observe(prompt, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["style"] });
  window.addEventListener("resize", () => {
    referenceSpacing = null;
    scheduleLayout();
  });
  document.fonts.ready.then(scheduleLayout);
  document.fonts.addEventListener("loadingdone", scheduleLayout);
  scheduleLayout();
})();
