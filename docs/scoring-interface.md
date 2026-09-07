# 评分接口说明（初学者版）

这份文档只定义“数据怎样交给评分算法”。具体加多少分、是否反向计分、怎样归一化，由你自己决定。

## 1. 数据流

```text
questions.json 题库
      ↓ 随机抽取 28 题
quiz.js 记录用户选择
      ↓ calculateResult({ answers, dimensions })
scoring.js 你的评分算法入口
      ↓ ScoringResult
sessionStorage 暂存完整结果
      ↓
result.js 显示 title 和 summary
```

“接口”可以理解为两个模块之间约定好的数据形状。只要输入和输出继续符合约定，你可以自由改写评分函数内部。

## 2. 固定特征量

- 题库共 92 题，每次按题型比例抽取 28 题，且同一次测试不会重复。
- 共有 12 个评分维度；每个维度使用唯一的英文 `key` 连接题库和算法。
- 题目分为 A、B、C、D 四个题型层（`stratum`），不是分数等级。
- 每题也有 A、B、C、D 四个选项。选项字母和题型字母长得相同，但含义不同。
- 当前所有 `scores` 和 `dimensionJudgement` 都是占位符，尚未决定实际分数。

## 3. 题库中的分值向量

每个选项的 `scores` 可以保持 `null`，也可以写成对象：

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

用户点击这个 B 选项后，`quiz.js` 会自动保存：

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

你不需要自己编写按钮取值代码。`quiz.js` 已经负责读取被选中的选项，并把分值复制到 `answers` 数组。

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

`quiz.js` 已经写好了调用代码：

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

`quiz.js` 会把接口返回值放进 `outcome`：

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

目前结果页还不会自动显示 12 维明细。如果以后要显示雷达图或维度列表，应修改 `result.html` 和 `result.js`，而不是把页面显示代码写进 `calculateResult()`。

## 7. 建议的第一版算法步骤

1. 建立一个以 12 个维度 key 为键、初始值全为 0 的对象。
2. 遍历 28 条 `answers`。
3. 遇到 `scores === null` 时明确决定跳过还是报错，不要默默产生 `NaN`。
4. 遍历每条答案的 `scores`，累加到对应维度。
5. 再处理反向计分、题型权重或归一化；这些规则不要混入页面代码。
6. 根据最终分数生成 `title` 和 `summary`，返回统一结果对象。

算法只做“纯计算”最容易测试：不要在评分函数里读取按钮、修改页面或重新请求题库。

## 8. 修改时的注意事项

- `data/questions.json` 是浏览器实际读取的题库；JSON 格式本身不允许写注释。
- `scripts/build-question-bank.mjs` 会从 Markdown 重新生成题库，并把评分字段恢复为占位值。开始手工配置分数后，不要直接运行它覆盖题库，除非你也同步扩展生成脚本。
- 修改算法后运行 `node tests/scoring-interface.test.mjs`，检查评分入口和页面传参。
- 修改题库分值后运行 `node tests/question-bank.test.mjs`，检查维度 key 和分数类型。
- 完整运行、目录结构和其余测试说明见 `docs/technical-guide.md`。

常见错误：

- 把 `scores === null` 直接拿来相加，最终得到 `NaN`。
- 使用维度数组下标进行匹配，导致调整维度顺序后分数错位。
- 忘记把 `status` 从 `"scoring-placeholder"` 改成 `"scored"`。
- 只返回一个数字，没有返回结果页所需的完整对象。
- 在评分函数里读取 DOM 或修改页面，使算法难以单独测试。
