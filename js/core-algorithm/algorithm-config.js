(function (global) {
  "use strict";

  const AlgorithmConfig = Object.freeze({
    VERSION: "1.0",
    HIGH_START: 0.35,
    HIGH_FULL: 0.75,
    P1_FIRST_WEIGHT: 0.8,
    P1_SECOND_WEIGHT: 0.2,
    P2_SUPPORT_WEIGHT: 0.25,
    P3_SUPPORT_WEIGHT: 0.2,
    P4_FIRST_WEIGHT: 0.8,
    P4_SECOND_WEIGHT: 0.2,
    P4_SUPPORT_WEIGHT: 0.15,
    SOURCE_TYPE_WEIGHTS: Object.freeze({
      A: 1,
      B: 1.2,
      C: 0.6,
      D: 0.8,
    }),
    CROSS_DIMENSION_CONTRIBUTION_LIMIT: 1.5,
  });

  global.AlgorithmConfig = AlgorithmConfig;
})(typeof window === "undefined" ? globalThis : window);
