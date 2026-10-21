# 第三方依赖、开源项目与资源致谢（Third-Party Notices）

本项目（人类图工具 / HumanDesignTool）以 **MIT 许可** 发布，版权归 **byazlle** 所有。
在构建、运行与发布过程中，本项目使用了下列第三方开源组件与公开方法/数据来源。
我们对所有作者与维护者致以感谢。

> 完整许可文本见仓库根目录 [LICENSE](LICENSE)。
> 各组件的版权归其各自作者所有，本文件仅作署名与许可汇总。

---

## 一、直接依赖（运行时 / 构建期）

| 组件 | 版本 | 许可 | 版权方 | 来源 |
| --- | --- | --- | --- | --- |
| astronomy-engine | 2.1.19 | MIT | Donald Cross | https://github.com/DonCross/astronomy-engine |
| pinia | 2.3.1 | MIT | Eduardo San Martin Morote | https://github.com/vuejs/pinia |
| vue | 3.5.44 | MIT | Evan You | https://github.com/vuejs/core |
| vue-router | 4.6.4 | MIT | Eduardo San Martin Morote | https://github.com/vuejs/router |
| @types/node | 26.6.5 | MIT | — | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @vitejs/plugin-vue | 5.2.4 | MIT | Evan You | https://github.com/vitejs/vite-plugin-vue |
| astronomia | 4.2.0 | MIT | commenthol | https://github.com/commenthol/astronomia |
| typescript | 5.9.3 | Apache-2.0 | Microsoft Corp. | https://github.com/microsoft/TypeScript |
| vite | 5.4.21 | MIT | Evan You | https://github.com/vitejs/vite |
| vitest | 2.1.9 | MIT | Anthony Fu | https://github.com/vitest-dev/vitest |
| vue-tsc | 2.2.12 | MIT | — | https://github.com/vuejs/language-tools |
| @tauri-apps/cli | 2.12.3 | Apache-2.0 OR MIT | — | https://github.com/tauri-apps/tauri |
| electron | 33.4.11 | MIT | Electron Community | https://github.com/electron/electron |
| electron-builder | 26.15.3 | MIT | Vladimir Krivosheev | https://github.com/electron-userland/electron-builder |

### 许可说明
- 标注 **MIT** 的组件适用下方「MIT License」标准文本；其各自版权方如上表，完整版权声明保留在对应仓库中。
- 标注 **Apache-2.0** 的组件（`typescript`、`@tauri-apps/cli`）适用 Apache License 2.0，
  其完整文本见 https://www.apache.org/licenses/LICENSE-2.0 。
- Electron 运行时本身及其捆绑的 Chromium / Node.js 等遵循各自许可，完整许可随发布产物（安装包 / APK）一并分发，
  并可在 `node_modules/electron/LICENSE` 查看。

---

## 二、衍生作品（需署名）

### 绘图程序「版式二」— 衍生于 free-human-design

`src/components/chart/bodyGraphLayoutV2.ts` 的中心坐标、形状、渐变与闸门偏移数据，
取自 [adamblvck/free-human-design](https://github.com/adamblvck/free-human-design)
仓库站点绘图数据（`site/charts.min.js`），并做了本地校准。该上游项目以 **MIT 许可** 发布。

**版权声明（沿用上游 MIT）：**

```
Copyright (c) adamblvck

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

“版式一 · 底图对齐”的中心形状与闸门位置来自用户提供的参考底图（1:1 像素实测），非第三方作品。

---

## 三、方法学与数据来源（公开方法，非代码依赖）

本工具的人类图计算与解读整合了以下公开方法与标准，特此致谢与说明：

- **星历（行星黄经）**：采用 `astronomy-engine`（VSOP87 理论）进行高精度星历计算。
- **真交点（月亮南北交）**：依据 Jean Meeus《Astronomical Algorithms》第 47 章的解析公式
  （平交点 + 5 项周期改正 + 章动）实现。
- **闸门盘序**：采用 Jovian Archive 标准的 64 卦盘序，整体偏移 29.8333°（即「闸门 1 起于白羊 28.83°」），
  而非「闸门 1 起于白羊 0°」的简化模型。
- **人类图体系**：类型 / 权威 / 定义型 / 轮回交叉等概念源自 Ra Uru Hu 创立的 Human Design System；
  本项目仅作本地计算与可视化呈现，未包含任何受版权保护的专有文本（如 192 个轮回交叉专有名称映射）。

---

## 四、MIT License（标准文本）

```
MIT License

Copyright (c) 2026 byazlle

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
