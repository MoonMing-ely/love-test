(function (global) {
  "use strict";

  const VERSION = "1.1";
  const P1_SOURCES = Object.freeze([
    ["recognition", "high_recognition"],
    ["need", "high_need"],
    ["specialness", "high_specialness"],
    ["scarcity", "high_scarcity"],
  ]);

  function config() {
    if (!global.AlgorithmConfig) {
      throw new Error("第五层算法需要先加载 AlgorithmConfig。");
    }
    return global.AlgorithmConfig;
  }

  function clamp(value) {
    return Math.min(1, Math.max(0, value));
  }

  function validateLayer4(layer4) {
    if (!layer4 || typeof layer4 !== "object" || !layer4.fuzzy) {
      throw new TypeError("第五层算法需要第四层输出对象。");
    }
  }

  function calculateP1(layer4) {
    const values = P1_SOURCES.map(([name, fuzzyKey]) => ({
      name,
      value: layer4.fuzzy[fuzzyKey],
    })).sort((left, right) => right.value - left.value);
    const first = values[0];
    const second = values[1];
    const { P1_FIRST_WEIGHT, P1_SECOND_WEIGHT } = config();

    return {
      score: clamp(
        P1_FIRST_WEIGHT * first.value + P1_SECOND_WEIGHT * second.value,
      ),
      primary_source: first.name,
      secondary_source: second.name,
    };
  }

  function calculateP2(layer4) {
    const core = Math.min(layer4.fuzzy.high_E, layer4.fuzzy.low_J);
    const support = Math.max(
      layer4.fuzzy.high_H,
      layer4.fuzzy.high_J_hole,
    );
    const {
      P2_SUPPORT_WEIGHT,
      P2_JUDGMENT_WEIGHT,
      P2_WEAK_JUDGMENT_WEIGHT,
      P2_AVOIDANCE_WEIGHT,
    } = config();
    const relationship = core * (1 + P2_SUPPORT_WEIGHT * (1 - core) * support);
    const judgment = P2_JUDGMENT_WEIGHT * layer4.fuzzy.low_J;
    const weakJudgment = P2_WEAK_JUDGMENT_WEIGHT * layer4.fuzzy.low_J_weak;
    const avoidance = P2_AVOIDANCE_WEIGHT * layer4.fuzzy.high_H;
    const score = Math.max(relationship, judgment, weakJudgment, avoidance);
    return { score: clamp(score), core, support, relationship, judgment, weakJudgment, avoidance };
  }

  function calculateP3(layer4) {
    const core = Math.min(layer4.fuzzy.high_J, layer4.fuzzy.low_B);
    const support = layer4.fuzzy.high_E;
    const score =
      core * (1 + config().P3_SUPPORT_WEIGHT * (1 - core) * support);
    return { score: clamp(score), core, support };
  }

  function calculateP4(layer4) {
    const tWeak = layer4.fuzzy.low_T;
    const fWeak = layer4.fuzzy.low_F;
    const first = Math.max(tWeak, fWeak);
    const second = Math.min(tWeak, fWeak);
    const {
      P4_FIRST_WEIGHT,
      P4_SECOND_WEIGHT,
      P4_SUPPORT_WEIGHT,
    } = config();
    const core = P4_FIRST_WEIGHT * first + P4_SECOND_WEIGHT * second;
    const support = layer4.fuzzy.high_E;
    const score = core * (1 + P4_SUPPORT_WEIGHT * (1 - core) * support);

    return { score: clamp(score), core, support, tWeak, fWeak };
  }

  function incompleteResult(layer4) {
    return {
      version: VERSION,
      status: "insufficient_data",
      missingDimensions: [...(layer4.missingDimensions ?? [])],
      P1_relation_value_amplification: null,
      P2_judgment_shift: null,
      P3_action_failure: null,
      P4_exit_difficulty: null,
      protection: {
        M: layer4.M,
        self_consistency: layer4.self_consistency,
      },
      diagnostics: {
        P1_primary_source: null,
        P1_secondary_source: null,
        J_weak_source: layer4.J_weak_source,
        E_peak: layer4.E_peak,
        E_sharp: layer4.E_sharp,
        J_weak: layer4.J_weak,
        J_hole: layer4.J_hole,
        BT_gap: layer4.BT_gap,
      },
      debug: null,
    };
  }

  function calculate(layer4) {
    validateLayer4(layer4);
    if (layer4.status !== "complete") return incompleteResult(layer4);

    const p1 = calculateP1(layer4);
    const p2 = calculateP2(layer4);
    const p3 = calculateP3(layer4);
    const p4 = calculateP4(layer4);

    return {
      version: VERSION,
      status: "complete",
      missingDimensions: [],
      P1_relation_value_amplification: p1.score,
      P2_judgment_shift: p2.score,
      P3_action_failure: p3.score,
      P4_exit_difficulty: p4.score,
      protection: {
        M: layer4.M,
        self_consistency: layer4.self_consistency,
      },
      diagnostics: {
        P1_primary_source: p1.primary_source,
        P1_secondary_source: p1.secondary_source,
        J_weak_source: layer4.J_weak_source,
        E_peak: layer4.E_peak,
        E_sharp: layer4.E_sharp,
        J_weak: layer4.J_weak,
        J_hole: layer4.J_hole,
        BT_gap: layer4.BT_gap,
      },
      debug: {
        high_E: layer4.fuzzy.high_E,
        low_J: layer4.fuzzy.low_J,
        core2: p2.core,
        support2: p2.support,
        P2_relationship: p2.relationship,
        P2_judgment: p2.judgment,
        P2_weak_judgment: p2.weakJudgment,
        P2_avoidance: p2.avoidance,
        high_J: layer4.fuzzy.high_J,
        low_B: layer4.fuzzy.low_B,
        core3: p3.core,
        support3: p3.support,
        low_T: p4.tWeak,
        low_F: p4.fWeak,
        core4: p4.core,
        support4: p4.support,
      },
    };
  }

  global.Layer5Mechanisms = Object.freeze({
    VERSION,
    calculateP1,
    calculateP2,
    calculateP3,
    calculateP4,
    calculate,
  });
})(typeof window === "undefined" ? globalThis : window);
