# 工作台复刻 2.0

工作台复刻 2.0 是一款桌面端视频复刻工具：输入一条短视频、替换人物图和音色参考，通过你自己配置的视频接口一次生成 3 个身份替换版本：

1. 黄金三秒开场；
2. 冲击链开场；
3. 异常转折开场。

原故事、场景、镜头逻辑和中心含义保持锁定。

## 视频接口

左侧“视频接口”是生成后端的统一入口。使用者需要填写自己的：

- 接口名称；
- 视频 API Base URL；
- 素材上传 Base URL；
- 任务路径与模型名称；
- API Key；
- 可选的独立上传 Token。

Replication 不附带任何开发者账号或密钥，也不绑定单一供应商。当前内置运行 Adapter 支持 Replication / Seedance 兼容任务协议：素材上传接口需要返回签名上传地址，生成接口需要返回可轮询的任务 ID。其他请求协议可以在 `runtime/seedance-face-swap/scripts/` 增加 Adapter，无需修改视频复刻主工作流。

API Key 和上传 Token 通过 Electron `safeStorage` 加密，只在主进程提交任务时注入运行环境，不会返回页面、写入日志或提交到仓库。

“视频接口”工作区还包含可选的 MiniMax H3 模组。该模组会读取当前视频、人物图和音色参考，并提供三种连接入口：

- 本机 ComfyUI：真实检测 6006/8188 服务以及 H3 生成模型、文本编码器、视频 VAE 和音频 VAE。
- SSH 服务器：保存主机、端口、用户名、远程工作目录和本机私钥路径，使用 `BatchMode` 做无密码连通测试。
- H3 API：输入 API Base URL、模型名称和 API Key；API Key 通过 Electron `safeStorage` 加密，不写入仓库、日志或前端配置。
- 官方模型下载：列出 Comfy-Org/MiniMax-H3 的 R2V 生成模型、文本编码器及视音频 VAE，可逐项或一键在默认浏览器开始下载，并显示目标 ComfyUI 目录与本机安装状态。

可通过 `REPLICATION_MINIMAX_H3_URL` 和 `REPLICATION_MINIMAX_H3_COMFY_ROOT` 覆盖默认本机连接与工作区路径，也可通过 `MINIMAX_H3_API_KEY` 从环境变量提供 API 凭据。真实付费任务在提交前仍需要当次明确授权。

## Windows 便携版

普通使用者请从 [GitHub Releases](https://github.com/francoeur003/replication/releases) 下载：

```text
Replication-2.0.2-windows-x64.zip
```

完整解压后：

1. 双击 `Configure-Account.cmd`，输入使用者自己的兼容视频接口；也可以直接在 APP 左侧“视频接口”中配置；
2. 双击 `Replication.exe`；
3. 选择本地视频、替换人物图和音色参考。

Windows 发布包已内置：

- Python 3.13；
- Python `requests` 及其依赖；
- FFmpeg 和 ffprobe；
- Replication 的生成运行脚本。

因此接收者不需要安装 Node.js、Python、pip、FFmpeg，也不会依赖开发者电脑上的 `/Users/...` 路径。API Key、Token、账号、密码、Cookie 和私人配置不会放进仓库或发布包。

当前 Windows 包未购买代码签名证书，SmartScreen 可能提示“未知发布者”。请只从本仓库 Releases 下载。Windows 便携包支持 Windows 10/11 x64。

MeowLoad 仍是可选组件：只有“粘贴视频链接导入”需要；直接选择本地视频不需要。

## macOS / 源码运行

Apple silicon 用户可以直接从 [GitHub Releases](https://github.com/francoeur003/replication/releases) 下载 `Replication-2.0.2-macOS-arm64.zip`。当前 macOS 包采用临时签名，尚未经过 Apple 公证。

要求：

- Node.js 22.12 或更新版本；
- Python 3；
- FFmpeg（`ffmpeg` 和 `ffprobe`）；
- 一个兼容的视频生成接口及使用者自己的 API Key；
- 可选 MeowLoad，用于粘贴链接导入。

```bash
git clone https://github.com/francoeur003/replication.git
cd replication
npm install
npm run setup:python
brew install ffmpeg
npm run doctor
npm start
```

如果 FFmpeg 已安装，可跳过 `brew install ffmpeg`。`npm run setup:python` 只创建仓库内的 `.venv`，不会修改系统 Python。

## 私人视频接口配置

源码运行时执行：

```bash
npm run configure
```

默认配置位置：

- Windows：`%APPDATA%\Replication\credentials.json`
- macOS / Linux：`~/.config/replication/credentials.json`

配置文件支持：`provider_name`、`api_base`、`upload_base`、`model`、`api_key` 和 `upload_token`。推荐直接使用 APP 左侧“视频接口”，密钥会进入系统加密存储；命令行配置文件仅用于便携版兼容。

也可使用环境变量：

```bash
export VIDEO_INTERFACE_NAME="My video provider"
export VIDEO_API_BASE="https://video-api.example.com/v1"
export VIDEO_UPLOAD_BASE="https://upload-api.example.com/v1"
export VIDEO_API_MODEL="your-video-model"
export VIDEO_API_KEY="..."
export VIDEO_UPLOAD_TOKEN="..."
```

如需修改配置文件位置，可设置 `REPLICATION_CREDENTIALS_FILE`。请勿把真实值提交进仓库。

## 测试

```bash
npm run doctor
npm test
npm start
```

本地集成测试只准备 3 份 dry-run 合约，不会提交付费任务：

```bash
npm run test:integration -- \
  "/absolute/path/to/vertical-video.mp4" \
  "/absolute/path/to/person.png" \
  "/absolute/path/to/voice.mp3"
```

## 构建

macOS Apple silicon：

```bash
npm run build:mac
```

Windows x64 请在 PowerShell 中运行：

```powershell
npm run prepare:win-runtime
npm run build:win
```

GitHub Actions 工作流会在真实 Windows runner 上完成依赖下载、SHA-256 校验、单元测试、依赖自检、打包、应用启动截图和 ZIP 产出。

## 付费边界

准备合约是本地免费操作。提交一次运行会通过当前视频接口创建恰好 3 个外部任务，可能产生费用。

APP 会保持在 `waiting_authorization`，直到使用者明确确认当前这 3 条任务。只有真实 MP4 已下载且通过媒体校验后才会显示成功；关闭 APP 不会自动重复提交。

## 第三方运行组件

Windows 便携包使用：

- [Python Windows embeddable package](https://docs.python.org/3.13/using/windows.html)，Python Software Foundation License；
- [FFmpeg](https://ffmpeg.org/download.html) 推荐的 Windows essentials build，随包保留许可证；
- `requests` 及依赖，许可证保留在各自的 `.dist-info` 目录。
