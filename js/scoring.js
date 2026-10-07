(function (global) {
  "use strict";

  // 只适配已经计算好的第六层结果，不重新读取题库或计算前五层。

  const DIMENSION_COUNT = 12;

  /**
   * 单个维度的说明。
   * @typedef {Object} DimensionDefinition
   * @property {string} key - 程序使用的唯一英文键，例如 "recognition"。
   * @property {string} code - 页面可显示的单字简称，例如 "认"。
   * @property {string} label - 给人阅读的完整中文名称。
   */

  /**
   * 一个选项对各维度产生的原始分值。
   *
   * 这是“稀疏向量”：只写受到该选项影响的维度，没写的维度按 0 理解。
   * 运行题库已经配置原始分；接口仍允许 null，以兼容未配置的旧答案。
   *
   * @typedef {Object.<string, number>|null} ScoreVector
   * @example { recognition: 2, evidence: -1 }
   */

  /**
   * 用户完成一道题后生成的答案快照。
   * @typedef {Object} AnswerRecord
   * @property {string} questionId - 题目唯一编号，例如 "A01"；不是数组下标。
   * @property {"A"|"B"|"C"|"D"} option - 用户选中的选项编号。
   * @property {ScoreVector} scores - 该选项当时携带的分值；保存快照可避免题库变化影响旧结果。
   */

  /**
   * calculateResult() 的输入对象。
   * @typedef {Object} ScoringInput
   * @property {AnswerRecord[]} answers - 本次测试的 28 条答案，顺序就是出题顺序。
   * @property {DimensionDefinition[]} dimensions - 12 个维度的名称与唯一键。
   * @property {Object} layer6Integration - 第六层已计算的输出。
   */

  /**
   * 评分模块交给结果页的统一输出。
   * @typedef {Object} ScoringResult
   * @property {3} version - 输出结构版本；字段发生不兼容变化时才升级。
   * @property {"scored"|"insufficient_data"} status - 已计算或数据不足。
   * @property {number} dimensionCount - 维度数量，当前固定为 12。
   * @property {number|null} totalScore - 最终分；数据不足时为 null。
   * @property {Object.<string, number>|null} dimensionScores - 以维度 key 为键的最终分数。
   * @property {string} title - 结果页主标题。
   * @property {string} summary - 结果页解释文字。
   */

  function isScoreVector(value, dimensionKeys) {
    if (value === null) return true;
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;

    return Object.entries(value).every(
      ([key, score]) => dimensionKeys.has(key) && Number.isFinite(score),
    );
  }

  function validateScoringInput(input) {
    if (!input || typeof input !== "object") {
      throw new TypeError("评分接口需要传入 { answers, dimensions } 对象。");
    }

    const { answers, dimensions } = input;
    if (!Array.isArray(answers) || answers.length === 0) {
      throw new Error("没有可用于生成测试记录的答案。");
    }
    if (!Array.isArray(dimensions) || dimensions.length !== DIMENSION_COUNT) {
      throw new Error(`评分接口需要 ${DIMENSION_COUNT} 个维度定义。`);
    }

    const validDimensions = dimensions.every(
      (dimension) =>
        typeof dimension?.key === "string" &&
        dimension.key.length > 0 &&
        typeof dimension.code === "string" &&
        typeof dimension.label === "string",
    );
    const dimensionKeys = new Set(dimensions.map((dimension) => dimension?.key));
    if (!validDimensions || dimensionKeys.size !== DIMENSION_COUNT) {
      throw new Error("每个评分维度都必须具有唯一的 key。");
    }

    const answeredQuestionIds = new Set();
    answers.forEach((answer, index) => {
      const valid =
        typeof answer?.questionId === "string" &&
        !answeredQuestionIds.has(answer.questionId) &&
        /^[A-D]$/u.test(answer?.option) &&
        isScoreVector(answer?.scores, dimensionKeys);
      if (!valid) {
        throw new Error(`第 ${index + 1} 条答案不符合 AnswerRecord 接口。`);
      }
      answeredQuestionIds.add(answer.questionId);
    });
  }

  /**
   * 评分算法的公开入口。
   *
   * @param {ScoringInput} input - 答案快照和 12 个维度定义。
   * @returns {ScoringResult} 结果页可以直接读取的统一结果对象。
   */
  function calculateResult(input) {
    validateScoringInput(input);

    const layer6 = input.layer6Integration;
    if (!layer6 || !["complete", "insufficient_data"].includes(layer6.status)) {
      throw new TypeError("评分接口需要第六层 layer6Integration 输出。");
    }
    const complete = layer6.status === "complete";
    if (complete && (!Number.isFinite(layer6.totalScore) || layer6.totalScore < 0 || layer6.totalScore > 100 ||
        ![1, 2, 3, 4].includes(layer6.stage))) {
      throw new RangeError("第六层最终分或阶段无效。");
    }
    return {
      version: 3,
      status: complete ? "scored" : "insufficient_data",
      dimensionCount: input.dimensions.length,
      totalScore: complete ? layer6.totalScore : null,
      dimensionScores: null,
      stage: complete ? layer6.stage : null,
      title: complete ? "情感被骗指数" : "测试数据不足",
      summary: complete
        ? `Stage ${layer6.stage} · ${layer6.shapeLabel ?? "无典型形状"} · ${layer6.paths.map((path) => path.label).join(" + ") || "无明显路径"}。V1 参数待校准。`
        : "本次数据不足以计算最终分数，请重测一次。",
    };
  }

  global.QuizScoring = Object.freeze({
    DIMENSION_COUNT,
    calculateResult,
    validateScoringInput,
  });
})(typeof window === "undefined" ? globalThis : window);
