(function () {
  "use strict";

  const frame = document.querySelector(".quiz-frame");
  const panel = document.querySelector(".quiz-panel");
  const question = document.querySelector(".question-slot");
  const options = document.querySelector(".options-grid");
  const progress = document.querySelector("#quiz-progress");
  const upperDivider = document.querySelector(".quiz-panel > .quiz-divider");
  const bottomDivider = document.querySelector(".quiz-bottom-divider");

  function positionBottomDivider() {
    const frameRect = frame.getBoundingClientRect();
    const optionsBottom = options.getBoundingClientRect().bottom;
    const gap = progress.getBoundingClientRect().top - optionsBottom;
    const lineHeight = upperDivider.getBoundingClientRect().height;

    // 从原来的 40% 处下移空白高度的 20%，即从选项底部起的 60% 处。
    bottomDivider.hidden = gap < lineHeight * 2;
    bottomDivider.style.top = `${optionsBottom + gap * 0.6 - frameRect.top - frame.clientTop - lineHeight / 2}px`;
    bottomDivider.style.width = `${upperDivider.getBoundingClientRect().width}px`;
  }

  // 换题、选项换行、字体加载和窗口变化都可能改变空白高度。
  const observer = new ResizeObserver(positionBottomDivider);
  for (const element of [frame, panel, question, options, progress]) {
    observer.observe(element, { box: "border-box" });
  }
  window.addEventListener("resize", positionBottomDivider);
  positionBottomDivider();
})();
