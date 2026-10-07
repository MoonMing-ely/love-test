# 评分链路与结果接口

当前第一至第六层已接通。第六层使用用户确认的 V1 参数；前五层计算保持不变。完整公式、与原设计的调整及验收状态见 [第六层实施方案](layer6-implementation-plan.md)。

## 1. 数据流

```text
题库 Markdown → questions.json → 受约束抽取28题
→ answers / 12维 Raw
→ normalizedDimensions（Raw/本轮Capacity）
→ layer3Structures（0～100高层结构）
→ layer4Evidence（0～1结构证据）
→ layer5Mechanisms（P1/P2/P3/P4 + Protection）
→ layer6Integration（连续Score、Stage、Shape、Path）
→ outcome（页面统一结果接口）
→ sessionStorage → 结果页
```

每层结果分别保存，不能用 outcome 覆盖中间层；第六层只读取第五层，不重新解释12维。

## 2. 题库和答案快照

维护源是 `data/question-bank-source.md`，用 `node scripts/build-question-bank.mjs` 生成 `data/questions.json`。当前96题、77 valid/19 review；按A12/B6/C6/D4、统一维度最低覆盖和同语义组最多2题抽取28题。

选项分值是按稳定英文 key 编码的稀疏对象：

```js
{ recognition: 3, evidence: 1 }
```

未写的维度对本选项贡献0；`scores:null`仅兼容尚未配置的旧数据，不等于完整测量的零分。

每条答案：

```js
{ questionId: "A01", option: "A", scores: { recognition: 3 } }
```

顺序对应本轮题序。维度元数据为 `{key,code,label}`，不能用固定数组下标猜维度含义。

## 3. 第一至第五层边界

- 第一层 `DimensionVector.fromAnswers` 累加12维Raw。
- 第二层 `DimensionNormalizer.normalize` 逐题取最高可得分形成Capacity，得到Raw/Capacity（0～1）；Capacity为0时返回null。
- 第三层 `HigherOrderStructure.aggregate` 将观测值局部转换至0～100：E聚合认/需/特/稀，J聚合校/证/操，B聚合边/止，H/F/M透传合/分/自；保留峰值、短板、总体标准差，R仍为null。
- 第四层 `Layer4Evidence.fromLayer3` 适配为0～1，提取峰值、短板差及High/Low隶属度；B只读取投入边界，T单独读取止损。
- 第五层 `Layer5Mechanisms.calculate` 分别计算四条风险。protection.M及可选self_consistency不修改P1～P4。缺失数据沿层返回null/insufficient_data。

## 4. 第六层接口

```js
const layer6Integration = Layer6Integration.calculate(layer5Mechanisms);
```

只读取第五层以下字段：

```js
{
  status: "complete", // 或 insufficient_data
  P1_relation_value_amplification: 0.52,
  P2_judgment_shift: 0.55,
  P3_action_failure: 0.57,
  P4_exit_difficulty: 0.54,
  protection: { M: 0.5, self_consistency: null }
}
```

self_consistency不参与最终修正；M只作用一次。第六层输出：

```js
{
  version: "1.0",
  status: "complete",
  missingInputs: [],
  missingDimensions: [],
  totalScore: 62.66196296296296,
  stage: 3,
  shape: "G",
  shapeLabel: "弥散中度",
  paths: [/* 0～2个Path，含Match、解释权重、锚点和深度 */],
  diagnostics: { pathAnchor, depth, depthAdjustment },
  debug: { input, mean, max, min, spread, sorted, allPaths,
    baseSeverity, pathSeverity, moderateOverlap, highOverlap,
    shapeAdjustment, preScore, protectionAdjustment }
}
```

`diagnostics.pathAnchor/depth`使用原文平方权重，**仅解释**；最终分由连续严重度主体、连续多路径增益和有限Protection修正产生。标签变化不直接切换计分公式。

模块不舍入。阶段按原值的30/50/70边界划分，页面展示两位小数。

## 5. 评分适配器

```js
const outcome = QuizScoring.calculateResult({
  answers,
  dimensions,
  layer6Integration,
});
```

这个函数只验证接口、适配已计算的第六层结果；不重新跑前五层、不查询题库、不操作DOM。

输出版本保持3，新增stage为兼容字段：

```js
{
  version: 3,
  status: "scored", // 数据不足时 insufficient_data
  dimensionCount: 12,
  totalScore: 62.66196296296296,
  dimensionScores: null,
  stage: 3,
  title: "情感被骗指数",
  summary: "Stage 3 · 弥散中度 · 行动失守 + 判断盲区。V1 参数待校准。"
}
```

`dimensionScores`不人为构造“12维最终风险分”；12维原始和归一化分分别在第一、第二层输出。数据不足时totalScore和stage均为null。

## 6. 完成答题与保存

`js/interactions/quiz.js` 在完成28题后依次计算各层：

```js
const normalizedDimensions = DimensionNormalizer.normalize({ rawVector: dimensionVector, dimensions, questions });
const layer3Structures = HigherOrderStructure.aggregate(normalizedDimensions);
const layer4Evidence = Layer4Evidence.fromLayer3(layer3Structures);
const layer5Mechanisms = Layer5Mechanisms.calculate(layer4Evidence);
const layer6Integration = Layer6Integration.calculate(layer5Mechanisms);
const outcome = QuizScoring.calculateResult({ answers, dimensions, layer6Integration });
```

结果信封保存completed、questionCount、questionIds、answers、dimensionVector、dimensions快照、六层中间数据、outcome和completedAt。sessionStorage键保持`deceptionIndexQuizResultV3`。先保存结果，再清理进度，再跳转；保存或清理失败时停止交互并保留可恢复进度。

## 7. 页面与旧记录

结果页校验28条题目/答案对应关系、结果版本、最终分范围以及outcome与第六层最终分/阶段一致，再显示六层数据。所有内容用textContent写入。

- 新完整结果：显示最终分、阶段及六层数值，详情区独立滚动。
- 实际0分：显示`0.00 / 100`。
- null/未定义：显示“暂无”，不会当成0。
- 旧scoring-placeholder结果：提示“重测一次”，不猜旧记录的最终分。
- 不完整或损坏记录：显示未完成状态。

底部左“重测一次”、右“分享结果”保持等宽和原有样式。重测仍访问`text.html?restart=1`，重新抽题并清理旧结果。

## 8. 修改与验证入口

调整第六层参数时只修改`AlgorithmConfig.LAYER6`，不改前五层参数。算法实现位于`sixth-layer-integration.js`，页面展示位于`interactions/result.js`。

```sh
node --test tests/*.test.mjs
```

测试包括第六层公式/标签/缺失/阶段、10000组连续性与方向、1000组正式题库完整评分，以及答题恢复/重测/存储失败/旧结果和结果页输出。
