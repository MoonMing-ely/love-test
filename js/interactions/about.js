const params = new URLSearchParams(window.location.search);
const allowedViews = new Set(["project", "result"]);
const allowedSources = new Set(["index.html", "text.html", "result.html"]);

const activeView = allowedViews.has(params.get("view"))
  ? params.get("view")
  : "project";
const sourcePage = allowedSources.has(params.get("from"))
  ? params.get("from")
  : "index.html";

const controls = document.querySelectorAll("[data-about-view]");
controls.forEach((control) => {
  const view = control.dataset.aboutView;
  const isActive = view === activeView;

  control.classList.toggle("is-active", isActive);
  control.href = isActive
    ? sourcePage
    : `about.html?view=${view}&from=${encodeURIComponent(sourcePage)}`;
  control.setAttribute("aria-current", isActive ? "page" : "false");
  const label = isActive ? "返回上一页" : view === "project" ? "关于作者" : "关于测试";
  control.setAttribute("aria-label", label);
  control.dataset.tooltip = label;
});

// 以断点规则给出的原始位置为基准，将实际底部留白缩至 80%。
// 用独立测量节点读取 CSS 基准，避免沿用上次调整的内联尺寸。
const aboutPage = document.querySelector(".about-page");
const aboutFrame = document.querySelector(".about-frame");
function resizeAboutFrame() {
  const pageStyle = getComputedStyle(aboutPage);
  const paddingTop = parseFloat(pageStyle.paddingTop);
  const paddingBottom = parseFloat(pageStyle.paddingBottom);
  const probe = aboutFrame.cloneNode(false);
  probe.removeAttribute("style");
  Object.assign(probe.style, {
    position: "absolute", top: `${paddingTop}px`, left: "0",
    visibility: "hidden", pointerEvents: "none",
  });
  aboutPage.append(probe);
  const pageRect = aboutPage.getBoundingClientRect();
  const frameRect = probe.getBoundingClientRect();
  const offset = frameRect.top - pageRect.top - paddingTop;
  const pageHeight = Math.max(parseFloat(pageStyle.minHeight), paddingTop + frameRect.height + paddingBottom);
  const gap = Math.max(0, pageHeight - paddingTop - offset - frameRect.height);
  const scale = parseFloat(pageStyle.getPropertyValue("--about-bottom-gap-scale"));
  probe.remove();
  aboutFrame.style.height = `${frameRect.height + gap * (1 - scale)}px`;
  aboutFrame.style.maxHeight = "none";
  aboutFrame.style.transform = `translateY(${offset}px)`;
}
let aboutLayoutScheduled = false;
window.addEventListener("resize", () => {
  if (aboutLayoutScheduled) return;
  aboutLayoutScheduled = true;
  requestAnimationFrame(() => {
    // 旋转后等待视口单位和媒体查询完成更新，再测量 CSS 基准。
    requestAnimationFrame(() => {
      aboutLayoutScheduled = false;
      resizeAboutFrame();
    });
  });
});
resizeAboutFrame();
