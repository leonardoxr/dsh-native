<p align="center"><img src="build/icon.png" width="128" alt="DSH Native terminal icon" /></p>

[English](README.md) | 简体中文

# DSH Native

[![CI](https://github.com/leonardoxr/dsh-native/actions/workflows/ci.yml/badge.svg)](https://github.com/leonardoxr/dsh-native/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/leonardoxr/dsh-native?display_name=tag&sort=semver)](https://github.com/leonardoxr/dsh-native/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

一个专注于 HTTPS Web 应用的原生外壳——支持保存服务器、快速重新连接，并为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供一流的工作流。

DSH Native 让常用的 Web 应用脱离普通浏览器标签页。本仓库包含跨平台 Electron 桌面应用，以及原生 SwiftUI/WebKit iOS 和 Android/WebView 配套应用。所有客户端都能记住多个已保存的服务器，并在启动时返回最近使用的服务器。

## 亮点

- **已保存服务器列表** — 添加、命名、移除、编辑 HTTPS 端点并在其间切换。
- **统一工作区主页** — 在一个按最近使用时间优先排列的仪表板中展示每个已保存服务器的工作区和实时会话，并提供各服务器的徽章、连接状态、缓存的离线快照，以及对 Tailscale 网络中 DSH 服务器的自动发现。
- **工作区侧边栏桥接** — 托管的 DSH 页面通过 Companion 在 Harness 左侧面板中呈现相同的跨服务器工作区模型；每次桥接调用均为只读或导航操作，并会针对本地 DSH 和已保存服务器执行来源校验。
- **快速返回** — 启动时重新连接到最近使用的服务器，并在窗口启动期间预连接。
- **专注窗口** — 外部链接在系统浏览器中打开，而不会生成额外的应用窗口。
- **顾及电池的后台行为** — 隐藏页面使用 Chromium 节流，仪表板轮询在离屏时暂停，而原生通知源在主进程中保持活动。
- **原生关注提醒** — 配套事件会转换为已去重的操作系统通知，涵盖已完成、已阻塞、失败、问题和批准状态。
- **强化的边界** — 托管的 DSH 页面只会获得经过来源校验的工作区读取/导航桥接；任何页面都不会获得服务器修改、文件系统、凭据、更新器或任意原生 IPC 能力，跨源导航则会在系统浏览器中打开。
- **原生移动端配套应用** — iOS 和 Android 使用平台 WebView 外壳，配备适配安全区域的服务器抽屉，不含 Electron 运行时，也不依赖第三方运行时。
- **明确的私有证书信任** — 在允许按服务器设置自签名/私有证书例外之前，iOS 和 Android 会显示准确的 HTTPS 主机和 SHA-256 证书指纹；证书发生变化时必须再次审核，并且每项例外都可撤销。

## 下载

预构建安装程序和便携软件包发布在 [Releases 页面](https://github.com/leonardoxr/dsh-native/releases)：

| 平台 | 发行产物 |
| --- | --- |
| Windows x64 | NSIS 安装程序和便携可执行文件 |
| macOS Apple silicon | DMG 和 ZIP |
| Linux x64 | AppImage 和 Debian 软件包 |
| Android API 26+ | 调试 APK（手动安装；未经 Play 签名） |

macOS 发行版面向 Apple silicon (arm64)；不支持 Intel Mac。iOS 构建需要使用你的 Apple 团队进行签名；Xcode 项目和远程构建辅助工具包含在 `ios/` 中。

> [!IMPORTANT]
> Windows 二进制文件未签名。从 v0.1.1 开始，macOS 应用带有临时完整性签名，但未使用 Apple Developer ID 签名，也未经过公证。因此，SmartScreen 或 Gatekeeper 可能要求明确执行首次启动。请使用发行版的 `SHA256SUMS.txt` 验证文件；参阅[发行文档](docs/RELEASING.md)。

### 在 macOS 上首次启动

将 DSH Native 复制到 Applications 后，按住 Control 键点按该应用并选择 **Open**。如果 macOS 仍报告应用已损坏，请先验证 DMG 校验和，然后清除已复制应用的隔离属性：

```sh
xattr -dr com.apple.quarantine "/Applications/DSH Native.app"
```

仅在发行版尚未使用 Developer ID 签名和公证期间才需要此变通方法。对于校验和不匹配的产物，绝不要绕过隔离。

### 使用 DSH Native

1. 启动 DSH Native。
2. 选择 **Start local DSH Web (port 3080)** 以运行现有的 `dsh` CLI 安装，或添加显示名称和 `https://` URL。
3. 选择要连接的服务器。启动时会自动重新连接到最近使用的服务器。
4. 在任何已连接的服务器中打开 **App → Workspaces…**（<kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>H</kbd>），进入聚合仪表板。

### 工作区主页

内置主页将**每个已保存服务器以及受管理的本地实例**中的工作区和实时会话聚合到一个按最近使用时间优先排列的组合列表中。每张卡片会显示工作区标题、路径、服务器名称、服务器 URL 徽章、最后更新时间、会话数，以及该服务器的连接状态（`loading`、`online` 或 `unavailable`——其中包括彼此不同的 *Not authorized*、*No Companion* 和 *Offline (tailnet)* 状态）。某个服务器离线绝不会阻塞仪表板的其余部分。

仪表板会立即从每个服务器上次成功的快照（存储在本地 `userData/workspace-cache.json` 中）绘制内容，然后在打开时、获得焦点时、可见期间每 60 秒以及通过明确的 **Refresh** 操作静默重新验证。缓存行会变暗并标注存留时间，直至获得新数据；陈旧快照绝不会被呈现为当前数据，移除服务器也会删除其缓存。

仪表板底部的 **Servers** 区域管理 Local、Saved 和已发现的计算机：启动或打开受管理的本地实例，添加/重命名/移除已保存的服务器，并确认 **Found on your Tailnet** 下的建议。当本地安装了 Tailscale 时，DSH Native 会列出能够响应 Companion 端点的 tailnet 对等节点，并将它们作为一键添加选项提供；添加后会保存为稳定的 MagicDNS HTTPS URL（`https://machine.tailnet.ts.net/`）。未经确认不会保存任何内容。

本地选项运行 `dsh web --port 3080`，等待其就绪，并在 DSH Native 退出时停止该进程。它要求 `dsh` 命令可在 `PATH` 中使用；端口 3080 必须空闲。

只能保存 HTTPS URL。请添加你信任的服务器：连接的网站在桌面窗口内运行，并在 DSH Native 的每用户应用配置文件中保留正常的 Chromium 站点存储。服务器列表和性能日志存储在 Electron 的 `userData` 目录中。

## iPhone 和 iPad 配套应用

[`ios/`](ios/) 项目是适用于 iOS 和 iPadOS 17 或更高版本的原生 SwiftUI 配套应用。它包含已保存主机选择器、自动重新连接、持久 WebKit 会话、严格的顶层选定源导航、原生浏览器控件、网站数据清除、隐私元数据以及确定性单元测试。

iOS 源码可编译，其模拟器测试套件可在项目的本地 Apple-silicon Mac 上运行。它目前不作为可安装发行版分发：标准 iOS 即使在个人设备上安装也要求代码签名。请使用 Xcode 自动个人团队签名部署到自己的设备，或在通过 TestFlight/App Store 分发前配置 Apple Developer 账户。请参阅 [`ios/README.md`](ios/README.md) 和可复用的 [`scripts/build-ios-remote.ps1`](scripts/build-ios-remote.ps1) 辅助工具。

## DeepSeek Harness 配套组件

当远程应用是 DeepSeek Harness Web UI 时，请安装 [dsh-companion](https://github.com/leonardoxr/dsh-companion)，这是一个树外 Harness 插件。它公开轻量级的项目/会话端点和经过筛选的通知事件源。DSH Native 从其主进程直接连接这些端点——远程页面内容绝不会获得特权 IPC 或 Companion 访问权限。Companion 严格**只读**：它会列出工作区、会话和事件，但不能远程创建或切换工作区；因此，在工作区主页中选择卡片会在普通 DSH Web UI 中打开其所属服务器，而不是导航到特定工作区。

同样的数据也会供应给工作区主页仪表板。远程服务器必须提供服务器信任的 authority：通过其 MagicDNS 名称（或任何主机）访问它们，并运行一次 `dsh web --trusted-host <that-host>`，否则 Companion 读取会返回 HTTP 403，仪表板会显示 *Not authorized* 状态及此提示。

仅当 DSH Native 正在运行且其窗口未获得焦点时才显示通知。点击通知会恢复应用并使其获得焦点。重新连接游标和稳定事件键可防止普通网络中断期间出现重复提醒。可在配套插件的 Harness 设置中选择要转发哪些轮次结果、问题、批准和子代理事件。关闭应用窗口会停止事件源；在 Windows 和 Linux 上，这也会退出 DSH Native。要继续接收提醒，请保持窗口打开或最小化。

如果代理重写了 `Host` 标头（例如 Tailscale Serve），请将其公共 authority 添加到 Harness 信任边界：

```sh
dsh web --trusted-host your-host.example.net
```

详情请参阅[配套组件安装指南](https://github.com/leonardoxr/dsh-companion#install)。

## 本地开发

### 要求

- Node.js 22.12 或更高版本
- npm 10 或更高版本
- 受支持的 Windows、macOS 或 Linux 桌面系统
- 对于 iOS 工作：安装了 Xcode 26 和 XcodeGen 2.46 的 Apple-silicon Mac
- 对于 Android 工作：Android Studio Ladybug 或更高版本、Android SDK 34 和 JDK 17+

```sh
git clone https://github.com/leonardoxr/dsh-native.git
cd dsh-native
npm ci
npm start
```

运行与 CI 相同的检查：

```sh
npm run check
npm test
```

使用 `npm run package` 为当前平台创建未打包的应用，或使用 `npm run dist` 创建可分发安装程序。输出将写入 `dist/`。

分别构建移动端配套应用：

```sh
# Android
gradle -p android testDebugUnitTest assembleDebug

# iOS (on an Apple-silicon Mac)
cd ios
SIMULATOR_NAME="iPhone 17 Pro" scripts/build.sh
```

两个移动端外壳在使用私有/自签名证书前都要求按服务器进行明确审核。

### 项目布局

```text
src/
├── main.js                 Electron main process and server management
├── preload.js              Context-isolated bridge for the bundled Workspaces home
├── lib/                    URL policy, local DSH launcher, Companion client and aggregator,
│                            Tailscale status parsing, presentation mapping, SSE feed, notifications
└── renderer/               Bundled Workspace Home dashboard HTML, CSS, and JavaScript
test/                       Node.js unit tests
ios/                        Native SwiftUI iPhone/iPad app and tests
android/                    Native Android WebView app and policy tests
scripts/                    Reusable local and remote build helpers
.github/                    CI, releases, and contribution templates
docs/RELEASING.md           Maintainer release process
```

## 贡献

欢迎贡献。在提出拉取请求前，请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；使用 issue 模板报告错误和提出想法，并遵守[行为准则](CODE_OF_CONDUCT.md)。

请按照 [SECURITY.md](SECURITY.md) 中的说明私下报告安全问题，不要在公开 issue 中报告。

## 路线图

- 多主机标签页，使已连接主机保持加载以便即时切换。
- 未读徽章和按会话的通知路由。
- 冷态、仅持久化的会话摘要。
- 已签名发行版二进制文件和自动更新元数据。

## 许可证

[MIT](LICENSE) © 2026 leonardoxr
