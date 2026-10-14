(function () {
  "use strict";

  const frame = document.querySelector(".result-frame");
  const content = document.querySelector(".result-content");
  const scrollbar = document.querySelector("#result-scrollbar");

  function sync() {
    const maximum = Math.max(0, content.scrollHeight - content.clientHeight);
    scrollbar.hidden = content.hidden || maximum === 0;
    scrollbar.max = String(maximum);
    scrollbar.value = String(content.scrollTop);
    scrollbar.setAttribute("aria-valuetext", `${Math.round(maximum ? content.scrollTop / maximum * 100 : 0)}%`);
  }

  function layout() {
    const frameRect = frame.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    // 位于原滚动条到外框右边缘之间的 60% 处，上下各收短 10%。
    const rightEdge = frameRect.right - frame.clientLeft;
    scrollbar.style.left = `${contentRect.right + (rightEdge - contentRect.right) * 0.6 - frameRect.left - frame.clientLeft}px`;
    scrollbar.style.top = `${contentRect.top - frameRect.top - frame.clientTop + contentRect.height * 0.1}px`;
    scrollbar.style.height = `${contentRect.height * 0.8}px`;
    sync();
  }

  scrollbar.addEventListener("input", () => {
    content.scrollTop = Number(scrollbar.value);
    sync();
  });
  content.addEventListener("scroll", sync, { passive: true });
  const observer = new ResizeObserver(layout);
  for (const element of [frame, content, document.querySelector("#result-layers")]) observer.observe(element);
  window.addEventListener("resize", layout);
  layout();
})();
