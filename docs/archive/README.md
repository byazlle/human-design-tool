# 归档文档

本目录存放**已不反映当前实现**的历史文档，仅作溯源用途保留。它们不再被主文档引用，
接手时**不要**把它们当作现状依据。

| 文档 | 归档原因 | 当前替代 |
| --- | --- | --- |
| `COMPONENTS.md` | 引用 3 个并不存在的文件（`services/hdEngine.ts`、`stores/composite.ts`、`composables/useHdInteractions.ts`），并声称「12 页面 / 实现未开始」 | [ARCHITECTURE.md](../ARCHITECTURE.md) §2–§4（模块划分与数据流） |
| `DESIGN.md` | 早期 AI 契约草案，硬编码 `D:/AIws` 绝对路径，含「实现未开始」表述 | [spec/AI-PROMPT-v2.0.md](../spec/AI-PROMPT-v2.0.md)（由 `scripts/sync-prompt-spec.mjs` 从代码逐字同步） |
| `功能与数据补全清单.md` | 描述旧版「四列 grid / 三到四列」布局与 v1.0.0 功能，与现行单列纵向布局冲突 | [README.md](../../README.md)「功能范围」表 |
| `参考 GitHub 仓库清单（分 3 大类：…适配你的 HumanDesignTool 项目）.txt` | 立项期的选型参考，其中 Tauri 方案未被采用（改用 Electron + 原生 WebView 壳） | [ARCHITECTURE.md](../ARCHITECTURE.md) §5（打包链路） |

版本沿革与逐版改动是另一条线，见 [CHANGELOG.md](../../CHANGELOG.md)；按版本归档的
源码快照与安装包见仓库外的 `rlt-archive/`（由 `scripts/archive-version.mjs` 生成）。
