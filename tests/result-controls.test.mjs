import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const scrollSource = await readFile(new URL("../js/interactions/result-scroll.js", import.meta.url), "utf8");
const shareSource = await readFile(new URL("../js/interactions/result-share.js", import.meta.url), "utf8");

test("结果程度颜色可由真实截图库解析，避免 color-mix 导致截图失败", async () => {
  const vendor = await readFile(new URL("../js/vendor/html2canvas-1.4.1.min.js", import.meta.url), "utf8");
  // 固定版本的私有解析器仅在测试内存中导出；不改动随页面发布的库文件。
  const exportTail = "return function(A,e){return Js(A,e=void 0===e?{}:e)}});";
  assert.ok(vendor.endsWith(exportTail), "截图库版本变化后需重新核对解析器测试入口");
  const context = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(vendor.slice(0, -exportTail.length) + "return {parseColor:fe}});", context);
  const parse = context.module.exports.parseColor;
  assert.throws(() => parse({}, "color(srgb 0.33 0.5 0.78)"), /unsupported color function/);
  assert.throws(() => parse({}, "color-mix(in srgb, #7da6e7 60%, #174799)"), /unsupported color function/);
  const css = await readFile(new URL("../css/content.css", import.meta.url), "utf8");
  const rule = css.match(/\.result-content \.result-degree\s*\{([^}]+)\}/u);
  assert.ok(rule);
  const color = rule[1].match(/(?:^|;)\s*(?:\/\*[\s\S]*?\*\/\s*)?color:\s*([^;]+)/u)?.[1];
  assert.ok(color, "需找到结果程度标签实际使用的颜色");
  assert.doesNotThrow(() => parse({}, color));
});

function element() {
  const events = new Map();
  return { hidden: false, disabled: false, dataset: {}, style: {}, attributes: {},
    scrollTop: 0, scrollHeight: 900, clientHeight: 400, clientLeft: 0, clientTop: 0,
    textContent: "", rect: { top: 24, left: 0, right: 390, height: 600, width: 390 },
    addEventListener(type, fn) { events.set(type, fn); },
    fire(type) { return events.get(type)?.(); },
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this[key]; delete this.attributes[key]; },
    getBoundingClientRect() { return this.rect; },
    showModal() { this.open = true; }, close() { this.open = false; this.fire("close"); },
  };
}

test("结果正文变化后滚动范围同步，滚动条控制整个解读区", () => {
  const nodes = Object.fromEntries([".result-frame", ".result-content", "#result-scrollbar", "#result-copy", "#result-layout"]
    .map((key) => [key, element()]));
  const observed = [];
  let onResize;
  const context = { document: { querySelector: (key) => nodes[key] }, window: { addEventListener() {} },
    ResizeObserver: class { constructor(fn) { onResize = fn; } observe(node) { observed.push(node); } } };
  vm.runInNewContext(scrollSource, context);
  const content = nodes[".result-content"];
  const scrollbar = nodes["#result-scrollbar"];
  assert.equal(scrollbar.max, "500");
  assert.equal(scrollbar.hidden, false);
  assert.ok(observed.includes(nodes["#result-copy"]));
  assert.ok(observed.includes(nodes["#result-layout"]));
  scrollbar.value = "200";
  scrollbar.fire("input");
  assert.equal(content.scrollTop, 200);
  assert.equal(scrollbar.attributes["aria-valuetext"], "40%");
  content.scrollHeight = 2200;
  onResize();
  assert.equal(scrollbar.max, "1800");
  content.scrollHeight = 400;
  onResize();
  assert.equal(scrollbar.hidden, true);
  content.hidden = true;
  content.scrollHeight = 900;
  onResize();
  assert.equal(scrollbar.hidden, true);
});

test("分享完整结果区：长正文、失败恢复、预览释放与空记录", async () => {
  async function harness(state = "complete") {
    const keys = [".result-page", ".result-frame", ".result-content", "#share-result", "#share-status",
      "#share-preview", "#share-preview-status", "#share-image", "#save-result-image", "#close-share-preview"];
    const nodes = Object.fromEntries(keys.map((key) => [key, element()]));
    nodes[".result-frame"].dataset.resultState = state;
    nodes[".result-page"].rect.top = 0;
    nodes[".result-content"].rect.top = 48;
    nodes[".result-content"].scrollTop = 200;
    const releases = [];
    const captures = [];
    const windowEvents = new Map();
    const context = { document: { querySelector: (key) => nodes[key], fonts: { ready: Promise.resolve() } },
      URL: { createObjectURL: () => "blob:test-result", revokeObjectURL: (url) => releases.push(url) },
      getComputedStyle: () => ({ paddingTop: "0px", paddingBottom: "12px", paddingLeft: "6px", paddingRight: "6px", getPropertyValue: () => "#ffffff" }),
      window: { devicePixelRatio: 2, addEventListener(type, fn) { windowEvents.set(type, fn); },
        html2canvas: async (page, options) => {
          const clones = Object.fromEntries([".result-page", ".result-frame", ".result-content"].map((key) => [key, element()]));
          let injectedStyle = "";
          options.onclone({ querySelector: (key) => clones[key], createElement: element,
            head: { append(style) { injectedStyle = style.textContent; } } });
          captures.push({ page, options, clones, injectedStyle });
          return { toBlob(callback) { callback({ type: "image/png" }); } };
        } } };
    vm.runInNewContext(shareSource, context);
    return { nodes, context, releases, captures, windowEvents };
  }
  const { nodes, captures, releases, context, windowEvents } = await harness();
  const button = nodes["#share-result"];
  await button.fire("click");
  assert.equal(captures.length, 1);
  assert.equal(captures[0].page, nodes[".result-content"]);
  assert.equal(captures[0].options.backgroundColor, "#ffffff");
  assert.equal(captures[0].options.width, nodes[".result-content"].rect.width + 48);
  const exportStyle = captures[0].clones[".result-content"].style;
  assert.equal(exportStyle.paddingTop, "40px");
  assert.equal(exportStyle.paddingLeft, "30px");
  assert.equal(exportStyle.paddingRight, "30px");
  assert.equal(Number.parseFloat(exportStyle.width) - 60, nodes[".result-content"].rect.width - 12);
  assert.ok(captures[0].options.height >= nodes[".result-content"].scrollHeight);
  assert.equal(captures[0].clones[".result-content"].style.height, "auto");
  assert.equal(captures[0].clones[".result-content"].style.outline, "none");
  assert.equal(captures[0].clones[".result-content"].style.overflow, "visible");
  assert.equal(captures[0].clones[".result-content"].scrollTop, 0);
  const resultHtml = await readFile(new URL("../html/result.html", import.meta.url), "utf8");
  assert.match(resultHtml, /<nav\b[^>]*class="top-actions"[^>]*data-html2canvas-ignore/u);
  assert.equal(nodes[".result-content"].scrollTop, 200);
  assert.equal(nodes["#share-preview"].open, true);
  assert.equal(nodes["#share-image"].src, "blob:test-result");
  assert.equal(nodes["#save-result-image"].href, "blob:test-result");
  assert.match(nodes["#save-result-image"].download, /\.png$/u);
  assert.equal(button.disabled, false);
  nodes["#close-share-preview"].fire("click");
  assert.deepEqual(releases, ["blob:test-result"]);
  assert.equal(nodes["#share-image"].src, undefined);
  assert.equal(nodes["#save-result-image"].href, undefined);

  nodes[".result-content"].scrollHeight = 6000;
  await button.fire("click");
  assert.ok(captures[1].options.height > captures[0].options.height);
  assert.ok(captures[1].options.scale <= 2);
  windowEvents.get("pagehide")();
  assert.equal(releases.length, 2);
  context.window.html2canvas = undefined;
  await button.fire("click");
  assert.match(nodes["#share-status"].textContent, /截图生成失败，请重试/u);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "分享结果");
  const empty = await harness("empty");
  assert.equal(empty.nodes["#share-result"].disabled, true);
  await empty.nodes["#share-result"].fire("click");
  assert.equal(empty.captures.length, 0);
});
