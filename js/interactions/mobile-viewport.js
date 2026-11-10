(function () {
  "use strict";

  // 在初次排版前识别手机横竖屏，只设置初始缩放，不干预后续手势缩放。
  const phone = window.matchMedia(
    "(pointer: coarse) and (max-width: 599px), (pointer: coarse) and (max-height: 599px)",
  ).matches;
  if (!phone) return;

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) viewport.content = "width=device-width, initial-scale=0.9";
})();
