(function () {
  "use strict";

  if (window.top !== window) return;

  const transitionKey = "loveTestAboutTransition";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeStage = null;
  let activeBackground = null;
  let returnBackgroundPromise = Promise.resolve(null);
  let isNavigating = false;

  function safeSessionGet() {
    try {
      const value = sessionStorage.getItem(transitionKey);
      sessionStorage.removeItem(transitionKey);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function safeSessionSet(value) {
    try {
      sessionStorage.setItem(transitionKey, JSON.stringify(value));
    } catch {
      // Navigation still works when storage is unavailable.
    }
  }

  function removeStage() {
    activeStage?.remove();
    activeStage = null;
    isNavigating = false;
  }

  function removeBackground() {
    activeBackground?.remove();
    activeBackground = null;
  }

  function preloadReturnBackground(destination) {
    const frame = document.createElement("iframe");
    frame.className = "page-transition-background";
    frame.src = destination;
    frame.tabIndex = -1;
    frame.title = "";
    frame.setAttribute("aria-hidden", "true");
    document.body.append(frame);
    activeBackground = frame;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      frame.addEventListener("load", () => finish(frame), { once: true });
      frame.addEventListener("error", () => finish(null), { once: true });
      window.setTimeout(() => finish(null), 2500);
    });
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function buildAboutPage(activeView) {
    const liveAboutPage = document.querySelector("body > .about-page");

    if (liveAboutPage) {
      return liveAboutPage.cloneNode(true);
    }

    const page = document.createElement("main");
    page.className = "home about-page";
    page.dataset.page = "about";
    page.innerHTML = `
      <nav class="top-actions" aria-hidden="true">
        <span class="image-slot ${activeView === "project" ? "is-active" : ""}"><span class="circle-icon circle-icon-feather"></span></span>
        <span class="image-slot ${activeView === "result" ? "is-active" : ""}"><span class="circle-icon circle-icon-dots"></span></span>
      </nav>
      <section class="content-frame about-frame"><div class="frame-side-glow" aria-hidden="true"></div></section>
    `;
    return page;
  }

  function createAboutMiniature(activeView) {
    const stage = document.createElement("div");
    stage.className = "page-transition-stage";
    stage.setAttribute("aria-hidden", "true");
    const page = buildAboutPage(activeView);
    page.classList.add("page-transition-document");
    page.querySelectorAll("a, button").forEach((control) => {
      control.tabIndex = -1;
    });
    stage.append(page);
    document.body.append(stage);
    activeStage = stage;
    return stage;
  }

  function getGeometry(link) {
    const rect = link.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const diameter = Math.max(rect.width, rect.height);
    const scale = diameter / Math.max(window.innerWidth, window.innerHeight);
    const farthestX = Math.max(centerX, window.innerWidth - centerX);
    const farthestY = Math.max(centerY, window.innerHeight - centerY);

    return {
      centerX,
      centerY,
      scale,
      smallRadius: diameter / (2 * scale),
      largeRadius: Math.hypot(farthestX, farthestY) + 2,
    };
  }

  function framesFor(geometry) {
    const origin = `${geometry.centerX}px ${geometry.centerY}px`;
    const small = {
      transform: `scale(${geometry.scale})`,
      clipPath: `circle(${geometry.smallRadius}px at ${geometry.centerX}px ${geometry.centerY}px)`,
    };
    const full = {
      transform: "scale(1)",
      clipPath: `circle(${geometry.largeRadius}px at ${geometry.centerX}px ${geometry.centerY}px)`,
    };
    return { origin, small, full };
  }

  function navigateAfter(animation, destination) {
    animation.finished
      .catch(() => {})
      .finally(() => window.location.assign(destination));
  }

  function canIntercept(event) {
    return !(
      isNavigating ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    );
  }

  function expandToAbout(event) {
    if (!canIntercept(event)) return;

    event.preventDefault();
    isNavigating = true;

    const link = event.currentTarget;
    const view = new URL(link.href).searchParams.get("view") || "project";
    const geometry = getGeometry(link);
    const { origin, small, full } = framesFor(geometry);
    const stage = createAboutMiniature(view);
    stage.style.transformOrigin = origin;

    safeSessionSet({ direction: "forward", view });

    const animation = stage.animate(
      reduceMotion.matches ? [{ opacity: 0 }, { opacity: 1 }] : [small, full],
      {
        duration: reduceMotion.matches ? 110 : 420,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      },
    );
    navigateAfter(animation, link.href);
  }

  async function collapseFromAbout(event) {
    if (!canIntercept(event)) return;

    event.preventDefault();
    isNavigating = true;

    const link = event.currentTarget;
    const geometry = getGeometry(link);
    const { origin, small, full } = framesFor(geometry);
    const currentView = new URL(window.location.href).searchParams.get("view") || "project";
    const stage = createAboutMiniature(currentView);
    stage.style.transformOrigin = origin;

    const background = await returnBackgroundPromise;
    if (!background) {
      removeStage();
      window.location.assign(link.href);
      return;
    }

    background.classList.add("is-visible");
    document.documentElement.classList.add("is-page-transitioning-out");
    await waitForPaint();

    const animation = stage.animate(
      reduceMotion.matches ? [{ opacity: 1 }, { opacity: 0 }] : [full, small],
      {
        duration: reduceMotion.matches ? 70 : 240,
        easing: "cubic-bezier(0.7, 0, 0.84, 0)",
        fill: "forwards",
      },
    );
    navigateAfter(animation, link.href);
  }

  function revealAboutPage() {
    const aboutPage = document.querySelector('[data-page="about"]');
    const entry = safeSessionGet();
    if (!aboutPage || entry?.direction !== "forward") return;

    const stage = createAboutMiniature(entry.view);
    stage.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduceMotion.matches ? 70 : 130,
      easing: "ease-out",
    }).finished.finally(removeStage);
  }

  document.querySelectorAll('.image-slot[href*="about.html"]').forEach((link) => {
    if (link.matches(".about-page .image-slot.is-active")) return;
    link.addEventListener("click", expandToAbout);
  });

  document.querySelectorAll('.about-page .image-slot.is-active[href]').forEach((link) => {
    link.addEventListener("click", collapseFromAbout);
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      document.documentElement.classList.remove("is-page-transitioning-out");
      removeStage();
      removeBackground();
    }
  });
  window.addEventListener("pagehide", () => {
    removeStage();
    removeBackground();
  });
  revealAboutPage();

  const returnControl = document.querySelector(
    '.about-page .image-slot.is-active[href]',
  );
  if (returnControl) {
    returnBackgroundPromise = preloadReturnBackground(returnControl.href);
  }
})();
