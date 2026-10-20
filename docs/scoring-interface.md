# 评分接口说明

本文说明答案如何逐层变成结果。当前是V1.6内容一致性修正版；保持六层职责与28题流程，证据映射、风险机制与整合规则见[本轮说明](algorithm-calibration-v1.6.md)。

## 数据流与职责

```text
85题正式题库 → 受约束抽取28题 → answers
  → 第一层 dimensionVector：累计12维原始分
  → 第二层 normalizedDimensions：Raw/Capacity，0～1
  → 第三层 layer3Structures：结构与细维度，0～100
  → 第四层 layer4Evidence：适配回0～1并提取证据
  → 第五层 layer5Mechanisms：P1～P4与protection.M
  → 第六层 layer6Integration：连续分数、Shape/Path与阶段
  → QuizScoring.calculateResult：适配为outcome
  → sessionStorage → 结果页
```

第一至第六层均为纯计算，不读取DOM、不重新抽题、不发送答案。页面交互维护在`js/interactions/`；核心算法维护在`js/core-algorithm/`。

## 答案与题库

当前正式85题，每题4个选项，12个稳定英文维度key；每轮28题，A12/B6/C6/D4，不重复。止损至少3个题目来源，其余维度至少2个，同语义组最多2题。抽题版本6保留具体边界执行类至少2题及至少50%边界容量，并要求资源／个人／不对等投入三个方面的内容占比；信任建立与实际行为核查也有最低容量占比。个人界限／承诺压力至少2题，其余内容方面最低题数不变。规则集中在QuestionSampler.CONTENT_COVERAGE，新抽题和恢复验证共用；生成时同步考虑已有内容的占比上限。计分仍为V1.6，抽题修改与验收见[最小修正说明](algorithm-sampling-v6.md)。

`stratum`是题型字母；`option`是选项字母，两者不能混用。每条答案保存实际选择及当时的分值快照：

```js
const answer = {
  questionId: "A01",
  option: "B",
  scores: { recognition: 2 },
};
```

`scores`是稀疏向量，未列出的维度视为0。接口兼容旧的null分值，但正式题库均已配置分值。维度名称和顺序由题库`dimensions`提供，按英文key匹配，不按中文文案推断。

维护源为`data/question-bank-source.md`，浏览器读取生成的`data/questions.json`。修改分值必须先修改维护源再构建，不能手改JSON。本轮校准没有修改题库。

## 逐层调用

页面唯一评分入口在`js/interactions/quiz.js`完成答题的位置：

```js
const dimensionVector = DimensionVector.fromAnswers(answers, dimensions);
const normalizedDimensions = DimensionNormalizer.normalize({
  rawVector: dimensionVector,
  dimensions,
  questions, // 本轮实际28题，不是整个题库
});
const layer3Structures = HigherOrderStructure.aggregate(normalizedDimensions);
const layer4Evidence = Layer4Evidence.fromLayer3(layer3Structures);
const layer5Mechanisms = Layer5Mechanisms.calculate(layer4Evidence);
const layer6Integration = Layer6Integration.calculate(layer5Mechanisms);
const outcome = QuizScoring.calculateResult({
  answers,
  dimensions,
  layer6Integration,
});
```

Capacity逐题取该维度四个选项中的最大分，再求和；Value=Raw/Capacity，容量0返回null。保护方向不会在第二层反转。

第三层仅在自己的输出中把0～1放大到0～100，保留E/J/B的细维度和峰值/短板/离散；H/F/M透传，R为null。第四层适配器读取细维度除以100，B只取边界，T只取停止，不把第三层B的均值误当成边界能力。

第四层统一使用全区间线性证据：High(x)=x，Low(x)=1−x，不再在0.2/0.8提前饱和。第五层输出P1关系价值入口、P2判断偏移、P3行动失守、P4退出困难和M保护，不映射总分。P2以70%最弱判断证据+30%整体判断弱为核心，经E/H支持后，与0.6×H的独立回避证据取最大值；J_hole只用于解释。P3由边界弱启动，判断好坏不再作为启动条件。P4=0.5×最大弱项+0.3×止损弱+0.2×最小弱项，再保留原E支持。第六层将P线性映射为严重度，取最强路径+其余路径严重度之和的10%，之后保留原M抵减。Path/Shape仅用于解释。`self_consistency`未提供时为null，不自动推算或并入M。

## 最终接口

`QuizScoring.calculateResult`复制第六层的结果，不重新计算前五层，不根据答案字母直接加出总分。

```js
{
  version: 3,          // 存储信封版本，不是算法参数版本
  status: "scored",   // 或 insufficient_data
  dimensionCount: 12,
  totalScore: 结果的连续分数,
  dimensionScores: null,
  stage: 1至4,
  title: "情感被骗指数",
  summary: 结果解释文字,
}
```

0～100是指数标尺，不是被骗概率。现标尺用原证据分[0,30,70,90.6]线性插值为[15,30,70,85]；全P=1/M=0显示85。原证据分保存在`layer6Integration.debug.evidenceScore`，M仍作用于映射前证据分；缺失数据不映射成15。阶段仍按30/50/70分界；同一份答卷的分数与档位会随算法更新而变化，尚未由真人效标标定。

任一必要维度缺失时，第四至第六层返回`insufficient_data`，总分与阶段为null；null不等于0分。结果页隐藏分数，展示数据不足状态。

## 存储、版本与恢复

`deceptionIndexQuizStateV3`保存题目ID、答案、游标、抽题版本与题库修订号。抽题版本现为6；刷新时验证版本、覆盖和答案快照。旧进度不符合版本或规则时，重新生成并提示。

`deceptionIndexQuizResultV3`并行保存原始答案、12维原始向量、六层输出、维度定义、outcome及完成时间。第三层版本1.1、第四层1.3、第五层1.3、第六层1.6各自标注；字段信封版本仍为3。

结果页加载当前`AlgorithmConfig`并核对第六层版本。旧版结果显示重测提示，不自动套用新参数重算，也不以新参数文案解释旧分数；当前版结果刷新保留已保存的分数。

## 修改后的验证

```bash
node --test tests/*.test.mjs
```

核心检查包括题库一致性、抽题硬约束、每层计算、P1～P4证据意义及新版方向约束、M保护、连续性、阶段、28题页面流程、刷新恢复、旧版本隔离及存储失败。画像模拟用于发现规则问题，不能代替真实信度与效度证据。
