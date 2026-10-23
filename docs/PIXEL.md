# 鲸娘像素动画

此分支基于余额挂件 0.4.2 与 dsh-TUI 0.16.1。帧表包含 22 个动作、267 帧，运行时从插件包读取，无需联网获取动画。

`0.4.2-pixel.2` 默认播放上游 `img/` 中 301×288 的原始透明 PNG 帧。42×30 字符格仅保留时序与故障回退用途；它是终端兼容素材，无法保留原始表情包的面部与服饰细节。PNG 素材约增加 11.7 MB，均锁定 SHA-256。小黄鸭按压 / 松开音量的新用户默认值与“恢复默认”统一为 20%；已保存的个人音量继续优先。

## 安装

在固定的 Windows 工作目录运行：

```powershell
dsh plugin --profile web add link:.
```

重启 `dsh web` 并刷新浏览器。包名沿用 `dsh-whale-widget`，作为原挂件的定制版本安装。角色菜单保留原角色与自定义图片入口。

DeepSeek Harness Desktop 使用其内置 `plugin_manager` 接入本目录，保持 `link:` 安装即可加载修改后的代码和资源。此次升级新增 PNG 路由，需完全退出桌面客户端（含托盘）后重开；客户端菜单版本应为 `0.4.2-pixel.2`。

首次使用默认开启像素动画。打开挂件菜单，点击“像素动画：开 / 关”切回原角色；选择自定义图片时显示该图片，返回默认角色时恢复像素动画。开关使用浏览器本地存储保存。

## 动作与事件

| 事件 | 动作 |
|---|---|
| 静置 | idle、东张西望、爱心待机；10 秒无操作后 sleeping |
| 睡眠后收到工作或交互 | waking，再进入工作或点击动作 |
| 按压左 / 右半边 | poke-left / poke-right，随显示镜像换算 |
| 1.2 秒内连续按压三次 | tickle |
| 拖拽 | drag；松开或取消后返回当前状态 |
| 首次 / 手动刷新余额 | thinking；后台无变化的余额刷新不打断睡眠 |
| 同币种余额上涨 | thumbs-up |
| 余额请求失败 | error |
| 余额预警、预算提醒、每轮消耗提示 | notification |
| DSH turn / step 开始、推理流 | thinking |
| DSH 文本输出流、工具执行 | typing |
| 提问或授权等待 | notification；处理完成后解除 |
| 上下文压缩 | compacting |
| 两个主会话 / 一个子代理 | music |
| 三个以上主会话 | building |
| 两个以上子代理 | conducting |
| 主会话完成 / 出错 | thumbs-up / error，播完后返回当前状态 |

帧表保存全部 22 个动作，自动触发范围以表中事件为准。TUI 的终端分层渲染与 git 分支变更反应未移植到 Web。会话状态来自插件启用后收到的事件；为限制异常残留状态，30 分钟未收到事件的工作项会过期。

播放器按每帧 `dur` 调度，按动画惰性解码原始 PNG，解码缓存上限 32 MB；切换动作时保留上一张清晰帧直至新动作就绪。canvas 按屏幕像素密度配置尺寸，关闭平滑插值，避免先降成字符格再放大。页面隐藏或选择其它角色时暂停绘制。原生帧在首次解码时提取 alpha 命中掩码；若浏览器阻止 canvas 读回，使用限定在图像矩形内的回退判定。

## 代码边界

- `assets/pixel-core.js`：帧表校验、时序、语义回落、交互优先级和睡眠状态机。
- `assets/pixel-raster.js`：原始 PNG 加载、逐动画解码缓存、高清绘制与 alpha 命中掩码。
- `assets/pixel-adapter.js`：canvas、透明命中、菜单开关、角色切换与绘制生命周期。
- `lib/pixel-animation.mjs`：DSH 事件聚合，输出语义、计数与修订号。
- `assets/whale-widget.js` / `lib/index.js`：少量桥接调用、受原信任栅栏保护的素材路由与脚本加载。

语义数据随既有 `wait.json` 轮询返回，沿用每秒一次的周期。脚本前缀与原客户端在同一响应中加载，兼容 Web 和桌面端原有注入路径；桌面端需单独人工验收。

## 维护

`upstream.lock.json` 记录两个上游的精确版本、提交与素材 SHA-256。以下命令分别验证本地资源和重新获取已锁定资源：

```powershell
node scripts/sync-whale-girl.mjs --check
node scripts/sync-whale-girl.mjs
```

下载脚本支持 `HTTPS_PROXY`；设置代理时调用系统 curl。更新素材时先审查新版本，再修改锁文件与对应校验值。

本地 Git 的 `upstream` 指向余额挂件原仓库，`pixel-animation` 承载本分支的改动。更新时获取选定的上游提交，重放定制提交，再完成资源校验、测试与交互验收。推送由维护者手动执行。

```powershell
npm run check
npm run preview
npm run patches
```

`preview` 在 `http://127.0.0.1:3081` 运行真实挂件客户端，使用隔离的模拟余额和会话事件。浏览器验收脚本为 `npm run test:browser`，需本机提供 Playwright；可用 `PIXEL_PLAYWRIGHT_PATH` 指定现有 Playwright 包路径。预览与截图保存在忽略目录 `.test-output`。

`patches` 将锁定余额挂件提交之后的定制提交导出为 `.test-output/pixel-animation.patch`，保留每个提交的作者，可在相同基线上用 `git am` 重放。迁移到新版本时先检查接入点，再重放并验收。

当前 `origin` 指向 `EachYoungX/DeepSeek-Balance-Whale-Widget`，`upstream` 指向 `MeteorNOX/DeepSeek-Balance-Whale-Widget`。GitHub Desktop 选择“我自己用”，在 `pixel-animation` 分支点击“Publish branch”即可发布定制分支。推送登录仍使用维护者自己的 GitHub 账号；提交作者由每条 commit 中的署名决定。

来源和许可范围见 [NOTICE](../NOTICE.md) 与 [PROVENANCE](../PROVENANCE.md)，贡献者见 [CONTRIBUTORS](CONTRIBUTORS.md)。
