# macOS 桌面工程

本仓库使用 Tauri 2 封装现有 React 工作台。前端业务规则沿用 `lib/tasks.ts`，没有为桌面版重做计时、任务或报告规则。浏览器版继续使用 IndexedDB，桌面版通过 `lib/desktop-storage.ts` 调用 Rust 本地存储。

## 已实现的能力

| 能力 | 实现与边界 |
| --- | --- |
| 本地保存 | SQLite WAL + FULL 同步；一个版本化文档同时保存完整 Memory 与附件编码，保留旧 JSON 的字段和 UUID；每次更新检查修订号。不是复制正在使用的数据库文件。 |
| 窗口与计时 | 单实例；第二次打开聚焦已有窗口。沿用全局计时、暂停不计时、当天结束锁定和跨午夜结算。关窗不代表暂停，计时依时间戳继续。 |
| 文件 / 目录关联 | 系统选择框授权具体文件或目录；资料 ID 对应规范路径。打开时再次校验路径、类型和资料关联；丢失原件不会删除记录。 |
| 打开原件 | macOS 默认应用打开，或在 Finder 定位。没有通用 shell / 任意路径打开权限；应用包、脚本、可执行内容和未知类型只允许 Finder 定位。 |
| 附件 | 沿用单文件 50 MB、总量 200 MB 限额。附件与任务在同一事务内保存，JSON 导出包含字节。打开副本会写入私有预览目录，不会改动原件。 |
| 备份 | 每个本地日期一个不可变的完整 JSON 快照，保留最近 30 个日期；可选系统目录写入。临时文件写完、落盘并校验后原子替换。 |
| 恢复点 | 恢复前原生层必须成功写出当前完整恢复点，才能提交新数据。恢复点不随 30 天每日快照清理，可在备份列表导出和恢复。 |
| 浏览器迁移 | 支持现有 `youxu-full-backup` v2 和现有前端支持的旧版 Memory 迁移；严格验证附件、层级和业务字段后才写入。导入会清除原文件授权，必须重新选择。 |
| 系统提醒 | 原生 Objective-C 接入 `UNUserNotificationCenter`。任务截止前一天 09:00；该日较晚添加则尽快提醒；22:00 每日重复休息提醒。完成、删除、改期会更新系统排程。 |
| 完全离线 | React、样式、历法均打包本地资源；无 CDN、服务器、远程模型、遥测或云账户。 |

数据默认位于系统的应用数据目录，标识为 `org.offline-research.workbench`。请通过界面的完整 JSON 导出迁移，不要仅复制正在使用的 `.sqlite3` 文件。保留稳定应用标识才能继续读取既有桌面数据。

当前不启用 App Sandbox，适用于未来完成 Developer ID 签名、公证后的独立分发路线。若改为 App Store / Sandbox 分发，需另外接入 security-scoped bookmark，并重新验证持久文件访问；当前记录的路径不等于沙盒授权。

## 从浏览器迁移

1. 在原浏览器工作台导出“当前完整备份”，保留原 HTML、浏览器数据与这份 JSON。
2. 打开桌面版，进入“备份与恢复”，选择“从 JSON 恢复”。
3. 核对确认框中的任务、心得、计时天数、心情日记和附件数量。点击“备份当前并恢复”，先完成当前数据导出；取消保存会中止恢复。
4. 原生层另外创建不可变恢复点，然后以一个 SQLite 事务替换记录与附件。校验、恢复点写入或提交失败时，旧数据库仍保留。
5. 检查四个板块、任务层级、历史心得、心情原文、工时、归档报告和附件。当天已结束的工时仍保持锁定。
6. 进入“课题资料”，对原文件路径使用“重新定位文件 / 目录”。不会自动打开导入路径。
7. 迁移核对完成前，不删除旧浏览器数据或原始 JSON。恢复是替换当前状态，未进行两套数据的自动合并；恢复前数据在导出的 JSON 和恢复点中保留。

只含 Memory 的备份若引用了未包含的附件，会拒绝恢复，不能把缺少附件的备份当作完整迁移。备份包含私人日记、工时和文件字节，未加密，应放在源码目录之外。

## 提醒、后台与退出

首次在“备份与恢复 → macOS 系统提醒”点击启用，让 macOS 请求通知权限。关闭休息开关会撤销每日排程。任务提醒用任务 ID + 截止日期生成稳定标识，保存排程账本以防重复；修改任务后异步同步，备份页可查看或手动重试。

已排程的通知由 macOS 负责，可在工作台退出后显示；是否出现和出现时间仍受通知权限、专注模式、关机及休眠影响。每轮排程最近 59 项任务与 1 项每日休息通知；应用运行时每分钟补充，应用长期退出后不会自动补充超出该队列的新提醒。系统排程失败不会被描述为成功，界面支持重试。

每日备份由 Rust 线程执行，关闭浏览器不会影响运行中的桌面进程。**完全退出桌面程序后不执行每日备份**，下次启动补做当天，不伪造退出期间每一天的快照。词云和归档报告仍在 React 启动 / 日期变化时按原规则更新；没有安装 LaunchAgent，也没有后台自动升级服务。

## 在 Mac 上构建

安装 Node.js 22.13+、Rust stable 和 Xcode Command Line Tools，然后运行：

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run test:desktop
cargo test --manifest-path src-tauri/Cargo.toml --locked --no-default-features
npm run desktop:build
```

本机架构产物在 `src-tauri/target/release/bundle/macos/` 与 `bundle/dmg/`。显式架构构建：

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run desktop:build -- --target aarch64-apple-darwin --ci
npm run desktop:build -- --target x86_64-apple-darwin --ci
npm run desktop:build:universal -- --ci
```

Universal 是可用的构建命令；是否已经实际生成和验证，要查看对应构建记录。当前 CI 分开构建两种原生架构，避免把交叉编译成功当作在目标架构运行成功。

配置的最低系统为 **macOS 13.3**，需考虑现有 Tailwind 4 / WebKit 的支持范围。最低系统运行与真实设备交互需另做验收。开发模式使用静态资源；改前端代码后需重新运行开发命令或构建，不依赖联网的开发服务器。

## CI、安装包与实际验证范围

`.github/workflows/macos-desktop.yml` 在分支提交、PR 和手动运行时执行：

- Linux：类型检查、原有业务测试、桌面存储桥测试、两种资源构建、隐私检查。
- macOS 15 Apple Silicon 与 macOS 15 Intel：Rust 原生测试、Objective-C 桥编译、完整 Tauri `.app` 和 `.dmg` 构建。
- 检查 Mach-O 架构、ad hoc 签名完整性、DMG 完整性；启动真实应用包并检查进程保持运行 8 秒。
- 上传 `.dmg`、保留 Unix 属性的 `.app.tar.gz`、SHA-256 清单与 `verification.json`。下载后应以 `.dmg` 或 `.app.tar.gz` 为准，ZIP 中直接上传的 `.app` 可能丢失权限。

`verification.json` 明确记录每项是否实际完成。启动进程冒烟检查不能证明 React 界面、通知授权、退出后通知投递、文件选择框、默认应用、真实数据迁移、休眠恢复与最低系统兼容性已在实机通过。

当前工作区的可重复测试包括原有 35 项业务规则、7 项桌面桥迁移 / 失败恢复测试及 13 项 Rust 原生测试。已在 macOS 15.8.2 / Apple Silicon 与 macOS 15.7.9 / Intel 完成应用和 DMG 构建、架构与完整性检查、启动及 React / SQLite 通信验证。详细记录见 [docs/VALIDATION.md](docs/VALIDATION.md)，后续提交以对应 Actions 运行结果为准。

## 签名、公证与发布

当前配置 `signingIdentity: "-"`，只生成 **ad hoc 开发测试包**。工作流不接收或导出 Developer ID、Apple ID、公证密码、API 密钥或开发者证书，也不创建正式 Release。

未经 Developer ID 签名、公证、staple 与真实设备验收的包，不是正式可分发版本。Gatekeeper 可能阻止安装；不要通过关闭系统安全机制来代替签名。未来正式发布时应在 GitHub Secrets / 受控 Keychain 中提供凭据并另加受保护的发布流程，不能把凭据写入仓库。

官方参考：[Tauri macOS 打包](https://v2.tauri.app/distribute/macos-application-bundle/)、[签名与公证](https://v2.tauri.app/distribute/sign/macos/)、[CSP](https://v2.tauri.app/security/csp/)、[Apple 本地通知](https://developer.apple.com/documentation/UserNotifications/scheduling-a-notification-locally-from-your-app)。Tauri 标准通知插件只在移动端提供排程，因此这里使用 macOS 原生接口。
