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
        ↓ interactions/quiz.js 加载并校验题库 v4
js/question-sampler.js
        ↓ 按固定题型配额、维度覆盖与语义限制抽取 28 道
js/interactions/quiz.js
        ↓ 显示题目、播放选择反馈、保存答案快照
js/core-algorithm/dimension-vector.js
        ↓ 第一层：累计 12 维 Raw 向量
js/core-algorithm/second-layer-normalizer.js
        ↓ 第二层：按本轮题目 Capacity 标准化为 0～1
js/core-algorithm/third-layer-aggregator.js
        ↓ 第三层：转换为 0～100 并归纳 E/J/B/H/F/M/R
js/core-algorithm/fourth-layer-evidence.js
        ↓ 第四层：适配回 0～1，提取峰值、短板、差异和模糊值
js/core-algorithm/fifth-layer-mechanisms.js
        ↓ 第五层：计算 P1/P2/P3/P4 和 Protection ─────────┐
js/core-algorithm/sixth-layer-integration.js
        ↓ 第六层：连续严重度、Shape/Path、Score/Stage
js/scoring.js                                             ├→ sessionStorage
        ↓ 适配第六层最终分与阶段为 outcome ───────────────┘
        ↓ 保存本轮原始答案和计算结果
js/interactions/result.js
        ↓ 校验并显示最终分与六层数据
html/result.html
```

这里的“无放回抽取”表示一道题在同一轮测试中最多出现一次。刷新答题页时，`js/interactions/quiz.js` 会尝试从 `sessionStorage` 恢复原题组和答题进度；点击重新测试时才清除旧状态并抽取新题组。

右上角圆圈的返回路径由 `about-navigation-stack.js` 管理。`restart=1` 是一次性的重测命令，导航栈归一化答题页地址时会移除它；读取已有返回路径时也会进行归一化，避免关于页的返回动画预加载答题页时重复清空进度。

## 3. 目录结构

```text
love-test/
├── html/       页面结构和入口
├── css/        全站样式及响应式排版
├── js/         随机抽题、评分接口和核心算法
│   ├── interactions/  页面交互、导航与转场
│   └── core-algorithm/  核心算法的数据处理模块
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
| `js/interactions/quiz.js` | 题库校验、答题流程、状态恢复和结果保存 | 修改答题行为 |
| `js/question-sampler.js` | 受约束抽题、题库与题组校验 | 修改抽题策略 |
| `js/scoring.js` | 将第六层结果适配为统一 outcome | 修改结果接口 |
| `js/core-algorithm/dimension-vector.js` | 建立并累加 12 维选项向量 | 修改第一层维度处理 |
| `js/core-algorithm/second-layer-normalizer.js` | 根据本轮题目容量生成标准化维度数据 | 修改第二层标准化处理 |
| `js/core-algorithm/third-layer-aggregator.js` | 将 12 维观测值归纳为 E/J/B/H/F/M/R 和组内结构 | 修改第三层高层结构 |
| `js/core-algorithm/algorithm-config.js` | 集中保存第四、第五层及独立 LAYER6 的 V1 参数 | 重新标定冻结参数 |
| `js/core-algorithm/fourth-layer-evidence.js` | 生成第四层模糊值、峰值、短板、B/T 差异和一致性 | 修改结构证据算法 |
| `js/core-algorithm/fifth-layer-mechanisms.js` | 独立计算 P1～P4、Protection、diagnostics 和 debug | 修改元机制算法 |
| `js/core-algorithm/sixth-layer-integration.js` | 连续整合 P1～P4/M，输出分数、阶段与解释 | 修改第六层计算 |
| `js/interactions/result.js` | 校验、读取和显示评分结果 | 增加结果图表或维度说明 |
| `js/interactions/about.js` | 切换关于页面内容 | 修改关于页交互 |
| `js/interactions/about-navigation-stack.js` | 右上角圆球的后进先出导航栈 | 修改圆球返回逻辑 |
| `js/interactions/page-transition.js` | 页面圆形展开和收回动画 | 修改转场动画 |
| `data/questions.json` | 浏览器实际读取的 96 题运行数据 | 通常由生成脚本产生 |
| `data/question-bank-source.md` | 题目文字的维护源 | 修改题干和选项文案 |
| `scripts/build-question-bank.mjs` | 将题库 Markdown 转换为 JSON | 题库格式变化时修改 |

## 5. 固定特征量

以下常量集中定义在 `js/interactions/quiz.js`：

```js
const SAMPLE_SIZE = 28;
// 题库结构检查由 QuestionSampler.assertQuestionBank 负责。
```

- 当前题库：96 道（A40/B21/C24/D11，77 valid / 19 review）；总量允许扩充，不作为运行时固定限制。
- 每轮抽题：28 道。
- 评分维度：12 个。
- 题型层：A、B、C、D 四层。
- 每道题：A、B、C、D 四个选项。

题型字母与选项字母虽然相同，但含义不同：`question.stratum` 表示题型，`answer.option` 表示用户选择，算法中不能将两者混用。

## 6. 受约束随机抽题

`QuestionSampler.sampleStratified(questions, 28, random)` 固定 A12/B6/C6/D4。仅使用 valid 题，认需特稀各至少 1 个不同 ID，其余八维各至少 2 个不同 ID，同语义组最多 2 题。先补骨架覆盖，再补配额，完整验证后洗牌；最多尝试 100 次。不修改原始题库或评分。

`assertQuestionBank(data)` 检查版本、结构和元数据；`validateSelection(questions)` 返回 `{ valid, errors, debug }`，用于生成及恢复。容量不足报 `QuestionPoolConstraintError`，reason 为 `pool_insufficient`；尝试耗尽为 `attempts_exhausted`。非预期程序异常直接向页面传播，不重抽。

维护源每题标题后包含一行 `<!-- selection: {...} -->`，其中 dimensions 使用英文评分 key，status 为 valid/review/disabled，semantic_group 为具体主题。同组第二题及非 A 来源属于优先选择，不增加硬规则。

生成脚本输出题库 version=4，并用 Node 内置 SHA-256 计算 bankRevision；同内容构建相同。候选状态及审核依据见 `question-bank-audit.md`。A29/C05 等 19 道存疑题仍为 review。已按用户确认新增 A40/C22/C23/C24，四题均 valid 且仅计入 manipulation；正式题库 1000 次生成全部通过，完整评分链路及真实 Firefox 两轮答题、刷新恢复、旧题库修订号失效均已验证。三种操纵机制覆盖由题库整体提供，不增加每轮机制数量校验。

第三个参数 random 默认 Math.random，可注入固定种子。成功返回 questions、allocation 和 debug（题型、维度来源、语义统计、attempt_count），不保存或展示用户答案日志。

## 7. 浏览器会话状态

项目使用 `sessionStorage` 保存两类数据：

- `deceptionIndexQuizStateV3`：当前题号、答案、题目 ID、selectionVersion 和 bankRevision。旧 key 保留，旧数据缺版本会重新生成。
- `deceptionIndexQuizResultV3`：完成状态、28 条原始答案、第一至第五层算法数据和占位评分输出。

`sessionStorage` 的作用范围是当前浏览器标签页会话。它不是长期数据库，也不会自动在不同设备或不同标签页之间同步。

结果数据把两种内容分开保存：

```js
{
  answers, // 用户的原始选择和选项分值快照
  dimensionVector, // 第一层产生的 12 维 Raw 数组
  normalizedDimensions, // 第二层产生的 traits、special、exposure 和 debug
  layer3Structures, // 第三层产生的 E、J、B、H、F、M、R 和组内结构
  layer4Evidence, // 第四层产生的结构证据和 High/Low 模糊值
  layer5Mechanisms, // 第五层产生的 P1～P4、Protection 和调试数据
  outcome  // 评分算法根据 answers 计算出的派生结果
}
```

保留原始答案可以让评分算法更容易调试，也避免只留下总分后无法追查计算来源。

第二层使用本轮实际抽到的题目计算每个维度的诊断容量：逐题取该维度四个选项中的最大有效贡献，再将第一层 Raw 除以 Capacity。它不做均值中心化、风险方向反转、12 维求和或最终风险判断。`分`、`自`写入 `special`，`边`、`止`在 `exposure` 中预留 `null`。

第三层首先把第二层的 `0～1` Observed Score（观测分数）局部转换为 `0～100`，不修改第二层原值。`E` 等权聚合认、需、特、稀，并保存峰值、并列峰值来源、峰值差和总体标准差；`J` 等权聚合校、证、操，并保存最弱值、并列短板来源、短板差和总体标准差；`B` 等权聚合边、止，并保存最弱值、并列短板来源和两项绝对差。`H`、`F`、`M` 分别透传合、分、自并转换到 `0～100`；当前题库不能可靠估计关系经验，因此 `R` 为 `null`。

E/J/B 始终保留自己的 `subScores`。如果某组含有 `null`，该组的 `summary` 及 peak/weak、gap、dispersion/imbalance 等派生字段返回 `null`，已观测到的细维度仍保留。第三层不生成诊断列表、风险分数、权重、等级或结论；这些结构特征交给第四层继续处理。

第四层入口 `Layer4Evidence.fromLayer3(layer3Structures)` 负责兼容第三层 V1.1：将 `0～100` 的细维度除以 100 后，再按新定义令 `B=boundary`、`T=stopLoss`。它不会把第三层旧的 `B.summary` 当成第四层 B。第四层输出 `E/J/H/B/T/F/M`、E 峰值、J 短板、`BT_gap`、可选一致性和集中计算的 High/Low。任一正式维度缺失时，状态为 `insufficient_data`，缺失值不会自动变成 0。

第五层入口 `Layer5Mechanisms.calculate(layer4Evidence)` 独立计算关系价值放大 P1、判断偏移 P2、行动失守 P3、退出困难 P4。M 与可选一致性只进入 `protection`，不修改 P1～P4；`debug` 保留各机制的 core/support。第五层不求和、不映射阶段，也不生成最终风险。第六层已独立实现：`Layer6Integration.calculate(layer5Mechanisms)` 仅读取四条风险和 protection.M，产生连续最终分及离散阶段/标签；`QuizScoring.calculateResult` 只适配第六层输出。公式和实施验收见 [第六层方案](layer6-implementation-plan.md)。旧占位结果需重测，不以0补缺失值。

V1 只有在 12 个底层维度都可计算时才正式生成 P1～P4，否则返回 `insufficient_data`。新抽题器保证合格问卷的最低覆盖；目前仍需补足有效操题才能生成正式问卷，不能把缺失维度静默当成 0。

## 8. 评分算法边界

评分模块的唯一调用形式：

```js
QuizScoring.calculateResult({ answers, dimensions });
```

职责划分如下：

- `js/interactions/quiz.js` 负责收集、整理和传递数据。
- 核心算法模块负责纯计算，`scoring.js` 只适配第六层输出，不读取按钮或修改页面。
- `js/interactions/result.js` 负责验证和显示计算结果。

第六层算法位于 `js/core-algorithm/sixth-layer-integration.js`；`js/scoring.js` 的 `calculateResult()` 只适配该层输出。输入结构、输出结构、12 维键名、稀疏分值向量和建议实现顺序见 [评分接口说明](scoring-interface.md)。

## 9. 题库维护

浏览器实际读取 `data/questions.json`，但 JSON 格式不支持注释。题干和选项文字的可维护源是 `data/question-bank-source.md`。

重新生成题库：

```bash
node scripts/build-question-bank.mjs
```

生成脚本会解析每个选项后的 `〔维度+分值〕` 标注，将中文维度简称转换为稳定的英文 `key`，并写入选项的 `scores` 对象。题目级 `dimensionJudgement` 仍保留为 `null`。

## 10. 测试

运行完整测试：

```bash
node tests/question-bank.test.mjs
node tests/question-sampler.test.mjs
node tests/scoring-interface.test.mjs
node tests/dimension-vector.test.mjs
node tests/second-layer-normalizer.test.mjs
node tests/third-layer-aggregator.test.mjs
node tests/fourth-layer-evidence.test.mjs
node tests/fifth-layer-mechanisms.test.mjs
node tests/about-navigation-stack.test.mjs
```

各测试职责：

- `question-bank.test.mjs`：检查元数据、维护源/JSON 一致性、修订号稳定性及变化敏感性。
- `question-sampler.test.mjs`：直接使用正式题库生成 1000 组固定种子，验证配额、维度来源、语义、状态及随机性；另验证容量不足和重试失败。
- `quiz-flow.test.mjs`：真实抽题器接页面及 Raw→第五层→结果，覆盖刷新恢复和启动/中途/完成存储失败。
- `scoring-interface.test.mjs`：检查评分输入输出约定，并模拟完成 28 道题，确认页面完整传入答案和维度定义。
- `dimension-vector.test.mjs`：检查第一层 12 维向量的建立、累加和恢复。
- `second-layer-normalizer.test.mjs`：检查 Capacity、0～1 标准化、特殊维度、exposure、clamp 警告和重复计算一致性。
- `third-layer-aggregator.test.mjs`：检查 0～100 转换、E 峰值、J/B 短板、并列来源、内部不均衡、H/F/M/R、缺失值和层级边界。
- `fourth-layer-evidence.test.mjs`：检查 0～1 适配、High/Low、E/J 结构、B/T 解耦、一致性、缺失值和输入范围。
- `fifth-layer-mechanisms.test.mjs`：检查 P1～P4 公式、五组集成人格、Protection、debug 和全部单调不变量。
- `about-navigation-stack.test.mjs`：检查连续打开两个右上角圆球后，返回顺序符合后进先出规则。

自动测试只能验证数据和程序行为。涉及字体、响应式比例、留白和动画速度的改动，还需要在手机与电脑浏览器中进行人工检查。


## 答题页响应式修复（2026-10-06）

已完成：竖屏题框与选项以原宽度为基准增加 15%，短题框最低高度为原高度的 85%；长题干与选项按实际内容自动增加高度，完整换行。题框顶部保持对齐，缩短留白发生在底部。

答题页外框统一采用 83svh 基准，受顶部快捷操作和底部留白约束；近正方形不再使用独立固定题框高度。移除顶部灰线及外框顶端装饰线，外框上移 8px（受快捷操作最小间距约束）。题干、选项、提示和进度条按自然顺序排列，去掉额外位移与进度条的绝对定位。

较矮窗口或长文本超出外框时，整组内容可纵向滚动；键盘可以聚焦滚动区域，选项仍保持至少 44px 点击高度。每次渲染新题或恢复问卷时，将滚动位置归零。保留原粉蓝配色、选项反馈、抽题和六层评分接口。

验证：Firefox 在 11 种尺寸（320×568 至 1440×900，包含竖屏、正方形与低高度横屏）逐题检查真实题库的全部 96 道题；题干、选项无裁字及互相覆盖，进度位于选项之后。现有 14 个测试文件全部通过。另实测最小竖屏下选项操作、下一题回顶部、刷新恢复、完成 28 题、六层结果显示和重测。


### 顶部进度与比例微调（2026-10-06）

答题进度移至左上角，采用与右上角快捷操作圆圈同为 40px 高的胶囊条；完成部分使用现有蓝色，题号显示为 `1/28题` 并位于条内右侧。顶部共用 flex 布局，移动端为圆圈预留空间，进度不会随答题区域滚动。保留原生 progress 的 max/value 更新、刷新恢复和暂停提示。

中间外框以当前宽度缩窄 5%，题框与选项跟随容器收窄；外框高度基准由 83svh 调为 85svh，短题框最低高度增加 5%，长文本继续按内容撑开。较矮窗口仍受可用屏高约束，保留滚动与换题回顶部。

验证：11 种屏幕尺寸、真实题库全部 96 题的布局检查及现有 14 个测试文件通过；Firefox 验证顶部圆条与圆圈等高、题号右对齐、无重叠，并完成整轮答题及刷新、重测的进度更新。

### 答题页布局与响应式适配（2026-10-08）

交流区域：A 为进度条，B 为两个导航圆圈，C 为蓝色外框，D/Douse 为题干卡片，E 为四个选项。区域名称只用于沟通。

样式统一维护在 `css/content.css`：公共面板、答题页组件、结果页组件、交互状态、响应式断点各自集中排列。答题页使用 `--quiz-frame-width` 定义 C 的宽度，`--quiz-card-base` 定义内容基准宽度，`--quiz-card-width` 定义 D、E 与状态区域共同的最终宽度；断点调整这些入口，不再叠加旧比例计算。手机、横屏和矮横屏的规则集中管理，没有按设备型号分支。

手机宽度小于 600px 时内容采用正常文档流，C 随长内容自然增高，整页滚动。优先保留题干字号、16px 选项字号与至少 52px 的点击高度，移除逐题测量并压缩字号的旧档位。短题保留 D 的最低高度，长题减少题号前的留白。换题同时重置页面和内部面板滚动位置，刷新恢复继续使用同一渲染函数。

手机和平板竖屏 C 基准宽度为 90vw，D/E 共用扣除 24–40px 两侧留白后的宽度，文字列仍限制在题框内部的 92%。平板保留单列和受限字号，电脑内容区上限为 760px。横屏 C 将此前两侧粉色留白减半，基准宽度为 `48.54368932vw + min(42vw, 600px)`；D/E 按 58vw 缓慢增长、目标下限 560px、上限 680px，空间不足时服从实际可用内宽。滚动条采用双侧对称预留，避免内容偏心。高度不超过 500px、宽度至少 600px 的横屏选项使用两列。

C 高度沿用增加 5% 后的基准，并保持中心补偿；手机长题采用自然高度，不强求一屏显示。过窄竖屏沿用普通手机竖屏的高度、内边距和间距规则，不再按宽高比额外增加纵向留白；仅文字自然换行会使内容增高。

D 使用上粉下白渐变和 2px 粉色边框，边框恢复为原来的 `--question-border: #f6bfd2`，顶部渐变仍为 `--canvas`，题干字重为 510。白色爱心尺寸 20.4px，居中搭配向外渐透明的白色横线；爱心累计上移自身高度的 45%。题目文字单独渲染，上移保留长题位移上限以避免与爱心重叠。QUESTION 使用边框同款粉色变量 `--question-border`、400 字重，靠近底部，编号与原生进度共用当前题索引。装饰不进入无障碍阅读。

选项字重为 540、边框统一为蓝色，各选项按自身内容独立增高，单行选项保留原最低高度；横屏两列也取消同一行内的高度拉伸。悬停为浅粉 `#ffe1ec`；点击过渡选中项为浅蓝，其他选项保持白底、原边框及原文字颜色；题框在普通和过渡状态均保留原来的粉白渐变，不再额外淡化。过渡由面板统一的 `is-answering` 状态控制，不替换题框背景结构；换题和失败状态统一清除反馈状态。颜色反馈及选择时序独立于响应式布局。A 为 8px 灰色未完成轨道和同高蓝色圆弧填充，不显示旧题号，保留原生进度语义。

验收：Firefox 检查指南的 8 个推荐视口与额外边界，共 25 种尺寸×96 道题。核对内容居中、完整文字、选项可访问、手机整页滚动与换题回顶部；并对比代码整理前后各区位置和尺寸，误差小于 0.3px。14 个 Node 测试文件通过，CSS 检查无错误。实际可用高度变化时允许滚动，避免裁切。

过渡状态验证：Firefox 手机与桌面实际点击，确认选中项蓝色反馈、未选项文字与边框不变、题框始终保留原粉白渐变与恢复后的粉色边框；换题恢复普通渐变、选项可继续点击，反馈期间几何尺寸不变。14 个 Node 测试文件通过。

竖屏 D/E 宽度统一连续收窄：390px 及以下为原宽度的 98%，通过同一个 clamp 插值逐渐过渡到约 768px 起的 95%。由基准宽度计算最终宽度，不为手机和平板分别添加覆盖规则；保持共同居中与独立选项高度，横屏宽度不变。Firefox 对比 34 种尺寸（包含 599/600/601、767/769、899/900/901 断点附近）和全部 96 道题，核对手机 2%、平板 5%、中间范围、D/E 同宽和内容完整性。

### 题目导航与底部进度（2026-10-08）

D、E 之间的灰色分隔线为 2px，两端各 12px 向透明渐变，线宽与 D、E 保持一致，线上下均采用现有区域间距的 1.1 倍，所有断点共享同一计算规则。

左上角圆形左右按钮采用蓝色边框、白色底、蓝色加粗箭头（SVG 圆角端点和折角），箭头在圈内上移 2%，高亮沿用粉色；按钮与 B 区圆圈同尺寸，左箭头与 C 左侧对齐。悬停只保持高亮，点击左箭头返回上一题。右箭头在回看已答题时出现，点击跳到第一道未答题，到达后隐藏。第一题隐藏左箭头按钮并保留其布局空位，左右箭头始终各居原位；加载、反馈和错误状态统一禁用导航。进度条移到 C 内底部，保留灰色细轨道与蓝色圆弧填充，面板留出底部空间。

导航仅保存当前题目游标，保留全部答案、题目顺序和抽题结果。回看以粉色底及蓝色边框高亮原答案，刷新仍能恢复；改选替换当前答案并从完整答案重新计算维度向量，避免重复累计。过渡时选中项为蓝色，其他选项白色，题干保留粉白渐变。

测试覆盖悬停不跳转、点击及键盘返回、未答题跳转、原答案高亮、刷新恢复、改选计分和存储失败。
