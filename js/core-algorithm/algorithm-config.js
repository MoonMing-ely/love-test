(function (global) {
  "use strict";

  const AlgorithmConfig = Object.freeze({
    VERSION: "1.6",
    // 全区间线性证据，避免 0.2/0.8 提前饱和及中段 1.67 倍放大。
    HIGH_START: 0,
    HIGH_FULL: 1,
    P1_FIRST_WEIGHT: 0.8,
    P1_SECOND_WEIGHT: 0.2,
    P2_SUPPORT_WEIGHT: 0.25,
    P2_WEAK_SHARE: 0.7,
    P2_AVOIDANCE_WEIGHT: 0.6,
    P3_SUPPORT_WEIGHT: 0.2,
    P4_FIRST_WEIGHT: 0.5,
    P4_STOPPING_WEIGHT: 0.3,
    P4_SECOND_WEIGHT: 0.2,
    P4_SUPPORT_WEIGHT: 0.15,
    LAYER6: Object.freeze({
      SCORE_ANCHORS: Object.freeze([
        Object.freeze({ evidence: 0, score: 15 }),
        Object.freeze({ evidence: 30, score: 30 }),
        Object.freeze({ evidence: 70, score: 70 }),
        Object.freeze({ evidence: 90.6, score: 85 }),
      ]),
      PATHS: Object.freeze([
        Object.freeze({ id: "B", key: "P1_relation_value_amplification", label: "关系价值入口", threshold: 0.50, ceiling: 24 }),
        Object.freeze({ id: "C", key: "P2_judgment_shift", label: "判断盲区", threshold: 0.45, ceiling: 62 }),
        Object.freeze({ id: "D", key: "P3_action_failure", label: "行动失守", threshold: 0.45, ceiling: 70 }),
        Object.freeze({ id: "E", key: "P4_exit_difficulty", label: "退出困难", threshold: 0.45, ceiling: 75 }),
      ]),
      SHAPE: Object.freeze({
        A_MEAN_MAX: 0.35, A_MAX: 0.45,
        H_THREE_MIN: 0.65, H_TWO_MIN: 0.75,
        F_MAX_MIN: 0.65, F_GAP_MIN: 0.25, F_OTHERS_MAX: 0.40,
        G_MEAN_MIN: 0.40, G_MEAN_MAX: 0.65, G_SPREAD_MAX: 0.20,
      }),
      SECOND_MATCH_MIN: 0.50,
      SECOND_RATIO_MIN: 0.70,
      // 最强路径 + 其余路径严重度之和的 10%；不再另叠共现激活曲线。
      SUPPLEMENTARY_WEIGHT: 0.1,
      PROTECTION_MAX: 8,
      PROTECTION_FULL_SCORE: 40,
    }),
  });

  global.AlgorithmConfig = AlgorithmConfig;
})(typeof window === "undefined" ? globalThis : window);
