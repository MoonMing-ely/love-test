(function (global) {
  "use strict";
  const TYPE_QUOTA = Object.freeze({ A: 12, B: 6, C: 6, D: 4 });
  const MINIMUM = Object.freeze({
    recognition: 1, needed: 1, specialness: 1, scarcity: 1,
    calibration: 2, evidence: 2, manipulation: 2, rationalization: 2,
    boundaries: 2, stopLoss: 2, differentiation: 2, selfCalibration: 2,
  });
  const CRITICAL = Object.freeze(["calibration", "evidence", "manipulation", "boundaries", "stopLoss", "differentiation"]);
  const KEYS = Object.keys(MINIMUM);
  const SAMPLE_SIZE = 28;
  const MAX_ATTEMPTS = 100;
  const SELECTION_VERSION = 1;

  function constraintError(reason, details) {
    const error = new Error(reason === "pool_insufficient" ? `有效题池不足：${details.join("；")}` : "100 次尝试仍未找到合格题组。");
    Object.assign(error, { name: "QuestionPoolConstraintError", reason, details });
    return error;
  }

  function assertQuestions(questions) {
    if (!Array.isArray(questions) || !questions.length) throw new Error("题库不能为空。");
    const ids = new Set();
    for (const q of questions) {
      if (!q || typeof q.id !== "string" || !/^[A-D]\d{2,}$/u.test(q.id) || ids.has(q.id)
        || !Object.hasOwn(TYPE_QUOTA, q.stratum) || q.stratum !== q.id[0]
        || typeof q.prompt !== "string" || !q.prompt.trim()
        || !["valid", "review", "disabled"].includes(q.status)
        || typeof q.semantic_group !== "string" || !/^[a-z][a-z0-9_]*$/u.test(q.semantic_group)
        || !Array.isArray(q.dimensions) || !q.dimensions.length
        || new Set(q.dimensions).size !== q.dimensions.length
        || q.dimensions.some((key) => !Object.hasOwn(MINIMUM, key))) {
        throw new Error(`题目元数据无效或 ID 重复：${q?.id ?? "未知"}`);
      }
      ids.add(q.id);
      if (!Array.isArray(q.options) || q.options.length !== 4) throw new Error(`${q.id} 必须有四个选项。`);
      const scoredKeys = new Set();
      q.options.forEach((option, index) => {
        if (option?.id !== "ABCD"[index] || typeof option.text !== "string" || !option.text.trim()
          || !option.scores || typeof option.scores !== "object" || Array.isArray(option.scores)
          || !Object.keys(option.scores).length) throw new Error(`${q.id} 选项或分值无效。`);
        for (const [key, score] of Object.entries(option.scores)) {
          if (!Object.hasOwn(MINIMUM, key) || !Number.isInteger(score) || score < 0 || score > 4) throw new Error(`${q.id} 分值无效：${key}=${score}`);
          scoredKeys.add(key);
        }
      });
      if (scoredKeys.size !== q.dimensions.length || q.dimensions.some((key) => !scoredKeys.has(key))) throw new Error(`${q.id} dimensions 与选项计分维度不一致。`);
      if (q.status === "valid" && q.dimensions.some((key) => {
        const scores = q.options.map((option) => option.scores[key] ?? 0);
        return Math.max(...scores) === 0 || new Set(scores).size < 2;
      })) throw new Error(`${q.id} 标注维度缺少有效分值差异。`);
    }
  }

  function assertQuestionBank(data) {
    const keys = data?.dimensions?.map((dimension) => dimension.key);
    if (data?.version !== 4 || data.scoringStatus !== "configured"
      || typeof data.bankRevision !== "string" || !/^[a-f0-9]{64}$/u.test(data.bankRevision)
      || !Array.isArray(keys) || keys.length !== 12 || new Set(keys).size !== 12
      || keys.some((key) => !Object.hasOwn(MINIMUM, key))) throw new Error("题库结构、版本或修订号无效。");
    assertQuestions(data.questions);
  }

  function statistics(questions) {
    const types = { A: 0, B: 0, C: 0, D: 0 };
    const sources = Object.fromEntries(KEYS.map((key) => [key, new Set()]));
    const semantics = Object.create(null);
    for (const q of questions) {
      types[q.stratum] += 1;
      q.dimensions.forEach((key) => sources[key].add(q.id));
      semantics[q.semantic_group] = (semantics[q.semantic_group] ?? 0) + 1;
    }
    return {
      selected_question_ids: questions.map((q) => q.id), type_counts: types,
      dimension_counts: Object.fromEntries(KEYS.map((key) => [key, sources[key].size])),
      dimension_question_ids: Object.fromEntries(KEYS.map((key) => [key, [...sources[key]]])),
      semantic_group_counts: semantics,
    };
  }

  function validateSelection(questions) {
    assertQuestions(questions);
    const debug = statistics(questions);
    const errors = [];
    if (questions.length !== SAMPLE_SIZE) errors.push("总题数必须为 28");
    if (questions.some((q) => q.status !== "valid")) errors.push("包含非 valid 题");
    for (const [type, quota] of Object.entries(TYPE_QUOTA)) if (debug.type_counts[type] !== quota) errors.push(`${type} 配额必须为 ${quota}`);
    for (const [key, minimum] of Object.entries(MINIMUM)) if (debug.dimension_counts[key] < minimum) errors.push(`${key} 来源不足 ${minimum}`);
    if (Object.values(debug.semantic_group_counts).some((count) => count > 2)) errors.push("语义组超过 2 题");
    return { valid: !errors.length, errors, debug };
  }

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function assertCapacity(pool) {
    const debug = statistics(pool);
    const shortages = [];
    if (pool.length < SAMPLE_SIZE) shortages.push(`valid ${pool.length}/${SAMPLE_SIZE}`);
    for (const [type, quota] of Object.entries(TYPE_QUOTA)) if (debug.type_counts[type] < quota) shortages.push(`${type} ${debug.type_counts[type]}/${quota}`);
    for (const [key, minimum] of Object.entries(MINIMUM)) if (debug.dimension_counts[key] < minimum) shortages.push(`${key} ${debug.dimension_counts[key]}/${minimum}`);
    const capacity = Object.values(debug.semantic_group_counts).reduce((sum, n) => sum + Math.min(n, 2), 0);
    if (capacity < SAMPLE_SIZE) shortages.push(`语义容量 ${capacity}/${SAMPLE_SIZE}`);
    if (shortages.length) throw constraintError("pool_insufficient", shortages);
  }

  function chooseBest(candidates, priority, random) {
    let best = [];
    let bestRank = null;
    for (const q of candidates) {
      const rank = priority(q);
      let comparison = bestRank === null ? 1 : 0;
      if (bestRank !== null) for (let i = 0; i < rank.length; i += 1) {
        if (rank[i] !== bestRank[i]) { comparison = rank[i] - bestRank[i]; break; }
      }
      if (comparison > 0) { best = [q]; bestRank = rank; }
      else if (!comparison) best.push(q);
    }
    return best.length ? best[Math.floor(random() * best.length)] : null;
  }

  function sampleStratified(questions, sampleSize = SAMPLE_SIZE, random = Math.random) {
    if (sampleSize !== SAMPLE_SIZE || typeof random !== "function") throw new Error("正式抽题只支持 28 题和有效随机函数。");
    assertQuestions(questions);
    const pool = questions.filter((q) => q.status === "valid");
    assertCapacity(pool);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const selected = [];
      const ids = new Set();
      const types = { A: 0, B: 0, C: 0, D: 0 };
      const sources = Object.fromEntries(KEYS.map((key) => [key, new Set()]));
      const nonA = new Set();
      const groups = new Map();
      const available = () => pool.filter((q) => !ids.has(q.id) && types[q.stratum] < TYPE_QUOTA[q.stratum] && (groups.get(q.semantic_group)?.length ?? 0) < 2);
      const add = (q) => {
        selected.push(q); ids.add(q.id); types[q.stratum] += 1;
        const group = groups.get(q.semantic_group) ?? [];
        group.push(q.stratum); groups.set(q.semantic_group, group);
        q.dimensions.forEach((key) => { sources[key].add(q.id); if (q.stratum !== "A") nonA.add(key); });
      };
      const semanticRank = (q) => [groups.has(q.semantic_group) ? 0 : 1,
        groups.has(q.semantic_group) && !groups.get(q.semantic_group).includes(q.stratum) ? 1 : 0];
      let failed = false;
      for (const phase of [CRITICAL, ["rationalization", "selfCalibration"], ["recognition", "needed", "specialness", "scarcity"]]) {
        while (phase.some((key) => sources[key].size < MINIMUM[key])) {
          const missing = (q) => q.dimensions.filter((key) => phase.includes(key) && sources[key].size < MINIMUM[key]);
          const q = chooseBest(available().filter((candidate) => missing(candidate).length), (candidate) => [missing(candidate).length,
            candidate.stratum !== "A" ? candidate.dimensions.filter((key) => CRITICAL.includes(key) && !nonA.has(key)).length : 0,
            ...semanticRank(candidate)], random);
          if (!q) { failed = true; break; }
          add(q);
        }
        if (failed) break;
      }
      while (!failed && selected.length < SAMPLE_SIZE) {
        const candidates = available();
        const remainingTypes = Object.keys(TYPE_QUOTA).filter((type) => types[type] < TYPE_QUOTA[type]);
        const capacities = Object.fromEntries(remainingTypes.map((type) => [type, candidates.filter((q) => q.stratum === type).length]));
        if (remainingTypes.some((type) => capacities[type] < TYPE_QUOTA[type] - types[type])) { failed = true; break; }
        const slack = (type) => capacities[type] - (TYPE_QUOTA[type] - types[type]);
        const minimumSlack = Math.min(...remainingTypes.map(slack));
        const tight = remainingTypes.filter((type) => slack(type) === minimumSlack);
        const type = tight[Math.floor(random() * tight.length)];
        const q = chooseBest(candidates.filter((candidate) => candidate.stratum === type), semanticRank, random);
        if (!q) { failed = true; break; }
        add(q);
      }
      if (failed) continue;
      const result = validateSelection(selected);
      if (result.valid) {
        const ordered = shuffle(selected, random);
        return { questions: ordered, allocation: { ...result.debug.type_counts }, debug: { ...statistics(ordered), attempt_count: attempt } };
      }
    }
    throw constraintError("attempts_exhausted", { attempt_count: MAX_ATTEMPTS });
  }

  global.QuestionSampler = Object.freeze({ SAMPLE_SIZE, TYPE_QUOTA, MINIMUM, CRITICAL, MAX_ATTEMPTS,
    SELECTION_VERSION, assertQuestions, assertQuestionBank, validateSelection, sampleStratified, shuffle });
})(typeof window === "undefined" ? globalThis : window);
