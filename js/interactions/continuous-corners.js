(function () {
  "use strict";

  // 只绘制背景和描边；文字、边框占位、命中区域和排版仍由原元素负责。
  if (!window.ContinuousCornerPath) return;
  const ns = "http://www.w3.org/2000/svg";
  const pending = new Set();
  const records = new Map();
  let scheduled = false;
  let sequence = 0;

  function node(name, attributes = {}) {
    const element = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  function gradient(svg, id, stops) {
    const result = node("linearGradient", { id, x1: "0", y1: "0", x2: "0", y2: "1" });
    for (const [offset, color] of stops) {
      const stop = node("stop", { offset });
      stop.style.stopColor = color;
      result.append(stop);
    }
    svg.querySelector("defs").append(result);
    return `url(#${id})`;
  }

  function shadow(svg, id, kind) {
    // 与原 box-shadow 使用相同参数，但从实际连续曲线提取 Alpha。
    // 负扩张量通过腐蚀 Alpha 实现，避免扩大阴影或留下旧圆角的白色间隙。
    const layers = kind === "option"
      ? [[2, 3, 2, 1, "rgb(105, 168, 255)", 0.2], [3, 4, 6, 3, "rgb(105, 168, 255)", 0.16]]
      : [[4.5, 4.5, 6, 2.25, "var(--continuous-shadow-color)", 1]];
    const filter = node("filter", { id, filterUnits: "userSpaceOnUse", x: -24, y: -24 });
    for (const [index, [dx, dy, blur, spread, color, opacity]] of layers.entries()) {
      filter.append(node("feMorphology", { in: "SourceAlpha", operator: "erode", radius: spread, result: `inset-${index}` }));
      filter.append(node("feGaussianBlur", { in: `inset-${index}`, stdDeviation: blur / 2, result: `blur-${index}` }));
      filter.append(node("feOffset", { in: `blur-${index}`, dx, dy, result: `offset-${index}` }));
      const flood = node("feFlood", { "flood-opacity": opacity, result: `color-${index}` });
      flood.style.floodColor = color;
      filter.append(flood);
      filter.append(node("feComposite", { in: `color-${index}`, in2: `offset-${index}`, operator: "in", result: `shadow-${index}` }));
    }
    const merge = node("feMerge");
    for (let index = layers.length - 1; index >= 0; index--) merge.append(node("feMergeNode", { in: `shadow-${index}` }));
    merge.append(node("feMergeNode", { in: "SourceGraphic" }));
    filter.append(merge);
    svg.querySelector("defs").append(filter);
    return `url(#${id})`;
  }

  function surface(kind) {
    const svg = node("svg", { class: `continuous-surface continuous-${kind}`, "aria-hidden": "true", focusable: "false" });
    const id = `continuous-${++sequence}`;
    svg.append(node("defs"));
    let fill = "var(--surface)";
    let stroke = "var(--continuous-border, var(--blue-gray))";
    if (kind === "option") {
      fill = "var(--option-fill)";
      stroke = gradient(svg, `${id}-edge`, [["0%", "var(--option-border-color)"], ["80%", "var(--option-border-color)"], ["100%", "color-mix(in srgb, var(--option-border-color) 65%, var(--surface))"]]);
    } else if (kind === "question") {
      fill = gradient(svg, `${id}-fill`, [["0%", "var(--question-top)"], ["54%", "var(--question-middle)"], ["100%", "var(--surface)"]]);
      stroke = gradient(svg, `${id}-edge`, [["0%", "var(--question-border-light)"], ["35%", "var(--question-border-light)"], ["80%", "var(--question-border)"], ["100%", "var(--question-border)"]]);
    } else if (kind === "primary") {
      fill = "var(--action-blue)";
      stroke = "var(--action-blue)";
    } else if (kind === "action") {
      fill = "var(--continuous-fill, var(--surface))";
    } else if (kind === "far" || kind === "near") {
      fill = "var(--stack-fill)";
      stroke = "color-mix(in srgb, #8598c0 60%, var(--stack-fill) 40%)";
    }
    const shape = node("path", { class: "continuous-shape" });
    shape.style.fill = fill;
    shape.style.stroke = stroke;
    if (kind === "option" || kind === "primary") shape.setAttribute("filter", shadow(svg, `${id}-shadow`, kind));
    svg.append(shape);
    return svg;
  }

  function geometry(svg, width, height, radius, border) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const shape = svg.querySelector(".continuous-shape");
    shape.setAttribute("d", window.ContinuousCornerPath(width - border, height - border, Math.max(0, radius - border / 2)));
    shape.setAttribute("transform", `translate(${border / 2} ${border / 2})`);
    shape.setAttribute("stroke-width", border);
    const filter = svg.querySelector("filter");
    if (filter) {
      filter.setAttribute("width", width + 48);
      filter.setAttribute("height", height + 48);
    }
  }

  function update(element) {
    const record = records.get(element);
    const style = getComputedStyle(element);
    // CSS 尺寸不含变换；不能用动画中的 getBoundingClientRect() 反复重算轮廓。
    const width = parseFloat(style.width);
    const height = parseFloat(style.height);
    const radius = parseFloat(style.borderTopLeftRadius);
    const border = parseFloat(style.borderLeftWidth);
    if (!(width > 0 && height > 0) || !Number.isFinite(radius)) return;
    const key = [width, height, radius, border].join(":");
    const missing = record.layers.some(svg => svg.parentNode !== element);
    if (record.key === key && !missing) return;
    record.key = key;
    for (const svg of record.layers) {
      const stack = record.kind === "stack";
      const usedBorder = stack ? parseFloat(getComputedStyle(element, "::before").borderLeftWidth) : border;
      geometry(svg, width, height, radius, usedBorder);
      Object.assign(svg.style, { left: `${-border}px`, top: `${-border}px`, width: `${width}px`, height: `${height}px` });
      if (svg.parentNode !== element) element.append(svg);
    }
    element.classList.add(record.kind === "stack" ? "has-continuous-stack" : "has-continuous-surface");
  }

  function schedule(element) {
    pending.add(element);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      for (const element of pending) update(element);
      pending.clear();
    });
  }

  const resize = new ResizeObserver(entries => entries.forEach(entry => schedule(entry.target)));
  // 题目和分享按钮会用 textContent 更新文案，只补回被移除的装饰节点。
  const content = new MutationObserver(entries => entries.forEach(entry => {
    const record = records.get(entry.target);
    if (record && record.layers.some(svg => svg.parentNode !== entry.target)) schedule(entry.target);
  }));
  for (const [selector, kind] of [[".option-slot", "option"], [".question-slot", "question"], [".question-stack", "stack"], [".primary-action", "primary"], [".info-action", "action"]]) {
    for (const element of document.querySelectorAll(selector)) {
      records.set(element, { kind, layers: kind === "stack" ? [surface("far"), surface("near")] : [surface(kind)] });
      resize.observe(element, { box: "border-box" });
      content.observe(element, { childList: true });
      schedule(element);
    }
  }
  window.addEventListener("resize", () => records.forEach((_record, element) => schedule(element)));
})();
