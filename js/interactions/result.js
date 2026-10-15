(function () {
  "use strict";

  const frame = document.querySelector(".result-frame");
  const content = document.querySelector(".result-content");
  const empty = document.querySelector(".result-empty");
  const title = document.querySelector("#result-title");
  const summary = document.querySelector("#result-summary");
  const score = document.querySelector("#result-score");
  const layers = document.querySelector("#result-layers");
  const statuses = new Set(["scoring-placeholder", "scored", "insufficient_data"]);

  function format(value) {
    if (value == null) return "暂无";
    if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(2) : "暂无";
    return String(value);
  }

  function section(index, heading, scale, rows) {
    const block = document.createElement("section");
    block.className = "algorithm-layer";
    block.dataset.layer = String(index);
    const h2 = document.createElement("h2");
    h2.textContent = heading;
    const note = document.createElement("p");
    note.className = "layer-scale";
    note.textContent = scale;
    const table = document.createElement("table");
    table.setAttribute("aria-label", heading);
    const body = document.createElement("tbody");
    for (const [name, value] of rows) {
      const row = document.createElement("tr");
      const label = document.createElement("th");
      label.setAttribute("scope", "row");
      label.textContent = name;
      const cell = document.createElement("td");
      cell.textContent = format(value);
      row.append(label, cell);
      body.append(row);
    }
    table.append(body);
    block.append(h2, note, table);
    layers.append(block);
  }

  function renderLayers(result) {
    const definitions = result.dimensions;
    const normalized = result.normalizedDimensions?.debug ?? {};
    const names = Object.fromEntries(definitions.map((definition) => [definition.key, definition.label]));
    Object.assign(names, { need: names.needed, boundary: names.boundaries,
      stopping: names.stopLoss, stop_loss: names.stopLoss, metacognition: names.selfCalibration });
    const sourceNames = (keys) => keys?.map((key) => names[key] ?? key).join("、") ?? null;
    section(1, "第一层 · 原始累计分", "Raw：本轮选项分值之和", definitions.map((definition, index) =>
      [`${definition.code} · ${definition.label}`, result.dimensionVector[index]]));
    section(2, "第二层 · 容量归一化", "Capacity 为本轮最高可得分；Value = Raw / Capacity，范围 0～1",
      definitions.flatMap((definition) => [[`${definition.code} · Capacity`, normalized.capacity?.[definition.key]],
        [`${definition.code} · Value`, normalized.value?.[definition.key]]]));

    const third = result.layer3Structures;
    const thirdRows = [];
    for (const [key, label] of [["E", "关系价值汇总"], ["J", "判断能力汇总"], ["B", "边界／止损汇总"]]) {
      const group = third[key];
      thirdRows.push([`${key} · ${label}`, group.summary]);
      thirdRows.push(...Object.entries(group.subScores).map(([name, value]) => [`${key} · ${names[name] ?? name}`, value]));
      if (key === "E") thirdRows.push(["E · 峰值", group.peak?.value], ["E · 峰值来源", sourceNames(group.peak?.sources)],
        ["E · 峰值差", group.peak?.gap], ["E · 离散程度", group.dispersion]);
      else thirdRows.push([`${key} · 短板值`, group.weak?.value], [`${key} · 短板来源`, sourceNames(group.weak?.sources)],
        key === "J" ? ["J · 短板差", group.weak?.gap] : ["B · 边界／止损差", group.imbalance]);
      if (key === "J") thirdRows.push(["J · 离散程度", group.dispersion]);
    }
    thirdRows.push(["H · 合理化", third.H], ["F · 情感分离", third.F], ["M · 自我校准", third.M], ["R · 关系经验", third.R]);
    section(3, "第三层 · 高层结构", `结构值 0～100；版本 ${third.version}；R 尚未定义`, thirdRows);

    const fourth = result.layer4Evidence;
    const fourthNames = { E: "关系价值汇总", J: "判断能力", H: "合理化", B: "投入边界", T: "止损能力", F: "情感分离", M: "自我校准",
      E_peak: "E 峰值", E_second: "E 次峰值", E_sharp: "E 峰值差", J_weak: "J 短板值", J_hole: "J 短板差", BT_gap: "边界／止损差", self_consistency: "自报／行为一致性" };
    const fourthRows = Object.entries(fourthNames).map(([key, label]) => [label, fourth[key]]);
    fourthRows.push(...Object.entries(fourth.fuzzy).map(([key, value]) => {
      const high = key.startsWith("high_");
      const baseKey = key.replace(/^(high|low)_/u, "");
      return [`${high ? "High" : "Low"} · ${fourthNames[baseKey] ?? names[baseKey] ?? baseKey}`, value];
    }));
    section(4, "第四层 · 结构证据", `结构值及 High/Low 隶属度 0～1；版本 ${fourth.version}`, fourthRows);

    const fifth = result.layer5Mechanisms;
    section(5, "第五层 · 风险机制", `风险与保护值 0～1；版本 ${fifth.version}`, [
      ["P1 · 关系价值放大", fifth.P1_relation_value_amplification],
      ["P2 · 判断偏移", fifth.P2_judgment_shift], ["P3 · 行动失守", fifth.P3_action_failure],
      ["P4 · 退出困难", fifth.P4_exit_difficulty], ["Protection · 自我校准 M", fifth.protection?.M],
      ["自报／行为一致性", fifth.protection?.self_consistency],
    ]);

    const sixth = result.layer6Integration;
    const debug = sixth.debug;
    const sixthRows = [["Shape · 风险形状", sixth.shape ? `${sixth.shape} · ${sixth.shapeLabel}` : "None"],
      ["Path · 主要位置", sixth.paths.map((path) => `${path.id} · ${path.label}`).join(" + ") || "None"]];
    for (const path of debug?.allPaths ?? []) {
      const selected = sixth.paths.find((item) => item.id === path.id);
      sixthRows.push([`${path.id} · Match`, path.match], [`${path.id} · 平滑激活`, path.activation],
        [`${path.id} · 严重度`, path.severity], [`${path.id} · 解释权重`, selected ? `${(selected.weight * 100).toFixed(2)}%` : "未入选"]);
    }
    sixthRows.push(["四条风险均值", debug?.mean], ["最大风险", debug?.max], ["最小风险", debug?.min], ["风险极差", debug?.spread],
      ["基础严重度", debug?.baseSeverity], ["计分主体 PathSeverity", debug?.pathSeverity],
      ["连续多路径增益（证据分）", debug?.shapeAdjustment], ["保护修正前证据分", debug?.preScore],
      ["Protection 修正（证据分）", debug?.protectionAdjustment], ["映射前证据分", debug?.evidenceScore],
      ["解释用 PathAnchor", sixth.diagnostics?.pathAnchor],
      ["解释用 Depth", sixth.diagnostics?.depth], ["解释用深度修正", sixth.diagnostics?.depthAdjustment],
      ["最终分", sixth.totalScore], ["阶段", sixth.stage ? `Stage ${sixth.stage}` : null]);
    const anchors = AlgorithmConfig.LAYER6.SCORE_ANCHORS;
    section(6, "第六层 · 连续整合", `最终指数 ${anchors[0].score}～${anchors[anchors.length - 1].score}；版本 ${sixth.version}。证据分与最终指数采用不同标尺，指数不代表被骗概率。Path 权重仅用于解释。`, sixthRows);
  }

  try {
    const result = JSON.parse(sessionStorage.getItem("deceptionIndexQuizResultV3"));
    const complete = result?.completed === true && result.questionCount === 28 &&
      Array.isArray(result.questionIds) && result.questionIds.length === 28 &&
      result.questionIds.every((id) => typeof id === "string" && /^[A-D]\d{2,}$/u.test(id)) &&
      new Set(result.questionIds).size === 28 && Array.isArray(result.answers) && result.answers.length === 28 &&
      result.answers.every((answer, index) => answer?.questionId === result.questionIds[index] && /^[A-D]$/u.test(answer?.option)) &&
      result.outcome?.version === 3 && result.outcome.dimensionCount === 12 && statuses.has(result.outcome.status) &&
      typeof result.outcome.title === "string" && typeof result.outcome.summary === "string";
    if (!complete) throw new Error("测试记录不完整。");

    title.textContent = result.outcome.title;
    summary.textContent = result.outcome.summary;
    score.hidden = true;
    layers.replaceChildren();
    if (result.outcome.status === "scoring-placeholder" ||
        (result.layer6Integration && result.layer6Integration.version !== AlgorithmConfig.VERSION)) {
      frame.dataset.resultState = "legacy";
      summary.textContent = "这份记录使用旧版算法，请点击重测一次，按当前算法重新测试。";
    } else {
      const sixth = result.layer6Integration;
      if (!sixth || !["complete", "insufficient_data"].includes(sixth.status) || !Array.isArray(sixth.paths) ||
          !Array.isArray(result.dimensions) || result.dimensions.length !== 12 ||
          !Array.isArray(result.dimensionVector) || result.dimensionVector.length !== 12) throw new Error("分层记录不完整。");
      if (result.outcome.status === "scored") {
        const anchors = AlgorithmConfig.LAYER6.SCORE_ANCHORS;
        if (sixth.status !== "complete" || !Number.isFinite(result.outcome.totalScore) ||
            result.outcome.totalScore < anchors[0].score || result.outcome.totalScore > anchors[anchors.length - 1].score ||
            result.outcome.totalScore !== sixth.totalScore || ![1, 2, 3, 4].includes(sixth.stage) ||
            result.outcome.stage !== sixth.stage || !sixth.debug || sixth.debug.allPaths.length !== 4 ||
            !Number.isFinite(sixth.debug.evidenceScore) || sixth.debug.evidenceScore < anchors[0].evidence ||
            sixth.debug.evidenceScore > anchors[anchors.length - 1].evidence) {
          throw new Error("最终分记录无效。");
        }
        score.textContent = `${format(result.outcome.totalScore)} / 100`;
        score.hidden = false;
        frame.dataset.resultState = "complete";
      } else {
        if (sixth.status !== "insufficient_data" || result.outcome.totalScore !== null || sixth.totalScore !== null) {
          throw new Error("数据不足记录无效。");
        }
        frame.dataset.resultState = "insufficient_data";
      }
      renderLayers(result);
    }
    content.hidden = false;
    empty.hidden = true;
  } catch {
    frame.dataset.resultState = "empty";
    content.hidden = true;
    empty.hidden = false;
  }
})();
