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
  control.setAttribute(
    "aria-label",
    isActive
      ? "返回上一页"
      : view === "project"
        ? "查看关于这个测试"
        : "查看关于测试结果",
  );
});
