# 开源发布清单（长征纪念）

> 状态：**已发布** → https://github.com/whitsats/changzheng-memorial（GPL-3.0，公开）；站点 https://whitsats.github.io/changzheng-memorial/。原作署名保持不动。

## 1. 许可与署名（必须保留，勿删）
- [x] `LICENSE`（GPL-3.0 全文，原作）保留
- [x] `README.md` 署名段：江山时序（DeanChensj，GPL-3.0）+ CHGIS 学术限制说明 + 非商业纪念声明
- [x] 站内 GitHub 按钮仍指向原仓库，title 标注「纪念版基于江山时序（GPL-3.0）」
- [x] `vendor/jiangshan-map/` 原仓库完整副本留作对照（发布时可二选一：保留以便溯源，或 .gitignore）
- [x] 域外小地图轮廓：`js/world_outline.js` 由 Natural Earth 1:110m（公有领域）抽稀生成，README 已署名
- [ ] 发布仓库简介（GitHub About）写明：纪念版 fork、原项目链接、GPL-3.0

## 2. 内容与数据
- [x] 171 条事件以《中国共产党简史》（2021）为准（81 主集 + 90 增补，其中 21 条为同期国际事件：19 条框外 + 广岛/长崎 2 条框内）；README 已注明「坐标为纪念示意」
- [x] 长征走廊 summary 已注明「路线为示意折线，不表示精确行军路线」
- [x] `tools/build_memorial.mjs` 可重跑（esbuild + vm 注入），幂等通过
- [ ] 事件文本版权：转述而非整段复制原文；如需微调口径见 `src/data/events.ts`

## 3. 隐私与外链（已清）
- [x] 已删 vercount / atlas_track / Cloudflare beacon
- [x] 已删指向 deanchen.me 的 canonical、hreflang、og:url、JSON-LD、SEO 目录区、topics/、workers/、sitemap.xml
- [x] `robots.txt` 改为 `User-agent: * / Allow: /`（无 Sitemap 行）
- [ ] 发布前全仓复查：`grep -rn "deanchen.me\|vercount\|cloudflareinsights" memorial/` 应只剩署名与 fork 说明

## 4. 元数据
- [x] `<title>`、og/twitter、manifest、llms.txt 均为纪念版
- [x] `inp-year` 静态默认 1934（动态初始化走 focusYear）
- [ ] 上线后核对：`document.title`、分享卡图路径（`./assets/terrain_relief.webp`）

## 5. 发布前功能检查（静态托管任意目录均可）
- [ ] 默认年份 1934；`?year=1935`、`?year=1949` 直达对应事件
- [ ] 时间轴播放/倍速/语音、翻页、搜索、点地溯源、图层开关
- [ ] 移动端（390px）与桌面端布局；`≤900px` 时右上「域外大事」小地图应隐藏
- [ ] 域外大事：点侧栏域外条目只在小地图亮城，主图镜头留在国内取景框
- [ ] 影响链：城卡展开域外大事显示「对国内的影响」（actor 标签 + 文本 + 国内对应入口）；「影响一览」按共产国际/苏联/日本/英美/德意/世界分组；点国内对应入口跳过去且镜头不被域外点拉走
- [ ] 无控制台报错；字体走 Google Fonts（离线时回退系统字体）

## 6. 发布与 CI
- [x] 仓库 `whitsats/changzheng-memorial`（公开，GPL-3.0，默认分支 `main`），About 链回原项目
- [x] GitHub Pages 以 `workflow` 方式启用，`deploy-pages.yml` 只为本站（`whitsats.github.io` 主站未改动）
- [x] 站点 `/js/app.js`、`/js/map_data.js` 均 200，首页 200
- [x] `.github/workflows/ci.yml` 已精简为只校验本站 1917—1949 数据集，与 README「校验与 CI」一节一致：
  - 拼音索引可复现（`npm run check --prefix scripts/search-pinyin`）
  - 拼音搜索回归（`npm run test:memorial --prefix scripts/search-pinyin`，19 个用例覆盖 172 条本站事件）
  - 资源版本哈希（`node scripts/sync_version.js --check`，哈希按 LF 归一化，Windows/Linux 结果一致）
  - 疆域拓扑 / 府州图层 baseline（`audit_topology.js --check`、`audit_prefectures.js --check`）
  - 首屏同步脚本 gzip 预算（`perf_budget.js --check`，上限 365.4 KB）
  - 响应式布局几何与非重叠（`audit_layout.js --check`）
- [x] 不再进入 CI（依赖上游全史 526 条史事）：`search.test.cjs` 全史断言、`build_atlas.js --check`、`audit_sources.js --check`、`validate_atlas.js`、`workers/stats/test.js`
- [ ] 后续改动：本地跑一遍第 6 节所列命令，再 `git push`，确认 `Atlas Integrity CI` 与 `Deploy GitHub Pages` 两个工作流均为绿

## 7. 已知小事项（非阻塞）
- 域外城市（莫斯科、柏林、华盛顿等 13 城）落在主图取景框外，主图浮签按原站逻辑判为屏外而不显示，改由右上小地图的城卡承载同一条事件与释文。
- 影响链数据（`src/data/influences.ts`，21 条、27 条国内对应）经 `tools/build_memorial.mjs` 挂为里程碑 `inf`；浏览器已验证：一览分组/未来置灰、点 chip 跳国内浮签且 viewBox 不变、莫斯科城卡展开苏联影响块、1942 华盛顿城卡+浮签联动。
- 时间轴「现代」段为原站保留样式，当前 toYear=1949，视觉上仍横跨到「今」。
- `index.html` 的 `?v=` / `data-v-*` 由 `node scripts/sync_version.js` 统一重算并提交；CI 用 `--check` 守着，改 JS/CSS 后记得重跑。
- 1949 年事件（开国大典等）的搜索结果显示年份为 1948：`_clampYearToDynasty` 受紧邻的 1949 年分段（`fromYear=1949`）上界限制，属数据分段问题，未在本轮改动。
