# 结果文案：维护与代码引用

更新：2026-10-20。文案版本 `1.0`，支持当前算法 `1.6`。

已正式接入 `html/result.html`。结果页显示分数、四档标识、开头总述、中间正文和结语；六层算法数据默认收在“查看计算明细”中。题库、评分和存储格式不变。

## 1. 文件只各管一件事

| 文件 | 用途 |
| --- | --- |
| [data/result-copy.json](../data/result-copy.json) | 唯一文字源：单项句、完整段落、结语、匹配条件、字段映射 |
| [scripts/build-result-copy.mjs](../scripts/build-result-copy.mjs) | 检查目录，生成浏览器文件，同步 Markdown 样稿与当前分数 |
| [js/result-copy/catalog.js](../js/result-copy/catalog.js) | 自动生成的浏览器目录，加载后深度冻结 |
| [js/result-copy/selector.js](../js/result-copy/selector.js) | 校验输入、选择文字，返回纯数据 |
| [docs/result-copy-v1.md](result-copy-v1.md) | 供人阅读和审稿；局部组合、变体、类型候选不进入运行目录 |
| [tests/result-copy.test.mjs](../tests/result-copy.test.mjs) | 检查匹配、边界、异常、压缩比例与真实答卷引用 |
| [tests/result-page.test.mjs](../tests/result-page.test.mjs) | 检查实际页面脚本引用文案、状态、分数与明细 |
| [tests/result-controls.test.mjs](../tests/result-controls.test.mjs) | 检查滚动、明细切换与分享调用链 |

修改文字时编辑 JSON，再执行：

```sh
node scripts/build-result-copy.mjs
node scripts/build-result-copy.mjs --check
node --test tests/result-copy.test.mjs
```

不要直接修改生成的 `catalog.js`，或只修改 Markdown 中的十九条单项、七份完整样稿。生成检查会核对它们是否一致。Markdown 的说明、审稿依据和未采用素材仍直接在文档维护。

七份正文相对上一版减少约 18%—19%，结语保留。JSON 中的 `baselineHan` 记录上一版中间正文汉字数，供压缩检查使用。构造画像用于软件测试，不代表真人验证。

## 2. 怎么选择文字

```text
现有答卷校验通过
  → 检查文案所需的版本、分数、档位、维度
  → 优先匹配完整段落
  → 没有完整匹配时选独立特点句
  → 返回开头、正文两段、结语与核查依据
```

**分数只决定开头的程度。** 分界沿用当前算法的 30／50／70，不据此推断具体性格。原始分数不变，展示截断到两位小数，避免四舍五入后越过档位。

**特点由维度决定。** 归一化值 ≥ 0.65 才引用高侧句，≤ 0.35 才引用低侧句。中间值不强行解释。这两个门槛是首版编辑规则，不是新增评分规则，也不是已经验证的心理学分界。

六份完整个性段落分别覆盖整体较稳、心动有界限、判断容易受影响、难拒绝、难停止投入、多处容易受影响。每份都有四至六个必要条件，必须全部满足；不按“最接近哪类人”套整段。同时满足多份时，依次比较现有 Path 顺序、条件偏离中点的平均幅度、目录顺序。

普通组合最多选择六项，同一主题最多两项。存在风险和保护特点时各保留至少一项，其他候选按 Path 相关性、偏离中点的幅度、目录顺序选取；最终按固定阅读顺序组成段落。Path 只影响排序，不替代维度条件。特点少时可以更短。

完整段落使用自身结语；普通组合根据主要特点选择现有结语；没有突出特点时使用中性说明与通用祝愿。结语表达期待，不用来证明用户的性格。

## 3. 输入和字段映射

页面先沿用现有答卷校验，再把完整结果对象传入：

```js
const copy = ResultCopy.build(result);
// result 已包含 outcome、normalizedDimensions、layer6Integration。
```

模块不读取存储、不访问页面或网络、不重新评分、不修改输入。

| 文案 key | normalizedDimensions 中的来源 |
| --- | --- |
| recognition | traits.recognition |
| needed | traits.need |
| specialness | traits.specialness |
| scarcity | traits.scarcity |
| calibration | traits.calibration |
| evidence | traits.evidence |
| manipulation | traits.manipulation |
| rationalization | traits.rationalization |
| boundaries | traits.boundary |
| stopLoss | traits.stopping |
| differentiation | special.differentiation |
| selfCalibration | special.selfCalibration |

按稳定 key 读取，不能按维度数组位置猜含义。能力类维度保持“值越高，能力越强”；文案选择器不反转或写回数值。

## 4. 返回什么

| 字段 | 页面用途 |
| --- | --- |
| status、reason | 状态与开发核查原因 |
| scoreText、stage | 分数文字与原档位 |
| degreeText、directionText | 四档编号与统一方向说明 |
| opening | 开头总述 |
| paragraphs | 中间正文，优先整体渲染 |
| closing | 结语；缺少测量信息时为空 |
| note、message | 共用说明与异常提示 |
| type | 当前始终为 null，类型名称仍待确定 |
| copyVersion | 文案版本 |
| profileId、selectedIds、evidence | 内部核查：用了哪段、哪些维度、什么值 |
| sentences | 正文完整句数组，供检查；不需要与 paragraphs 重复渲染 |

相同输入和同一文案版本始终得到相同结果。返回数组可供调用方使用，不会改变冻结的目录。文案不额外存回答卷；改措辞后可重新生成文字，不重新计算旧分数。

## 5. 状态如何处理

| 状态 | 情况 | 行为 |
| --- | --- | --- |
| ready | 找到完整段落或有效单项 | 显示总述、特点、结语 |
| fallback | 十二维有效但没有突出特点 | 保留原分数，显示中性解释与通用祝愿 |
| fallback | 有维度明确为 null | 保留已校验的分数，说明信息不足，不编造特点或祝愿 |
| unavailable | 缺字段、非法数值、版本不支持、分数档位矛盾、整体信息不足 | 使用 message，不引用个人解释 |

`null` 不当成 0；字符串、NaN、Infinity、越界值均拒绝。文案模块只检查解释所需字段，不能取代页面原有的完整答卷校验。模块文件未加载时保留原结果，并由页面给出提示。

## 6. 已接入的页面行为

`html/result.html` 按顺序加载算法配置、文案目录、选择器和结果交互脚本。新模块与答题页计分脚本使用同一发布版本 `20261020-runtime-v16-v6-copy1`；测试会检查依赖顺序与资源版本。

`js/interactions/result.js` 保留原有完整记录校验，之后调用 `ResultCopy.build(result)`。具体渲染位置如下：

| 节点 | 内容 |
| --- | --- |
| result-score | 截断到两位小数的分数，单位“分”，移除原来的 /100 |
| result-degree、result-direction | 四档编号与方向说明 |
| result-summary | 开头总述；异常时显示恢复提示 |
| result-copy | 按 paragraphs 的顺序创建完整段落 |
| result-closing | 温暖结语；为空时隐藏 |
| result-note | 共用说明，仅出现一次 |
| result-details | 默认折叠的“查看计算明细”，保留原六层数据 |

文字全部通过 `textContent` 插入，`sentences` 不再重复渲染。类型为 null 时不新增类型节点，也不显示待定名称。

文案脚本未加载时保留已校验的原分数，提示刷新页面，不退回旧技术摘要。明确缺少测量信息时不编造个性描述；非法记录沿用原有空结果处理。

滚动条的 `aria-controls` 改为整个 `result-content`。正文与明细均纳入滚动观察，展开或收起明细时重新同步范围。重测和导航入口保持原路径。

分享继续截取整个结果区：默认包含完整文案及收起的明细入口；用户展开明细后，截图也包含其内容。截图仅在克隆文档中展开滚动区，原页面滚动位置保持不变。图片在浏览器本地生成，不自动发送。

## 7. 验证范围

已覆盖七份样稿的当前算法重放、必要条件逐项失效、普通组合去重、高低门槛、档位边界、版本／空值／坏记录、真实 28 题保存结果和 200 组正式抽题计算。

完整检查：

```sh
node scripts/build-result-copy.mjs --check
node --test tests/*.test.mjs
```

若执行环境禁止子进程，使用 `node --test --test-isolation=none tests/*.test.mjs`，测试内容相同。本轮已验证页面脚本、滚动与分享的模拟调用链；当前浏览器工具未提供可用实例，尚未完成真实浏览器截图、排版目测或真实 PNG 导出检查。真人阅读效果、类型命名与最终视觉验收仍需单独确认。
