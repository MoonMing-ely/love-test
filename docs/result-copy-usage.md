# 结果文案：维护与代码引用

更新：2026-10-20。文案版本 `1.0`，支持当前算法 `1.6`。

已完成独立文案模块、七份完整样稿与测试。本轮未向结果页加入新脚本或节点，页面仍使用原来的展示。后续接入可直接使用下面的接口。

## 1. 文件只各管一件事

| 文件 | 用途 |
| --- | --- |
| [data/result-copy.json](../data/result-copy.json) | 唯一文字源：单项句、完整段落、结语、匹配条件、字段映射 |
| [scripts/build-result-copy.mjs](../scripts/build-result-copy.mjs) | 检查目录，生成浏览器文件，同步 Markdown 样稿与当前分数 |
| [js/result-copy/catalog.js](../js/result-copy/catalog.js) | 自动生成的浏览器目录，加载后深度冻结 |
| [js/result-copy/selector.js](../js/result-copy/selector.js) | 校验输入、选择文字，返回纯数据 |
| [docs/result-copy-v1.md](result-copy-v1.md) | 供人阅读和审稿；局部组合、变体、类型候选不进入运行目录 |
| [tests/result-copy.test.mjs](../tests/result-copy.test.mjs) | 检查匹配、边界、异常、压缩比例与真实答卷引用 |

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

## 6. 后续页面接入示例

普通脚本的先后顺序：现有算法配置 → `catalog.js` → `selector.js` → 结果交互。两个新文件位于 `js/result-copy/`，相对 `html/result.html` 的路径分别为 `../js/result-copy/catalog.js` 和 `../js/result-copy/selector.js`。发布时与结果交互脚本统一更新资源版本，避免新旧缓存混用。

下面的函数接收页面提供的专用文案容器，不操作原分数、滚动或分享控件：

```js
function renderResultCopy(container, validatedResult) {
  const fragment = document.createDocumentFragment();
  function paragraph(text) {
    if (!text) return;
    const node = document.createElement("p");
    node.textContent = text;
    fragment.append(node);
  }

  const copy = window.ResultCopy?.build(validatedResult);
  if (!copy || copy.status === "unavailable") {
    paragraph(copy?.message || "暂时无法显示特点说明。");
  } else {
    paragraph(copy.degreeText);
    paragraph(copy.directionText);
    paragraph(copy.opening);
    copy.paragraphs.forEach(paragraph);
    paragraph(copy.closing);
    paragraph(copy.note);
  }
  container.replaceChildren(fragment);
  return copy;
}
```

始终使用 `textContent`。同一段信息只渲染一次，`message` 不与相同内容的正文重复显示。节点的布局、字号、原技术明细如何收起以及分享截图，仍需接入页面后单独验证；独立模块测试通过不代表页面视觉验收完成。

## 7. 验证范围

已覆盖七份样稿的当前算法重放、必要条件逐项失效、普通组合去重、高低门槛、档位边界、版本／空值／坏记录、真实 28 题保存结果和 200 组正式抽题计算。

完整检查：

```sh
node scripts/build-result-copy.mjs --check
node --test tests/*.test.mjs
```

若执行环境禁止子进程，使用 `node --test --test-isolation=none tests/*.test.mjs`，测试内容相同。真人阅读效果、类型命名和真实页面展示仍需单独确认。
