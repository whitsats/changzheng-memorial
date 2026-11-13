# 长征纪念 · 1921—1949 大事件时间轴

为纪念中国革命历史而做的交互地图：1921 年中共一大 → 1934—1935 年红军长征（瑞金至会宁，33 个途经点）→ 1935 年遵义会议 → 抗日战争 → 1949 年开国大典。

171 条事件文本以《中国共产党简史》（2021 年版）为准；坐标为纪念示意（点到为止，不作精确定位）。其中 19 条同期域外大事（共产国际、苏德战争、雅尔塔、波茨坦、旧金山等，共 13 座城市）落在主图取景框外，绘于右上角「域外大事」小地图，与主图同一年份同步点亮；另有 2 条国际事件落在框内（广岛、长崎），仍在主图上。推进时间轴时主视角始终锁定中国：当年事件在框内则主图弹浮签，框外则主图不开浮签、只在小地图上让对应城市脉冲；同年国内外事件并存时两者同时呈现。
每条事件均附 `source`，已按该书目录细分：国内主线事件定位到章/节/页码，国内支线事件定位到章，国际事件仅章级定位并注明日期与地点取通行史实（详见 `src/data/sources.ts`）。

**外部力量 → 国内形势**：点击小地图城名打开城卡，展开某条域外大事可看到「对国内的影响」——标注外部力量（共产国际 / 苏联 / 日本 / 英美 / 德意 / 世界）及这件事如何改变国内形势，并附可点击的「国内对应」事件入口，点即可跳到主图里相应的国内事件浮签；主图镜头不会被域外点拉走（域外目标仍只在小地图亮出城卡）。小地图提示行还有「影响一览」按钮，把全部 21 条域外大事按外部力量分组列出，附时间与国内对应入口，点击条目同样跳转且镜头不移动。

## 打开方式

纯静态站点，无后端、无构建。用任意静态服务器打开本目录即可，例如：

```bash
npx serve memorial          # 或 python -m http.server
```

默认定位 1934 年（长征出发）。拖动时间轴可按年回溯，点击地图地名可「点地溯源」查看沿革。

## 数据来源与改造方式

- 地图引擎、矢量几何底图（`js/atlas_boot.js`）、宣纸设色与气泡 UI 基于开源项目
  **[江山时序（jiangshan-map）](https://github.com/DeanChensj/jiangshan-map)（作者 DeanChensj，GPL-3.0）** 改造。
- 改造仅发生在 `js/map_data.js`（里程碑、时段、长征走廊）与可读的 HTML/CSS/JS 品牌文案；
  几何压缩文件未动。原仓库完整副本保留在项目根目录 `vendor/jiangshan-map/`。
- 重新注入事件数据：工作区根的 `tools/build_memorial.mjs`（数据源 `src/data/*.ts`）；本仓库只含生成后的 `js/map_data.js`。事件按覆盖其年份的时段分派：1921—1948 归 `roc` 段，1949 年 8 条归时间轴末段 `prc`，避免 `_clampYearToDynasty` 把 1949 年事件夹到 1948。
- 域外小地图为独立 mixin（`js/atlas_world.js`），不改动 `app.js` 主体；世界轮廓由
  `node tools/build_world_outline.mjs` 从 **Natural Earth 1:110m（公有领域）** 抽稀生成
  `js/world_outline.js`（无网络请求，静态可用）。

## 校验与 CI

`.github/workflows/ci.yml` 对数据与前端资产做回归，改动数据或 JS 后请在本地先跑一遍：

| 检查 | 命令 | 覆盖内容 |
| --- | --- | --- |
| 拼音索引可复现 | `npm ci --prefix scripts/search-pinyin` 后 `npm run check --prefix scripts/search-pinyin` | `js/event_pinyin.js` 与 `js/map_data.js` 同步；每条事件都有纯拼音键 |
| 拼音搜索回归（本站事件） | `npm run test:memorial --prefix scripts/search-pinyin` | 171 条 1917—1949 事件：紧凑 / 空格 / 大写 / 带调拼音、地名拼音、结果携带坐标与年份、选中后跳年开卡并平移、1949 年事件不得被进度夹到 1948、中文标题优先于拼音别名、短串不产生拼音噪声 |
| 资源版本哈希 | `node scripts/sync_version.js --check` | `index.html` 中 18 个 bundle 的 `?v=` 与 `data-v-*` 与文件内容一致（哈希按 LF 归一化，跨平台结果相同） |
| 疆域拓扑 baseline | `node scripts/audit_topology.js --check` | 与 `data/atlas/topology_baseline.json` 对齐 |
| 府州图层 baseline | `node scripts/audit_prefectures.js --check` | 与 `data/atlas/prefecture_baseline.json` 对齐 |
| 首屏脚本预算 | `node scripts/perf_budget.js --check` | 同步脚本 gzip 总量（上限写在 `data/atlas/perf_baseline.json`）、是否新增未登记的同步脚本 |
| 响应式布局 | `node scripts/audit_layout.js --check` | 1280×800 / 768×1024 / 375×812 三档 HUD 不溢出、不重叠（本机需能启动 Chrome，可用 `CHROME_BIN` 指定） |

上述检查只针对本站实际发布的 1917—1949 数据集。上游全史副本的校验（`build_atlas.js --check`、`audit_sources.js --check`、`validate_atlas.js`、`workers/stats/test.js`，以及 `scripts/search-pinyin/search.test.cjs` 里依赖 18 个朝代 526 条史事的断言）需要完整全史数据，CI 中不运行。

## 许可与署名

- 本站代码遵循 **GPL-3.0**（见 `LICENSE`）；公开分发须保留本文件署名与原项目出处。
- 历史地图几何源自学术历史地图集（CHGIS），仅供个人纪念用途。
- 域外小地图的世界轮廓源自 Natural Earth（1:110m，公有领域）。
- 本站为个人非商业纪念作品，与任何机构无关。

## 内容分期（stage）

1921 大革命 → 1927 土地革命 → 1934 长征 → 1937 抗战 → 1946 解放战争 → 1949 开国。
