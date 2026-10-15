# 第六层 V1 实施方案与验收记录

> 历史记录：本文保留V1.0方案与当时验收。当前正式实现采用[算法V1.4曲线说明](algorithm-calibration-v1.4.md)，请以该文及`algorithm-config.js`为准。

## 1. 目标与范围

实现第六层并在结果页暂时展示最终分数和第一至第六层数据。保留正式96题、28题抽题约束、前五层公式、答题动画以及底部左“重测一次”、右“分享结果”的等宽按钮。

输入严格限于第五层的 P1/P2/P3/P4 与 protection.M，均为0～1；不重新读取12维，不把 self_consistency 并入 M，不重复降低 P。

本方案的数字为待校准的 V1 候选参数，不表示已经由真实样本验证。

## 2. 必须明确的一处原文调整

原文将单/双 Path 的 Anchor 做加权平均作为计分主体。这不能同时保证风险方向：只有 P4=0.85 时，路径严重度为71.25；增加较低锚点的 P1 后，混合平均可能降低总分。模型选择也会造成分数跳变。

建议分离解释和计分：

- 标签层：严格保留原文粗筛、Match、单/双 Path 和平方权重，最多输出两个 Path。
- 计分层：用所有路径的连续严重度取最大值，再叠加连续的多路径增益。
- 原文的加权 PathAnchor、Depth 和解释权重继续保存为诊断数据，不用于覆盖计分主体。

这是有意修改原文主公式，用户已于2026-10-06确认采用并要求实施。不会把新规则包装成文档已有规则。

## 3. Shape 标签

记四个 P 的平均值为 mean，降序值为 q1≥q2≥q3≥q4，spread=q1-q4。

按 A → H → F → G 顺序判断，均不成立时为 None：

| Shape | V1 条件 |
| --- | --- |
| A 整体稳定 | mean≤0.35 且 q1≤0.45，沿用原文 |
| H 多路径高风险 | 至少3条 P≥0.65，或至少2条 P≥0.75 |
| F 单点突出 | q1≥0.65、q1-q2≥0.25，且其余3条平均值≤0.40 |
| G 弥散中度 | 0.40≤mean≤0.65 且 spread≤0.20 |
| None | 其他组合 |

Shape 只用于解释。标签的硬切换不参与最终分的分支选择。

## 4. Path 标签：保留原文公式

粗筛：B/P1≥0.50；C/P2、D/P3、E/P4≥0.45。

```text
prominence_i = P_i - mean(其他三个 P)
Match_i = 0.8*P_i + 0.2*clip(0.5+prominence_i, 0, 1)
```

只对入围者按 Match 降序排序；同分按 B/C/D/E 顺序保持可复现。

- 无候选：Path=None。
- 有候选：保留第一名。
- 第二名同时满足 S2≥0.50、S2/S1≥0.70：保留前两名。
- 单 Path 权重1；双 Path 权重为 S1²/(S1²+S2²) 和 S2²/(S1²+S2²)。

Anchor 保持 B=40/C=52/D=60/E=65。按原文计算解释用 PathAnchor、Depth 与25*(Depth-0.60)，明确标注为诊断量；解释权重不是概率。

## 5. 连续计分主体

统一平滑函数：

```text
t = clip((x-a)/(b-a), 0, 1)
smooth(x;a,b) = t²*(3-2*t)
```

记粗筛阈值为 Ti，对应 Anchor 为 Ai。

```text
activation_i = smooth(P_i; Ti-0.05, Ti+0.10)
severity_i = activation_i * [Ai + 25*(P_i-0.60)]
baseSeverity = 70*mean(P)
PathSeverity = max(baseSeverity, severity_1, ..., severity_4)
```

作用：

- 没有明显 Path 时，通过 baseSeverity 获得分数，不强贴标签。
- 单条风险充分激活时，沿用原文 Anchor+DepthAdjustment。
- 新增较弱路径不能通过平均降低已有严重风险。
- 取最大值连续，但不要求处处可导；满足用户要求的数学连续。

## 6. 连续多路径增益

```text
moderateOverlap = smooth(q3; 0.35, 0.55)
highOverlap = max(
  smooth(q3; 0.55, 0.75),
  smooth(q2; 0.65, 0.85)
)
ShapeAdjustment = 4*moderateOverlap + 12*highOverlap
```

q3 反映至少3条中度风险；q2/q3 反映2条很高或3条较高风险。仅单点突出时不会获得多路径增益。

这是同一组合增益函数，范围0～16。通常 G 获得较小增益，H 获得更大增益；不能直接按 G/H 标签加固定分，否则边界会跳变。接近标签边界但尚为 None 的输入也可以有少量连续增益。

## 7. Protection 与阶段

```text
PreScore = PathSeverity + ShapeAdjustment
ProtectionAdjustment = -8*M*min(1, PreScore/40)
Score = clip(PreScore + ProtectionAdjustment, 0, 100)
```

M 只在这里作用一次：最多降低8分，低分时最多降低20%，不会把正风险直接抹成0。固定 P 时，M 升高不会使分数升高。Shape/Path 不受 M 改变。

阶段按未舍入的 Score：<30为Stage1，<50为Stage2，<70为Stage3，否则Stage4。内部保留精度，页面默认两位小数。

不为了填满刻度把最大值强行拉伸到100。本组参数的极端 P全1、M=0 为91分；0～100是输出标尺，不是概率。

## 8. 候选公式的实际数值核对

| P1/P2/P3/P4 | M | Shape | Path | Score |
| --- | --- | --- | --- | --- |
| 0/0/0/0 | 0 | A | None | 0.00 |
| .20/.20/.20/.20 | .80 | A | None | 11.76 |
| .82/.25/.30/.28 | .50 | F | B | 41.50 |
| .52/.55/.57/.54 | .50 | G | D+C | 62.66 |
| .75/.72/.68/.78 | 0 | H | E+B | 84.77 |
| .75/.72/.68/.78 | 1 | H | E+B | 76.77 |
| 0/0/0/.85 | 0 | F | E | 71.25 |
| .55/0/0/.85 | 0 | F | E | 71.25 |
| 1/1/1/1 | 0 | H | B+C | 91.00 |

已用独立数值原型检查10000组固定随机输入：分别提高每条风险不降分、提高M不升分、微小扰动不跳分。以上最初为候选公式检查；项目代码与浏览器实施状态见文末验收记录。

连续性还可从公式直接判断：smooth、mean、顺序统计量、max、min和clip均连续；阶段与标签允许离散切换。

## 9. 结果页临时输出

| 层级 | 展示内容与尺度 |
| --- | --- |
| 最终结果 | Score/100、Stage、Shape、Path、解释权重 |
| 第一层 | 12维 Raw 原始累计分 |
| 第二层 | 12维 Capacity、Raw/Capacity（0～1） |
| 第三层 | E/J/B/H/F/M（0～100）、峰值/短板/离散；R保留未定义 |
| 第四层 | E/J/H/B/T/F/M、E_peak/J_weak/J_hole/BT_gap，以及High/Low隶属度（0～1） |
| 第五层 | P1/P2/P3/P4、Protection.M（0～1）；self_consistency未提供时显示暂无 |
| 第六层 | Shape/Path、Match/权重、各路径severity、baseSeverity、PathSeverity、组合增益、保护修正、最终分 |

每层显示已有数值，不给没有总分的层人为创造总分。第三层F/H与第六层Shape F/H使用明确中文名称和层级区分。

结果详情采用可滚动内容区，不遮挡底部操作。电脑和手机保留现有粉蓝外观、字体、按钮样式与左右布局。

## 10. 文件与接口

- 新增 js/core-algorithm/sixth-layer-integration.js，纯函数 Layer6Integration.calculate(layer5Mechanisms)。
- 在 algorithm-config.js 增加独立的第六层配置，不改前五层既有参数。
- quiz.js 完成第五层后调用第六层；并行保存 layer6Integration 和现有各层数据。
- scoring.js 只将第六层结果适配为 outcome，status改为scored；不重复跑前五层。
- html/text.html 补齐脚本加载顺序，结果页及样式增加分层输出区域。
- 模块输出 complete/insufficient_data、Score/Stage/Shape/Path和可追踪debug；保留每层算法版本。

旧占位结果提示重测，不填0、不猜旧记录的最终分。有效答题进度保留，完成时使用当前第六层计算。缺失输入保持null/insufficient_data；非有限数和越界输入作为错误停止，不生成虚假分数。

## 11. 实施验收

1. 文档公式、候选参数、Shape优先级、同分排序逐项测试。
2. 零值/满值、无Path、单/双Path、所有标签、输入缺失和错误输入测试。
3. 数学连续、风险方向、Protection方向及阈值附近细步扫描；检查标签变动不能直接跳总分。
4. 真实正式题库 Raw→第六层→outcome→结果页；结果保存、刷新恢复、重测、旧结果与存储失败回归。
5. 全部现有测试及真实Firefox完整28题；电脑/手机结果页显示所有层数值，详情可滚动且按钮不重叠。
6. 更新技术说明和进度，交付本机预览；不自动提交或推送。

## 实施进度（2026-10-06）

- 主公式调整和全部V1参数已获用户确认。
- 第六层纯模块、评分适配、答题页保存、结果页六层输出已完成并写入原项目。
- 全部14个Node测试文件通过，包含10000组第六层连续性/方向检查与1000组正式题库全评分链路。
- 真实Firefox从首页完成两轮正式28题；答题刷新恢复、结果页刷新、旧占位记录提示和重测重新计算通过。
- 1440×900、768×1024、390×844、320×720、1280×600五种视口通过；六层详情可滚动到底、按钮等宽且不重叠、没有横向溢出。
- 题库、抽题、前五层算法文件、导航和动画与修改前逐字节一致；配置只新增独立LAYER6。
- 未自动提交、推送或发布。

本机预览：http://127.0.0.1:4173/html/index.html。浏览器验收临时记录：`/tmp/love-test-layer6-browser-4186.json`。
