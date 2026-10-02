(function (global) {
  "use strict";

  const VERSION = "1.0";
  const REQUIRED_KEYS = Object.freeze([
    "recognition",
    "need",
    "specialness",
    "scarcity",
    "calibration",
    "evidence",
    "manipulation",
    "rationalization",
    "boundary",
    "stop_loss",
    "differentiation",
    "metacognition",
  ]);
  const E_KEYS = Object.freeze([
    "recognition",
    "need",
    "specialness",
    "scarcity",
  ]);
  const J_KEYS = Object.freeze(["calibration", "evidence", "manipulation"]);

  function config() {
    if (!global.AlgorithmConfig) {
      throw new Error("第四层算法需要先加载 AlgorithmConfig。");
    }
    return global.AlgorithmConfig;
  }

  function clamp(value) {
    return Math.min(1, Math.max(0, value));
  }

  function high(value) {
    if (value === null) return null;

    const { HIGH_START, HIGH_FULL } = config();
    const bounded = clamp(value);
    if (bounded <= HIGH_START) return 0;
    if (bounded >= HIGH_FULL) return 1;
    return (bounded - HIGH_START) / (HIGH_FULL - HIGH_START);
  }

  function low(value) {
    return value === null ? null : high(1 - value);
  }

  function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function validateInput(input) {
    if (!input || typeof input !== "object") {
      throw new TypeError("第四层算法需要第三层输入对象。");
    }

    REQUIRED_KEYS.forEach((key) => {
      const value = input[key];
      if (value === null) return;
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`${key} 必须是 0～1 的数字或 null。`);
      }
    });
  }

  function calculateConsistency(selfReportScores, behaviorScores) {
    if (!selfReportScores || !behaviorScores) return null;

    const sharedKeys = Object.keys(selfReportScores).filter((key) =>
      Object.hasOwn(behaviorScores, key),
    );
    if (sharedKeys.length === 0) return null;

    const values = sharedKeys.map((key) => {
      const selfReport = selfReportScores[key];
      const behavior = behaviorScores[key];
      if (
        !Number.isFinite(selfReport) ||
        selfReport < 0 ||
        selfReport > 1 ||
        !Number.isFinite(behavior) ||
        behavior < 0 ||
        behavior > 1
      ) {
        throw new RangeError(`一致性证据 ${key} 必须是 0～1 的数字。`);
      }
      return 1 - Math.abs(selfReport - behavior);
    });

    return mean(values);
  }

  function calculate(input) {
    validateInput(input);

    const missingDimensions = REQUIRED_KEYS.filter((key) => input[key] === null);
    const eComplete = E_KEYS.every((key) => input[key] !== null);
    const jComplete = J_KEYS.every((key) => input[key] !== null);
    const E = eComplete ? mean(E_KEYS.map((key) => input[key])) : null;
    const J = jComplete ? mean(J_KEYS.map((key) => input[key])) : null;
    const H = input.rationalization;
    const B = input.boundary;
    const T = input.stop_loss;
    const F = input.differentiation;
    const M = input.metacognition;

    const sortedE = eComplete
      ? E_KEYS.map((name) => ({ name, value: input[name] })).sort(
          (left, right) => right.value - left.value,
        )
      : null;
    const weakestJ = jComplete
      ? J_KEYS.map((name) => ({ name, value: input[name] })).reduce(
          (weakest, item) => (item.value < weakest.value ? item : weakest),
        )
      : null;
    const EPeak = sortedE?.[0] ?? null;
    const ESecond = sortedE?.[1] ?? null;
    const JWeak = weakestJ;
    const JHole = J === null ? null : Math.max(0, J - JWeak.value);
    const selfConsistency = calculateConsistency(
      input.self_report_scores,
      input.behavior_scores,
    );

    return {
      version: VERSION,
      status: missingDimensions.length === 0 ? "complete" : "insufficient_data",
      missingDimensions,
      E,
      J,
      H,
      B,
      T,
      F,
      M,
      recognition: input.recognition,
      need: input.need,
      specialness: input.specialness,
      scarcity: input.scarcity,
      calibration: input.calibration,
      evidence: input.evidence,
      manipulation: input.manipulation,
      E_peak: EPeak?.value ?? null,
      E_second: ESecond?.value ?? null,
      E_sharp: EPeak === null ? null : Math.max(0, EPeak.value - E),
      E_peak_source: EPeak?.name ?? null,
      J_weak: JWeak?.value ?? null,
      J_hole: JHole,
      J_weak_source: JWeak?.name ?? null,
      BT_gap: B === null || T === null ? null : Math.abs(B - T),
      self_consistency: selfConsistency,
      fuzzy: {
        high_E: high(E),
        low_E: low(E),
        high_J: high(J),
        low_J: low(J),
        high_H: high(H),
        low_H: low(H),
        high_B: high(B),
        low_B: low(B),
        high_T: high(T),
        low_T: low(T),
        high_F: high(F),
        low_F: low(F),
        high_M: high(M),
        low_M: low(M),
        high_recognition: high(input.recognition),
        high_need: high(input.need),
        high_specialness: high(input.specialness),
        high_scarcity: high(input.scarcity),
        high_J_hole: high(JHole),
      },
    };
  }

  function fromLayer3(layer3Structures, optionalEvidence = {}) {
    if (!layer3Structures || typeof layer3Structures !== "object") {
      throw new TypeError("第四层适配器需要 layer3Structures 对象。");
    }

    const e = layer3Structures.E?.subScores ?? {};
    const j = layer3Structures.J?.subScores ?? {};
    const b = layer3Structures.B?.subScores ?? {};
    const toUnit = (value) => (value == null ? null : value / 100);

    return calculate({
      recognition: toUnit(e.recognition),
      need: toUnit(e.need),
      specialness: toUnit(e.specialness),
      scarcity: toUnit(e.scarcity),
      calibration: toUnit(j.calibration),
      evidence: toUnit(j.evidence),
      manipulation: toUnit(j.manipulation),
      rationalization: toUnit(layer3Structures.H),
      boundary: toUnit(b.boundary),
      stop_loss: toUnit(b.stopLoss),
      differentiation: toUnit(layer3Structures.F),
      metacognition: toUnit(layer3Structures.M),
      self_report_scores: optionalEvidence.self_report_scores,
      behavior_scores: optionalEvidence.behavior_scores,
    });
  }

  global.Layer4Evidence = Object.freeze({
    VERSION,
    REQUIRED_KEYS,
    clamp,
    high,
    low,
    calculate,
    fromLayer3,
  });
})(typeof window === "undefined" ? globalThis : window);
