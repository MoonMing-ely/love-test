import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
const source = await readFile(new URL("../js/interactions/about-view.js", import.meta.url), "utf8");
const context = vm.createContext({ URL, URLSearchParams });
vm.runInContext(source, context);
const api = context.AboutView;

test("About 返回保留普通查询和 hash，只消费 restart=1", () => {
  const base = "https://example.test/html/text.html";
  for (const [value, expected] of [
    ["/", "/index.html"],
    ["/index.html?mode=x#top", "/index.html?mode=x#top"],
    ["/html/text.html?restart=1&mode=x#question", "/html/text.html?mode=x#question"],
    ["/html/text.html?restart=0", "/html/text.html?restart=0"],
    ["/html/result.html", "/html/result.html"],
    ["https://outside.test/index.html", null],
    ["//outside.test/index.html", null],
    ["javascript:alert(1)", null],
    ["/outside/text.html", null],
    ["/html/about.html", null],
  ]) assert.equal(api.sourceRoute(value, base), expected);
});

test("About 直达限制视图和来源，并生成两个视图的原始 URL", () => {
  assert.equal(api.viewName("result"), "result");
  assert.equal(api.viewName("invalid"), "project");
  assert.equal(api.fallback("?from=text.html"), "/html/text.html");
  assert.equal(api.fallback("?from=https://outside.test"), "/index.html");
  assert.equal(api.route("result", "/html/text.html?mode=x#question"), "/html/about.html?view=result&from=text.html");
});
