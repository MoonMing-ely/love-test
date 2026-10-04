import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import "../js/question-sampler.js";

const sourceUrl = new URL("../data/question-bank-source.md", import.meta.url);
const outputUrl = new URL("../data/questions.json", import.meta.url);

const STRATA = Object.freeze({
  A: { label: "程度自陈题", type: "self-report" },
  B: { label: "真实经历 / 日常行为题", type: "experience" },
  C: { label: "短投射题", type: "projection" },
  D: { label: "元认知 / 自我校准题", type: "metacognition" },
});

const DIMENSIONS = [
  ["recognition", "认", "人格认可敏感"],
  ["needed", "需", "被需要敏感"],
  ["specialness", "特", "特殊性放大"],
  ["scarcity", "稀", "稀缺性判断"],
  ["calibration", "校", "关系校准"],
  ["evidence", "证", "行为证据意识"],
  ["manipulation", "操", "操纵识别"],
  ["rationalization", "合", "现实回避/合理化"],
  ["boundaries", "边", "投入边界"],
  ["stopLoss", "止", "止损能力"],
  ["differentiation", "分", "心理分化能力"],
  ["selfCalibration", "自", "自我校准能力"],
].map(([key, code, label]) => ({
  key,
  code,
  label,
  scoringStatus: "configured",
}));

const DIMENSION_KEY_BY_CODE = new Map(
  DIMENSIONS.map(({ key, code }) => [code, key]),
);

function nextContentLine(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const value = lines[index].trim();
    if (value) return { index, value };
  }
  return null;
}

function parseOptions(line, questionId) {
  const parts = line.split(/\s*·\s*/u);

  if (parts.length !== 4) {
    throw new Error(`${questionId} 应有 4 个选项，实际解析到 ${parts.length} 个。`);
  }

  return parts.map((part, index) => {
    const match = part.match(/^\*\*(.+?)\*\*\s*〔(.+)〕$/u);
    if (!match) throw new Error(`${questionId} 的第 ${index + 1} 个选项格式无效。`);

    const scores = {};
    match[2].split("｜").forEach((scoreExpression) => {
      const scoreMatch = scoreExpression.trim().match(/^(.+?)\+([0-4])$/u);
      const dimensionCode = scoreMatch?.[1];
      const dimensionKey = DIMENSION_KEY_BY_CODE.get(dimensionCode);

      if (!scoreMatch || !dimensionKey || dimensionKey in scores) {
        throw new Error(
          `${questionId} 的第 ${index + 1} 个选项分值格式无效：${scoreExpression}`,
        );
      }
      scores[dimensionKey] = Number(scoreMatch[2]);
    });

    return {
      id: ["A", "B", "C", "D"][index],
      text: match[1],
      scores,
    };
  });
}

export function parseQuestions(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const questions = [];

  lines.forEach((line, index) => {
    const heading = line.match(/^### ([A-D]\d{2,})$/u);
    if (!heading) return;

    const id = heading[1];
    const stratum = id[0];
    const metadataLine = nextContentLine(lines, index + 1);
    const metadataMatch = metadataLine?.value.match(/^<!-- selection: (.+) -->$/u);
    if (!metadataMatch) throw new Error(`${id} 缺少 selection 元数据。`);
    const metadata = JSON.parse(metadataMatch[1]);
    const promptLine = nextContentLine(lines, metadataLine.index + 1);
    const optionsLine = promptLine
      ? nextContentLine(lines, promptLine.index + 1)
      : null;

    if (!promptLine || !optionsLine) {
      throw new Error(`${id} 缺少题干或选项。`);
    }

    questions.push({
      id,
      stratum,
      type: STRATA[stratum].type,
      dimensions: metadata.dimensions,
      status: metadata.status,
      semantic_group: metadata.semantic_group,
      prompt: promptLine.value,
      options: parseOptions(optionsLine.value, id),
      dimensionJudgement: null,
    });
  });

  return questions;
}

export function buildQuestionBank(markdown) {
  const questions = parseQuestions(markdown);
  globalThis.QuestionSampler.assertQuestions(questions);
  const bankRevision = createHash("sha256")
    .update(JSON.stringify({ dimensions: DIMENSIONS, questions }))
    .digest("hex");
  return {
    version: 4,
    bankRevision,
    title: "情感被骗指数测试",
    scoringStatus: "configured",
    dimensions: DIMENSIONS,
    strata: Object.entries(STRATA).map(([key, value]) => ({
      key, label: value.label, type: value.type,
      questionCount: questions.filter((question) => question.stratum === key).length,
    })),
    questions,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bank = buildQuestionBank(await readFile(sourceUrl, "utf8"));
  await writeFile(outputUrl, `${JSON.stringify(bank, null, 2)}\n`);
  console.log(`Generated ${bank.questions.length} questions in ${outputUrl.pathname}.`);
}
