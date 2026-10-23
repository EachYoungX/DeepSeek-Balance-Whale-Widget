# 鲸娘像素动画

此分支基于余额挂件 0.4.2 与 dsh-TUI 0.16.1。帧表包含 22 个动作、267 帧，运行时从插件包读取，无需联网获取动画。

## 安装

在固定的 Windows 工作目录运行：

```powershell
dsh plugin --profile web add link:.
```

重启 `dsh web` 并刷新浏览器。包名沿用 `dsh-whale-widget`，作为原挂件的定制版本安装。角色菜单保留原角色与自定义图片入口。

## 维护

`upstream.lock.json` 记录两个上游的精确版本、提交与素材 SHA-256。以下命令分别验证本地资源和重新获取已锁定资源：

```powershell
node scripts/sync-whale-girl.mjs --check
node scripts/sync-whale-girl.mjs
```

下载脚本支持 `HTTPS_PROXY`；设置代理时调用系统 curl。更新素材时先审查新版本，再修改锁文件与对应校验值。

本地 Git 的 `upstream` 指向余额挂件原仓库，`pixel-animation` 承载本分支的改动。更新时获取选定的上游提交，重放定制提交，再完成资源校验、测试与交互验收。推送由维护者手动执行。

来源和许可范围见 [NOTICE](../NOTICE.md) 与 [PROVENANCE](../PROVENANCE.md)，贡献者见 [CONTRIBUTORS](CONTRIBUTORS.md)。
