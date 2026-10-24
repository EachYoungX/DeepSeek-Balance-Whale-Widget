# 来源说明

本项目基于 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) 的 0.4.2 开发。原作者与原仓库贡献者的声明见 `LICENSE`、`PROVENANCE.md` 和 Git 提交历史。

鲸娘动画帧表取自 [ccch1mneyyy/dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) 0.16.1，具体提交和 SHA-256 见 `upstream.lock.json`；随附该仓库的 MIT 文本 `assets/whaleGirl/LICENSE.dsh-TUI` 和素材来源说明 `assets/whaleGirl/README.upstream.md`。动画语义映射和帧时序实现参考该仓库的 `skins.tsx`、`deepy.ts` 等代码。

上游说明这些动画由用户提供的鲸娘表情包 GIF 转换，属于非官方作品。此处保留来源信息；随附仓库许可不等于已独立确认原始 GIF 与角色形象的全部权利。原始余额挂件的图片、动图和音效继续适用原 `PROVENANCE.md` 的 as-is 范围。来源说明与移除承诺本身不构成额外授权。

新增播放器、状态机、适配器与维护脚本采用 MIT 许可。贡献者与 AI 参与范围见 `docs/CONTRIBUTORS.md`。

`0.4.2-pixel.4` 内置 [TakWolf/Fusion Pixel](https://github.com/TakWolf/fusion-pixel-font) `2026.09.01` 的 12px 比例宽度简体中文 WOFF2，字体文件保持原样，使用 SIL Open Font License 1.1。完整版权、许可与组成来源声明随包保留在 `assets/fonts/fusion-pixel/OFL.txt` 和 `LICENSES/`，固定归档与文件 SHA-256 见 `upstream.lock.json` 的 `pixelFont` 字段。

自 `0.4.2-pixel.2` 起，同时随包保留同一 dsh-TUI 提交下的 `assets/whaleGirl/img/` 原始 PNG 帧与 `timings.json`，用于保留图像细节和透明边缘。每个文件的校验值均写入锁文件，继续沿用上面的素材来源和许可范围说明。
