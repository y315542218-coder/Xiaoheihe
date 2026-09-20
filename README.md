---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'd6605cdc-cea0-429f-88bb-227e3d1d70a4'
  PropagateID: 'd6605cdc-cea0-429f-88bb-227e3d1d70a4'
  ReservedCode1: '194acc1d-4f0c-416e-8400-2cec18f04029'
  ReservedCode2: '194acc1d-4f0c-416e-8400-2cec18f04029'
---

# 小黑盒 VS Code 摸鱼模式

把 [小黑盒](https://www.xiaoheihe.cn/) 社区页面伪装成 VS Code 暗色编辑器界面，老板路过以为你在写代码。

纯前端换肤，不修改页面任何 DOM 结构，不拦截请求，不动页面逻辑，随时一键还原。

## 截图

<!-- 在这里放截图，建议用相对路径引用 images/ 目录 -->

![首页效果](home.png)
![详情页效果](detail.png)
![Boss 模式](boss-mode.png)

## 功能

- **VS Code 暗色主题**：One Dark Pro 配色（可切换 Dark+ / Monokai / One Dark 三套主题）
- **帖子列表代码化**：CSS 行号 + 标题加引号（字符串字面量）+ 摘要加 `//`（行注释）+ 用户名加 `@`（函数名风格）
- **侧边栏文件树**：帖子分类伪装成文件夹，帖子标题伪装成 `.ts` / `.py` / `.md` 等代码文件
- **顶部 Tab 栏**：当前页面显示为打开的文件标签，带未保存圆点
- **底部状态栏**：Git 分支、问题计数、光标行列（跟随滚动实时变化）、编码、语言类型
- **右侧缩略图**：模拟 VS Code minimap
- **面包屑导航**：`src › modules › bbs › post.ts › renderContent()`
- **图片占位图标**：帖子配图显示 `{ }`、头像显示 `@`、正文图片显示 `< />`，鼠标悬停显示原图
- **Boss 模式**：按 `Ctrl + ~` 瞬间切换到假代码编辑器，显示一段带语法高亮的 TypeScript 代码 + 终端输出
- **命令面板**：按 `Ctrl + Shift + P` 打开，搜索跳转、切换主题、切换图片模式等
- **标签页伪装**：浏览器标签页标题改为 `xxx.ts - xiaoheihe - Visual Studio Code`，图标改为代码图标
- **评论区代码化**：评论加行号 + `//` 注释前缀
- **分类栏 Tab 化**：帖子分类按钮变为 VS Code 横向 Tab 风格

## 安装

1. 在浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 插件
2. 点击 Tampermonkey 图标 → 创建新脚本
3. 将 `小黑盒VSCode摸鱼模式.user.js` 的全部内容粘贴进去
4. 保存（`Ctrl + S`），访问 [xiaoheihe.cn](https://www.xiaoheihe.cn/) 即自动生效

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + ~` | 切换 Boss 模式（瞬间显示/隐藏假代码编辑器） |
| 双击 `Esc` | 同上 |
| `Ctrl + Shift + P` | 打开命令面板（搜索跳转、切换设置） |
| `Ctrl + Alt + V` | 换肤总开关（完全还原页面） |

## 命令面板

按 `Ctrl + Shift + P` 打开，支持模糊搜索：

- Boss 模式：显示/隐藏假编辑器
- 换肤：开启 / 关闭（完全还原页面）
- 主题：切换配色（Dark+ / Monokai / One Dark）
- 视图：显示/隐藏缩略图、面包屑
- 图片：占位图标 / 半透明 / 原样显示
- 字体：等宽字体开关
- 标签页伪装：标题 + 图标开关
- 转到：首页各分类、导航链接

## 工作原理

脚本分为两层，互不干涉：

### CSS 换肤层（承担全部视觉变化）

- 用 `!important` 覆盖站点原有样式，切换主题时只替换 CSS 变量
- 代码装饰用 `::before` / `::after` 伪元素实现（引号、`//` 注释、`@` 符号等）
- 行号用 CSS 计数器（`counter-reset` / `counter-increment`），不修改 DOM
- 图片只改 `opacity`，不动 `width` / `height` / `display`，保证布局与懒加载不受影响
- 隐藏原导航栏与右侧推广位（精确 class 选择器，不用结构选择器）

### JS 外壳层（只创建 fixed 覆盖层）

- 侧边栏、Tab 栏、状态栏、缩略图、命令面板、Boss 覆盖层全部是 `position: fixed` 的独立元素
- 不 `remove` / `move` / `wrap` 页面任何节点
- `Ctrl + Alt + V` 随时把页面还原成原样

### 设计原则

> 换肤类脚本的唯一安全形态是「CSS 全责 + JS 只搭框架」。不修改页面 DOM 结构是底线——SPA 框架的虚拟 DOM 映射一旦被破坏，轻则样式错乱，重则页面直接打不开。

## 已知限制

- 详情页可能有个别小区域残留白底（CSS 规则未覆盖到的 class），不影响使用
- 图片占位图标在部分懒加载场景下可能延迟出现
- 纯 CSS 换肤无法改变文字内容本身（帖子正文仍是原文，不会变成代码）

## 技术要点

### 为什么不用 JS 扫描 `getComputedStyle` 逐个改色？

v3.5 之前有一套 JS 兜底扫描器，遍历页面上每个元素、调用 `getComputedStyle` 检查背景色是否为白色然后改色。首页帖子少不卡，但详情页评论区有上万层嵌套节点，上万次 `getComputedStyle` 强制浏览器同步重算样式，直接把主线程打满——表现为页面转圈不停、风扇狂转、返回键点不动。

v3.6.0 彻底移除了整个 JS 扫描引擎和 `MutationObserver`，换肤完全由 CSS 承担。

### 为什么 `@run-at document-start`？

在 `document-start` 时注入 CSS（`<style>` 标签），让暗色主题在页面渲染前就生效，避免白屏闪烁。JS 逻辑（外壳构建、事件绑定）延迟到 `window.load` 后 800ms 启动，不与 Vue 首屏渲染抢 CPU。

### localStorage 配置兼容

旧版本可能将已废弃的配置项（如 `deepScan`）缓存在 localStorage 中，脚本启动时 `delete cfg.deepScan` 强制清除，避免旧值覆盖新默认值导致已废弃的扫描器继续运行。

## 浏览器兼容

- Chrome / Edge（Chromium 内核）
- 需安装 Tampermonkey 4.x+
- 理论兼容 Firefox + Greasemonkey（未测试）

## 版本历史

| 版本 | 主要变更 |
|------|----------|
| 3.6.0 | 彻底移除 JS 扫描引擎和 MutationObserver，换肤纯 CSS 化，根除详情页卡死 |
| 3.5.0 | deepScan 默认关闭，JS 逻辑延迟到 load 后启动 |
| 3.4.x | rAF → requestIdleCallback，扫描代际守卫，子树元素上限 |
| 3.3.0 | body padding 让位，图片定位不碰，@match 补全域名，Observer 忽略自家 UI |
| 2.0.0 | 重写为纯换肤架构（CSS 全责 + JS 只搭框架） |
| 1.0.0 | 初版：JS 隐藏原元素 + 插入代码化副本 |

## License

MIT
