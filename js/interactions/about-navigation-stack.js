(function (global) {
  "use strict";

  const storageKey = "loveTestAboutNavigationStackV1";
  const maximumDepth = 32;
  const allowedPages = new Set([
    "index.html",
    "text.html",
    "result.html",
    "about.html",
  ]);

  function normalizeRoute(value, baseUrl) {
    try {
      const url = new URL(value, baseUrl);
      const page = url.pathname.split("/").pop();
      if (!allowedPages.has(page)) return null;
      return `${page}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }

  class NavigationStack {
    constructor(storage) {
      this.storage = storage;
      this.items = this.read();
    }

    read() {
      try {
        const value = JSON.parse(this.storage.getItem(storageKey));
        return Array.isArray(value)
          ? value.filter((route) => typeof route === "string").slice(-maximumDepth)
          : [];
      } catch {
        return [];
      }
    }

    write() {
      try {
        this.storage.setItem(storageKey, JSON.stringify(this.items));
      } catch {
        // Navigation still works when storage is unavailable.
      }
    }

    reset(route) {
      this.items = route ? [route] : [];
      this.write();
    }

    push(route) {
      if (!route) return;
      this.items.push(route);
      this.items = this.items.slice(-maximumDepth);
      this.write();
    }

    peek() {
      return this.items.at(-1) || null;
    }

    pop() {
      const route = this.items.pop() || null;
      this.write();
      return route;
    }

    get size() {
      return this.items.length;
    }
  }

  function isPlainActivation(event) {
    return !(
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    );
  }

  function bindCircleNavigation() {
    const controls = Array.from(document.querySelectorAll(".top-actions .image-slot[href]"));
    if (controls.length === 0) return;

    const page = document.querySelector("[data-page]")?.dataset.page;
    const isAboutPage = page === "about";
    const stack = new NavigationStack(global.sessionStorage);
    const currentRoute = normalizeRoute(global.location.href, global.location.href);
    const activeControl = controls.find((control) => control.classList.contains("is-active"));

    if (isAboutPage && activeControl) {
      const fallbackRoute = normalizeRoute(activeControl.href, global.location.href) || "index.html";
      activeControl.href = stack.peek() || fallbackRoute;
    }

    controls.forEach((control) => {
      control.addEventListener("click", (event) => {
        if (!isPlainActivation(event)) return;

        if (isAboutPage && control.classList.contains("is-active")) {
          const fallbackRoute = normalizeRoute(control.href, global.location.href) || "index.html";
          control.href = stack.pop() || fallbackRoute;
          return;
        }

        if (isAboutPage) {
          stack.push(currentRoute);
        } else {
          stack.reset(currentRoute);
        }
      });
    });
  }

  global.AboutNavigationStack = {
    NavigationStack,
    normalizeRoute,
  };

  if (
    typeof document !== "undefined" &&
    (!global.top || global.top === global)
  ) {
    bindCircleNavigation();
  }
})(typeof window === "undefined" ? globalThis : window);
