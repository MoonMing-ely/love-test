# 开发文档

先读 [技术说明](technical-guide.md) 了解结构与维护方法，再按任务查阅下列文档。

| 文档 | 用途 |
| --- | --- |
| [评分接口](scoring-interface.md) | 当前数据流、公式、版本和恢复约定 |
| [V1.6 校准记录](algorithm-calibration-v1.6.md) | 计分与内容覆盖的决策、验证及限制 |
| [抽题 V6](algorithm-sampling-v6.md) | 个人界限覆盖修正与稳定性验收 |
| [结果分享](result-sharing.md) | 本地长图、预览和保存 |
| [文案引用](result-copy-usage.md) | 文案源、生成器、选择接口与结果页接入 |
| [文案验收](result-copy-acceptance.md) | 语言要求和审核边界 |
| [完整文案样稿](result-copy-v1.md) | 与文案源同步的七份样稿 |
| [文案研究](research/result-copy-2026-10-17.md) | 研究当时的依据，产品状态以当前接口说明为准 |

`audits/` 集中保存 V1.6 与抽题 V6 的冻结审计材料；`fixtures/` 保留复现这些审计所需的 V1.5 源码基线。正式测试及固定输入仍在 `tests/`。

## 工作区维护

旧截图、一次性预览、未采用图片、已被取代的分版本方案和逐次视觉微调记录已于 2026-10-20 清理。完整旧内容可从清理前提交 `eda4e2f` 查阅，例如：

```sh
git show eda4e2f:docs/algorithm-calibration-v1.4.md
```

需要恢复文件时先导出到 `/tmp` 检查，避免覆盖当前文件。不重写或清除 Git 历史。

临时截图、预览、日志和新审计输出放在 `/tmp` 或项目的 `.local-artifacts/`，不纳入版本控制。完成的规则与维护说明合并到现有文档；只有需要长期复现的证据才进入 `docs/audits/` 或测试夹具目录。Git 负责保存普通小版本历史。
