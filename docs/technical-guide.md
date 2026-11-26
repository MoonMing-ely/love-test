# 项目技术说明

本文只描述当前结构和维护方法；文档入口见 [文档目录](README.md)。评分 V1.6，抽题 V6，题库结构 V4，浏览器存储信封 V3。它们分别管理不同接口，不要求版本号相同。

## 本地运行

```sh
python -m http.server 8765 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8765/html/index.html`。答题页通过 `fetch()` 读取 JSON，请使用 HTTP 服务。

## 目录与职责

| 目录 | 内容 |
| --- | --- |
| `html/` | 首页、答题、结果、关于页 |
| `css/` | 全局样式与内容布局 |
| `assets/` | 页面实际使用的图片、字体及许可 |
| `js/interactions/` | 答题、导航、布局、转场和结果分享 |
| `js/core-algorithm/` | 六层纯计算及集中参数 |
| `js/result-copy/` | 文案目录与选择器，供结果页调用 |
| `js/vendor/` | 本地 html2canvas 及许可 |
| `data/` | 题库维护源、运行 JSON、文案维护源 |
| `scripts/` | 生成器与离线审计工具 |
| `tests/` | 自动测试、辅助代码和固定回归夹具 |
| `docs/` | 当前说明、审计材料及文案研究依据 |

## 答案怎样变成结果

```text
data/questions.json
  → question-sampler.js：受约束抽取 28 题
  → interactions/quiz.js：显示题目、保存选择及分值快照
  → dimension-vector.js：累计 12 维 Raw
  → second-layer-normalizer.js：按本轮 Capacity 归一化到 0～1
  → third-layer-aggregator.js：转换到 0～100，形成 E/J/B/H/F/M/R
  → fourth-layer-evidence.js：适配回 0～1，提取结构证据
  → fifth-layer-mechanisms.js：形成 P1～P4 与 M
  → sixth-layer-integration.js：输出最终指数、档位及解释数据
  → scoring.js：适配为 outcome
  → sessionStorage → interactions/result.js → 结果页
```

`algorithm-config.js` 集中保存参数。`quiz.js` 管理流程，核心算法只计算，`scoring.js` 只适配第六层输出，`result.js` 校验和显示。完整字段与公式见 [评分接口](scoring-interface.md)。适配器的调用包含已计算好的第六层：

```js
QuizScoring.calculateResult({ answers, dimensions, layer6Integration });
```

当前指数范围为 15～85，按 30/50/70 分为四档；它不是被骗概率。必要维度缺失时返回 `insufficient_data`，分数和档位为 `null`。离线模拟不能代替真人信效度验证。

## 题库与抽题

当前正式题库 85 题、12 维，每题四个选项。每轮无放回抽取 28 题，配额 A12/B6/C6/D4；止损至少三个不同题目来源，其余维度至少两个，同语义组最多两题。

具体边界执行至少两题，并占边界容量至少 50%。资源边界、个人界限、不对等投入、信任建立、行为核查的内容要求集中在 `QuestionSampler.CONTENT_COVERAGE`；个人界限至少两题。完整规则见 [评分接口](scoring-interface.md) 和 [抽题 V6](algorithm-sampling-v6.md)。容量按各题最高有效分计算，不随用户答案改变。

新抽题与刷新恢复共用 `validateSelection()`。生成最多尝试 100 次；题池不足或尝试耗尽分别报告 `pool_insufficient` 和 `attempts_exhausted`，不静默放宽规则。

`question.stratum` 是题型，`answer.option` 是选择，两者不能混用。题库维护源是 `data/question-bank-source.md`，运行数据是 `data/questions.json`。题干、选项及分值需先经用户确认，再生成：

```sh
node scripts/build-question-bank.mjs
```

生成器将选项分值和 selection 元数据转为 JSON，并计算 `bankRevision`。不要只改运行 JSON，也不要为了清理重新生成或修改题库。

## 会话、导航与缓存

- `deceptionIndexQuizStateV3` 保存题目 ID、选择及分值快照、游标、抽题版本和题库修订号。刷新恢复前核对版本、覆盖规则与答案；失效时提示并重新生成。
- `deceptionIndexQuizResultV3` 保存原始答案、六层计算和 outcome。旧算法结果提示重测，不自动用新参数解释旧分数。

存储限定在当前标签页会话，不上传服务器。存储失败、缺失结果和无效记录有对应错误处理。

`about-view.js` 共用关于页模板、尺寸计算与安全来源规则；`about-overlay.js` 在首页、答题页和结果页复用一个原生全屏 dialog，原页面 DOM 不重建。圆圈展开沿用 420ms、收起沿用 240ms，不再克隆假页面、跨页交接或预加载返回页 iframe；独立 `about.html` 继续承接刷新和新标签页直达。覆盖层专用宿主和返回图标样式在 `about.css`。

About 导航使用合并到 `history.state` 的专用字段和 `popstate`，保留来源查询参数、hash、页面／结果正文滚动位置及返回焦点。切换视图记录历史，返回逐层退回，Escape 一次回到来源；刷新后由独立页按安全来源链接正常导航。答题初始化或确认中打开时等待 `quiz:idle`，避免打断保存或 `restart=1` 清理。模态层阻止操作底下页面，完全打开后暂停源页装饰动画；关闭后移除动画对象并停止覆盖层尺寸监听，不运行持续动画循环。

答题页与结果页的计分相关脚本必须共用同一发布查询参数。更新这些脚本时同步更新两页 URL，防止旧配置与新算法混用产生 `NaN`。已有页面需重新加载 HTML；`runtime-assets.test.mjs` 检查版本一致性。

## 布局、结果与分享

`style.css` 管理全局背景、字体、外框与响应式规则，`content.css` 管理题干、选项和结果内容。`quiz-layout.js` 根据字体、题目与窗口变化更新布局；普通中文自然换行，短数字和拉丁字母组合可保持整体。它不参与计分。

题干叠卡、选答反馈、导航及页面转场由现有状态类和交互脚本协调。更改界面时保留 DOM ID、题目顺序与状态接口，并在真实浏览器检查长题、矮屏、横屏、缩放和减少动态效果。

`interaction-details.css` 与 `interactions/continuous-corners.js` 负责连续圆角和触摸反馈。SVG 只绘制背景、描边及叠层底卡，沿用原元素的尺寸、边框占位与圆角尺度。分享弹窗使用原生圆角描边，图片在内缩的独立区域滚动，上下渐变只覆盖预览边缘。曲线数学实现保存在 `vendor/continuous-corners.js`，来源和 MIT 许可证随文件保留，无外部运行依赖。轮廓只在尺寸变化或装饰节点被文案更新移除时更新，点击变色由 CSS 状态处理。

`quiz-motion.js` 管理上方题卡原有的小幅抽出／归位，使用短促加速、平滑减速的曲线。选项按下与确认共用蓝色底，表面颜色约 80ms 过渡；确认后约 80ms 开始退色，再用 60ms 淡回白色，先于题卡完成翻页，选中语义与提交锁仍由答题逻辑管理。减少动态效果模式不播放退色动画。鼠标悬停保留粉色、加深描边和 1px 上浮，位移过渡为 160ms。滑动或取消清理按下状态，只有原生 `click` 提交答案。

点击后直接开始 14px 横向、3px 纵向的小幅抽卡，退场 160ms 后统一更新题干、选项、进度和存储，再以 220ms 归位。卡片不透明度按 `1 → 0 → 1` 变化。没有整卡宽度横滑、双卡并排或临时卡片副本。选项文字直接更新，不播放位移或翻页动画；持久 `.option-text` 避免重建连续圆角 SVG。归位过程中内容可读后解除重复提交锁，剩余动画可以被下一次操作清理。

动效模块不处理抽题、计分或答题数据。窗口尺寸变化、页面隐藏或系统动态效果偏好变化会取消视觉动画，已确认的数据交接仍只执行一次。减少动态效果时跳过空间动画，确认保留 80ms，回看直接更新。键盘焦点在新内容可操作后恢复。主观手感仍需正常速度与真机验收。

结果页已按“分数与档位 → 总述 → 正文 → 结语”调用文案模块，页面不再展示计算明细，六层计算及结果记录保持不变。文案使用 `textContent` 渲染；缺少模块时保留分数并提示刷新。维护、状态处理与验证范围见 [文案引用说明](result-copy-usage.md)。

分享由 `result-share.js` 在浏览器本地生成长图，`result-scroll.js` 管理结果滚动。详见 [结果截图分享](result-sharing.md)。

## 验证与审计

```sh
node --test tests/*.test.mjs
node scripts/build-result-copy.mjs --check
```

测试覆盖题库一致性、抽题约束、各层公式、评分方向与连续性、构造画像、答题和恢复流程、结果隔离、存储失败、导航、资源版本及文案生成。`tests/fixtures/` 保存仍在使用的回归输入，不能当作临时输出删除。

历史审计 JSON 在 `docs/audits/`，V1.5 回放基线在 `docs/fixtures/`。它们属于冻结证据，版本可能早于当前源码；日期、种子、源码哈希和限制以对应说明为准。重新审计应输出到 `/tmp` 或 `.local-artifacts/`，不要覆盖冻结记录。复现命令见 [V1.6 校准说明](algorithm-calibration-v1.6.md)。

自动测试不验证真实字体、布局、浏览器缓存或真人测量效度。本次目录整理不新增这些验收结论。
