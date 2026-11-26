(function () {
  "use strict";
  const api = window.AboutView;
  const params = new URLSearchParams(location.search);
  const saved = history.state?.loveTestAboutOverlayV1;
  const base = api.sourceRoute(saved?.base, location.href) || api.fallback(location.search);
  const active = api.viewName(params.get("view"));
  const trail = saved?.trail;
  const back = Array.isArray(trail) && trail.length > 1 ? api.route(trail.at(-2), base) : base;
  const view = api.create();
  view.setView(active, base, back);
  document.querySelector("body > .about-page").replaceWith(view.root);
  view.resume();
})();
