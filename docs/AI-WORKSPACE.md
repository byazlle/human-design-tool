# AI 工作区契约（v3.5.0）

## 1. 它解决什么

v3.5.0 之前，AI 解读是挂在五个盘面视图上的**侧栏抽屉**：

- 视图是短生命周期的，`useAiReading` 在 scope 销毁时 `abort()`——**切页即中断**；
- 解读没有自己的页面，权重等同于一个详情面板；
- 五个视图各自显示「XX AI 解读状态」标语，信息噪音大于状态本身。

v3.5.0 把解读升级为**一级页面 + 最小化 + 后台运行**，同时保证既有业务能力一项不少。

## 2. 三个入口，一套状态

| 位置 | 文件 | 角色 |
| --- | --- | --- |
| 完整页面 `/ai` | `src/views/AiWorkspaceView.vue` | 主入口。两栏：左表单（档案 / 维度 / 角度 / 档位 / 最近解读表），右正文与结果动作 |
| 最小化胶囊 | `src/components/panel/AiMiniDock.vue` | 除 `/ai` 外常驻右下角。显示状态灯 + 阶段文案，点击回到工作区 |
| 旧侧栏面板 | `src/components/panel/AiReadingPanel.vue` + `AiReadingHost.vue` | **完全不改**，作为兼容层继续存在；工作区接管时由 `ui.aiPanelSuspended` 隐藏 |

三者读写同一份 `ui.aiReading`。工作区页面不复制任何业务状态。

## 3. 后台运行的生命周期（关键）

请求控制器 `activeController` 本来就是模块级单例。v3.5.0 只改了一件事：

> **删除 `useAiReading` 中的 `onScopeDispose(abort)`。**

理由：AI 请求归工作区所有，不归发起它的盘面视图所有。视图卸载只是"没人看了"，不等于"用户取消了"。

现在唯一的中断来源是：

1. 用户在工作区点「取消解读」→ `abort()`；
2. 用户关闭可见的侧栏面板 → `ui.closeAi()` 使 `open=false` → 保留的 `watch(open)` 调用 `abort()`。

新增的 `watch(open)` 自动跳转只改显示位置，**不碰 `open`**：

```ts
// App.vue
watch(() => ui.aiReading.open, (open) => {
  if (open && route.path !== '/ai') {
    ui.enterAiWorkspace(route.fullPath)  // 只记来源 + 挂起侧栏
    void router.push('/ai')
  }
})
```

`enterAiWorkspace()` 刻意不写 `ui.aiReading.open`——写了就会触发上面的 watch 链从而误中止请求。

最小化走 `exitAiWorkspace()` + `consumeAiReturnPath()`，同样不碰 `open`。

### 状态字段

`src/stores/ui.ts` 新增两个字段，均为纯 UI 状态、不持久化、不进备份：

| 字段 | 含义 |
| --- | --- |
| `aiPanelSuspended` | 侧栏是否让位给 `/ai`。只影响"在哪显示" |
| `aiReturnPath` | 进入工作区前的路径，供最小化原路返回 |

## 4. 不变的业务边界（逐条）

改动只在 UI 编排与样式层。以下**一行未动**：

- `src/engine/*`：曼陀罗锚点 `29.875` / `302.000`、星历、通道与中心判定；
- `src/services/aiClient.ts`：`PROMPT_VERSION = '3.4'`、四套 system prompt、缓存键、续写与校验；
- `src/services/aiFullReading.ts` / `aiConcurrency.ts` / `aiBatchReading.ts`：任务清单、并发/串行调度、降级与失败重试；
- `src/services/crossNames.ts` / `circuitData.ts` / `destinyText.ts`；
- `src/components/panel/AiReadingPanel.vue`：被 `aiConcurrency.acceptance.test.ts` QA-B4 逐字锁定（`data-zone A–E`、恰 3 处 `emit('cancel')`、`.ai-panel.is-expanded` 等），保持原样；
- `src/router/index.ts` 中 `beforeEach` 的来源记录逻辑与 `DERIVED_ROUTE_NAMES`：新路由不加入派生页集合，避免改变返回按钮语义；
- `desktop/main.cjs` 冒烟脚本依赖的选择器（`aria-label="关闭"`、`[data-zone="E"]` 等）。

## 5. 视觉收敛

`src/styles/workspace.css` 是**纯追加层**，在 `tokens.css` / `base.css` 之后加载：

- 冷中性石墨外壳：`nova` 从「米白 + 靛紫」收敛为「冷灰纸 + 石墨」，颜色只留给人体图底板与状态灯；
- 毛玻璃仅用于浮层（胶囊），`@supports` 兜底为实色；颗粒为静态 SVG 噪点，透明度 0.022；
- 边框统一发丝线，阴影两级，动效只有 140/220ms 的颜色与位移过渡；
- `prefers-reduced-motion` 下全部关闭；
- 不覆盖 `classic` 皮肤，用户切回仍是升级前观感。

同时删掉 5 个视图里「本盘 / 多盘 / 合盘 / 双盘 AI 解读状态」四类标语与 `AI 综合解读` 小标题；凯龙盘那句「独立周期盘，不替换本命盘」是业务口径说明，保留。

## 6. 三维度决策记录

| 维度 | 决策 |
| --- | --- |
| UX | 一屏完成一次解读；状态用一颗灯 + 一行阶段文案表达，不堆提示卡；离开页面不丢结果 |
| DX | 新增状态集中在 `ui` store 两个字段；工作区复用既有 composables 与 services，不复制业务编排；覆盖层样式单独成文件，回滚只需删一个 import |
| AX | 路由 `/ai` 可直接跳转；状态字段命名稳定（`aiPanelSuspended` / `aiReturnPath`）；结果区 `aria-live="polite"`，胶囊与表格行均可键盘操作；不依赖动画完成才有可点区域 |

## 7. 测试防线

- `tests/aiReadingHost.test.ts`：新增「视图 scope 销毁不中断在途请求」，防止有人把 `onScopeDispose(abort)` 加回来；原有 4 项跨实例中断语义不变；
- `tests/aiConcurrency.acceptance.test.ts`：QA-B4 源码静态断言继续全绿（因为面板文件没动）；
- 全量：`npm test` 32 文件 / 408 项通过；`npm run typecheck`、`npm run build` 通过。
