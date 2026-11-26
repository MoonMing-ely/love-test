(function (global) {
  "use strict";
  const views = new Set(["project", "result"]);
  const sources = new Set(["/index.html", "/html/text.html", "/html/result.html"]);
  const viewName = value => views.has(value) ? value : "project";

  function sourceRoute(value, base) {
    try {
      const url = new URL(value, base);
      if (url.origin !== new URL(base).origin) return null;
      if (url.pathname === "/") url.pathname = "/index.html";
      if (!sources.has(url.pathname)) return null;
      if (url.searchParams.get("restart") === "1") url.searchParams.delete("restart");
      return url.pathname + url.search + url.hash;
    } catch { return null; }
  }

  function route(view, source) {
    const name = source.split(/[?#]/)[0].split("/").pop();
    return `/html/about.html?view=${viewName(view)}&from=${name}`;
  }

  function fallback(search) {
    const name = new URLSearchParams(search).get("from");
    return ["text.html", "result.html"].includes(name) ? `/html/${name}` : "/index.html";
  }

  function create() {
    const root = document.createElement("main");
    root.className = "home about-page";
    root.dataset.page = "about";
    root.innerHTML = `<nav class="top-actions" aria-label="关于页导航">
      <a class="image-slot" href="/index.html" data-about-view="project"><span class="circle-icon circle-icon-feather" aria-hidden="true"></span></a>
      <a class="image-slot" href="/index.html" data-about-view="result"><span class="circle-icon circle-icon-dots" aria-hidden="true"></span></a>
    </nav><section class="content-frame about-frame" aria-label="关于页面内容区域"><div class="frame-side-glow" aria-hidden="true"></div></section>`;
    const frame = root.querySelector(".about-frame");
    const controls = [...root.querySelectorAll("[data-about-view]")];
    let listening = false;
    let scheduled = false;

    function setView(active, base, back = base) {
      controls.forEach(control => {
        const current = control.dataset.aboutView === active;
        control.classList.toggle("is-active", current);
        control.href = current ? back : route(control.dataset.aboutView, base);
        control.setAttribute("aria-current", current ? "page" : "false");
        const label = current ? "返回上一页" : control.dataset.aboutView === "project" ? "关于作者" : "关于测试";
        control.setAttribute("aria-label", label);
        control.dataset.tooltip = label;
      });
    }

    function resize() {
      // 与原独立 About 页共用同一套最终尺寸规则。
      const style = getComputedStyle(root);
      const top = parseFloat(style.paddingTop);
      const bottom = parseFloat(style.paddingBottom);
      const probe = frame.cloneNode(false);
      probe.removeAttribute("style");
      Object.assign(probe.style, { position: "absolute", top: `${top}px`, left: "0", visibility: "hidden", pointerEvents: "none" });
      root.append(probe);
      const pageRect = root.getBoundingClientRect();
      const rect = probe.getBoundingClientRect();
      const offset = rect.top - pageRect.top - top;
      const height = Math.max(parseFloat(style.minHeight), top + rect.height + bottom);
      const gap = Math.max(0, height - top - offset - rect.height);
      const scale = parseFloat(style.getPropertyValue("--about-bottom-gap-scale"));
      probe.remove();
      frame.style.height = `${rect.height + gap * (1 - scale)}px`;
      frame.style.maxHeight = "none";
      frame.style.transform = `translateY(${offset}px)`;
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        scheduled = false;
        if (listening && root.isConnected) resize();
      }));
    }
    function resume() {
      if (!listening) { window.addEventListener("resize", schedule); listening = true; }
      resize();
    }
    function pause() { window.removeEventListener("resize", schedule); listening = false; }
    return { root, frame, controls, setView, resize, resume, pause };
  }

  global.AboutView = { create, viewName, sourceRoute, route, fallback };
})(typeof window === "undefined" ? globalThis : window);
