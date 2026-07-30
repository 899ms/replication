Replication 0.3.0 · Windows x64 便携版
=======================================

首次使用
1. 把 ZIP 完整解压到一个普通文件夹；不要直接在压缩包预览里运行。
2. 双击 Configure-Account.cmd。
3. 输入你自己的筷子 / Seedance 账号信息。
4. 双击 Replication.exe。

已经内置
- Python 3.13 与 requests
- FFmpeg / ffprobe
- Replication 生成运行脚本

不会包含
- 开发者的 API Key、Token、账号、密码或 Cookie
- 你的账号信息（配置后只保存在当前 Windows 用户的 AppData 中）
- MeowLoad（仅“粘贴视频链接导入”需要；直接选择本地视频不需要）

安全与付费
- 准备三条生成任务是本地操作，不会付费。
- 只有在 APP 中明确确认本次三条任务后，才会提交到外部 Seedance 服务。
- 生成成功必须下载到真实 MP4 并通过视频校验。

Windows 提示
- 当前发布包未购买代码签名证书，Windows SmartScreen 可能显示“未知发布者”。
- 请只从 https://github.com/francoeur003/replication/releases 下载。

第三方组件
- Python: https://www.python.org/ ，Python Software Foundation License
- FFmpeg: https://ffmpeg.org/ ，随包附带 LICENSE；本包使用独立 FFmpeg 可执行文件
- requests 及其依赖的许可证保存在 Python\Lib\site-packages 对应的 dist-info 目录
