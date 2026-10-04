# 评分接口说明（初学者版）

这份文档主要定义“数据怎样交给评分算法”。选项原始分、第二层 `Raw / Capacity` 标准化、第三层高层结构、第四层结构证据和第五层元机制已经确定；第六层最终结果仍未设计。

## 1. 数据流

```text
questions.json 题库
      ↓ 随机抽取 28 题
js/interactions/quiz.js 记录用户选择
      ↓ 第一层累计 Raw、第二层按 Capacity 标准化
normalizedDimensions
      ↓ 第三层转换并归纳 E/J/B/H/F/M/R
layer3Structures
      ↓ 第四层结构证据 → 第五层 P1/P2/P3/P4 ┐
layer4Evidence + layer5Mechanisms          ├→ sessionStorage 暂存完整结果
calculateResult({ answers, dimensions })   │
      ↓ 第六层尚未实现                      │
scoring.js 生成占位 outcome ────────────────┘
      ↓
js/interactions/result.js 显示 title 和 summary
```

“接口”可以理解为两个模块之间约定好的数据形状。只要输入和输出继续符合约定，你可以自由改写评分函数内部。

## 2. 固定特征量

- 当前候选题库共 92 题；新抽题器按 A12/B6/C6/D4、最低维度覆盖及语义限制抽取 28 道 valid 题，同轮不重复。有效操题不足时暂停生成。
- 共有 12 个评分维度；每个维度使用唯一的英文 `key` 连接题库和算法。
- 题目分为 A、B、C、D 四个题型层（`stratum`），不是分数等级。
- 每题也有 A、B、C、D 四个选项。选项字母和题型字母长得相同，但含义不同。
- 当前 92 道题的四个选项都已配置 12 维原始分；`dimensionJudgement` 仍是占位字段。

## 3. 题库中的分值向量

每个选项的 `scores` 是一个对象；接口仍允许 `null`，用于兼容尚未配置分值的旧数据：

```json
{
  "id": "A",
  "text": "80%–90%",
  "scores": {
    "recognition": 2,
    "evidence": -1
  }
}
```

这个对象是一个“稀疏向量”（sparse vector）：只写本选项影响的维度，没写的维度按 0 理解。键必须来自 `questions.json` 顶部 `dimensions` 数组中的 `key`，值必须是有限数字。

## 4. 评分函数的输入

唯一入口位于 `js/scoring.js`：

```js
QuizScoring.calculateResult({ answers, dimensions });
```

`answers` 是 28 条答案记录：

```js
{
  questionId: "A01", // 题目唯一编号，不是第几题
  option: "B",       // 用户选择的选项编号
  scores: {           // 该选项在答题时的分值快照
    recognition: 1
  }
}
```

保存“快照”意味着：用户答完后即使题库分值被修改，这一次已经完成的测试结果仍然使用当时的分值。

`dimensions` 是 12 个维度定义。算法应使用 `dimension.key` 做匹配，不要依赖维度在数组中的位置。

## 5. 评分函数的输出

评分函数必须返回下面的结构：

```js
{
  version: 3,
  status: "scored",
  dimensionCount: 12,
  totalScore: 72,
  dimensionScores: {
    recognition: 8,
    needed: 5
  },
  title: "结果标题",
  summary: "给用户阅读的结果解释"
}
```

- `status`：算法完成后改成 `"scored"`；当前占位实现使用 `"scoring-placeholder"`。
- `totalScore`：总分。如果你不设计总分，可以继续返回 `null`。
- `dimensionScores`：12 维最终分数。是否必须包含全部维度，由你的算法规则决定。
- `title`、`summary`：结果页当前会直接显示这两个字段。

## 6. 完整使用示意

下面用一个选项演示数据如何从题库流到评分结果。示例中的分值和计算方法只用于说明接口，不代表正式评分标准。

### 6.1 在题库里给选项配置原始分值

假设题目 `A01` 的 B 选项会让“人格认可敏感”增加 2 分，同时让“行为证据意识”减少 1 分：

```json
{
  "id": "B",
  "text": "比较符合",
  "scores": {
    "recognition": 2,
    "evidence": -1
  }
}
```

这里没有写出的其余 10 个维度，都按 0 分理解。

### 6.2 用户选择后，页面自动生成答案记录

用户点击这个 B 选项后，`js/interactions/quiz.js` 会自动保存：

```js
{
  questionId: "A01",
  option: "B",
  scores: {
    recognition: 2,
    evidence: -1
  }
}
```

你不需要自己编写按钮取值代码。`js/interactions/quiz.js` 已经负责读取被选中的选项，并把分值复制到 `answers` 数组。

真实测试会得到 28 条答案。下面只截取两条，方便观察结构：

```js
const answers = [
  {
    questionId: "A01",
    option: "B",
    scores: { recognition: 2, evidence: -1 }
  },
  {
    questionId: "C03",
    option: "C",
    scores: { scarcity: 3 }
  }
];
```

### 6.3 完成 28 题后，页面自动调用接口

`js/interactions/quiz.js` 已经写好了调用代码：

```js
const outcome = QuizScoring.calculateResult({
  answers,
  dimensions: dimensionDefinitions
});
```

`dimensions: dimensionDefinitions` 的意思是：接口要求这个字段叫 `dimensions`，实际传进去的变量叫 `dimensionDefinitions`。

这里可以把接口理解成一个加工机器：

```text
28 条原始答案 + 12 个维度定义
              ↓
       calculateResult()
              ↓
总分 + 12 维分数 + 结果文字
```

正常答题时，不需要在其他文件再次手动调用 `calculateResult()`。你只需要实现这个函数内部的计算过程。

### 6.4 在 calculateResult() 中读取输入

下面是最简单的“按维度直接累加”示意，可以用来理解接口怎么使用：

```js
function calculateResult(input) {
  // 先使用项目已有的函数检查输入结构。
  validateScoringInput(input);

  // 根据 dimensions 动态建立 12 个初始分数，避免手写后遗漏维度。
  const dimensionScores = Object.fromEntries(
    input.dimensions.map((dimension) => [dimension.key, 0])
  );

  // 依次处理用户的 28 条答案。
  input.answers.forEach((answer) => {
    // null 表示该选项还没有配置分值；这个示例选择跳过。
    if (answer.scores === null) return;

    // 一条答案可能同时影响一个或多个维度。
    Object.entries(answer.scores).forEach(([dimensionKey, score]) => {
      dimensionScores[dimensionKey] += score;
    });
  });

  // 这里只用所有维度的原始和演示 totalScore。
  // 正式算法可以改成加权、反向计分或归一化后的结果。
  const totalScore = Object.values(dimensionScores).reduce(
    (sum, score) => sum + score,
    0
  );

  return {
    version: 3,
    status: "scored",
    dimensionCount: input.dimensions.length,
    totalScore,
    dimensionScores,
    title: "示意结果",
    summary: `本次示意总分为 ${totalScore}。`
  };
}
```

这个示例只完成了三件事：

1. 建立 12 个初始值为 0 的维度。
2. 把 28 条答案中相同维度的分数累加。
3. 按接口要求返回一个完整结果对象。

它还没有处理维度方向、题目权重、反向计分、分数上限和结果区间，因此不能直接视为正式测评算法。

### 6.5 返回结果之后发生什么

`js/interactions/quiz.js` 会把接口返回值放进 `outcome`：

```js
{
  answers: answers,
  outcome: {
    version: 3,
    status: "scored",
    dimensionCount: 12,
    totalScore: 4,
    dimensionScores: {
      recognition: 2,
      evidence: -1,
      scarcity: 3
    },
    title: "示意结果",
    summary: "本次示意总分为 4。"
  }
}
```

上面只展示了非 0 维度，实际示例代码返回的 `dimensionScores` 会包含全部 12 个维度。随后数据会被写入 `sessionStorage`，结果页读取并显示 `outcome.title` 和 `outcome.summary`。

目前结果页还不会自动显示 12 维明细。如果以后要显示雷达图或维度列表，应修改 `html/result.html` 和 `js/interactions/result.js`，而不是把页面显示代码写进 `calculateResult()`。

## 7. 当前数据处理层次

1. `dimension-vector.js` 把所选选项分值累加成 12 维 Raw 数组。
2. `second-layer-normalizer.js` 根据本轮题目逐题计算 Capacity。
3. 第二层使用 `Value = Raw / Capacity` 生成 `normalizedDimensions`。
4. `third-layer-aggregator.js` 将第二层值从 `0～1` 转换到 `0～100`，但不修改 `normalizedDimensions`。
5. E 保存主值、细维度、峰值、峰值差和离散程度。
6. J 保存主值、细维度、最弱项、短板差和离散程度。
7. B 保存主值、边/止、最弱项和两项不均衡程度。
8. H/F/M 分别透传合、分、自；当前不能可靠计算关系经验，因此 R 为 `null`。
9. 第四层将第三层数据适配回 `0～1`，并提取 High/Low、E 峰值、J 短板、B/T 差异和可选一致性。
10. 第五层分别生成 P1 关系价值放大、P2 判断偏移、P3 行动失守、P4 退出困难，同时独立输出 M/一致性 Protection。
11. 第六层最终分数、阶段、标题和说明尚未实现；`outcome` 继续保持占位状态。

第三层公开入口为：

```js
HigherOrderStructure.aggregate(normalizedDimensions);
```

输出结构版本为字符串 `"1.1"`，主要形状为：

```js
{
  version: "1.1",
  E: {
    summary,
    subScores: { recognition, need, specialness, scarcity },
    peak: { value, sources, gap },
    dispersion
  },
  J: {
    summary,
    subScores: { calibration, evidence, manipulation },
    weak: { value, sources, gap },
    dispersion
  },
  B: {
    summary,
    subScores: { boundary, stopLoss },
    weak: { value, sources },
    imbalance
  },
  H,
  F,
  M,
  R: null
}
```

`sources` 使用稳定英文维度 key 的数组，因此并列峰值或并列短板不会丢失。某组只要有一个细维度为 `null`，该组的派生字段就返回 `null`，但 `subScores` 中已有的观测值继续保留。第三层不再生成 `warnings` 或 `diagnostics`。

第四、第五层公开入口为：

```js
const layer4Evidence = Layer4Evidence.fromLayer3(layer3Structures);
const layer5Mechanisms = Layer5Mechanisms.calculate(layer4Evidence);
```

第三层 V1.1 保持 `0～100` 接口；第四层适配器统一除以 100 后运行冻结公式。新定义中的 B 只取 `boundary`，T 独立取 `stopLoss`，不会沿用第三层 B 组的平均值。第五层输出四个互相独立的 `0～1` 机制强度，不生成它们的总和。

若本轮题组使任一底层维度无法计算，第四、第五层会返回 `status: "insufficient_data"`，不会把缺失值当成 0。新抽题器已经约束 12 维覆盖；正式题库仍需补足有效操题，不能将独立测试题池通过视为正式内容验收。

算法只做“纯计算”最容易测试：不要在评分函数里读取按钮、修改页面或重新请求题库。

## 8. 修改时的注意事项

- `data/questions.json` 是浏览器实际读取的题库；JSON 格式本身不允许写注释。
- `scripts/build-question-bank.mjs` 会从 Markdown 的 `〔维度+分值〕` 标注重新生成题库；修改分值时应先修改维护源，再运行生成脚本。
- 修改算法后运行 `node tests/scoring-interface.test.mjs`，检查评分入口和页面传参。
- 修改第二层算法后运行 `node tests/second-layer-normalizer.test.mjs`。
- 修改第三层算法后运行 `node tests/third-layer-aggregator.test.mjs`。
- 修改第四层算法后运行 `node tests/fourth-layer-evidence.test.mjs`。
- 修改第五层算法或参数后运行 `node tests/fifth-layer-mechanisms.test.mjs`。
- 修改题库分值后运行 `node tests/question-bank.test.mjs`，检查维度 key 和分数类型。
- 完整运行、目录结构和其余测试说明见 `docs/technical-guide.md`。

常见错误：

- 把 `scores === null` 直接拿来相加，最终得到 `NaN`。
- 使用维度数组下标进行匹配，导致调整维度顺序后分数错位。
- 忘记把 `status` 从 `"scoring-placeholder"` 改成 `"scored"`。
- 只返回一个数字，没有返回结果页所需的完整对象。
- 在评分函数里读取 DOM 或修改页面，使算法难以单独测试。
