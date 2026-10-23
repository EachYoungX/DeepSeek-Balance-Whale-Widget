# 发行与下载附件

本 fork 使用 GitHub Releases 分发完整安装包，保持 `dsh-whale-widget` 包名以承接已有安装。版本采用 `0.4.2-pixel.N`，与原版版本区分。`package.json` 的 `private: true` 保留；同包名表达替换关系，npm 注册表中的原项目归原维护者发布。

## 准备

1. 同步 `package.json` 与 `lib/index.js` 中的版本号，并更新相关使用说明。
2. 运行 `npm run check` 和浏览器验收；涉及宿主接入时再做真实 DSH 加载验证。
3. 提交本次发行需要的变更。`README.upstream.md` 保存锁定基线的原文，分支功能、安装和声明写入自己的 README 与 `docs/`。
4. 运行 `npm run release:bundle`，产物位于 `.test-output/release/<版本>/`。

打包脚本从当前提交导出一个独立目录，再执行 `npm pack`。这样能排除工作区中未跟踪的其它文件，发行内容与提交一致。已跟踪文件存在未提交改动时脚本停止，避免把尚未提交的内容误当作发行内容。

## 附件

| 文件 | 内容 |
|---|---|
| `dsh-whale-widget-<版本>.tgz` | 标准插件包，供 DSH / pnpm 安装 |
| `dsh-whale-pixel-<版本>.zip` | 当前提交的完整源码目录，Desktop 可解压到新目录后按 `link:` 安装 |
| `SHA256SUMS.txt` | 两个压缩包的 SHA-256 |

附件名包含版本，便于缓存、校验和回退。ZIP 使用固定内部目录名 `dsh-whale-pixel/`，用户可自行选择版本化的父目录。用户数据保存在 DSH 的数据目录，发行包仅含代码、素材与公开文档。

普通用户按 [安装指南](INSTALL.md) 切换同名包。维护者使用的 `npm run patches` 保留提交作者，供更新上游基线时重放定制改动。

## 手动发布

维护者手动推送提交后，在 GitHub Actions 的发行工作流中选择 `pixel-animation` 或已包含定制版的 `main`。默认执行演练，检查和附件构建均通过后，通过 Actions artifact 下载产物审阅；正式运行时取消演练选项，创建对应 `v<版本>` 的 Release 并上传附件。

也可以在 GitHub 网页创建指向本次提交的 Release，手动上传上述三个文件。Release 说明应包含新增功能、测试范围、已有用户迁移入口和已知限制。发行工作流只发布 GitHub Release，本地构建只生成文件；Git 推送继续由维护者手动执行。
