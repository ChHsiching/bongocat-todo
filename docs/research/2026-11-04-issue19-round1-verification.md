# Issue #19 Round 1 决策核查：9-slice 手绘窗口边框缩放

- 调研日期：2026-11-04
- 对应 issue：[ChHsiching/bongocat-todo#19](https://github.com/ChHsiching/bongocat-todo/issues/19)
- 调研性质：**中立核查**——对主会话提出的五条"9-slice 手绘窗口边框缩放"设计决策逐条找一手依据与反证，判定每条是站得住 / 需修正 / 无定论
- 前置文档：[2026-11-03 调研报告](./2026-11-03-issue19-todo-window-resize.md)（窗口层结论不重查）；现状代码 `src/plugins/todo/components/PaperPanel/index.vue`（单个 SVG viewBox 0 0 360 540、`preserveAspectRatio="none"`）
- 资料来源：W3C/WHATWG 规范原文、MDN（含 BCD 原始数据）、WPT（web-platform-tests）实测结果（2026-11-04 当日 master run）、WebKit Bugzilla / Chromium issue tracker、wired-elements 与 Excalidraw 官方仓库源码、Apple/Android/Unity 官方文档

---

## TL;DR

| #   | 主张                                                               | 判定                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | 9-slice（角固定+边拉伸）是可 resize 装饰性边框的正确模型           | **站得住**，但表述需修正：9-slice 是"拉伸系"的行业标准（Apple/Android/Unity/CSS 规范原文均如此）；手绘风库生态（wired-elements、Excalidraw）主流其实是"尺寸变化时 rough.js 重绘"。两条路线各有适用场景，对我们（连续拖拽的窗口边框）9-slice 更合适——但它是"从拉伸族里选 9-slice"，不是"手绘界的通用做法" |
| C2  | 非周期手绘线用 stretch 而非 repeat（repeat 拼接处露馅）            | **站得住**。规范原文证实 repeat 不做余数处理、直接切断平铺；round 会缩放 tile（尺寸变化时跳变）、space 会留空隙。第三种处理（把波形周期化后用 repeat）确实存在，但不适合连续手绘线                                                                                                                       |
| C3  | 单向拉伸的边框线加 `vector-effect="non-scaling-stroke"` 是标准修复 | **站得住（inline SVG 场景）**，但有明确的坑清单。SVG2 规范原文明确覆盖非均匀缩放；WPT 实测 Chrome 全过、Safari/Firefox inline 场景全过；**反证**：SVG 被 `<img>`/background-image/border-image 引用（image 上下文）时 WebKit/Firefox 当前 FAIL——这直接影响 C5 路线选择                                   |
| C4  | "todo 标题行宽超 ~600 逻辑像素可读性下降"，支撑 maxWidth≈720       | **需修正**。W3C《中文排版需求》给出的是"书籍正文行长 17–40 字、横排上限 48 字、下限 10 字"，没有"600px 拐点"概念。按本地 17px 字号换算，**720px ≈ 40 字恰是 clreq 书籍正文上沿，有据**；"600px 后可读性下降"应删掉或降级为经验说法                                                                       |
| C5  | 实现载体：border-image+SVG 源 vs 手工九宫格 inline SVG             | **推荐手工三段式/九宫格 inline SVG**（维持昨日报告方向）。border-image+SVG 现代可用（Interop 2023 重点）但有三处硬伤：slice 数字单位是 SVG 源坐标而非 CSS 逻辑像素；SVG 变 image 后 non-scaling-stroke 失效（C3 反证）；filter/pattern/装饰跨区被切需重设计源图                                          |

---

## C1：9-slice 是不是正确模型？

### 核查过程

**（1）9-slice 的出处与常规使用域**（一手官方文档）：

- **CSS 规范本身就是 9-slice 模型**。CSS Backgrounds & Borders Level 3 对 `border-image-slice` 的定义原文："This property specifies inward offsets ... **dividing it into nine regions: four corners, four edges and a middle**"（[spec §5.2](https://drafts.csswg.org/css-backgrounds-3/#border-image-slice)）。即 web 平台把 9-slice 作为边框图片的标准布局模型。
- **Apple（UIKit 官方文档）**：`resizableImage(withCapInsets:)` 原文 "you can use this method to create a background image for a button with borders and corners: **when the button is resized, the corners of the image remain unchanged, but the borders and center of the image expand to cover the new size**"（[Apple Developer Documentation](<https://developer.apple.com/documentation/uikit/uiimage/resizableimage(withcapinsets:)>)）。macOS 侧对应 `NSImage.capInsets`。
- **Android（官方工具文档）**：Draw 9-patch 是 Android Studio 内置 WYSIWYG 编辑器，"lets you create bitmap images that automatically resize to accommodate the contents of the view and the size of the screen. You can **scale selected parts of the image horizontally or vertically based on indicators drawn within the image**"（[developer.android.com/studio/write/draw9patch](https://developer.android.com/studio/write/draw9patch)）。
- **Unity（官方手册）**：9-slicing 文档明确 "The four corners (A, C, G and I) do not change in size. The B and H sections stretch or tile horizontally..."（[Unity Manual: 9-slicing](https://docs.unity3d.com/Manual/sprite/9-slice/9-slicing.html)、[9-slice a sprite](https://docs.unity3d.com/6000.0/Documentation/Manual/sprite/9-slice/set-sprite-9slicing.html)）。辅助参考：[Wikipedia: 9-slice scaling](https://en.wikipedia.org/wiki/9-slice_scaling)。

结论：9-slice 是系统 UI（iOS 气泡/按钮、Android NinePatch）、游戏 UI、CSS 边框共同的成熟标准模型，用于"一张图适配任意尺寸且保护角部不变形"。

**（2）手绘风库怎么处理 resize**（读官方仓库源码）：

- **wired-elements（wiredjs）**：记忆属实——它走的是"**resize 后 rough.js 重绘**"路线，不是 9-slice。证据（master 分支源码）：
  - [`src/wired-base.ts`](https://github.com/rough-stuff/wired-elements/blob/master/src/wired-base.ts)：`wiredRender()` 比较 `canvasSize()` 与 `lastSize`，尺寸一变就**清空 svg 全部子节点**、重设 width/height、重新 `draw()`（rough.js 按新尺寸生成 path）；实例持有固定 `seed`（`Math.floor(Math.random() * 2 ** 31)`），保证同尺寸输出确定、resize 过程中手绘抖动风格稳定。
  - [`src/wired-card.ts`](https://github.com/rough-stuff/wired-elements/blob/master/src/wired-card.ts)：用 `ResizeObserver` 监听自身尺寸变化（降级 window resize），回调里直接 `wiredRender()`，**无节流**。
  - [`src/wired-lib.ts`](https://github.com/rough-stuff/wired-elements/blob/master/src/wired-lib.ts)：直接调 roughjs 的 renderer（`roughness: 1, bowing: 0.85` 等参数）。
- **Excalidraw**：同路线。[`packages/element/src/shape.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/shape.ts) 的 `ShapeCache` 用 WeakMap 按 element 缓存 rough.js 生成的 Drawable，元素尺寸（width/height/seed/version）变化即缓存失效、用 `RoughGenerator` 重新生成。Excalidraw 的 frame（画布分区容器）边框本身不是手绘风格（普通虚线矩形），未提供"可缩放手绘容器"先例。
- **papercss**：纯 CSS 框架，手绘感来自普通 CSS border + 不规则 border-radius（[Borders & Shadows 文档](https://www.getpapercss.com/docs/utilities/borders/)），随盒子尺寸自然伸缩，无任何 resize 特殊处理——说明"手绘感"与"9-slice/重绘"并不强绑定。

**（3）两条路线的适用场景对比与选择**：

| 维度            | rough.js 重绘（wired/Excalidraw 路线）                    | 9-slice 拉伸（系统/游戏/CSS 路线）           |
| --------------- | --------------------------------------------------------- | -------------------------------------------- |
| 目的            | 任意尺寸下重新分布手绘笔触，保持"现画"质感                | 保护角部与装饰不变形，边单向拉伸             |
| resize 时的计算 | 每次尺寸变化 JS 重算 path + DOM 重建（wired-card 无节流） | 一次切好，之后纯渲染层缩放，无 JS            |
| 适用负载        | 叶子级小组件（按钮/卡片），尺寸变化由布局驱动、不连续     | 大面积连续 resize 的容器（窗口、气泡、面板） |
| 图案保真        | 每次重绘图案会随参数微变（seed 固定时确定性变化）         | 角与装饰**严格不变**（这正是作者约束）       |

我们的场景是"用户连续拖拽边缘、每帧 resize 的窗口边框 + 作者硬约束（横向拉伸时上缘装饰等比放大、不许变形）"：重绘路线要在拖拽期间每帧清空重建 SVG DOM 并跑 rough.js（WebView 主线程开销），且产出的是"随尺寸连续变化的抖动"而非"固定装饰"；9-slice 路线把等比约束交给布局（条带锁定宽高比），resize 期间零 JS。**对我们 9-slice 更合适**；wired/Excalidraw 的重绘路线是为"手绘笔触密度自然"服务的，其组件形态与约束都与我们不同。

### 判定：站得住（表述修正）

- 9-slice 有权威出处与跨平台一致实践（Apple/Android/Unity/CSS 四处一手文档），用于"可任意 resize 的装饰性边框"是行业标准，不是拍脑袋。
- **修正表述**：不能说"手绘风 UI 的业界标准是 9-slice"——手绘风库（wired-elements、Excalidraw）实际主流是重绘。正确说法是："在**拉伸系**方案里 9-slice 是标准；重绘系适合叶子组件与笔触再分布，不适合连续 resize 的窗口边框。"向作者解释时建议引用 Apple/Android 官方文档（系统级先例最有说服力）。

---

## C2：非周期手绘线用 stretch 优于 repeat？

### 核查过程

**（1）规范语义**（CSS Backgrounds & Borders Level 3，[§5.6 Drawing the Border Image](https://drafts.csswg.org/css-backgrounds-3/#border-image-process) 四步算法原文）：

- **repeat 不做任何余数处理**："If the first keyword is `repeat` or `space`, the top, middle, and bottom images are **not changed any further**"；随后 "The images are then **tiled to fill** their respective regions"。即 tile 按当前尺寸（经 border-image-width 缩放后）平铺、超出区域直接切断——**没有自动留白，也没有余数拉伸**（那是另外两个关键字的行为，见下）。
- repeat 时第一块 tile 还会**居中放置**（"centered horizontally in their respective regions"），两侧对称切断。
- 对照另外两个值：
  - `round`："the top, middle and bottom images are **resized in width, so that exactly a whole number of them fit**"——通过轻微缩放 tile 消灭余数。副作用：窗口尺寸连续变化时 tile 缩放因子在整数跳变点突变（"呼吸"感）。
  - `space`："**any partial tiles are discarded** and the extra space distributed before, after, and between the tiles ... This can result in **empty border-image side regions**"——丢弃残片、空隙均分。对必须连续的边框线会直接断开留白。
- `border-image-repeat` 属性表见 [§5.5](https://drafts.csswg.org/css-backgrounds-3/#border-image-repeat)（初始值就是 `stretch`）。

**（2）公开先例/佐证**：

- MDN 官方文档对 `repeat` 的描述："The value `repeat` will repeat the image across the border, **potentially clipping it if it doesn't fit perfectly** in the border area"；`round` 则 "Image sections **might be stretched** for a proper fit"（[MDN blog: Border images in Interop 2023](https://developer.mozilla.org/en-US/blog/border-images-interop-2023/)）。
- Unity 9-slicing 的 Tiled-Continuous 模式明确 "The texture doesn't stretch. **The tiles at the edges might use cropped parts of the texture**"（[Unity Manual](https://docs.unity3d.com/6000.0/Documentation/Manual/sprite/9-slice/set-sprite-9slicing.html)）——游戏引擎侧同样承认"平铺=边缘裁切"。
- 未搜到针对 CSS `border-image-repeat` 拼接痕迹的专门 bug 报告（该现象是规范定义的正常行为，不构成 bug），规范原文 + MDN + Unity 三处描述已互相印证。

**（3）第三种处理是否存在**：存在，即**把图案周期化**——将手绘波形设计成首尾相位连续的可平铺 tile（tileable），再用 repeat/round，或用 SVG `<pattern>` 沿区域铺排。代价：波长被锁定为 tile 宽度的整数倍、不能再"等比放大"，且手绘不规则感会被周期性重复显形。对我们"上缘装饰须等比缩放"的约束不适用。

### 判定：站得住

非周期连续手绘线在四个值里的归宿：repeat 会切断露馅、round 缩放 tile 且跳变、space 留空隙断线——只有 stretch 保证连续与无缝，结论成立。补充给 Round 2 的信息：若未来某个装饰**本身就是离散/周期性的**（如一串圆点、虚线缝线），repeat/round 反而是正确选择，可按区分别处理。

---

## C3：non-scaling-stroke 是标准修复吗？

### 核查过程

**（1）SVG2 规范确切语义**（一手原文）：

- [SVG2 painting §13.6 Vector effects](https://www.w3.org/TR/SVG2/painting.html#VectorEffects) 对 `non-scaling-stroke` 的定义："With the non-scaling-stroke vector effect, stroke outline shall be calculated in the **'host' coordinate space** instead of user coordinate system. More precisely: **the viewport coordinate system of the furthest ancestral SVG viewport**. ... The resulting visual effect of this modification is that **stroke width is not dependent on the transformations of the element (including non-uniform scaling and shear transformations) and zoom level**."——规范原文明确点名 **non-uniform scaling**。
- 该属性由 SVG Tiny 1.2 引入、SVG2 正式化（[SVG2 coords §8.13](https://www.w3.org/TR/SVG2/coords.html#VectorEffectProperty)，属性表 `none | non-scaling-stroke | non-scaling-size | non-rotation | fixed-position`；规范注明除 `non-scaling-stroke` 和 `none` 外的其余值"at risk of being dropped due to lack of implementations"——即浏览器实际实现的就是 non-scaling-stroke）。
- 规范自己的示例就是非均匀缩放：`<g transform="scale(9,1)">` 下对比三条线的描边宽度（[coords §8.13.3 示例](https://www.w3.org/TR/SVG2/coords.html#VectorEffects)）。
- 两个规范级注意点：a) host 是"最外层祖先 SVG viewport"——**viewport 之后的 CSS transform 不在补偿范围内**；b) "The vector-effect property has **no effect on transformations performed in a 3d rendering context**"。

**（2）兼容矩阵**：

- MDN BCD（[vector-effect 条目](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/vector-effect)，原始数据 [mdn/browser-compat-data `svg/global_attributes.json`](https://github.com/mdn/browser-compat-data/blob/main/svg/global_attributes.json)）：**Chrome ≤80、Firefox ≤72、Safari ≤13.1**（≤ 表示至少该版本已支持、确切引入版本未回溯验证）。
- 对三个目标 WebView 的映射：
  - Windows WebView2（Chromium Evergreen）：Chrome 80（2020-02）起必然满足，**无风险**；
  - macOS WKWebView：Safari 13.1 需要 macOS 10.15（2020-03）。本项目 Tauri 默认 `minimumSystemVersion` 10.13，**10.13/10.14 上确切支持版本未验证**（BCD 只标到 ≤13.1；WebKit 对 shapes 的实现实际早于此，但无权威版本表），需 QA 或走不依赖它的嵌套 SVG 等比方案兜底；
  - Linux webkit2gtk：与 Safari 同引擎。wpt.fyi 不提供 webkit2gtk 产品 run，**无法一手验证**，按引擎同期推断现代发行版（Ubuntu 22.04 的 2.40+、Debian 12 的 2.44）远超 Safari 13.1 时代引擎，属"推断，未实机验证"。
- **WPT 实测**（2026-11-04 当日 master run，[wpt.fyi](https://wpt.fyi/results/svg/painting/reftests/non-scaling-stroke-006.html)）——比 BCD 更贴近现状的一手证据：
  - **Chrome 159（dev）**：15 个 non-scaling-stroke 测试**全部 PASS**（含 [006 viewBox+preserveAspectRatio=none](https://github.com/web-platform-tests/wpt/blob/master/svg/painting/reftests/non-scaling-stroke-006.html)、[007 嵌套 SVG](https://github.com/web-platform-tests/wpt/blob/master/svg/painting/reftests/non-scaling-stroke-007.html)）。
  - **Safari 255 preview（mac）**：inline SVG 场景（001/002/004/005/**006/007**）PASS；但 **003（svg 元素被 CSS transform 包裹）FAIL**、`non-scaling-stroke-non-uniform-scale`（SVG 放在 `<image>` 里引用 + preserveAspectRatio=none）FAIL、`non-scaling-stroke-with-none-preserve-aspect-ratio`（同为 image 场景）FAIL、`non-scaling-stroke-precision-loss` FAIL、`non-scaling-stroke-transform-change-hittest` [1,2]（transform 变化后命中测试区域与视觉不符）。
  - **Firefox 161（nightly）**：inline 场景全 PASS（含 006/007、non-uniform-scale）；**009（background-image 引用 SVG）/010（`<img>` 引用 SVG）FAIL**。
- 结论性解读：**inline SVG + `preserveAspectRatio="none"`（viewBox 非均匀拉伸）+ shapes** 这一无一例外是三个引擎都有 WPT reftest 保障且当前全绿的场景；**SVG 作为图像资源被引用时**（`<img>`、background-image、border-image）WebKit/Firefox 当前仍不可靠。

**（3）已知怪癖/bug**：

- **WebKit：text 元素长期无效**——[webkit.org/b/139322](https://bugs.webkit.org/show_bug.cgi?id=139322)（2014 年开）：对 `<text>` 设置 vector-effect 无效果，多年未修；WebKit SVG 维护者 Nikolas Zimmermann 在评论中说明修复需同时覆盖 legacy 引擎与 LBSE（Layer-Based SVG Engine），关联 [b/258120](https://bugs.webkit.org/show_bug.cgi?id=258120)（LBSE 字体缩放忽略 page zoom）。两 bug 现均为 **RESOLVED FIXED**（修复随 LBSE 工作，按评论推断约 2022–2023，未逐一核对落地版本）。对旧 WebKit 的 text 场景不可靠；我们的 PaperPanel 只有 path/circle，不受影响。
- **Chromium（历史）**：[issues.chromium.org/40912001](https://issues.chromium.org/issues/40912001)（2014）：`preserveAspectRatio="none"` 的元素上 non-scaling-stroke 未生效——即 WPT 现测仍覆盖的 image 场景问题的老祖宗，现 inline 场景已全绿。另有 [issues.chromium.org/41397192](https://issues.chromium.org/issues/41397192)（JS 动态改 scale 时失效，2014 年报告；tracker 现需登录无法核对状态）与 3D transform 下模糊的 [issues.chromium.org/40806937](https://issues.chromium.org/issues/40806937)（与规范"3D 渲染上下文无效"一致）。
- **dash 描边互斥**：[purecss.com 实践文](https://purecss.com/examples/border-draw-button/)（官方示例）："Leave it off any stroke you are dashing, because **it moves the dash calculation into device pixels and cancels pathLength**"——non-scaling-stroke 会把 dash 计算移到设备像素、`pathLength` 归一化失效。我们无边框 dash，不受影响。
- **DPI/缩放屏**：描边定宽发生在 viewport 坐标系（CSS 像素），DPR 只影响物理像素栅格化——2.5px 在 4K/150% 缩放屏上仍是 2.5 CSS px，视觉宽度与其他元素一致，**不存在"4K 上描边变细"的实现层问题**。真实存在的只是设计感知问题：窗口整体放大后，恒定粗细的线相对放大的图案会显得偏细（这是 9-slice 模型的固有属性，位图 9-slice 同样如此），如在意可在少数几个尺寸档位微调 stroke-width。

### 判定：站得住（inline SVG 场景的标准修复），附落地规避清单

规范明确覆盖非均匀缩放，三引擎 inline 场景有 WPT 全绿保障。落地时规避：

1. **不要指望它在 image 上下文里工作**——SVG 一旦被 `<img>`/background-image/**border-image** 引用，WebKit/Firefox 当前 FAIL（这是 C5 否决 border-image 路线救描边的关键依据）；
2. 不要包在带 CSS transform 的容器里（Safari 003 FAIL）；
3. 不要用于 `<text>`（旧 WebKit 不可靠）；
4. 不要与 stroke-dasharray/pathLength 组合；
5. macOS 10.13/10.14 上确切支持版本未验证，QA 覆盖不到就按已知风险记录（或用嵌套 SVG 等比方案完全绕开）。

---

## C4："行宽超 ~600 逻辑像素可读性下降"有据吗？

### 核查过程

**（1）找到的权威一手来源：W3C《中文排版需求》（Requirements for Chinese Text Layout，clreq）**。其"版面设计/行长"一节原文（[w3.org/TR/clreq](https://www.w3.org/TR/clreq/)）：

> "作为总体原则，行长应依照不同字体、版式、成品尺寸以及媒介种类、根据实际情况设置。一般来说，报纸期刊的行长相对较短，而书籍的行长较长，但作为参考值，**大多数书籍的正文行长一般设在 17 到 40 字范围区间。为避免阅读时频繁换行、串行等情况，正文行长最小不宜少于 10 字、而横排最大行长不宜长于 48 字**、竖排不宜长于 55 字。"

（英文对照版同页："the line length of body copy in most books is set in the range of 17 to 40 characters ... should not be less than 10 characters ... For horizontal writing mode, the line length of body copy should not exceed 48 characters."）

这是 W3C 正式工作组笔记，对 CJK 每行字数给出了可直接引用的区间：**下限 10 字、书籍常见 17–40 字、横排硬上限 48 字**。

**（2）换算到本项目**（本地代码事实：`TodoItem/index.vue` 标题 `font-size: 17px`；中文方块字宽 ≈ 字号；`PaperPanel` 左右 padding 共 44px）：

| 行长                     | 字数（17px）          | 对应窗口宽（+44px padding） | 相对 clreq                            |
| ------------------------ | --------------------- | --------------------------- | ------------------------------------- |
| 600px 内容宽             | ≈ 35 字               | ≈ 644px                     | 舒适区中段偏上                        |
| **maxWidth 720（窗口）** | ≈ 40 字（内容 676px） | 720px                       | **恰在书籍正文常见区间上沿（40 字）** |
| 48 字上限                | 48 字                 | ≈ 860px                     | clreq 横排硬上限                      |

**（3）"~600px 后可读性下降"的直接出处**：未找到。clreq 全文没有"某字数/像素后可读性下降"的拐点表述（它只给区间与上限）；也未找到 GB 标准或可读性研究论文给出 600px/CJK 拐点。拉丁排版学经典（Bringhurst 45–75 字符/行等）不覆盖 CJK，不适用。

### 判定：需修正

- **maxWidth≈720 本身有据**：17px 字号下 ≈40 字，正好是 clreq 书籍正文行长区间的上沿，保守且合规；即便放宽到 clreq 硬上限 48 字（≈860px 窗口）也在规范许可内。
- **"行宽超 ~600 逻辑像素可读性下降"这一具体断言无权威出处**，应删掉或改写。建议口径改为："依 W3C《中文排版需求》，横排行长不宜超过 48 字、书籍正文常见 17–40 字；本项目标题字号 17px，maxWidth 720px 对应约 40 字，取常见区间上沿。"
- 诚实标注两点：a) clreq 的语境是**书籍正文**，todo 标题是短句列表（多数单行、不折行），引用属类比而非直接适用；b) 若标题多为单行短句，行宽约束的实际收益主要是限制折行后的视觉宽度与整窗视觉密度，而非长文阅读效率。

---

## C5：实现载体预研（Round 2 输入）

### 路线 a：CSS border-image + SVG 源

**可行性依据**：

- border-image 于 2023 年被列入 [Interop 2023](https://wpt.fyi/interop-2023) 重点领域，各浏览器承诺行为一致（[MDN blog](https://developer.mozilla.org/en-US/blog/border-images-interop-2023/)）；MDN `border-image-slice` 页的现行官方示例就是 SVG 源（`border-florid.svg` + 百分比 slice + px border-image-width）。
- 历史 bug 已修：无 intrinsic size 的 SVG 作为 border-image 时 slice 不正确（[WebKit b/139405](https://bugs.webkit.org/show_bug.cgi?id=139405)，RESOLVED FIXED 2015）；`fill` 需 border-width>0（[WebKit b/142650](https://bugs.webkit.org/show_bug.cgi?id=142650)，RESOLVED FIXED）。2015 年 W3C www-style 邮件列表记录了当年 Blink/WebKit 在该场景的多处不一致（[lists.w3.org 2015-Jun-0143](https://lists.w3.org/Archives/Public/www-style/2015Jun/0143.html)），对应老 Blink bug 492485/493088。

**三处硬伤（本次核查发现）**：

1. **slice 值单位不是 CSS 逻辑像素**。规范原文：`<number>` "represent **pixels in the image (if the image is a raster image) or vector coordinates (if the image is a vector image)**"（[spec §5.2](https://drafts.csswg.org/css-backgrounds-3/#border-image-slice)）——对 SVG 源，数字是 SVG 用户坐标；百分比才是"相对源图尺寸"（MDN 也建议 vector 场景用百分比：[border-image-slice](https://developer.mozilla.org/en-US/docs/Web/CSS/border-image-slice)）。逻辑像素只能通过 `border-image-width`（length/number 倍数）表达。这不是 bug 而是模型如此，但意味着"角部 60 逻辑像素"要靠"slice 百分比 × border-image-width"间接凑出，窗口尺寸变化时角部显示大小由 border-image-width 决定、与源图 viewBox 的换算链容易写错。
2. **SVG 进入 border-image 后成为 image 上下文，non-scaling-stroke 不可用**（C3 的 WPT 反证：该场景 Safari/Firefox 当前 FAIL）。即边条被单向拉伸时的描边粗细不均，在 border-image 路线里**没有矢量特效可救**，只能在源图层面重新设计（每条边单独画正确粗细的线）。
3. **filter（feGaussianBlur 阴影）与 pattern（颗粒纹理）被 9 区切开后需要整体重设计**。现在的 PaperPanel 是一张连续 path（阴影层 + 主面板 + 顶部波浪/圆点跨区分布），切开后拉伸区的模糊会单向变形、装饰若骑在切线上会被切成两半——源图必须按"9 区各自的职责"重画，工作量与手工切分相当，还多背一层 border-image 语义。

### 路线 b：手工九宫格/三段式（inline SVG 切片 + grid/absolute 布局）

- 嵌套/多 svg 各自 `preserveAspectRatio` 的组合**有平台测试保障**：WPT [non-scaling-stroke-007](https://github.com/web-platform-tests/wpt/blob/master/svg/painting/reftests/non-scaling-stroke-007.html)（嵌套 `<svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">` 内含 vector-effect path）在 Chrome/Safari/Firefox 当日 run **全部 PASS**；006（根 svg preserveAspectRatio="none"）同样三引擎全绿。嵌套 svg 建立独立 viewport/viewBox 是 SVG 1.1 起的规范行为（[SVG2 embedding](https://www.w3.org/TR/SVG2/embedded.html#.EmbeddedSVGContexts)），非新特性。
- 已知注意点（规范行为，非 bug）：嵌套 svg 默认 `overflow: hidden`，切片内容不得超出各自 viewBox；相邻切片各自抗锯齿可能在接缝处出现半透明细缝，常见对策是相邻切片重叠 ~1px 或让填充色越过切线。
- 与作者约束（横向等比、纵向自由）**直接映射**——昨日报告 §5.3 的三段式（顶/底条带锁宽高比 + 中段 `preserveAspectRatio="none"` 自由拉伸）就是这条路线的实例，且比完整 9 宫格更贴合"左右边缘本就是近直线"的现况。
- vector-effect、pattern、filter 均可逐段独立控制（哪段拉伸就只在哪段加 non-scaling-stroke；纹理可按昨日建议挪到容器 CSS 背景）。

### 判定：推荐路线 b（手工三段式/九宫格 inline SVG）

理由：与作者约束一一对应；避开 border-image 的三处硬伤（尤其是 image 上下文里 non-scaling-stroke 失效——这一点使路线 a 无法用矢量特效解决拉伸区描边不均）；inline SVG 组合有三引擎 WPT 佐证；改动集中在 `PaperPanel/index.vue` 单文件内，符合本仓库"上游改动最小化"的架构约束。路线 a 记为可行备选（纯 CSS、零布局代码是它的真实优势），但采用前提是接受重画源图并放弃矢量描边保护。

附带提示（供 Round 2，不展开）：手绘阴影（feGaussianBlur）无论走哪条路线，在拉伸区都会单向变形（位图系 9-slice 同样如此，属模型固有代价）；若在意，可把阴影独立成一层整体均匀缩放，或改用 CSS `filter: drop-shadow`/`box-shadow`（与边框几何解耦、天然无方向性问题）。

---

## 对 Round 1 五决策的总体意见

1. **C1（9-slice 模型）：维持**。表述改为"拉伸系方案的行业标准（Apple/Android/Unity/CSS 规范原文均为九区模型）；手绘库的 resize 重绘路线（wired-elements/Excalidraw 源码证实）适用于叶子组件与笔触再分布，不适用于连续拖拽的窗口边框"。向作者回话时引用 Apple `resizableImage(withCapInsets:)` 与 CSS 规范"nine regions"原文最有力。
2. **C2（stretch 而非 repeat）：维持**。规范四步算法证实 repeat 零余数处理、直接切断；round/space 各有不适合连续线 的副作用。补充：离散/周期性装饰（圆点串等）未来可按区用 repeat。
3. **C3（non-scaling-stroke）：维持，附规避清单**。inline SVG 场景三引擎 WPT 全绿；五个坑（image 上下文、CSS transform 容器、text、dash、老 macOS 版本）写入落地注意事项。4K/缩放屏"描边变细"不成立（viewport 坐标=CSS px，视觉恒定）。
4. **C4（maxWidth≈720）：数字维持，理由改写**。依据从"600px 后可读性下降"（无出处，弃用）改为"W3C clreq：横排 ≤48 字、书籍正文常见 17–40 字；17px 字号下 720px≈40 字取区间上沿"。如作者问"为什么不能更宽"：clreq 硬上限 48 字 ≈ 860px 窗口，可作为让步空间。
5. **C5（实现载体）：定案路线 b**（手工三段式 inline SVG，即昨日 §5.3 方案），border-image 降为备选并注明其三处硬伤。Round 2 按路线 b 展开切片几何（顶带 y 0–60 / 底带 y 500–540 的切线选取、1px 防缝重叠、阴影层处理方式）。

### 诚实标注的不确定项

- macOS 10.13/10.14（Safari < 13.1）与 webkit2gtk 各版本对 vector-effect 的确切支持：BCD 上限标记 + 引擎同源推断，**未实机验证**；
- WebKit b/139322 修复落地的具体 Safari 版本：bug 状态 RESOLVED FIXED，修复时点按评论（LBSE 工作）推断约 2022–2023，未核对 release note；
- Chromium 新 tracker（issues.chromium.org）需登录，2014 年两条老 bug 的当前状态未能直接核对——但对应场景已被 WPT 现测覆盖（Chrome 159 全绿），影响有限；
- clreq 应用于 todo 短句列表属类比引用（其原文语境为书籍正文），报告已按类比标注。
