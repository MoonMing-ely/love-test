(function (global) {
  "use strict";

  /**
   * 本文件是“答题流程”和“评分算法”之间唯一的公开接口。
   *
   * 当前返回值仍是未计分状态。你以后写算法时，主要修改
   * calculateResult() 中标记为 TODO 的区域即可；
   * 页面抽题、按钮动画和结果存储不需要跟着重写。
   */

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
   * 当前题库尚未配置分数，所以值允许为 null。
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
   */

  /**
   * 评分模块交给结果页的统一输出。
   * @typedef {Object} ScoringResult
   * @property {3} version - 输出结构版本；字段发生不兼容变化时才升级。
   * @property {"scoring-placeholder"|"scored"} status - 占位或已经完成计算。
   * @property {number} dimensionCount - 维度数量，当前固定为 12。
   * @property {number|null} totalScore - 你的总分；未实现算法时为 null。
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

    /*
     * TODO（留给你实现）：
     * 1. 遍历 input.answers。
     * 2. 把每条 answer.scores 中相同维度的数值累加。
     * 3. 根据你的规则做反向计分、权重、归一化或区间判断。
     * 4. 将 status 改为 "scored"，并填写 totalScore、dimensionScores、title、summary。
     *
     * 不要直接依赖答案在数组中的位置；请使用 questionId、option 和维度 key。
     */

    return {
      version: 3,
      status: "scoring-placeholder",
      dimensionCount: input.dimensions.length,
      totalScore: null,
      dimensionScores: null,
      title: "随机抽题测试已完成",
      summary: "28 道题已全部作答；12 维判断标准暂未启用。",
    };
  }

  global.QuizScoring = Object.freeze({
    DIMENSION_COUNT,
    calculateResult,
    validateScoringInput,
  });
})(typeof window === "undefined" ? globalThis : window);
