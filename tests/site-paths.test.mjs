import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const root = new URL("../", import.meta.url);
const pages = ["index.html", "html/about.html", "html/text.html", "html/result.html"];

test("所有 HTML 页面跳转和静态资源均使用存在的网站根路径", async () => {
  for (const page of pages) {
    const source = await readFile(new URL(page, root), "utf8");
    for (const match of source.matchAll(/\b(?:href|src|data-result-page)="([^"]+)"/gu)) {
      const value = match[1].replaceAll("&amp;", "&");
      assert.ok(value.startsWith("/") && !value.startsWith("//"), `${page}: ${value}`);
      const url = new URL(value, "http://localhost/");
      await access(new URL(`.${url.pathname}`, root));
    }
  }
});

test("CSS 字体和图片从网站根目录加载", async () => {
  for (const name of ["css/style.css", "css/content.css"]) {
    const source = await readFile(new URL(name, root), "utf8");
    for (const match of source.matchAll(/url\(["']?([^"')]+)["']?\)/gu)) {
      assert.ok(match[1].startsWith("/assets/"), `${name}: ${match[1]}`);
      await access(new URL(`.${match[1]}`, root));
    }
  }
});

test("关于页直达返回及切换使用根路径并限制来源", async () => {
  const source = await readFile(new URL("js/interactions/about-view.js", root), "utf8");
  const context = { URL, URLSearchParams };
  vm.runInNewContext(source, context);
  const api = context.AboutView;
  for (const from of ["index.html", "text.html", "result.html", "invalid.html"]) {
    const expected = ["text.html", "result.html"].includes(from) ? `/html/${from}` : "/index.html";
    assert.equal(api.fallback(`?from=${from}`), expected);
    for (const view of ["project", "result"]) {
      assert.equal(api.route(view, expected), `/html/about.html?view=${view}&from=${expected.split("/").pop()}`);
    }
  }
});
