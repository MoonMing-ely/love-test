(function (global) {
  "use strict";

  function assertSampleRequest(questions, sampleSize) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("题库不能为空。");
    }
    if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
      throw new Error("抽题数量必须是正整数。");
    }
    if (sampleSize > questions.length) {
      throw new Error("抽题数量不能超过题库总数。");
    }

    const ids = new Set();
    questions.forEach((question) => {
      if (!question?.id || !question?.stratum) {
        throw new Error("每道题都必须包含 id 和 stratum。");
      }
      if (ids.has(question.id)) {
        throw new Error(`题目编号重复：${question.id}`);
      }
      ids.add(question.id);
    });
  }

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function allocateProportionally(groups, sampleSize, random = Math.random) {
    const total = groups.reduce((sum, group) => sum + group.questions.length, 0);
    const allocations = groups.map((group) => {
      const exact = (group.questions.length / total) * sampleSize;
      return {
        key: group.key,
        count: Math.floor(exact),
        remainder: exact - Math.floor(exact),
        tieBreaker: random(),
      };
    });
    let remaining = sampleSize - allocations.reduce((sum, item) => sum + item.count, 0);

    allocations
      .sort((left, right) =>
        right.remainder - left.remainder || right.tieBreaker - left.tieBreaker,
      )
      .forEach((allocation) => {
        if (remaining > 0) {
          allocation.count += 1;
          remaining -= 1;
        }
      });

    return Object.fromEntries(allocations.map(({ key, count }) => [key, count]));
  }

  /**
   * 按题型层比例抽题的公开接口。
   *
   * @param {Object[]} questions - 完整题库；每题至少包含唯一 id 和 stratum。
   * @param {number} sampleSize - 需要抽取的题数，当前页面传入 28。
   * @param {Function} random - 可注入的随机函数；正式运行使用 Math.random，测试时可固定。
   * @returns {{questions: Object[], allocation: Object.<string, number>}}
   * questions 是已打乱且不重复的题目；allocation 记录每个 stratum 实际抽了几题。
   */
  function sampleStratified(questions, sampleSize = 28, random = Math.random) {
    assertSampleRequest(questions, sampleSize);

    const grouped = new Map();
    questions.forEach((question) => {
      if (!grouped.has(question.stratum)) grouped.set(question.stratum, []);
      grouped.get(question.stratum).push(question);
    });

    const groups = Array.from(grouped, ([key, groupQuestions]) => ({
      key,
      questions: groupQuestions,
    }));
    const allocation = allocateProportionally(groups, sampleSize, random);
    const selected = groups.flatMap((group) =>
      shuffle(group.questions, random).slice(0, allocation[group.key]),
    );

    return {
      questions: shuffle(selected, random),
      allocation,
    };
  }

  global.QuestionSampler = Object.freeze({
    allocateProportionally,
    sampleStratified,
    shuffle,
  });
})(typeof window === "undefined" ? globalThis : window);
