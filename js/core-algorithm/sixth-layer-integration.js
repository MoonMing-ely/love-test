(function (global) {
  "use strict";

  const VERSION = "1.4";
  const SHAPE_LABELS = Object.freeze({
    A: "整体稳定", F: "单点突出", G: "弥散中度", H: "多路径高风险",
  });

  function clip(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function smooth(value, start, full) {
    const t = clip((value - start) / (full - start));
    return t * t * (3 - 2 * t);
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
    const allPaths = config.PATHS.map((path) => {
      const value = input[path.id];
      const otherMean = (4 * average - value) / 3;
      const prominence = value - otherMean;
      const match = config.ABSOLUTE_WEIGHT * value +
        (1 - config.ABSOLUTE_WEIGHT) * clip(0.5 + prominence);
      const activation = smooth(value, path.threshold - config.ACTIVATION_BEFORE,
        path.threshold + config.ACTIVATION_AFTER);
      const severity = activation * (path.anchor + config.DEPTH_SCALE * (value - config.DEPTH_CENTER));
      return { ...path, value, otherMean, prominence, match, activation, severity,
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
    const pathAnchor = paths.length ? paths.reduce((sum, path) => sum + path.weight * path.anchor, 0) : null;
    const depth = paths.length ? paths.reduce((sum, path) => sum + path.weight * path.value, 0) : null;

    const baseSeverity = config.BASE_SCALE * average;
    const pathSeverity = Math.max(baseSeverity, ...allPaths.map((path) => path.severity));
    const moderateOverlap = smooth(sorted[2], ...config.MODERATE_RANGE);
    const highOverlap = Math.max(smooth(sorted[2], ...config.HIGH_THREE_RANGE),
      smooth(sorted[1], ...config.HIGH_TWO_RANGE));
    const shapeAdjustment = config.MODERATE_GAIN * moderateOverlap + config.HIGH_GAIN * highOverlap;
    const preScore = pathSeverity + shapeAdjustment;
    const protectionAdjustment = -config.PROTECTION_MAX * input.M *
      Math.min(1, preScore / config.PROTECTION_FULL_SCORE);
    const evidenceScore = clip(preScore + protectionAdjustment, 0, 100);
    const totalScore = scoreForEvidence(evidenceScore);
    const shape = shapeFor(values, average, sorted, config);

    return {
      ...base, status: "complete", totalScore, stage: stageForScore(totalScore),
      shape, shapeLabel: SHAPE_LABELS[shape] ?? null, paths,
      // 原文混合锚点/深度仅解释标签，不覆盖连续严重度主体。
      diagnostics: { pathAnchor, depth,
        depthAdjustment: depth === null ? null : config.DEPTH_SCALE * (depth - config.DEPTH_CENTER) },
      debug: { input, mean: average, max: sorted[0], min: sorted[3],
        spread: sorted[0] - sorted[3], sorted, allPaths, baseSeverity, pathSeverity,
        moderateOverlap, highOverlap, shapeAdjustment, preScore, protectionAdjustment, evidenceScore },
    };
  }

  global.Layer6Integration = Object.freeze({ VERSION, calculate, smooth, stageForScore, scoreForEvidence });
})(typeof window === "undefined" ? globalThis : window);
