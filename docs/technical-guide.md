# 项目技术说明

这份文档面向项目开发者和维护者，说明程序结构、数据流、随机抽题、浏览器状态、评分边界和测试方式。普通测试用户只需要阅读项目根目录的 `README.md`。

## 1. 本地运行

答题页使用 `fetch()` 加载 JSON 题库，因此不能依赖浏览器直接打开 `file://` 文件。请在项目根目录启动本地 HTTP 服务：

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

浏览器入口：

```text
http://127.0.0.1:4173/html/index.html
```

## 2. 系统数据流

```text
data/questions.json
        ↓ quiz.js 加载并校验 92 道题
js/question-sampler.js
        ↓ 按 A/B/C/D 题型比例无放回抽取 28 道
js/quiz.js
        ↓ 显示题目、播放选择反馈、保存答案快照
js/scoring.js
        ↓ calculateResult({ answers, dimensions })
sessionStorage
        ↓ 保存本轮原始答案和计算结果
js/result.js
        ↓ 读取 title 和 summary
html/result.html
```

这里的“无放回抽取”表示一道题在同一轮测试中最多出现一次。刷新答题页时，`quiz.js` 会尝试从 `sessionStorage` 恢复原题组和答题进度；点击重新测试时才清除旧状态并抽取新题组。

## 3. 目录结构

```text
love-test/
├── html/       页面结构和入口
├── css/        全站样式及响应式排版
├── js/         页面交互、随机抽题、导航栈和评分接口
├── data/       当前题库和人工维护源
├── scripts/    题库生成工具
├── tests/      核心数据和程序接口测试
└── docs/       开发者技术文档
```

## 4. 主要文件职责

| 文件 | 职责 | 通常什么时候修改 |
| --- | --- | --- |
| `html/index.html` | 首页结构 | 修改首页内容或入口 |
| `html/text.html` | 答题页骨架 | 修改题目、选项或进度条的 HTML 结构 |
| `html/result.html` | 结果页骨架 | 增加维度结果展示区域 |
| `html/about.html` | 右上角圆球打开的关于页面 | 增加关于内容 |
| `css/style.css` | 全站背景、外框和基础响应式布局 | 修改整体视觉 |
| `css/content.css` | 题目、选项、进度和结果内容样式 | 修改内容区排版 |
| `js/quiz.js` | 题库校验、答题流程、状态恢复和结果保存 | 修改答题行为 |
| `js/question-sampler.js` | 分层比例分配、洗牌和无重复抽题 | 修改抽题策略 |
| `js/scoring.js` | 评分算法的唯一公开入口 | 编写 12 维评分算法 |
| `js/result.js` | 校验、读取和显示评分结果 | 增加结果图表或维度说明 |
| `js/about-navigation-stack.js` | 右上角圆球的后进先出导航栈 | 修改圆球返回逻辑 |
| `js/page-transition.js` | 页面圆形展开和收回动画 | 修改转场动画 |
| `data/questions.json` | 浏览器实际读取的 92 题运行数据 | 通常由生成脚本产生 |
| `data/question-bank-source.md` | 题目文字的维护源 | 修改题干和选项文案 |
| `scripts/build-question-bank.mjs` | 将题库 Markdown 转换为 JSON | 题库格式变化时修改 |

## 5. 固定特征量

以下常量集中定义在 `js/quiz.js`：

```js
const QUESTION_BANK_SIZE = 92;
const SAMPLE_SIZE = 28;
const DIMENSION_COUNT = 12;
const OPTION_IDS = ["A", "B", "C", "D"];
```

- 题库总数：92 道。
- 每轮抽题：28 道。
- 评分维度：12 个。
- 题型层：A、B、C、D 四层。
- 每道题：A、B、C、D 四个选项。

题型字母与选项字母虽然相同，但含义不同：`question.stratum` 表示题型，`answer.option` 表示用户选择，算法中不能将两者混用。

## 6. 分层随机抽题

题库四层数量为：

| 题型 | 数量 | 含义 |
| --- | ---: | --- |
| A | 39 | 程度自陈题 |
| B | 21 | 真实经历／日常行为题 |
| C | 21 | 短投射题 |
| D | 11 | 元认知／自我校准题 |

`question-sampler.js` 先使用最大余数法按照各层题量分配 28 个名额，然后在每层内部执行 Fisher–Yates 洗牌并截取相应数量，最后再次打乱合并后的 28 道题。

当前每轮固定抽取 A 12 道、D 3 道；B/C 分别为 6 道和 7 道。B/C 的比例余数相同，因此通过随机平局值决定哪一层多一道。

抽题函数的公开形式：

```js
QuestionSampler.sampleStratified(questions, sampleSize, random);
```

第三个参数 `random` 在浏览器中默认使用 `Math.random`，测试中可以传入固定随机函数，使相同种子得到可重复检查的结果。

## 7. 浏览器会话状态

项目使用 `sessionStorage` 保存两类数据：

- `deceptionIndexQuizStateV3`：当前题号、已经完成的答案和本轮题目编号。
- `deceptionIndexQuizResultV3`：完成状态、28 条原始答案和评分模块输出。

`sessionStorage` 的作用范围是当前浏览器标签页会话。它不是长期数据库，也不会自动在不同设备或不同标签页之间同步。

结果数据把两种内容分开保存：

```js
{
  answers, // 用户的原始选择和选项分值快照
  outcome  // 评分算法根据 answers 计算出的派生结果
}
```

保留原始答案可以让评分算法更容易调试，也避免只留下总分后无法追查计算来源。

## 8. 评分算法边界

评分模块的唯一调用形式：

```js
QuizScoring.calculateResult({ answers, dimensions });
```

职责划分如下：

- `quiz.js` 负责收集、整理和传递数据。
- `scoring.js` 负责纯计算，不读取按钮或修改页面。
- `result.js` 负责验证和显示计算结果。

实现评分时，主要修改 `js/scoring.js` 中 `calculateResult()` 的 TODO 区域。输入结构、输出结构、12 维键名、稀疏分值向量和建议实现顺序见 [评分接口说明](scoring-interface.md)。

## 9. 题库维护

浏览器实际读取 `data/questions.json`，但 JSON 格式不支持注释。题干和选项文字的可维护源是 `data/question-bank-source.md`。

重新生成题库：

```bash
node scripts/build-question-bank.mjs
```

当前生成脚本会把选项 `scores` 和题目 `dimensionJudgement` 恢复为未配置状态。开始录入正式评分值后，必须先扩展生成脚本，否则重新生成题库会覆盖手工写入的分数。

## 10. 测试

运行完整测试：

```bash
node tests/question-bank.test.mjs
node tests/question-sampler.test.mjs
node tests/scoring-interface.test.mjs
node tests/about-navigation-stack.test.mjs
```

各测试职责：

- `question-bank.test.mjs`：检查 92 道题、12 个维度、各题型数量和分值格式。
- `question-sampler.test.mjs`：使用 100 组随机种子检查抽题比例、随机差异和同轮不重复。
- `scoring-interface.test.mjs`：检查评分输入输出约定，并模拟完成 28 道题，确认页面完整传入答案和维度定义。
- `about-navigation-stack.test.mjs`：检查连续打开两个右上角圆球后，返回顺序符合后进先出规则。

自动测试只能验证数据和程序行为。涉及字体、响应式比例、留白和动画速度的改动，还需要在手机与电脑浏览器中进行人工检查。
