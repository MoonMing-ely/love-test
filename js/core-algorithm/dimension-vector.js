(function (global) {
  "use strict";

  const DIMENSION_COUNT = 12;

  function create() {
    return Array(DIMENSION_COUNT).fill(0);
  }

  function getDimensionIndex(dimensions) {
    if (!Array.isArray(dimensions) || dimensions.length !== DIMENSION_COUNT) {
      throw new Error(`维度向量需要 ${DIMENSION_COUNT} 个维度定义。`);
    }

    const dimensionIndex = new Map();
    dimensions.forEach((dimension, index) => {
      if (
        typeof dimension?.key !== "string" ||
        dimension.key.length === 0 ||
        dimensionIndex.has(dimension.key)
      ) {
        throw new Error("每个维度都必须具有唯一的 key。");
      }
      dimensionIndex.set(dimension.key, index);
    });

    return dimensionIndex;
  }

  function addOption(dimensionVector, optionDimensions, dimensions) {
    if (
      !Array.isArray(dimensionVector) ||
      dimensionVector.length !== DIMENSION_COUNT ||
      !dimensionVector.every(Number.isFinite)
    ) {
      throw new Error(`累计向量必须是包含 ${DIMENSION_COUNT} 个数字的一维数组。`);
    }

    if (optionDimensions === null) return dimensionVector;
    if (
      !optionDimensions ||
      typeof optionDimensions !== "object" ||
      Array.isArray(optionDimensions)
    ) {
      throw new TypeError("选项维度必须是以维度 key 为键的对象或 null。");
    }

    const dimensionIndex = getDimensionIndex(dimensions);
    Object.entries(optionDimensions).forEach(([dimensionKey, value]) => {
      const index = dimensionIndex.get(dimensionKey);
      if (index === undefined || !Number.isFinite(value)) {
        throw new Error(`选项包含无效维度：${dimensionKey}`);
      }
      dimensionVector[index] += value;
    });

    return dimensionVector;
  }

  function fromAnswers(answers, dimensions) {
    if (!Array.isArray(answers)) {
      throw new TypeError("答案记录必须是数组。");
    }

    return answers.reduce(
      (dimensionVector, answer) =>
        addOption(dimensionVector, answer?.scores ?? null, dimensions),
      create(),
    );
  }

  global.DimensionVector = Object.freeze({
    DIMENSION_COUNT,
    create,
    addOption,
    fromAnswers,
  });
})(typeof window === "undefined" ? globalThis : window);
