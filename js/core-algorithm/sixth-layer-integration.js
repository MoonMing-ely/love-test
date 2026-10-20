(function (global) {
  "use strict";

  const VERSION = "1.6";
  const SHAPE_LABELS = Object.freeze({
    A: "整体较低", F: "单项突出", G: "多项中等", H: "多项突出",
  });

  function clip(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function stageForScore(score) {
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new RangeError("阶段映射需要 0～100 的最终分数。");
    }
    return score < 30 ? 1 : score < 50 ? 2 : score < 70 ? 3 : 4;
  }

  function scoreForEvidence(evidence) {
    const anchors = global.AlgorithmConfig?.LAYER6?.SCORE_ANCHORS;
    if (!anchors) throw new Error("第六层算法需要分数标尺锚点。");
    const first = anchors[0];
    const last = anchors[anchors.length - 1];
    if (!Number.isFinite(evidence) || evidence < first.evidence || evidence > last.evidence) {
      throw new RangeError(`证据分必须是 ${first.evidence}～${last.evidence} 的数字。`);
    }
    for (let index = 1; index < anchors.length; index += 1) {
      const left = anchors[index - 1];
      const right = anchors[index];
      if (evidence <= right.evidence) {
        return left.score + (right.score - left.score) *
          (evidence - left.evidence) / (right.evidence - left.evidence);
      }
    }
  }

  function shapeFor(values, average, sorted, config) {
    const shape = config.SHAPE;
    if (average <= shape.A_MEAN_MAX && sorted[0] <= shape.A_MAX) return "A";
    if (values.filter((value) => value >= shape.H_THREE_MIN).length >= 3 ||
        values.filter((value) => value >= shape.H_TWO_MIN).length >= 2) return "H";
    if (sorted[0] >= shape.F_MAX_MIN && sorted[0] - sorted[1] >= shape.F_GAP_MIN &&
        (sorted[1] + sorted[2] + sorted[3]) / 3 <= shape.F_OTHERS_MAX) return "F";
    if (average >= shape.G_MEAN_MIN && average <= shape.G_MEAN_MAX &&
        sorted[0] - sorted[3] <= shape.G_SPREAD_MAX) return "G";
    return null;
  }

  function calculate(layer5) {
    const config = global.AlgorithmConfig?.LAYER6;
    if (!config) throw new Error("第六层算法需要先加载 AlgorithmConfig.LAYER6。");
    if (!layer5 || typeof layer5 !== "object" || Array.isArray(layer5) ||
        !["complete", "insufficient_data"].includes(layer5.status)) {
      throw new TypeError("第六层算法需要第五层输出对象。");
    }

    const input = Object.fromEntries(config.PATHS.map((path) => [path.id, layer5[path.key]]));
    input.M = layer5.protection?.M;
    const missingInputs = [];
    for (const [key, value] of Object.entries(input)) {
      if (value == null) missingInputs.push(key);
      else if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`${key} 必须是 0～1 的数字或 null。`);
      }
    }
    const base = {
      version: VERSION,
      missingInputs,
      missingDimensions: [...(layer5.missingDimensions ?? [])],
    };
    if (missingInputs.length > 0 || layer5.status !== "complete") {
      return { ...base, status: "insufficient_data", totalScore: null, stage: null,
        shape: null, shapeLabel: null, paths: [], diagnostics: null, debug: null };
    }

    const values = config.PATHS.map((path) => input[path.id]);
    const average = values.reduce((sum, value) => sum + value, 0) / 4;
    const sorted = [...values].sort((left, right) => right - left);
    const maximumCeiling = Math.max(...config.PATHS.map((path) => path.ceiling));
    const allPaths = config.PATHS.map((path) => {
      const value = input[path.id];
      const severity = path.ceiling * value;
      // 解释路径按实际严重度排序；标签与入选阈值不参与总分。
      const match = severity / maximumCeiling;
      return { ...path, value, match, severity,
        eligible: value >= path.threshold };
    });
    // 稳定排序保留配置中的 B/C/D/E 同分顺序；标签不参与计分分支。
    const candidates = allPaths.filter((path) => path.eligible)
      .sort((left, right) => right.match - left.match);
    const selected = candidates.slice(0, 1);
    if (candidates.length > 1 && candidates[1].match >= config.SECOND_MATCH_MIN &&
        candidates[1].match / candidates[0].match >= config.SECOND_RATIO_MIN) {
      selected.push(candidates[1]);
    }
    const matchSquares = selected.reduce((sum, path) => sum + path.match ** 2, 0);
    const paths = selected.map((path) => ({ ...path, weight: path.match ** 2 / matchSquares }));
    const pathSeverity = Math.max(...allPaths.map((path) => path.severity));
    const supplementarySeverity = config.SUPPLEMENTARY_WEIGHT *
      (allPaths.reduce((sum, path) => sum + path.severity, 0) - pathSeverity);
    const preScore = pathSeverity + supplementarySeverity;
    const protectionAdjustment = -config.PROTECTION_MAX * input.M *
      Math.min(1, preScore / config.PROTECTION_FULL_SCORE);
    const evidenceScore = clip(preScore + protectionAdjustment, 0, 100);
    const totalScore = scoreForEvidence(evidenceScore);
    const shape = shapeFor(values, average, sorted, config);

    return {
      ...base, status: "complete", totalScore, stage: stageForScore(totalScore),
      shape, shapeLabel: SHAPE_LABELS[shape] ?? null, paths,
      diagnostics: { maximumCeiling, supplementaryWeight: config.SUPPLEMENTARY_WEIGHT },
      debug: { input, mean: average, max: sorted[0], min: sorted[3],
        spread: sorted[0] - sorted[3], sorted, allPaths, pathSeverity,
        supplementarySeverity, preScore, protectionAdjustment, evidenceScore },
    };
  }

  global.Layer6Integration = Object.freeze({ VERSION, calculate, stageForScore, scoreForEvidence });
})(typeof window === "undefined" ? globalThis : window);
