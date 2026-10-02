(function (global) {
  "use strict";

  const DIMENSION_COUNT = 12;
  const TRAIT_OUTPUT_KEYS = Object.freeze({
    recognition: "recognition",
    needed: "need",
    specialness: "specialness",
    scarcity: "scarcity",
    calibration: "calibration",
    evidence: "evidence",
    manipulation: "manipulation",
    rationalization: "rationalization",
    boundaries: "boundary",
    stopLoss: "stopping",
  });
  const SPECIAL_OUTPUT_KEYS = Object.freeze({
    differentiation: "differentiation",
    selfCalibration: "selfCalibration",
  });
  const REQUIRED_DIMENSION_KEYS = Object.freeze([
    ...Object.keys(TRAIT_OUTPUT_KEYS),
    ...Object.keys(SPECIAL_OUTPUT_KEYS),
  ]);

  function validateInput(input) {
    if (!input || typeof input !== "object") {
      throw new TypeError(
        "第二层算法需要传入 { rawVector, dimensions, questions } 对象。",
      );
    }

    const { rawVector, dimensions, questions } = input;
    if (
      !Array.isArray(rawVector) ||
      rawVector.length !== DIMENSION_COUNT ||
      !rawVector.every(Number.isFinite)
    ) {
      throw new Error(`rawVector 必须是包含 ${DIMENSION_COUNT} 个数字的一维数组。`);
    }
    if (!Array.isArray(dimensions) || dimensions.length !== DIMENSION_COUNT) {
      throw new Error(`第二层算法需要 ${DIMENSION_COUNT} 个维度定义。`);
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("第二层算法需要本轮实际使用的题目。");
    }

    const dimensionKeys = dimensions.map((dimension) => dimension?.key);
    if (
      new Set(dimensionKeys).size !== DIMENSION_COUNT ||
      !REQUIRED_DIMENSION_KEYS.every((key) => dimensionKeys.includes(key))
    ) {
      throw new Error("第二层算法需要完整且唯一的 12 个标准维度 key。");
    }

    const questionIds = new Set();
    questions.forEach((question) => {
      if (
        typeof question?.id !== "string" ||
        questionIds.has(question.id) ||
        !Array.isArray(question.options) ||
        question.options.length === 0
      ) {
        throw new Error("第二层算法收到无效或重复的题目。");
      }
      questionIds.add(question.id);
    });
  }

  function calculateCapacity(questions, dimensionKeys) {
    const capacity = Object.fromEntries(dimensionKeys.map((key) => [key, 0]));
    const contributingQuestionCount = Object.fromEntries(
      dimensionKeys.map((key) => [key, 0]),
    );
    const knownKeys = new Set(dimensionKeys);

    questions.forEach((question) => {
      const maxima = new Map();

      question.options.forEach((option) => {
        if (option?.scores === null) return;
        if (
          !option?.scores ||
          typeof option.scores !== "object" ||
          Array.isArray(option.scores)
        ) {
          throw new Error(`${question.id} 包含无效的选项分值。`);
        }

        Object.entries(option.scores).forEach(([dimensionKey, score]) => {
          if (
            !knownKeys.has(dimensionKey) ||
            !Number.isInteger(score) ||
            score < 0 ||
            score > 4
          ) {
            throw new Error(
              `${question.id} 包含无效分值：${dimensionKey}=${score}`,
            );
          }
          maxima.set(
            dimensionKey,
            Math.max(maxima.get(dimensionKey) ?? 0, score),
          );
        });
      });

      maxima.forEach((maximum, dimensionKey) => {
        capacity[dimensionKey] += maximum;
        contributingQuestionCount[dimensionKey] += 1;
      });
    });

    return { capacity, contributingQuestionCount };
  }

  function normalize(input) {
    validateInput(input);

    const { rawVector, dimensions, questions } = input;
    const dimensionKeys = dimensions.map(({ key }) => key);
    const raw = Object.fromEntries(
      dimensionKeys.map((key, index) => [key, rawVector[index]]),
    );
    const { capacity, contributingQuestionCount } = calculateCapacity(
      questions,
      dimensionKeys,
    );
    const value = {};
    const dimensionMeanContribution = {};
    const warnings = [];

    dimensionKeys.forEach((key) => {
      const currentRaw = raw[key];
      const currentCapacity = capacity[key];
      const questionCount = contributingQuestionCount[key];

      dimensionMeanContribution[key] =
        questionCount > 0 ? currentCapacity / questionCount : null;

      if (currentCapacity === 0) {
        value[key] = null;
        if (currentRaw !== 0) {
          warnings.push(`${key}: capacity 为 0，但 raw 为 ${currentRaw}。`);
        }
        return;
      }

      const unboundedValue = currentRaw / currentCapacity;
      if (unboundedValue < 0 || unboundedValue > 1) {
        warnings.push(
          `${key}: raw/capacity=${unboundedValue} 超出 0～1，已执行 clamp。`,
        );
      }
      value[key] = Math.min(1, Math.max(0, unboundedValue));
    });

    const traits = Object.fromEntries(
      Object.entries(TRAIT_OUTPUT_KEYS).map(([dimensionKey, outputKey]) => [
        outputKey,
        value[dimensionKey],
      ]),
    );
    const special = Object.fromEntries(
      Object.entries(SPECIAL_OUTPUT_KEYS).map(([dimensionKey, outputKey]) => [
        outputKey,
        value[dimensionKey],
      ]),
    );

    return {
      traits,
      special,
      exposure: {
        boundary: null,
        stopping: null,
      },
      debug: {
        raw,
        capacity,
        value,
        dimensionMeanContribution,
        warnings,
      },
    };
  }

  global.DimensionNormalizer = Object.freeze({
    DIMENSION_COUNT,
    normalize,
  });
})(typeof window === "undefined" ? globalThis : window);
