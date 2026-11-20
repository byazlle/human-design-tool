# 提示词开发指南（给开发的专项文档）

> 基准：2026-11-20 · 提示词版本 `PROMPT_VERSION='4.2'` · 产品版本 v3.7.0
> **这份文档专门讲"提示词这块怎么改"**——之前的执行计划只在通用约束里提了一句"改了必同步"，没给可认领的任务和步骤，开发者容易踩坑（漏改测试断言、漏跑同步脚本、缓存串档）。本文补上。
> 配套：[AI-PROMPT-v4.0.md](../spec/AI-PROMPT-v4.0.md)（逐字权威正文）· [aiPrompt.ts](../../src/services/aiPrompt.ts)（代码常量）· [DEV-ITERATION-PLAN.md](DEV-ITERATION-PLAN.md)（总执行计划）

---

## 1. 先理解系统：提示词不是一整段字符串

### 1.1 架构（五段拼装）

```
system = [CORE, ENTRY, DETAIL, STYLE, SCOPE?].filter(Boolean).join('\n\n')
```

| 序 | 段 | 常量（12 个之一） | 何时拼 |
| --- | --- | --- | --- |
| 1 | 基础契约 | `PROMPT_CORE` | 恒拼 |
| 2 | 入口契约 | `PROMPT_ENTRY_FULL` / `_COMPOSITE` / `_SELECTION` | 按 entry 三选一 |
| 3 | 档位契约 | `PROMPT_DETAIL_CONCISE` / `_DETAILED` / `_FULL` | 按 detail 三选一 |
| 4 | 风格段 | `PROMPT_STYLE_PLAIN` / `PROMPT_STYLE_PRO` | 按 style 二选一 |
| 5 | 范围段 | `PROMPT_SCOPE_FUSION` / `_ITEM` / `_OVERVIEW` | 仅融合 / 分项 / 通解三类 scope 拼 |

**顺序不可调换**：从「全局不可违背」→「入口职责」→「本档强度」→「表达方式」→「本次范围」，**靠后的段覆盖靠前的段**（STYLE 能覆盖 DETAIL 的默认表述）。

### 1.2 四个必记事实

1. **正文只有两个合法存放处**：`src/services/aiPrompt.ts`（代码常量）与 `docs/spec/AI-PROMPT-v4.0.md`（文档代码块），两者必须逐字一致。
2. **文档按 `<!-- id: 常量名 -->` 标记取块**（不靠数组下标），共 12 个标记，顺序固定。
3. **`PROMPT_VERSION` 在 `src/services/aiClient.ts`**（当前 `'4.2'`），与产品版本（`package.json` 的 3.7.0）是两条独立线。
4. **缓存前缀 `hdt.ai.cache.v2`** 在 aiClient.ts，版本段 `p4.2` 由 `PROMPT_VERSION` 拼进缓存键——改版本 = 旧缓存自动失效。

---

## 2. 当前基线（v4.2，已落地，别改回去）

| 项 | 状态 |
| --- | --- |
| 五段拼装 / 12 段结构 | ✅ 架构版本 v4.0，本次未动 |
| `PROMPT_STYLE_PLAIN` / `PROMPT_STYLE_PRO` | ✅ v4.1 重写表达风格（few-shot / 抽象落镜头 / 编号后置 / 例子从盘面取值）；v4.2 再修 3 处示例——依据示例补「什么时候 / 做了什么」画面、收尾自检加「只有体感不算」、PRO 段去掉「中心是亮的」术语隐喻 |
| `PROMPT_VERSION` | ✅ `'4.2'` |
| 规范文档 | ✅ 文件名沿用 `AI-PROMPT-v4.0.md`（架构版本），头注标明内容修订 4.2 |
| 4 处测试版本断言 | ✅ 已同步为 4.2；另有 PROMPT-3 测试自动守护（漏改会报出文件名:行号） |
| 逐字同步 | ✅ `node scripts/sync-prompt-spec.mjs --check` 通过 |

### 2.1 三条不能违反的语义（v4.1 血泪教训）

1. **专业版必须"首次出现时阐释"**：`PROMPT_STYLE_PRO` 必须含 `第一次出现时必须阐释`、`先给一句定义`——这与 v3.5.0 相反（旧版是"读者已熟悉术语、不必解释"），从旧文件复制会反向违约。
2. **精简档与"依据前置"互斥**：精简档声明"只描述倾向，不做事实性断言"；详细档有"依据前置铁律"。两档同时要求会产出自相矛盾的提示词。
3. **禁用词零命中**：全部 12 段不得出现「前世」「读者已熟悉人类图术语」「不必逐个展开解释」。

---

## 3. 改提示词的标准操作流程（SOP）——照着做不会漏

> ⚠️ **每一个改动都要走完下面 6 步，少一步 CI 必红或缓存串档。**

### 步骤 1：确定改哪一段、是否升版本

- 只改**措辞 / 示例 / 表达方式** → 小版本升级（`4.1` → `4.2`）。
- 改**段结构 / 拼装顺序 / 新增段** → 主版本升级（`4.x` → `5.0`），并同步改文件名与全部引用（见第 5 节）。
- 只是修错别字且不影响语义 → 仍建议升版本（成本极低，避免缓存串档争议）。

### 步骤 2：改代码常量

- 文件：`src/services/aiPrompt.ts`，找到对应 `export const PROMPT_XXX: string = \`...\``。
- 注意模板字符串内**不能有反引号 / `${}`**（同步脚本用正则提取）。

### 步骤 3：跑同步脚本（把正文写进规范文档）

```bash
node scripts/sync-prompt-spec.mjs
```

- 它会按 `<!-- id: X -->` 标记替换对应的 ```text 代码块，并校验 12 段一致。
- **不要手改文档里的代码块**——手改会被脚本覆盖，且容易漏。

### 步骤 4：升版本

- 文件：`src/services/aiClient.ts`，改 `export const PROMPT_VERSION = 'x.y'` 与上方注释。

### 步骤 5：改 4 处测试版本断言（全部！）

| 文件 | 位置 | 断言形式 |
| --- | --- | --- |
| `tests/ai-prompt.test.ts` | ② 描述组 | `expect(PROMPT_VERSION).toBe('x.y')` |
| `tests/aiStage.test.ts` | "不传 onStage"用例 | `expect(PROMPT_VERSION).toBe('x.y')` |
| `tests/aiClientContinuation.test.ts` | "提示词版本已升"用例 | `expect(PROMPT_VERSION).toBe('x.y')` |
| `tests/aiConcurrency.acceptance.test.ts` | 静态契约区 | `expect(read('src/services/aiClient.ts')).toContain("PROMPT_VERSION = 'x.y'")` |

> 这是最容易漏的一步——前三次漏改都会 CI 红。

### 步骤 6：全量验证

```bash
node scripts/sync-prompt-spec.mjs --check   # 逐字一致
npm run typecheck                          # 0 错
npm test                                   # 39 文件 / 534 项全绿（只增不减）
npm run build                              # 通过
```

再加一条人工检查：`grep -rn "PROMPT_VERSION" tests/ src/services/aiClient.ts` 确认四处断言与源码版本一致。

---

## 4. 版本与缓存：改提示词到底影响什么

### 4.1 缓存键构成（`cacheKey` in aiClient.ts）

```
hdt.ai.cache.v2 : p{PROMPT_VERSION} : ENGINE_VERSION : baseUrl : model : configTag : entry : scope : mode : style : ref : ...
```

- **`PROMPT_VERSION` 进键** → 升版本后旧缓存不会命中，用户重新生成才拿到新提示词的结果。
- `style` 与 `audience` 等价（`style` 优先），两者进同一个键位，不产生第二套缓存。
- `ENGINE_VERSION` 也在键里——改计算同样让缓存失效。

### 4.2 解读记录的"陈旧"判定（`isStale` in stores/readings.ts）

```ts
return r.promptVersion !== PROMPT_VERSION || r.engineVersion !== ENGINE_VERSION
```

- 提示词或内核版本变化后，旧记录标「口径已更新」，**不删除**——用户仍可查看历史。
- 所以升版本是安全的：不会丢用户数据，只是提示重新生成。

### 4.3 ARM（AI 回复检测）注意

- `validateAiReplyFacts` 挑出事实块之外的闸门编号——提示词改动不能鼓励模型编造编号。
- v4.1 的"编号后置"规则要求编号放句尾括号，正好与这个检测兼容：`（人类图里叫通道 20-34）` 里的 20-34 若在事实块里就不报。

---

## 5. 改段结构 / 主版本时的额外工作

如果动了 12 段结构或拼装顺序（主版本 5.0），除上述 6 步外还要：

1. 规范文档改名 `AI-PROMPT-v5.0.md`，并更新全部引用：
   - `src/services/aiClient.ts:2`、`src/services/aiPrompt.ts:15`
   - `scripts/sync-prompt-spec.mjs:4,20`（`DOC` 路径）
   - `tests/ai-prompt.test.ts:5,71,104`（注释 + 两处 `readFileSync`）
   - `docs/ARCHITECTURE.md:223`、`docs/AI-WORKSPACE.md:5,133,244`
   - `README.md:25`、`CHANGELOG.md`、`docs/spec/AI-PROMPT-v2.0.md:3`（废弃指向）
2. 同步改 `scripts/sync-prompt-spec.mjs` 的 `NAMES` 数组（段名与顺序）。
3. `tests/ai-prompt.test.ts` 的段数量断言（当前 12）与 id 集合同步更新。
4. `tests/aiPromptLayers.test.ts` 的 18 种组合互异断言复核。

> **建议**：除非确有架构需要，不改段结构。v4.1 的"看不懂"问题靠改措辞就能解决，无需动架构。

---

## 6. 可认领的提示词开发任务

> 这些是产品迭代计划 v2 里与提示词直接相关、开发可独立认领的工作。

### PROMPT-1　提示词可懂性抽检与再优化 【已完成 ✅】

- **结果（2026-11-20）**：抽检已随 DEV-701 完成（`docs/VERIFY-可懂性-基线.md`，机械 14.3% / 正面 few-shot 6/8）；发现 2 条"正面示例"自身违反三问，据此修订 PROMPT_STYLE 两段共 3 处并升 4.2。素材层问题转 DEV-702（I-2），未硬改提示词代偿。

- **背景**：v4.1 加了 few-shot，但"看不懂"是否根治没有数据验证。
- **涉及文件**：`tests/readability.test.ts`（与 DEV-701 共用）、`src/services/aiPrompt.ts`（若抽检发现规则问题再改）、`docs/VERIFY-可懂性-基线.md`
- **实施要点**：
  1. 抽检 30 条解读（AI 15 + 离线释义 15），按产品计划 v2 第 5 节三问法打分。
  2. 若"看不懂"集中在某一类（如通道通解），针对性补一段 few-shot 到对应段的风格契约，走完整 SOP（第 3 节 6 步）。
  3. 若问题在素材而非提示词 → 转 DEV-702，不要硬改提示词。
- **验收**：基线报告 + 达标率；若改提示词，四密码断言与逐字同步全绿。
- **依赖**：无。
- **预估**：1 人日（抽检）+ 按需。

### PROMPT-2　自定义 AI 角度（用户自填提示词）【Later · 需确认】

- **前置**：提示词策略确认 + 缓存键设计（用户自填内容必须进缓存键，否则不同角度串档）。
- **涉及**：`src/types/aiReading.ts`、`src/services/aiPrompt.ts`、`src/services/aiClient.ts`（`cacheKey`）、设置 UI。
- **注意**：自填内容是用户输入，**必须转义防注入**；提示词正文引用它时不能破坏 12 段的逐字一致性（建议作为 user 段的一部分，不改 system 常量）。
- **预估**：2～3 人日。

### PROMPT-3　提示词版本升级的 CI 防线加固 【已完成 ✅】

- **结果（2026-11-20）**：新建 `tests/promptVersion.acceptance.test.ts`（2 项）——动态读 aiClient.ts 版本、扫描全部测试文件的版本字面量、守至少 4 处断言、核对规范文档头注。实测漏改一处变红并报出 `tests/aiStage.test.ts:82 ('4.1' → '4.2')`。

- **背景**：4 处版本断言容易漏改（历史上漏过多次）。
- **涉及文件**：`tests/ai-prompt.test.ts` 或新建 `tests/promptVersion.acceptance.test.ts`
- **实施要点**：加一条静态断言，扫描全部测试文件里 `PROMPT_VERSION` 的字面量，确保与 `aiClient.ts` 一致；漏改时给出明确报错"第 X 处断言未同步"。
- **验收**：故意漏改一处断言时测试变红并报出文件名。
- **预估**：0.3 人日。

---

## 7. 验收清单（改提示词的 Definition of Done）

- [ ] `node scripts/sync-prompt-spec.mjs --check` 通过
- [ ] `npm run typecheck` 0 错
- [ ] `npm test` 全绿且 ≥ 544 项（v4.2 后基线：41 文件 / 544 项）
- [ ] `npm run build` 通过
- [ ] 4 处版本断言与 `PROMPT_VERSION` 一致（`grep` 人工确认）
- [ ] 规范文档头注的"内容修订"版本号与 `PROMPT_VERSION` 一致
- [ ] CHANGELOG 有条目，写明改了哪段、为什么、是否升版本
- [ ] 若改了风格段：抽 3 条真实解读看表达是否符合新规则
- [ ] 提示词正文（12 段常量）禁用词零命中：前世 / 读者已熟悉人类图术语 / 不必逐个展开解释；规范文档"不变量"段引用旧文案作反例属历史说明，不计入

---

## 8. 常见坑（按踩坑频率排序）

| 坑 | 后果 | 避免 |
| --- | --- | --- |
| 漏改 4 处版本断言中的某处 | CI 红 | SOP 步骤 5 逐条核对 + PROMPT-3 加固 |
| 改了代码常量没跑 sync 脚本 | 逐字比对失败 | SOP 步骤 3 必跑 |
| 手改文档代码块 | 被脚本覆盖 / 漏改 | 只改代码，文档由脚本生成 |
| 忘记升 `PROMPT_VERSION` | 缓存串档，用户看不到新提示词效果 | SOP 步骤 4；把"升版本"当改提示词的同义词 |
| 从 v3.5 旧文件复制专业版文案 | 语义反转为"不必解释"，违反硬断言 | 只从当前 `aiPrompt.ts` 复制 |
| 精简档加"依据前置" | 与"不做断言"自相矛盾 | 保持两档互斥（第 2.1 节） |
| 模板字符串里写反引号 / `${}` | sync 脚本正则提取失败 | 用中文引号，不用反引号 |
| 把产品版本 3.6.0 当提示词版本改 | 版本线混乱 | 两版本独立（第 1.2 节） |
| 改了提示词但告知用户"已生效" | 用户缓存命中旧结果，以为没改 | 升版本后说明"需重新生成才生效" |

---

## 变更记录

| 日期 | 变更 | 原因 |
| --- | --- | --- |
| 2026-11-20 | 初版建立 | 补上 DEV 计划缺失的提示词专项操作文档，避免开发踩坑 |
| 2026-11-20 | 基准更新到 4.2；PROMPT-1 / PROMPT-3 标已完成 | 按基线修订 3 处示例并新建版本断言加固测试 |
