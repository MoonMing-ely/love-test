import { readFile } from "node:fs/promises";

export const productionBank = JSON.parse(await readFile(new URL("../../data/questions.json", import.meta.url), "utf8"));

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// 仅为测试补足未确认的操题，不进入 data/questions.json 或生产页面。
export function runnableBank() {
  const bank = structuredClone(productionBank);
  const sources = bank.questions.filter((q) => q.status === "valid" && q.dimensions.includes("manipulation"));
  for (let index = sources.length; index < 2; index += 1) {
    const stratum = index === 0 ? "A" : "C";
    bank.questions.push({
      id: `${stratum}98`, stratum,
      type: stratum === "A" ? "self-report" : "projection",
      dimensions: ["manipulation"], status: "valid",
      semantic_group: `test_manipulation_${index}`,
      prompt: `独立操维度测试来源 ${index + 1}（仅测试夹具）`,
      options: [3, 2, 1, 0].map((score, i) => ({ id: "ABCD"[i], text: `测试选项 ${i}`, scores: { manipulation: score } })),
      dimensionJudgement: null,
    });
  }
  // 测试夹具与生产题库必须具有不同修订号。
  bank.bankRevision = "f".repeat(64);
  return bank;
}
