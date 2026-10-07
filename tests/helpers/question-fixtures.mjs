import { readFile } from "node:fs/promises";

export const productionBank = JSON.parse(await readFile(new URL("../../data/questions.json", import.meta.url), "utf8"));

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// 测试使用正式题库副本，不补入人工操题，也不伪造修订号。
export function runnableBank() {
  return structuredClone(productionBank);
}
