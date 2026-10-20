(function (global) {
  "use strict";

  // 只选择文字，不评分、不读取存储，不访问 DOM 或网络。
  function build(input) {
    const catalog = global.ResultCopyCatalog;
    const config = global.AlgorithmConfig;
    if (!catalog || !config) return unavailable("missing_dependency");

    function unavailable(reason, message = catalog?.messages?.invalid ?? "暂时无法显示特点说明。") {
      return { copyVersion: catalog?.copyVersion ?? null, status: "unavailable", reason,
        scoreText: null, stage: null, degreeText: null, directionText: null,
        type: null, opening: "", paragraphs: [], sentences: [], closing: "", note: "",
        message, selectedIds: [], evidence: [], profileId: null };
    }

    if (!input || typeof input !== "object") return unavailable("invalid_input");
    const { outcome, layer6Integration: sixth, normalizedDimensions: normalized } = input;
    if (!outcome || !sixth || outcome.version !== 3 || outcome.dimensionCount !== 12) {
      return unavailable("invalid_envelope");
    }
    if (!catalog.supportedAlgorithmVersions.includes(config.VERSION) || sixth.version !== config.VERSION) {
      return unavailable("unsupported_algorithm", catalog.messages.legacy);
    }
    if (outcome.status === "insufficient_data" && sixth.status === "insufficient_data" &&
        outcome.totalScore === null && sixth.totalScore === null &&
        outcome.stage === null && sixth.stage === null) {
      return unavailable("insufficient_data", catalog.messages.insufficient);
    }
    const anchors = config.LAYER6?.SCORE_ANCHORS;
    if (!Array.isArray(anchors) || anchors.length < 2) return unavailable("invalid_config");
    const value = outcome.totalScore;
    const expectedStage = catalog.stageBounds.filter((bound) => value >= bound).length + 1;
    if (outcome.status !== "scored" || sixth.status !== "complete" || !Number.isFinite(value) ||
        value < anchors[0].score || value > anchors[anchors.length - 1].score ||
        value !== sixth.totalScore || outcome.stage !== sixth.stage || outcome.stage !== expectedStage) {
      return unavailable("inconsistent_score");
    }
    if (!Array.isArray(sixth.paths) || sixth.paths.length > 2 ||
        sixth.paths.some((path) => !path || !["B", "C", "D", "E"].includes(path.id)) ||
        new Set(sixth.paths.map((path) => path.id)).size !== sixth.paths.length) {
      return unavailable("invalid_paths");
    }
    const dimensions = {};
    for (const definition of catalog.dimensions) {
      const [group, key] = definition.source;
      const source = normalized?.[group];
      if (!source || typeof source !== "object" || Array.isArray(source) || !Object.hasOwn(source, key)) {
        return unavailable("missing_dimension");
      }
      const score = source[key];
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > 1)) {
        return unavailable("invalid_dimension");
      }
      dimensions[definition.key] = score;
    }

    const flat = catalog.examples.find((item) => item.id === "flat");
    const output = { copyVersion: catalog.copyVersion, status: "ready", reason: null,
      scoreText: `${(Math.floor(value * 100) / 100).toFixed(2)} 分`, stage: outcome.stage,
      degreeText: `受骗倾向：第 ${outcome.stage} 档（共 4 档）`, directionText: catalog.directionText,
      type: null, opening: catalog.stageOpenings[outcome.stage - 1], paragraphs: [], sentences: [],
      closing: "", note: catalog.note, message: "", selectedIds: [], evidence: [], profileId: null };
    if (Object.values(dimensions).some((score) => score === null)) {
      return { ...output, status: "fallback", reason: "insufficient_dimensions",
        message: catalog.messages.missing, paragraphs: [catalog.messages.missing],
        sentences: [catalog.messages.missing], selectedIds: ["state.dimensionsMissing"] };
    }

    const pathIds = sixth.paths.map((path) => path.id);
    const pathRank = (ids) => {
      const ranks = ids.map((id) => pathIds.indexOf(id)).filter((rank) => rank >= 0);
      return ranks.length ? Math.min(...ranks) : pathIds.length;
    };
    const matches = ({ key, side }) => side === "high"
      ? dimensions[key] >= catalog.thresholds.high : dimensions[key] <= catalog.thresholds.low;
    const distance = (key) => Math.abs(dimensions[key] - 0.5);
    const candidates = catalog.features.filter(matches);

    // 完整段落仅在每个描述所需的条件都满足时入选，不按最近画像强配。
    const patterns = catalog.patterns.map((pattern, order) => ({ pattern, order }))
      .filter(({ pattern }) => pattern.conditions.every(matches))
      .sort((a, b) => pathRank(a.pattern.paths) - pathRank(b.pattern.paths) ||
        averageStrength(b.pattern) - averageStrength(a.pattern) || a.order - b.order);
    function averageStrength(pattern) {
      return pattern.conditions.reduce((sum, item) => sum + distance(item.key), 0) / pattern.conditions.length;
    }
    if (patterns.length) {
      const pattern = patterns[0].pattern;
      const example = catalog.examples.find((item) => item.id === pattern.id);
      output.profileId = pattern.id;
      output.opening += pattern.summary;
      output.paragraphs = [...example.paragraphs];
      output.closing = example.closing;
      output.selectedIds = [`body.${pattern.id}`, `closing.${pattern.id}`];
      output.evidence = pattern.conditions.map((item) => ({ ...item, value: dimensions[item.key] }));
    } else if (candidates.length) {
      const ranked = candidates.map((feature, order) => ({ feature, order }))
        .sort((a, b) => pathRank(a.feature.paths) - pathRank(b.feature.paths) ||
          distance(b.feature.key) - distance(a.feature.key) || a.order - b.order);
      const selected = [];
      const themes = new Map();
      function add(feature) {
        if (selected.length >= catalog.maxFeatures || selected.includes(feature) ||
            (themes.get(feature.theme) ?? 0) >= catalog.maxPerTheme) return;
        selected.push(feature);
        themes.set(feature.theme, (themes.get(feature.theme) ?? 0) + 1);
      }
      const risk = ranked.find(({ feature }) => feature.role === "risk");
      const protection = ranked.find(({ feature }) => feature.role === "protection");
      if (risk) add(risk.feature);
      if (protection) add(protection.feature);
      ranked.forEach(({ feature }) => add(feature));
      // 阅读顺序按维度目录排列；排序强弱不变成碎句随机拼接。
      selected.sort((a, b) => catalog.features.indexOf(a) - catalog.features.indexOf(b));
      const texts = selected.map((item) => item.text);
      const split = Math.ceil(texts.length / 2);
      output.paragraphs = [texts.slice(0, split).join(""), texts.slice(split).join("")].filter(Boolean);
      const lead = risk?.feature;
      output.opening += (lead ?? ranked[0].feature).summary;
      const closingId = lead?.key === "boundaries" ? "action" : lead?.key === "stopLoss" ? "exit"
        : lead && ["recognition", "needed", "specialness", "scarcity"].includes(lead.key) ? "sensitive-steady" : "multiple";
      output.closing = catalog.examples.find((item) => item.id === closingId).closing;
      output.selectedIds = [...selected.map((item) => item.id), `closing.${closingId}`];
      output.evidence = selected.map((item) => ({ key: item.key, side: item.side,
        role: item.role, theme: item.theme, value: dimensions[item.key] }));
    } else {
      output.status = "fallback";
      output.reason = "no_prominent_features";
      output.profileId = "flat";
      output.paragraphs = [...flat.paragraphs];
      output.closing = flat.closing;
      output.selectedIds = ["body.flat", "closing.flat"];
    }
    output.sentences = output.paragraphs.flatMap((paragraph) => paragraph.match(/[^。！？]+[。！？]?/gu) ?? []);
    return output;
  }

  global.ResultCopy = Object.freeze({ build });
})(typeof window === "undefined" ? globalThis : window);
