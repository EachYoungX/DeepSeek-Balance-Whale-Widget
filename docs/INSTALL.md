# 安装、迁移与回退

本分支是原余额挂件的完整定制版，包名、bundle 名和插件行标识均为 `dsh-whale-widget`。在每个 profile 中选择一个版本即可。

当前基线为原挂件 `0.4.2`。后续上游更新由维护者集成、验证后发布新的 `pixel` 版本；已安装用户沿本分支 Release 更新。独立的外观插件需要上游提供稳定的渲染扩展接口，目前的发行形式是完整定制包。

## 先确认已有功能

DSH 自带的“账号与余额”设置继续保留。这里需要切换的是额外安装的 `dsh-whale-widget` 包；其它包名的余额插件分别管理，如果只需要一个悬浮挂件，可停用重复的界面。

Web 和 Desktop 分别使用自己的 profile；在 Web 安装的包不会自动进入 Desktop。

## 已有原余额挂件

1. 在当前 profile 的插件管理器中记录原包版本、安装来源及启用状态，保留可用的原安装包或来源地址。
2. 备份当前 `DSH_HOME` 下的挂件数据：`.dshw-*.json`、已有的 `whale-roles/`、`whale-audio/`、`whale-bubble-imgs/`。通常 `DSH_HOME` 为 `%USERPROFILE%/.dsh`；使用自定义位置时以实际位置为准。
3. 下载本分支 Release 的完整安装包，并核对 `SHA256SUMS.txt`。
4. 使用官方管理器移除 `dsh-whale-widget` 包，然后安装本分支。移除插件包与手工清理挂件数据是两件事，迁移过程保留第 2 步的数据。
5. 完全退出客户端或 Web 宿主后重启，核对菜单中的 `pixel` 版本、余额和个人设置。

部分新版 DSH 的 HMR 会以 `already-installed` 拒绝覆盖已安装包，官方迁移方式是先 `remove_bundle`，再 `install_bundle`。详细依据见 [官方升级说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/upgrade-guide/v0.2.1-alpha.2/plugin-install-over-installed/guide.md)。卸载完成而新安装失败时，可用第 1 步保留的来源重装原版。

本分支沿用原挂件的用户数据路径和格式，因此无需导入账本。已有的个性化音量保持原值；20% 是新安装和“恢复默认”的音量。首次迁移后的实际数据应由用户按第 5 步核对。

## Desktop：完整目录安装

将 `dsh-whale-pixel-<版本>.zip` 解压到固定的新目录。ZIP 内的 `dsh-whale-pixel/` 才是插件根目录，其中包含 `package.json`、`cordis.patch.yml`、`lib/` 和 `assets/`。

在 Desktop 官方插件页面使用本地目录来源；也可以在启用了 `plugin_manager` 的会话中提出明确的安装请求：

```text
请列出当前 Desktop profile 的 bundles。记录已安装的 dsh-whale-widget 来源；
若存在，通过 plugin_manager 移除该 bundle，然后安装
link:D:/DSHPlugins/dsh-whale-pixel
并启用。保留 DSH_HOME 下的账本、角色和设置，核对安装后的版本及应用状态。
```

将示例路径换成实际目录。管理器要求授权时在 DSH 中完成相应确认。安装后完全退出 Desktop（含托盘）再启动。链接目录需持续保留；移动目录后要重新指定来源。通过当前 profile 的官方管理器管理插件的行为见 [DSH 官方说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.zh.md)。

更新时把新 ZIP 解压到另一个版本目录，再通过管理器切换来源。旧目录可保留供回退。开发者对已链接工作目录的代码更新，重启加载即可。

## Web：标准安装包

退出使用目标 profile 的 DSH。在已安装原版的情况下，先移除包再安装本地压缩包：

```powershell
dsh plugin --profile web remove dsh-whale-widget
dsh plugin --profile web add "D:/Downloads/dsh-whale-widget-0.4.2-pixel.4.tgz"
dsh web
```

首次安装跳过 `remove`。本地开发可将 `add` 的目标改为 `link:<源码绝对路径>`。CLI 将插件操作转给当前 profile 的包管理器，路径与压缩包按实际包名登记，见 [官方 CLI 参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md)。

## 回退原版

通过同一 profile 的管理器移除本分支的 `dsh-whale-widget`，重新安装迁移前记录的来源与版本，保留挂件用户数据，然后重启并核对。需要回到迁移前的精确数据时，退出 DSH 后恢复自行保存的备份。

更换包管理来源比合并安装目录更可靠：旧文件可以随原包移除，依赖清单也记录实际版本；手工覆盖包管理器内部目录可能在下次安装时被重建。维护补丁主要供开发者在固定上游基线上重放改动，面向普通用户发行完整安装包。
