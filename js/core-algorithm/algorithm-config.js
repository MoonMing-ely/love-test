(function (global) {
  "use strict";

  const AlgorithmConfig = Object.freeze({
    VERSION: "1.4",
    HIGH_START: 0.20,
    HIGH_FULL: 0.80,
    P1_FIRST_WEIGHT: 0.8,
    P1_SECOND_WEIGHT: 0.2,
    P2_SUPPORT_WEIGHT: 0.25,
    P2_JUDGMENT_WEIGHT: 0.8,
    P2_WEAK_JUDGMENT_WEIGHT: 0.5,
    P2_AVOIDANCE_WEIGHT: 0.45,
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
    LAYER6: Object.freeze({
      SCORE_ANCHORS: Object.freeze([
        Object.freeze({ evidence: 0, score: 15 }),
        Object.freeze({ evidence: 30, score: 30 }),
        Object.freeze({ evidence: 70, score: 70 }),
        Object.freeze({ evidence: 91, score: 85 }),
      ]),
      PATHS: Object.freeze([
        Object.freeze({ id: "B", key: "P1_relation_value_amplification", label: "关系价值入口", threshold: 0.50, anchor: 40 }),
        Object.freeze({ id: "C", key: "P2_judgment_shift", label: "判断盲区", threshold: 0.45, anchor: 52 }),
        Object.freeze({ id: "D", key: "P3_action_failure", label: "行动失守", threshold: 0.45, anchor: 60 }),
        Object.freeze({ id: "E", key: "P4_exit_difficulty", label: "退出困难", threshold: 0.45, anchor: 65 }),
      ]),
      SHAPE: Object.freeze({
        A_MEAN_MAX: 0.35, A_MAX: 0.45,
        H_THREE_MIN: 0.65, H_TWO_MIN: 0.75,
        F_MAX_MIN: 0.65, F_GAP_MIN: 0.25, F_OTHERS_MAX: 0.40,
        G_MEAN_MIN: 0.40, G_MEAN_MAX: 0.65, G_SPREAD_MAX: 0.20,
      }),
      ABSOLUTE_WEIGHT: 0.8,
      SECOND_MATCH_MIN: 0.50,
      SECOND_RATIO_MIN: 0.70,
      ACTIVATION_BEFORE: 0.30,
      ACTIVATION_AFTER: 0.35,
      DEPTH_CENTER: 0.60,
      DEPTH_SCALE: 25,
      BASE_SCALE: 70,
      MODERATE_RANGE: Object.freeze([0.35, 0.55]),
      HIGH_THREE_RANGE: Object.freeze([0.55, 0.75]),
      HIGH_TWO_RANGE: Object.freeze([0.65, 0.85]),
      MODERATE_GAIN: 4,
      HIGH_GAIN: 12,
      PROTECTION_MAX: 8,
      PROTECTION_FULL_SCORE: 40,
    }),
  });

  global.AlgorithmConfig = AlgorithmConfig;
})(typeof window === "undefined" ? globalThis : window);
