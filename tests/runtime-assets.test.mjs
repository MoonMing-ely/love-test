import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// 更新算法后不能复用旧的无版本URL，否则浏览器可能混用旧配置和新计算模块。
const releases = new Set();
for (const page of ["text", "result"]) {
  const html = await readFile(new URL(`../html/${page}.html`, import.meta.url), "utf8");
  const sources = [...html.matchAll(/<script src="([^"]+)"/gu)].map((match) => match[1]);
  const required = page === "text" ? [
    "question-sampler.js", "core-algorithm/dimension-vector.js",
    "core-algorithm/second-layer-normalizer.js", "core-algorithm/third-layer-aggregator.js",
    "core-algorithm/algorithm-config.js", "core-algorithm/fourth-layer-evidence.js",
    "core-algorithm/fifth-layer-mechanisms.js", "core-algorithm/sixth-layer-integration.js",
    "scoring.js", "interactions/quiz.js",
  ] : ["core-algorithm/algorithm-config.js", "result-copy/catalog.js", "result-copy/selector.js", "interactions/result.js", "interactions/result-scroll.js"];
  if (page === "result") {
    const position = (path) => sources.findIndex((source) => source.split("?")[0] === `../js/${path}`);
    for (const [first, second] of [["core-algorithm/algorithm-config.js", "result-copy/catalog.js"],
      ["result-copy/catalog.js", "result-copy/selector.js"], ["result-copy/selector.js", "interactions/result.js"]]) {
      assert.ok(position(first) < position(second), `${first}须在${second}之前加载`);
    }
  }
  for (const path of required) {
    const urls = sources.filter((source) => source.split("?")[0] === `../js/${path}`);
    assert.equal(urls.length, 1, `${page}: ${path}须加载一次`);
    const url = new URL(urls[0], "http://localhost/html/");
    const version = url.searchParams.get("v");
    assert.ok(version, `${page}: ${path}缺少发布版本，可能复用旧缓存`);
    releases.add(version);
    await readFile(new URL(`../js/${path}`, import.meta.url));
  }
}
assert.equal(releases.size, 1, "答题及结果页相关脚本须使用同一发布版本");
assert.match([...releases][0], /runtime-v16-v6/u, "抽题V6不能复用抽题V5的缓存地址");
console.log("答题和结果页计分资源使用同一版本URL，不复用旧无版本脚本缓存。");
