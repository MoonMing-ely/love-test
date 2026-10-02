(function (global) {
  "use strict";

  const VERSION = "1.1";
  const SCORE_SCALE = 100;

  function calibrated(value) {
    return value == null ? null : value * SCORE_SCALE;
  }

  function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function populationStandardDeviation(values, summary) {
    const variance =
      values.reduce((sum, value) => sum + (value - summary) ** 2, 0) /
      values.length;
    return Math.sqrt(variance);
  }

  function hasMissingValue(subScores) {
    return Object.values(subScores).some((value) => value === null);
  }

  function buildE(subScores) {
    if (hasMissingValue(subScores)) {
      return {
        summary: null,
        subScores,
        peak: null,
        dispersion: null,
      };
    }

    const values = Object.values(subScores);
    const summary = mean(values);
    const peakValue = Math.max(...values);

    return {
      summary,
      subScores,
      peak: {
        value: peakValue,
        sources: Object.entries(subScores)
          .filter(([, value]) => value === peakValue)
          .map(([source]) => source),
        gap: peakValue - summary,
      },
      dispersion: populationStandardDeviation(values, summary),
    };
  }

  function buildJ(subScores) {
    if (hasMissingValue(subScores)) {
      return {
        summary: null,
        subScores,
        weak: null,
        dispersion: null,
      };
    }

    const values = Object.values(subScores);
    const summary = mean(values);
    const weakValue = Math.min(...values);

    return {
      summary,
      subScores,
      weak: {
        value: weakValue,
        sources: Object.entries(subScores)
          .filter(([, value]) => value === weakValue)
          .map(([source]) => source),
        gap: summary - weakValue,
      },
      dispersion: populationStandardDeviation(values, summary),
    };
  }

  function buildB(subScores) {
    if (hasMissingValue(subScores)) {
      return {
        summary: null,
        subScores,
        weak: null,
        imbalance: null,
      };
    }

    const values = Object.values(subScores);
    const summary = mean(values);
    const weakValue = Math.min(...values);

    return {
      summary,
      subScores,
      weak: {
        value: weakValue,
        sources: Object.entries(subScores)
          .filter(([, value]) => value === weakValue)
          .map(([source]) => source),
      },
      imbalance: Math.abs(subScores.boundary - subScores.stopLoss),
    };
  }

  function aggregate(normalizedDimensions) {
    if (!normalizedDimensions || typeof normalizedDimensions !== "object") {
      throw new TypeError("第三层算法需要第二层 normalizedDimensions 对象。");
    }

    const traits = normalizedDimensions.traits;
    const special = normalizedDimensions.special;

    return {
      version: VERSION,
      E: buildE({
        recognition: calibrated(traits.recognition),
        need: calibrated(traits.need),
        specialness: calibrated(traits.specialness),
        scarcity: calibrated(traits.scarcity),
      }),
      J: buildJ({
        calibration: calibrated(traits.calibration),
        evidence: calibrated(traits.evidence),
        manipulation: calibrated(traits.manipulation),
      }),
      B: buildB({
        boundary: calibrated(traits.boundary),
        stopLoss: calibrated(traits.stopping),
      }),
      H: calibrated(traits.rationalization),
      F: calibrated(special.differentiation),
      M: calibrated(special.selfCalibration),
      R: null,
    };
  }

  global.HigherOrderStructure = Object.freeze({
    VERSION,
    aggregate,
  });
})(typeof window === "undefined" ? globalThis : window);
