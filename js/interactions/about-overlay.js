(function () {
  "use strict";
  const source = document.querySelector("body > .home:not(.about-page)");
  if (!source || !window.HTMLDialogElement?.prototype.showModal) return;
  const api = window.AboutView;
  const key = "loveTestAboutOverlayV1";
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let dialog, view, animation, saved, anchor;
  let revision = 0;
  let intent = 0;
  let quizWait = null;
  let geometry = null;
  let phase = "closed";
  let returning = false;
  const prepared = new Map();
  const setPhase = value => { phase = value; if (dialog) dialog.dataset.phase = value; };
  const data = () => {
    const value = history.state?.[key];
    return value?.owner === owner && location.pathname === "/html/about.html" ? value : null;
  };

  function back(all = false) {
    const current = data();
    if (!current || returning) return;
    returning = true;
    history.go(all ? -current.trail.length : -1);
  }

  function ensure() {
    if (dialog) return;
    dialog = document.createElement("dialog");
    dialog.className = "about-overlay";
    dialog.setAttribute("aria-label", "关于页面");
    view = api.create();
    dialog.append(view.root);
    document.body.append(dialog);
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      back(true);
    });
  }

  function lock(trigger) {
    const result = source.querySelector(".result-content");
    saved = { x: scrollX, y: scrollY, overflow: document.documentElement.style.overflow,
      padding: document.body.style.paddingRight, title: document.title, result, resultY: result?.scrollTop, trigger };
    document.title = "关于情感被骗指数测试";
    const width = innerWidth - document.documentElement.clientWidth;
    if (width) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + width}px`;
    document.documentElement.style.overflow = "hidden";
  }

  function unlock() {
    if (!saved) return;
    document.documentElement.style.overflow = saved.overflow;
    document.body.style.paddingRight = saved.padding;
    document.title = saved.title;
    if (saved.result) saved.result.scrollTop = saved.resultY;
    window.scrollTo({ left: saved.x, top: saved.y, behavior: "instant" });
    if (saved.trigger?.isConnected) saved.trigger.focus({ preventScroll: true });
    saved = null;
  }

  function clearAnimation() {
    animation?.cancel();
    animation = null;
    if (view) {
      view.root.style.willChange = "";
      view.root.style.transformOrigin = "";
    }
  }

  function close() {
    clearAnimation();
    dialog.close();
    view.pause();
    document.documentElement.classList.remove("has-about-overlay");
    unlock();
    setPhase("closed");
  }

  function frames() {
    const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : view.controls[0].getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const scale = Math.max(rect.width, rect.height) / Math.max(innerWidth, innerHeight);
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 2;
    geometry = { origin: `${x}px ${y}px`,
      small: { transform: `scale(${scale})`, clipPath: `circle(${Math.max(rect.width, rect.height) / (2 * scale)}px at ${x}px ${y}px)`, opacity: 1 },
      full: { transform: "scale(1)", clipPath: `circle(${radius}px at ${x}px ${y}px)`, opacity: 1 } };
  }

  async function resources() {
    await document.fonts.ready;
    const background = getComputedStyle(view.frame).backgroundImage;
    await Promise.all([...background.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(([, url]) => {
      if (!prepared.has(url)) prepared.set(url, new Promise(resolve => {
        const image = new Image();
        image.onload = () => image.decode().catch(() => {}).then(resolve);
        image.onerror = resolve;
        image.src = url;
      }));
      return prepared.get(url);
    }));
  }

  async function synchronize() {
    const ticket = ++revision;
    const previous = phase;
    const current = data();
    const presentation = animation && view ? (() => {
      const s = getComputedStyle(view.root);
      return { transform: s.transform, clipPath: s.clipPath, opacity: s.opacity };
    })() : null;
    clearAnimation();
    if (!current) {
      document.documentElement.classList.remove("has-about-overlay");
      if (!dialog?.open) { setPhase("closed"); return; }
      if (previous === "preparing") { close(); return; }
      setPhase("closing");
      view.root.style.transformOrigin = geometry.origin;
      view.root.style.willChange = "transform, opacity";
      animation = view.root.animate(reduced.matches ? [{ opacity: 1 }, { opacity: 0 }] : [presentation || geometry.full, geometry.small],
        { duration: reduced.matches ? 70 : 240, easing: "cubic-bezier(0.7, 0, 0.84, 0)", fill: "forwards" });
      await animation.finished.catch(() => {});
      if (ticket === revision) close();
      return;
    }

    ensure();
    const back = current.trail.length > 1 ? api.route(current.trail.at(-2), current.base) : current.base;
    view.setView(current.trail.at(-1), current.base, back);
    if (previous === "open" || previous === "updating") setPhase("updating");
    if (!dialog.open) {
      lock(anchor);
      view.root.style.visibility = "hidden";
      setPhase("preparing");
      dialog.showModal();
    }
    view.resume();
    await resources();
    if (ticket !== revision) return;
    view.resize();
    view.root.style.visibility = "";
    if (previous === "open" || previous === "updating") { setPhase("open"); return; }
    if (!geometry || previous === "closed" || previous === "preparing") frames();
    setPhase("opening");
    view.root.style.transformOrigin = geometry.origin;
    view.root.style.willChange = "transform, opacity";
    animation = view.root.animate(reduced.matches ? [{ opacity: 0 }, { opacity: 1 }] : [presentation || geometry.small, geometry.full],
      { duration: reduced.matches ? 110 : 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" });
    await animation.finished.catch(() => {});
    if (ticket !== revision) return;
    clearAnimation();
    document.documentElement.classList.add("has-about-overlay");
    setPhase("open");
    view.root.querySelector('[aria-current="page"]').focus({ preventScroll: true });
  }

  function quizReady() {
    const panel = source.querySelector(".quiz-panel");
    if (!panel || panel.dataset.loadState === "error" || (panel.dataset.loadState === "ready" && panel.dataset.busy !== "true")) return Promise.resolve(panel?.dataset.loadState !== "error");
    if (!quizWait) quizWait = new Promise(resolve => {
      const idle = () => {
        if (panel.dataset.loadState !== "error" && (panel.dataset.loadState !== "ready" || panel.dataset.busy === "true")) return;
        window.removeEventListener("quiz:idle", idle);
        quizWait = null;
        resolve(panel.dataset.loadState !== "error");
      };
      window.addEventListener("quiz:idle", idle);
    });
    return quizWait;
  }

  document.addEventListener("click", async event => {
    const link = event.target.closest("a.image-slot[href]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (dialog?.contains(link)) {
      event.preventDefault();
      const current = data();
      if (!current || returning) return;
      if (link.classList.contains("is-active")) back();
      else {
        const trail = [...current.trail, link.dataset.aboutView];
        history.pushState({ ...history.state, [key]: { ...current, trail } }, "", api.route(trail.at(-1), current.base));
        synchronize();
      }
      return;
    }
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.pathname !== "/html/about.html") return;
    event.preventDefault();
    const request = ++intent;
    if (!await quizReady()) { location.assign(link.href); return; }
    if (request !== intent) return;
    const base = api.sourceRoute(location.href, location.href);
    if (!base) return;
    anchor = link;
    const trail = [api.viewName(url.searchParams.get("view"))];
    history.replaceState({ ...history.state, [key]: { owner, base, trail: [] } }, "", base);
    history.pushState({ ...history.state, [key]: { owner, base, trail } }, "", api.route(trail[0], base));
    synchronize();
  });
  window.addEventListener("popstate", () => { intent += 1; returning = false; synchronize(); });
  window.addEventListener("pageshow", event => { if (event.persisted) synchronize(); });
  reduced.addEventListener("change", () => synchronize());
})();
