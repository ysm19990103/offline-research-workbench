# 离线研究工作台

一个使用深绿色与白色界面的本地工作台。日常运行无需登录、服务器或网络。源码中的任务与测试记录均为通用演示，不附带使用者的个人数据。

## 功能

- 科研工作、临床工作、个人技能、个人娱乐四个板块，支持多级子任务与完成勾选；娱乐事项不设截止日期。
- 全工作台共用一套计时，支持开始、暂停、继续、结束；暂停不计时，当天结束后不能重新开始。
- 每日工作心得使用一个自由记录框，自动保存在本机。
- 独立心情日记：每日 1–10 分评分和自由感悟。感悟原文不进入报告；周报、月报只使用评分。
- 周报与月报提供每天总工时柱状图、心情晴雨表；可按月导出日期对齐的工时与心情 CSV。
- 月报按“完成了什么、得到什么结果、遇到什么问题、下一步是什么”整理明确填写的内容，并链接到原始记录。
- 右侧词云提取近 14 天的任务关键词，在本机每周日更新。
- 截止前一天弹窗提醒、22:00 休息提醒，以及包含农历、干支和五行的本地日历。
- 每日快照、完整 JSON 导出与恢复、资料副本和本地文件路径关联。

## 构建与使用

开发需要 Node.js 22.13 或更高版本。首次安装依赖需要联网；构建好的工作台无需联网。

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run privacy:check
```

用较新版本的 Chrome 或 Edge 打开 `dist/index.html`。所有脚本、样式、日历数据均内嵌在这个文件中，使用系统字体。

保持 HTML 的文件位置和浏览器一致。此分发版使用独立的本地数据库名称，不会自动读取其他版本的个人记录。需要迁移时，请在旧版手动导出 JSON，再在新版选择恢复。不要把包含个人记录的 JSON 放进源码目录或 Git 仓库。

`npm test` 需要先构建 HTML；覆盖计时、任务层级、报告来源、备份恢复、心情隔离、CSV 日期匹配、词云刷新、提醒和历法规则。

## 数据与运行边界

浏览器版数据保存在当前浏览器的 IndexedDB 中。桌面版使用本机 SQLite，并通过事务同时保存记录和附件。源码、构建文件和个人运行数据是分开的；复制 HTML 不会附带后来输入的任务、日记或资料。手动导出的完整 JSON 包含这些私人内容，应放在源码目录之外。

每日首次打开生成一次快照，保留最近 30 个日期。在支持目录授权的浏览器中，可以把快照写入选定的本地目录。清理浏览器数据也会清理浏览器中的记录与快照，外部备份需自行保留。

弹窗和自动更新需要页面运行；关闭页面或电脑休眠时不能保证准时执行。词云与报告在下次打开时检查并补更新；截止提醒只在截止前一天检查。计时按时间戳累计，关闭页面不等于暂停，跨午夜按前一天午夜结算。

心情晴雨表中，1–3 分显示雨、4–6 分显示多云、7–10 分显示晴，仅表达自评分。未评分日期留空，不补 0、不跨缺失日期连线。CSV 导出到所选月份的最后一天，当前月则到今天。

浏览器只能读取用户选择导入的文件。路径关联保存位置，不能直接调用本地应用；桌面版的文件打开、系统排程提醒、原生备份与迁移说明见 [MACOS_DESKTOP.md](MACOS_DESKTOP.md)。仓库现已包含 Tauri 2 桌面工程；macOS 开发安装包由 GitHub Actions 分别构建，签名、公证与实机验证状态见构建记录。

## 源码入口

| 文件 | 用途 |
| --- | --- |
| `app/workbench.tsx` | 导航、全局计时、提醒 |
| `app/task-views.tsx` | 任务编辑与层级 |
| `app/review-views.tsx` | 工作心得、周报、月报 |
| `app/mood-view.tsx` | 独立心情日记 |
| `app/data-views.tsx` | 资料与备份 |
| `lib/tasks.ts` | 数据模型、校验、迁移与业务规则 |
| `lib/storage.ts` | 本地持久化和备份 |
| `lib/report-export.ts` | 离线报告、图表和 CSV |
| `lib/word-cloud.ts` | 本地关键词提取与周期更新 |
| `scripts/privacy-check.mjs` | 发布目录中的隐私与配置检查 |

## 日历与第三方声明

历法支持 1900–2099 年。数据与规则来源包括 [香港天文台公历农历对照](https://www.hko.gov.hk/tc/gts/time/conversion.htm)、[干支说明](https://6tail.cn/calendar/lunar.ganzhi.html)和[纳音对照](https://6tail.cn/calendar/lunar.nayin.html)。传统历法不参与任务优先级判断。

第三方界面与运行依赖的许可原文保存在 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) 和 `vendor/` 中。脱敏范围及数据边界见 [PRIVACY.md](PRIVACY.md)。


## macOS 桌面版

完整保留现有 React 界面、四类事项、统一计时、心情日记与离线历法。新增原生文件与目录关联、默认应用打开 / Finder 定位、SQLite 事务保存、每日 JSON 快照、恢复前恢复点，以及 macOS 系统排程提醒。

```sh
npm ci
npm run desktop:dev
# 在 Mac 上构建本机架构的 .app 与 .dmg
npm run desktop:build
# 同时装有两种 Rust 目标时，可构建 Universal 版本
npm run desktop:build:universal
```

开发需要 Node.js 22.13+、Rust stable（建议使用锁文件对应的当前 stable）和 Xcode Command Line Tools。目标最低系统配置为 macOS 13.3，最低系统的实际运行验证尚未完成。CI 分别使用 Apple Silicon 和 Intel 的 macOS 15 runner；构建通过不等于已经验证全部真实设备行为。

旧版先导出完整 JSON，再在桌面版“备份与恢复”导入。确认框会显示任务、心得、心情日记、工时和附件数量；恢复前先导出当前数据，原生层还会保留独立恢复点。所有导入路径都需重新选择原件才可打开。保留旧浏览器数据和原始备份，核对后再清理。

[macOS 构建流程](https://github.com/ysm19990103/offline-research-workbench/actions/workflows/macos-desktop.yml)生成 **UNNOTARIZED 开发测试包**及 `verification.json`，不自动发布正式 Release。包只有 ad hoc 开发签名，未完成 Developer ID 签名、公证和实机验收，不应当作正式可分发版本。安装包不包含运行后产生的个人数据。

```sh
npm run test:desktop
cargo test --manifest-path src-tauri/Cargo.toml --locked --no-default-features
```

已完成双架构构建及应用启动验证，详细环境、证据与未覆盖范围见 [验证记录](docs/VALIDATION.md)。
