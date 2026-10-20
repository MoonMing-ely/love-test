import { readFile } from "node:fs/promises";
import vm from "node:vm";

export const algorithmPaths = [
  "question-sampler.js", "core-algorithm/dimension-vector.js", "core-algorithm/second-layer-normalizer.js",
  "core-algorithm/third-layer-aggregator.js", "core-algorithm/algorithm-config.js", "core-algorithm/fourth-layer-evidence.js",
  "core-algorithm/fifth-layer-mechanisms.js", "core-algorithm/sixth-layer-integration.js", "scoring.js",
];
const root = new URL("../../", import.meta.url);
export async function loadAlgorithm({ directory = root } = {}) {
  const context = {};
  for (const path of algorithmPaths) {
    const source = await readFile(new URL(`js/${path}`, directory), "utf8");
    vm.runInNewContext(source, context, { filename: path });
  }
  return context;
}

export function scoreDimensions(context, dimensions) {
  const layer4 = context.Layer4Evidence.calculate(dimensions);
  const layer5 = context.Layer5Mechanisms.calculate(layer4);
  return context.Layer6Integration.calculate(layer5);
}

export function scoreAnswers(context, bank, questions, answers) {
  const rawVector = context.DimensionVector.fromAnswers(answers, bank.dimensions);
  const normalized = context.DimensionNormalizer.normalize({ rawVector, dimensions: bank.dimensions, questions });
  const layer3 = context.HigherOrderStructure.aggregate(normalized);
  const layer4 = context.Layer4Evidence.fromLayer3(layer3);
  const layer5 = context.Layer5Mechanisms.calculate(layer4);
  return context.Layer6Integration.calculate(layer5);
}

export const riskKeys = ["recognition", "need", "specialness", "scarcity", "rationalization"];
export const protectionKeys = ["calibration", "evidence", "manipulation", "boundary", "stop_loss", "differentiation", "metacognition"];
export const stableDimensions = Object.freeze({
  recognition: 0.2, need: 0.2, specialness: 0.2, scarcity: 0.2,
  calibration: 0.8, evidence: 0.8, manipulation: 0.8, rationalization: 0.2,
  boundary: 0.8, stop_loss: 0.8, differentiation: 0.8, metacognition: 0.8,
});
