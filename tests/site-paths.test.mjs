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

test("关于页的返回与切换链接保留来源参数并指向正确目录", async () => {
  const source = await readFile(new URL("js/interactions/about.js", root), "utf8");
  for (const from of ["index.html", "text.html", "result.html", "invalid.html"]) {
    for (const view of ["project", "result"]) {
      const controls = ["project", "result"].map((view) => ({
        dataset: { aboutView: view }, classList: { toggle() {} }, setAttribute() {},
      }));
      const frame = {
        style: {}, cloneNode: () => ({ style: {}, removeAttribute() {}, remove() {},
          getBoundingClientRect: () => ({ top: 0, height: 100 }) }),
      };
      const context = {
        URLSearchParams,
        window: { location: { search: `?view=${view}&from=${from}` }, addEventListener() {} },
        document: { querySelectorAll: () => controls,
          querySelector: (selector) => selector === ".about-frame" ? frame : {
            append() {}, getBoundingClientRect: () => ({ top: 0 }),
          } },
        getComputedStyle: () => ({ paddingTop: "0", paddingBottom: "0", minHeight: "100",
          getPropertyValue: () => "0.8" }),
      };
      vm.runInNewContext(source, context);
      const expectedFrom = from === "invalid.html" ? "index.html" : from;
      for (const control of controls) {
        assert.equal(control.href, control.dataset.aboutView === view
          ? expectedFrom === "index.html" ? "/index.html" : `/html/${expectedFrom}`
          : `/html/about.html?view=${control.dataset.aboutView}&from=${expectedFrom}`);
      }
    }
  }
});
