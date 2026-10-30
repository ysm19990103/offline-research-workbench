# 有序工作台：macOS 桌面版制作路线

当前交付的是可在 Mac 浏览器中离线运行的 HTML，以及完整前端源码。以下是制作原生桌面外壳、持久化数据和文件关联的方案；本包未附已编译的 `.app` 或 `.dmg`。

## 推荐：复用界面，使用 Tauri 2 封装

现有 React 界面已经能编译成完全离线的静态资源，可复用为 Tauri 桌面窗口。原生层负责本地数据库、文件对话框、打开原件与备份目录。无需建立云服务。

官方依据：[Tauri 架构](https://v2.tauri.app/concept/architecture/)、[macOS 开发依赖](https://v2.tauri.app/start/prerequisites/)、[DMG 打包](https://v2.tauri.app/distribute/dmg/)。

在一台 Mac 上的实际制作顺序：

1. 安装 Node.js（源码要求 22.13+）、Rust，以及 Xcode Command Line Tools。只做桌面程序可运行 `xcode-select --install` 安装命令行工具。
2. 进入本项目目录，在终端进入该目录。运行 `npm ci`、`npm run build`，得到 `dist/index.html`。开发工具与依赖首次安装需要联网，做好的程序日常运行不需要。
3. 安装 Tauri 2 开发 CLI：`npm install --save-dev @tauri-apps/cli@^2`，再运行 `npx tauri init` 创建 `src-tauri`。
4. 将生成的 `src-tauri/tauri.conf.json` 中 `build.frontendDist` 设为 `../dist`，`build.beforeBuildCommand` 设为 `npm run build`；窗口标题设为“有序 · 工作台”，初始大小可用 1440 × 940。界面来自本地资源，不填远程网站地址。使用初始化生成的配置并保留其余必要字段。
5. 先验证桌面窗口可以读取旧版完整 JSON。单纯套壳仍然是 WebView 的存储；要达到下面的原生文件、备份和后台能力，还需要完成对应的存储与文件适配。
6. 在 Mac 上运行 `npx tauri build --bundles app,dmg`，生成应用与拖拽安装磁盘映像。按目标机器构建 Apple Silicon 或 Intel 版本；两种机器都要用时可做 Universal 包。请在 macOS 上完成原生构建与实机验证。

窗口与打包配置参见 [Tauri 配置](https://v2.tauri.app/reference/config/)、[macOS 应用包与架构](https://v2.tauri.app/distribute/macos-application-bundle/)。对外分发时按官方流程做 [签名与公证](https://v2.tauri.app/distribute/sign/macos/)。

当前前端内嵌脚本与 CSS。制作桌面生产包时可改为本地独立 JS/CSS，并配置相应 CSP；若保留内嵌脚本，应按构建产物生成匹配的脚本哈希。最低 macOS 版本需结合系统 WebKit 对现有 CSS 和 JavaScript 的支持实测确定。

## 桌面版应接入的原生能力

| 功能 | 具体实现 |
| --- | --- |
| 数据保存 | 用 SQLite 存任务、子任务关系、计时片段、心得、资料索引和报告快照；复用现有 UUID 与日期，提供旧 JSON 导入。 |
| 文件副本 | 保存到应用自己的数据目录中的 attachments 子目录；数据库保存文件 ID、名称、类型和相对路径。 |
| 原文件关联 | 用户在系统对话框选择课题目录；保存目录书签和相对路径。浏览器版导入的纯文本路径需在 Mac 重新授权关联。 |
| 打开原件 | 用系统默认程序打开 PDF、表格、代码或目录；增加“在 Finder 显示”。 |
| 每日备份 | 在原生层按本地日期执行一次，备份数据库一致性快照与附件索引/副本；临时写完、校验成功后再替换目标文件，显示最后成功日期。 |
| 多窗口计时 | 使用单实例或数据库事务保护，继续沿用每天结束后锁定、暂停不计时的规则。 |
| 截止日期提醒 | 按设备本地日期在截止前一天触发，保留每项任务与截止日期的提醒去重状态；日期修改或任务完成后同步更新排程。 |
| 每周词云 | 应用运行时每周日刷新一次本地任务关键词，启动时检查错过的更新；保留词云统计范围。 |
| 22:00 提醒 | 调用 macOS 本地通知，按本地时间排程；如需退出程序后仍提醒，应使用系统支持的本地通知触发器，不依赖网页计时器。 |

可使用 Tauri 的 [SQL 插件](https://v2.tauri.app/plugin/sql/)、[文件系统插件](https://v2.tauri.app/plugin/file-system/)、[对话框插件](https://v2.tauri.app/plugin/dialog/) 和 [Opener 插件](https://v2.tauri.app/plugin/opener/)。这些是待接入的桌面能力，当前 HTML 不会调用它们。

SQLite 开启 WAL 时不要只复制正在使用中的 `.db` 文件来冒充完整备份；应使用一致性备份机制，例如 [SQLite Online Backup API](https://www.sqlite.org/backup.html)。导入或恢复应先校验内容和附件，再在事务中替换；保留当前版本的当天结束锁定规则。

若要求完全退出程序后也每天自动备份，需要额外的 macOS 后台任务，例如用户级 LaunchAgent，并处理数据库并发与电脑休眠后的补执行。否则可采用“应用运行时每天一次，启动时检查并补做当天”的清晰规则。网页外壳本身不会自动获得后台运行能力。

## 课题与资料的关联方式

建议每个课题使用一个本地根目录，内部按用途放在 papers、code、tables、assets、outputs 子目录中。工作台索引这个目录，不强制搬动现有文件。

| 类型 | 建议关联 | 工作台中的操作 |
| --- | --- | --- |
| 论文 | PDF 原件；需要固定版本时再收一份副本 | 默认 PDF 阅读器打开、Finder 显示、关联阅读笔记 |
| 代码 | 本地代码仓库的目录 | 打开目录或代码编辑器，不把整个仓库重复塞进数据库 |
| 表格 | xlsx / csv 原件 | 系统默认应用打开；可另存一个关键分析版本作为结果附件 |
| 素材 | 图片、视频或素材目录 | 打开原件、Finder 显示；大文件优先目录关联 |
| 分析结果 | outputs 内图表、结果表、报告 | 关联完成事项和日期，方便月报回到成果 |

索引可保存：资料 ID、课题/任务 ID、类型、显示名、目录书签、相对路径、文件大小和最后修改时间。需要版本核对的论文或结果文件，再保存内容摘要。文件找不到时提供“重新定位”；不应直接删除记录或悄悄指向同名文件。

在采用 App Sandbox 的 macOS 程序中，持久访问用户选中的目录应使用 security-scoped bookmark，并处理书签失效和重新授权。仅记一个绝对路径不等于持有持续访问权限。参见 [Apple：从 macOS App Sandbox 访问文件](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox)。

Opener 提供 `openPath`（交给默认程序）和 `revealItemInDir`（在 Finder 中显示）。权限范围限定到用户选择并关联的资料目录。参见 [Opener API](https://v2.tauri.app/reference/javascript/opener/)。

计时区只有一套总计时：开始、暂停、继续、结束。任务与板块不单独计时，任务详情中的文件关联也不会改变时长。工作心得与心情日记分开保存；报告只读取心情评分，原始心情感悟仅留在日记中。

## 从本包开始开发时的文件入口

- `app/workbench.tsx`：工作台主界面与计时按钮。
- `app/task-views.tsx`：任务层级、事项编辑。
- `app/data-views.tsx`：资料与备份界面。
- `app/review-views.tsx`：心得、周报、月报界面。
- `lib/tasks.ts`：数据模型、迁移、计时与报告规则。
- `lib/storage.ts`：当前浏览器存储接口；桌面版将其接到 SQLite 与原生文件接口。
- `lib/report-export.ts`：工时/心情图表、CSV 与可离线分享的报告。
- `app/mood-view.tsx`：独立心情日记。
- `lib/word-cloud.ts`、`app/word-cloud-view.tsx`：本地分词、更新规则与右侧词云。

先保留现有业务规则与备份兼容，再替换存储和文件接口，可以减少界面重写与数据迁移的风险。
