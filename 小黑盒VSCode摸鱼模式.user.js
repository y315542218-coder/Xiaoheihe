// ==UserScript==
// @name         小黑盒 VS Code 摸鱼模式
// @namespace    https://www.xiaoheihe.cn/
// @version      3.6.0
// @description  纯前端换肤：把小黑盒渲染成深色代码编辑器外观。不改任何 DOM 结构、不拦截请求、不动页面逻辑，随时一键还原。Ctrl+` Boss 模式 / Ctrl+Shift+P 命令面板 / Ctrl+Alt+V 开关换肤。
// @author       TeleAgent
// @match        https://xiaoheihe.cn/*
// @match        https://*.xiaoheihe.cn/*
// @match        http://xiaoheihe.cn/*
// @match        http://*.xiaoheihe.cn/*
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  /* ================================================================
   * 0. 设计原则（改动前请先读）
   * ----------------------------------------------------------------
   * a. 只做“外观层”：CSS 换肤 + 独立 fixed 覆盖层。
   *    绝不 remove / move / wrap / 重排页面任何节点。
   * b. 唯一会写入页面元素的是 inline background-color / color / border-color，
   *    全部登记在 touched 表里，关闭换肤时逐一还原。
   * c. 图片只改 opacity，不动 width/height/display，保证布局与懒加载不受影响。
   * d. 选择器一律用站点 class，禁止 div > div:last-child 这类结构选择器
   *    （站点一次改版就会连环崩）。
   * e. 任何时候 Ctrl+Alt+V 都能把页面还原成原样。
   * ================================================================ */

  /* ================================================================
   * 1. 配置（持久化到 localStorage）
   * ================================================================ */
  const LS_KEY = 'vscode-skin:cfg';

  const DEFAULTS = {
    enabled: true,          // 换肤总开关
    theme: 'dark-plus',     // dark-plus | monokai | one-dark
    mono: true,             // 全站等宽字体
    minimap: true,          // 右侧缩略图
    breadcrumb: true,       // 面包包屑栏
    images: 'placeholder',  // placeholder(占位图标, 悬停显图) | dim(半透明) | raw(原样)
    fakeTitle: true,        // 伪装标签页标题
    fakeFavicon: true,      // 伪装标签页图标
    bossOnBlur: false,      // 窗口失焦自动进入 Boss 模式
  };

  // v3.6.0：彻底移除 deepScan。旧版 localStorage 里可能还存着 deepScan:true，
  // 它会通过 Object.assign 覆盖新默认值，导致已废弃的 JS 扫描器继续运行 → 卡死。
  // 这里强制清除旧配置，确保干净启动。
  const cfg = Object.assign({}, DEFAULTS, readCfg());
  delete cfg.deepScan;     // 强制删除旧版遗留的 deepScan
  saveCfg();

  function readCfg() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (_) { return {}; }
  }
  function saveCfg() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (_) {}
  }

  /* ================================================================
   * 2. 主题调色板
   * ================================================================ */
  const THEMES = {
    'dark-plus': {
      name: 'Dark+',
      editor: '#1e1e1e', panel: '#252526', activity: '#333333', status: '#007acc',
      border: '#3c3c3c', chip: '#2d2d2d', hover: '#2a2d2e', line: '#2d2d2d',
      text: '#d4d4d4', lineNum: '#858585',
      comment: '#6a9955', string: '#ce9178', keyword: '#569cd6', ctrl: '#c586c0',
      fn: '#dcdcaa', varc: '#9cdcfe', num: '#b5cea8', type: '#4ec9b0',
    },
    'monokai': {
      name: 'Monokai',
      editor: '#272822', panel: '#2d2e27', activity: '#1e1f1c', status: '#75715e',
      border: '#3e3d32', chip: '#3a3b32', hover: '#34352c', line: '#3e3d32',
      text: '#f8f8f2', lineNum: '#75715e',
      comment: '#75715e', string: '#e6db74', keyword: '#f92672', ctrl: '#f92672',
      fn: '#a6e22e', varc: '#66d9ef', num: '#ae81ff', type: '#66d9ef',
    },
    'one-dark': {
      name: 'One Dark',
      editor: '#282c34', panel: '#21252b', activity: '#1b1f24', status: '#4d78cc',
      border: '#3e4451', chip: '#333842', hover: '#2c313a', line: '#3a3f4b',
      text: '#abb2bf', lineNum: '#5c6370',
      comment: '#5c6370', string: '#98c379', keyword: '#c678dd', ctrl: '#c678dd',
      fn: '#61afef', varc: '#e06c75', num: '#d19a66', type: '#e5c07b',
    },
  };
  const themeOf = () => THEMES[cfg.theme] || THEMES['dark-plus'];

  const MONO_STACK = "Consolas, 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace";

  /* ================================================================
   * 3. 变量层 CSS（换主题时只替换这一段，不重排整张样式表）
   * ================================================================ */
  function buildVars() {
    const T = themeOf();
    return `
    :root {
      --vsc-editor:${T.editor}; --vsc-panel:${T.panel}; --vsc-activity:${T.activity};
      --vsc-status:${T.status}; --vsc-border:${T.border}; --vsc-chip:${T.chip};
      --vsc-hover:${T.hover}; --vsc-line:${T.line};
      --vsc-text:${T.text}; --vsc-num-col:${T.lineNum};
      --vsc-comment:${T.comment}; --vsc-string:${T.string}; --vsc-keyword:${T.keyword};
      --vsc-ctrl:${T.ctrl}; --vsc-fn:${T.fn}; --vsc-var:${T.varc}; --vsc-number:${T.num};
      --vsc-type:${T.type};
      --vsc-font:${MONO_STACK};

      --vsc-act-w:48px;
      --vsc-side-w:192px;
      --vsc-tab-h:35px;
      --vsc-crumb-h:22px;
      --vsc-status-h:22px;
      --vsc-mini-w:64px;
      --vsc-left:calc(var(--vsc-act-w) + var(--vsc-side-w));
      --vsc-top:calc(var(--vsc-tab-h) + var(--vsc-crumb-h));
    }
    html:not([data-vsc-crumb="1"]) { --vsc-crumb-h:0px; }
    html:not([data-vsc-mini="1"])  { --vsc-mini-w:0px; }
    /* 注意：这里必须写 :root 而不是 html —— :root 是伪类(0,1,0)，
       优先级高于类型选择器 html(0,0,1)，用 html 会被上面的 :root 压住，
       媒体查询等于白写，窄屏下正文仍按 240px 缩进。 */
    @media (max-width: 1100px) { :root { --vsc-mini-w:0px; } }
    @media (max-width: 900px)  { :root { --vsc-side-w:0px; } }
    `;
  }

  /* ================================================================
   * 4. 主样式表
   *    只在 <html data-vsc="on"> + <body class="vscode-mode"> 下生效，
   *    关掉开关即整体失效，页面瞬间还原。
   * ================================================================ */
  const CSS = `
  /* ---------- 4.1 底色：压掉站点自带的 rgb(247,248,249) 浅色底 ---------- */
  html[data-vsc="on"] { background: var(--vsc-editor) !important; }

  body.vscode-mode,
  body.vscode-mode > div,
  body.vscode-mode > div > main,
  body.vscode-mode > div > main > section,
  body.vscode-mode > div > main > section > *,
  body.vscode-mode > div > main > div,
  body.vscode-mode > div > main > div > *,
  body.vscode-mode main.list,
  body.vscode-mode .bbs-community__search-module,
  body.vscode-mode .search-input-wrap,
  body.vscode-mode .content,
  body.vscode-mode .hb-cpt__scroll-list,
  body.vscode-mode .bbs-home__content-list,
  body.vscode-mode .bbs-home__topic-list-wrapper,
  body.vscode-mode .hb-cpt__pagination,
  body.vscode-mode .hb-cpt__pagination-outer,
  body.vscode-mode .hb-cpt__pagination-inner {
    background: var(--vsc-editor) !important;
    color: var(--vsc-text) !important;
  }

  /* 站点在结构容器的 ::before/::after 上画了白色底板 → 透明化。
     只动结构容器，不动我们自己用 ::after 画图标的元素。 */
  body.vscode-mode main::before, body.vscode-mode main::after,
  body.vscode-mode main > section::before, body.vscode-mode main > section::after,
  body.vscode-mode main > section > *::before, body.vscode-mode main > section > *::after,
  body.vscode-mode main.list::before, body.vscode-mode main.list::after,
  body.vscode-mode .content::before, body.vscode-mode .content::after,
  body.vscode-mode .bbs-community__search-module::before, body.vscode-mode .bbs-community__search-module::after,
  body.vscode-mode .search-input-wrap::before, body.vscode-mode .search-input-wrap::after,
  body.vscode-mode .bbs-home__topic-list-wrapper::before, body.vscode-mode .bbs-home__topic-list-wrapper::after,
  body.vscode-mode .hb-cpt__pagination::before, body.vscode-mode .hb-cpt__pagination::after,
  body.vscode-mode .hb-cpt__pagination-outer::before, body.vscode-mode .hb-cpt__pagination-outer::after,
  body.vscode-mode .hb-cpt__pagination-inner::before, body.vscode-mode .hb-cpt__pagination-inner::after,
  body.vscode-mode .hb-cpt__scroll-list::before, body.vscode-mode .hb-cpt__scroll-list::after,
  body.vscode-mode .bbs-home__content-list::before, body.vscode-mode .bbs-home__content-list::after,
  body.vscode-mode .bbs-home__content-item::before, body.vscode-mode .bbs-home__content-item::after,
  body.vscode-mode .hb-cpt__bbs-content::before, body.vscode-mode .hb-cpt__bbs-content::after,
  body.vscode-mode .bbs-list-content__header::before, body.vscode-mode .bbs-list-content__header::after,
  body.vscode-mode .link-comment::before, body.vscode-mode .link-comment::after,
  body.vscode-mode .link-comment__list::before, body.vscode-mode .link-comment__list::after,
  body.vscode-mode .link-comment__comment-item::before, body.vscode-mode .link-comment__comment-item::after,
  body.vscode-mode .hb-article::before, body.vscode-mode .hb-article::after,
  body.vscode-mode .link-section-title::before, body.vscode-mode .link-section-title::after,
  body.vscode-mode .bbs-link__related-recommend::before, body.vscode-mode .bbs-link__related-recommend::after,
  body.vscode-mode .vsc-flat-pe::before, body.vscode-mode .vsc-flat-pe::after {
    background-color: transparent !important;
    background-image: none !important;
    box-shadow: none !important;
  }

  /* ---------- 4.2 字体 ---------- */
  body.vscode-mode { margin: 0 !important; }
  /* 字体：用 * 一把套上，再用一条覆盖规则把图标字体还回去。
     原来那串 *:not(svg):not(svg *):not(i):not([class*="icon" i])… 看着精确，
     但每个元素都要跑一遍带大小写无关子串匹配的 :not 链，
     而且站点每次 DOM 变动都会重算 —— 是本脚本最大的一笔常驻样式开销。
     单独一个 * 在 Blink 里反而是最快的一类选择器。 */
  html[data-vsc-mono="1"] body.vscode-mode,
  html[data-vsc-mono="1"] body.vscode-mode * { font-family: var(--vsc-font) !important; }
  html[data-vsc-mono="1"] body.vscode-mode i,
  html[data-vsc-mono="1"] body.vscode-mode .el-icon,
  html[data-vsc-mono="1"] body.vscode-mode .el-icon *,
  html[data-vsc-mono="1"] body.vscode-mode [class^="icon-"],
  html[data-vsc-mono="1"] body.vscode-mode [class*=" icon-"],
  html[data-vsc-mono="1"] body.vscode-mode svg,
  html[data-vsc-mono="1"] body.vscode-mode svg * { font-family: revert !important; }

  body.vscode-mode ::selection { background: #264f78; color: #fff; }

  /* 卡片投影在深色下全是脏白边，统一抹掉，再把输入框的还回来 */
  body.vscode-mode main *,
  body.vscode-mode [data-vsc-shell] * { box-shadow: none !important; }
  body.vscode-mode [data-vsc-ui], body.vscode-mode [data-vsc-ui] * { box-shadow: revert !important; }

  /* ---------- 4.3 布局：给编辑器外壳让位 ---------- */
  /* 让位：给 body 加内边距，而不是给某个容器加 margin。
     小黑盒首页有两个嵌套的 <main>（外层 max-width:1300 居中，
     内层 main.list 是 .content 这个 flex 容器里的一列），
     按 main 加 margin 会命中两次、左边距叠加成两倍，正文被推到屏幕右侧。
     改用 body padding：不管站点内部嵌了几层、用不用 main，
     整页可用宽度一次性收窄，居中容器自己会重新居中。 */
  body.vscode-mode {
    padding-left: var(--vsc-left) !important;
    padding-right: var(--vsc-mini-w) !important;
    padding-top: var(--vsc-top) !important;
    padding-bottom: var(--vsc-status-h) !important;
    box-sizing: border-box !important;
    background: var(--vsc-editor) !important;
    color: var(--vsc-text) !important;
  }
  body.vscode-mode main {
    background: var(--vsc-editor) !important;
    color: var(--vsc-text) !important;
  }
  body.vscode-mode main,
  body.vscode-mode main section,
  body.vscode-mode main .content,
  body.vscode-mode main.list,
  body.vscode-mode .hb-cpt__scroll-list,
  body.vscode-mode .bbs-home__content-list { background: transparent !important; }

  /* ---------- 4.4 隐藏原导航与右侧推广位 ----------
     nav 的功能由命令面板（Ctrl+Shift+P）接管，链接一个不丢。 */
  body.vscode-mode nav.nav,
  body.vscode-mode .cpt-right-side.right,
  body.vscode-mode .qr-section { display: none !important; }

  /* ---------- 4.5 帖子列表 → 代码行 ---------- */
  body.vscode-mode .bbs-home__content-list { counter-reset: vsc-line; }
  body.vscode-mode .bbs-home__content-item {
    position: relative;
    padding-left: 52px !important;
    background: transparent !important;
    border-bottom: 1px solid var(--vsc-line) !important;
    min-height: 24px;
  }
  body.vscode-mode .bbs-home__content-item:hover { background: var(--vsc-hover) !important; }
  body.vscode-mode .bbs-home__content-item::before {
    counter-increment: vsc-line;
    content: counter(vsc-line);
    position: absolute; left: 0; top: 6px;
    width: 44px; text-align: right; padding-right: 14px;
    color: var(--vsc-num-col); font-size: 13px; user-select: none;
  }
  body.vscode-mode .hb-cpt__bbs-content { background: transparent !important; }

  /* 标题 → 字符串字面量 */
  body.vscode-mode .bbs-content__title {
    color: var(--vsc-string) !important;
    font-size: 14px !important;
    background: transparent !important;
  }
  body.vscode-mode .bbs-content__title::before,
  body.vscode-mode .bbs-content__title::after { content: '"'; color: var(--vsc-string); }

  /* 摘要 → 行注释 */
  body.vscode-mode .bbs-content__content {
    color: var(--vsc-comment) !important;
    font-size: 13px !important;
    background: transparent !important;
  }
  body.vscode-mode .bbs-content__content::before {
    content: '// '; color: var(--vsc-comment); font-weight: bold;
  }

  /* 用户名 → 函数名 */
  body.vscode-mode .list-content__username { color: var(--vsc-fn) !important; }
  body.vscode-mode .list-content__username::before { content: '@'; color: var(--vsc-fn); margin-right: 1px; }

  body.vscode-mode .hb-level-tag__inner__text { color: var(--vsc-number) !important; }
  body.vscode-mode .bbs-new-style-bottom__rich-stack { background-color: var(--vsc-chip) !important; }
  body.vscode-mode .bbs-new-style-bottom__rich-node { color: var(--vsc-keyword) !important; }
  body.vscode-mode .bbs-new-style-bottom { color: var(--vsc-number) !important; background: transparent !important; }
  body.vscode-mode .bbs-list-content__header { background: transparent !important; }

  /* ---------- 4.6 图片：占位图标，悬停还原 ----------
     只改 opacity，尺寸与懒加载完全不动。 */
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-cpt__image img.hb-cpt__image-elem,
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-article img.img-item,
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-cpt-avatar img.hb-avatar__image {
    opacity: 0; transition: opacity .12s ease;
  }
  html[data-vsc-img="dim"] body.vscode-mode .hb-cpt__image img.hb-cpt__image-elem,
  html[data-vsc-img="dim"] body.vscode-mode .hb-article img.img-item {
    opacity: .28; transition: opacity .12s ease;
  }
  html[data-vsc-img="dim"] body.vscode-mode .hb-cpt__image:hover img.hb-cpt__image-elem,
  html[data-vsc-img="dim"] body.vscode-mode .hb-article .img-media:hover img.img-item { opacity: 1; }

  body.vscode-mode .hb-cpt__image--default { background: var(--vsc-chip) !important; }
  body.vscode-mode .hb-cpt__image--default svg { opacity: .4; }

  /* 不要动 .hb-cpt__image 的 position！
     小黑盒的帖子缩略图是「.bbs-content__imgs-wrapper 定 relative +
     每张图 absolute 到 left:0/194/388px」拼出来的瀑布流版式。
     早先版本把它改成 relative，等于把整排图打回普通文档流 —— 三张图竖着叠，
     版式全毁。站点自己已经定好位了，这里只负责上色，不碰定位。
     头像与正文配图在原站是 static，需要我们给个 relative 来承载占位伪元素。 */
  /* .img-media 在原站已经是 relative，无需覆写定位 */
  body.vscode-mode .hb-cpt-avatar { position: relative; }

  html[data-vsc-img="placeholder"] body.vscode-mode .hb-cpt__image::after,
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-article .img-media::after,
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-cpt-avatar::after {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--vsc-chip);
    border: 1px solid var(--vsc-border);
    border-radius: 2px;
    z-index: 1; pointer-events: none;
  }
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-cpt__image::after {
    content: '{ }'; color: var(--vsc-comment); font-size: 18px;
  }
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-article .img-media::after {
    content: '< />'; color: var(--vsc-fn); font-size: 20px;
  }
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-cpt-avatar::after {
    content: '@'; color: var(--vsc-string); font-size: 12px;
    border-radius: 50%; border: none;
  }
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-cpt__image:hover img.hb-cpt__image-elem,
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-article .img-media:hover img.img-item,
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-cpt-avatar:hover img.hb-avatar__image {
    opacity: 1; position: relative; z-index: 2;
  }
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-cpt__image:hover::after,
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-article .img-media:hover::after,
  html[data-vsc-img="placeholder"] body.vscode-mode .hb-cpt-avatar:hover::after { content: none; }

  body.vscode-mode .hb-cpt-avatar__avatar-decoration { opacity: 0; }

  /* 勋章/角标等碎图：隐藏但保留占位 */
  html[data-vsc-img="placeholder"] body.vscode-mode img.list-content__medal,
  html[data-vsc-img="placeholder"] body.vscode-mode img.link-user__medal,
  html[data-vsc-img="placeholder"] body.vscode-mode img.bbs-new-style-bottom__rich-image,
  html[data-vsc-img="placeholder"] body.vscode-mode img.content-tag-icon,
  html[data-vsc-img="placeholder"] body.vscode-mode img.info-box__medal-item-image,
  html[data-vsc-img="placeholder"] body.vscode-mode img.nav-user-avatar,
  html[data-vsc-img="placeholder"] body.vscode-mode img.bbs-home__topic-item-icon { opacity: 0; }

  /* ---------- 4.7 分类栏 → 编辑器横向 Tab ---------- */
  body.vscode-mode .bbs-home__topic-list-wrapper,
  body.vscode-mode .hb-cpt__pagination,
  body.vscode-mode .hb-cpt__pagination-outer,
  body.vscode-mode .hb-cpt__pagination-inner { background: transparent !important; }

  /* 分类行整体压成一条编辑器 Tab 带 */
  body.vscode-mode .bbs-home__topic-list-wrapper {
    border-bottom: 1px solid var(--vsc-border) !important;
    padding: 0 !important;
    margin-bottom: 4px !important;
  }

  body.vscode-mode button.bbs-home__topic-item {
    background: transparent !important;
    color: var(--vsc-num-col) !important;
    border: none !important;
    border-bottom: 2px solid transparent !important;
    border-radius: 0 !important;
    font-size: 13px !important;
    padding: 6px 14px !important;
  }
  body.vscode-mode button.bbs-home__topic-item:hover {
    color: var(--vsc-text) !important; background: var(--vsc-panel) !important;
  }
  body.vscode-mode button.bbs-home__topic-item.is-active,
  body.vscode-mode button.bbs-home__topic-item.active {
    color: var(--vsc-text) !important;
    border-bottom-color: var(--vsc-status) !important;
  }

  /* ---------- 4.8 Element Plus 组件暗色化 ---------- */
  body.vscode-mode .search-input-wrap { background: transparent !important; }
  body.vscode-mode .el-input__wrapper {
    background-color: var(--vsc-chip) !important;
    box-shadow: none !important;
    border: 1px solid var(--vsc-border) !important;
    border-radius: 2px !important;
  }
  body.vscode-mode .el-input__inner { color: var(--vsc-text) !important; }
  body.vscode-mode .el-input__inner::placeholder { color: var(--vsc-num-col); }
  body.vscode-mode .el-input__suffix .el-icon,
  body.vscode-mode .el-input__suffix svg { color: var(--vsc-num-col) !important; }
  body.vscode-mode .el-popper {
    background: var(--vsc-panel) !important;
    border: 1px solid var(--vsc-border) !important;
  }
  body.vscode-mode .el-popper .el-popper__arrow::before {
    background: var(--vsc-panel) !important; border-color: var(--vsc-border) !important;
  }
  body.vscode-mode .el-autocomplete-suggestion li,
  body.vscode-mode .el-popper li { color: var(--vsc-text) !important; background: transparent !important; }
  body.vscode-mode .el-autocomplete-suggestion li:hover,
  body.vscode-mode .el-popper li:hover { background: var(--vsc-status) !important; color: #fff !important; }
  body.vscode-mode .el-dropdown-menu,
  body.vscode-mode .el-select-dropdown,
  body.vscode-mode .el-picker-panel,
  body.vscode-mode .el-dialog,
  body.vscode-mode .el-message-box {
    background: var(--vsc-panel) !important; border-color: var(--vsc-border) !important; color: var(--vsc-text) !important;
  }
  body.vscode-mode .el-dropdown-menu__item { color: var(--vsc-text) !important; }
  body.vscode-mode .el-dropdown-menu__item:hover { background: var(--vsc-status) !important; color: #fff !important; }

  /* ---------- 4.9 详情页 ---------- */
  body.vscode-mode .list,
  body.vscode-mode .hb-cpt-page-header,
  body.vscode-mode .hb-bbs-link__header,
  body.vscode-mode .page-header__container-bg,
  body.vscode-mode .hb-bbs-image-text,
  body.vscode-mode .header-image__item,
  body.vscode-mode .swiper-slide,
  body.vscode-mode .link-comment__comment-children,
  body.vscode-mode .link-reply,
  body.vscode-mode .link-comment__reply,
  body.vscode-mode .link-reply__input-wrapper,
  body.vscode-mode .hb-cpt-page-header > div,
  body.vscode-mode .link-section-link-data,
  body.vscode-mode .link-section-tags,
  body.vscode-mode .link-section-user,
  body.vscode-mode .hb-article,
  body.vscode-mode .img-media,
  body.vscode-mode .img {
    background: var(--vsc-editor) !important;
    background-color: var(--vsc-editor) !important;
    color: var(--vsc-text) !important;
  }
  body.vscode-mode .list::before, body.vscode-mode .list::after,
  body.vscode-mode .hb-bbs-image-text::before, body.vscode-mode .hb-bbs-image-text::after,
  body.vscode-mode .hb-cpt-page-header::before, body.vscode-mode .hb-cpt-page-header::after,
  body.vscode-mode .page-header__container-bg::before, body.vscode-mode .page-header__container-bg::after,
  body.vscode-mode .link-comment__comment-children::before, body.vscode-mode .link-comment__comment-children::after,
  body.vscode-mode .comment-children__load-all::before, body.vscode-mode .comment-children__load-all::after,
  body.vscode-mode .link-reply::before, body.vscode-mode .link-reply::after,
  body.vscode-mode .link-comment__reply::before, body.vscode-mode .link-comment__reply::after,
  body.vscode-mode .link-section-link-data::before, body.vscode-mode .link-section-link-data::after {
    background-color: transparent !important; background-image: none !important;
  }

  body.vscode-mode .link-section-title,
  body.vscode-mode .section-title__content { background: transparent !important; }
  body.vscode-mode .section-title__content {
    color: var(--vsc-string) !important; font-size: 16px !important; font-weight: 600 !important;
  }
  body.vscode-mode .section-title__content::before,
  body.vscode-mode .section-title__content::after { content: '"'; color: var(--vsc-string); }

  body.vscode-mode .hb-article {
    color: var(--vsc-text) !important; background: transparent !important; line-height: 1.7 !important;
  }
  body.vscode-mode .hb-article p,
  body.vscode-mode .hb-article span,
  body.vscode-mode .hb-article div { color: var(--vsc-text) !important; }
  body.vscode-mode .link-section-user { background: transparent !important; color: var(--vsc-fn) !important; }

  /* 评论区 → 注释流 */
  body.vscode-mode .link-comment,
  body.vscode-mode .link-comment__list,
  body.vscode-mode .link-comment__comment-item,
  body.vscode-mode .comment-item__content-container { background: transparent !important; }
  body.vscode-mode .link-comment__list { counter-reset: vsc-cmt; }
  body.vscode-mode .link-comment__comment-item {
    position: relative;
    border-bottom: 1px solid var(--vsc-line) !important;
    padding: 6px 0 6px 40px !important;
  }
  body.vscode-mode .link-comment__comment-item::before {
    counter-increment: vsc-cmt;
    content: counter(vsc-cmt);
    position: absolute; left: 0; top: 8px;
    width: 30px; text-align: right;
    color: var(--vsc-num-col); font-size: 12px; user-select: none;
  }
  body.vscode-mode .comment-item__content { color: var(--vsc-comment) !important; font-size: 13px !important; }
  body.vscode-mode .comment-item__content::before { content: '// '; color: var(--vsc-comment); font-weight: bold; }
  body.vscode-mode .children-item__reply-to { color: var(--vsc-comment) !important; }
  body.vscode-mode .children-item__reply-to::before { content: '> '; color: var(--vsc-num-col); }

  body.vscode-mode .link-item__title { color: var(--vsc-var) !important; }
  body.vscode-mode .bbs-link__related-recommend,
  body.vscode-mode .bbs-link__related-recommend.content { background: transparent !important; }
  body.vscode-mode .link-section-tags { background: transparent !important; }
  body.vscode-mode .link-section-tags span,
  body.vscode-mode .link-section-tags [class*="tag"] {
    background: var(--vsc-chip) !important; color: var(--vsc-keyword) !important; border: none !important;
  }

  /* ---------- 4.10 通用元素 ---------- */
  body.vscode-mode a { color: var(--vsc-var) !important; text-decoration: none !important; }
  body.vscode-mode a:hover { text-decoration: underline !important; }
  body.vscode-mode button:not([data-vsc-ui]) {
    background: transparent !important; color: var(--vsc-text) !important;
    border: none !important; cursor: pointer !important; border-radius: 2px !important;
  }
  body.vscode-mode button:not([data-vsc-ui]):hover { background: var(--vsc-panel) !important; }
  body.vscode-mode .list-cotent__operation-btn:hover { background: var(--vsc-chip) !important; }
  body.vscode-mode input[type="text"],
  body.vscode-mode input[type="search"],
  body.vscode-mode textarea {
    background: var(--vsc-chip) !important;
    border: 1px solid var(--vsc-border) !important;
    color: var(--vsc-text) !important;
    border-radius: 2px !important; outline: none !important;
  }
  body.vscode-mode ::-webkit-scrollbar { width: 10px; height: 10px; }
  body.vscode-mode ::-webkit-scrollbar-track { background: var(--vsc-editor); }
  body.vscode-mode ::-webkit-scrollbar-thumb { background: #424242; border-radius: 5px; }
  body.vscode-mode ::-webkit-scrollbar-thumb:hover { background: #4f4f4f; }
  body.vscode-mode { scrollbar-color: #424242 var(--vsc-editor); scrollbar-width: thin; }

  /* ================================================================
   * 4.11 编辑器外壳（全部是脚本自建的 fixed 元素，与页面互不干涉）
   * ================================================================ */
  [data-vsc-ui] { box-sizing: border-box; font-family: var(--vsc-font); }

  #vsc-activity {
    position: fixed; left: 0; top: var(--vsc-tab-h); bottom: var(--vsc-status-h);
    width: var(--vsc-act-w); background: var(--vsc-activity);
    z-index: 2147483000;
    display: flex; flex-direction: column; align-items: center; padding-top: 4px; gap: 2px;
  }
  #vsc-activity .ic {
    width: var(--vsc-act-w); height: 48px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; color: var(--vsc-num-col); cursor: pointer; user-select: none;
    border-left: 2px solid transparent;
  }
  #vsc-activity .ic:hover { color: var(--vsc-text); }
  #vsc-activity .ic.on { color: #fff; border-left-color: #fff; }
  #vsc-activity .spacer { flex: 1; }

  #vsc-sidebar {
    position: fixed; left: var(--vsc-act-w); top: var(--vsc-tab-h); bottom: var(--vsc-status-h);
    width: var(--vsc-side-w); background: var(--vsc-panel);
    z-index: 2147482999; overflow: hidden auto;
    font-size: 13px; line-height: 1.8; padding: 4px 0;
    color: var(--vsc-text); user-select: none;
  }
  @media (max-width: 900px) { #vsc-sidebar { display: none; } }
  #vsc-sidebar .hd {
    font-size: 11px; color: var(--vsc-num-col);
    padding: 6px 16px 4px; letter-spacing: .5px; font-weight: 700;
  }
  #vsc-sidebar .it {
    display: flex; align-items: center; gap: 6px;
    padding: 1px 10px 1px 16px; cursor: pointer;
    white-space: nowrap; overflow: hidden;
  }
  #vsc-sidebar .it:hover { background: var(--vsc-hover); }
  #vsc-sidebar .it.on { background: #37373d; }
  #vsc-sidebar .it .ic { flex-shrink: 0; width: 16px; text-align: center; font-size: 11px; }
  #vsc-sidebar .it .nm { overflow: hidden; text-overflow: ellipsis; }
  #vsc-sidebar .sub { padding-left: 16px; }
  #vsc-sidebar .c-ts, #vsc-sidebar .c-md, #vsc-sidebar .c-cpp, #vsc-sidebar .c-c, #vsc-sidebar .c-kt { color: #519aba; }
  #vsc-sidebar .c-js, #vsc-sidebar .c-json { color: #cbcb41; }
  #vsc-sidebar .c-py { color: #4b8bbe; }
  #vsc-sidebar .c-go, #vsc-sidebar .c-java, #vsc-sidebar .c-rs, #vsc-sidebar .c-swift, #vsc-sidebar .c-rb { color: var(--vsc-number); }
  #vsc-sidebar .c-default { color: var(--vsc-text); }
  #vsc-sidebar .f-ic { color: #dcb67a; }
  #vsc-sidebar .fn-ic { color: var(--vsc-fn); font-style: italic; }

  #vsc-tabbar {
    position: fixed; left: 0; top: 0; right: 0; height: var(--vsc-tab-h);
    background: var(--vsc-panel); z-index: 2147483001;
    display: flex; align-items: stretch; padding-left: var(--vsc-left);
    box-shadow: inset 0 -1px 0 var(--vsc-border);
  }
  #vsc-tabbar .tab {
    display: flex; align-items: center; gap: 8px; padding: 0 14px;
    background: var(--vsc-editor); border-right: 1px solid var(--vsc-border);
    color: var(--vsc-text); font-size: 13px; max-width: 300px; cursor: default;
    border-top: 1px solid var(--vsc-status);
  }
  #vsc-tabbar .tab.ghost {
    background: var(--vsc-panel); color: var(--vsc-num-col); border-top-color: transparent;
    cursor: pointer;
  }
  #vsc-tabbar .tab.ghost:hover { color: var(--vsc-text); }
  #vsc-tabbar .tab .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vsc-text); flex-shrink: 0; }
  #vsc-tabbar .tab .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #vsc-tabbar .tab .lg { color: #519aba; flex-shrink: 0; font-size: 11px; }

  #vsc-crumb {
    position: fixed; left: var(--vsc-left); right: var(--vsc-mini-w);
    top: var(--vsc-tab-h); height: var(--vsc-crumb-h);
    background: var(--vsc-editor); z-index: 2147483000;
    display: flex; align-items: center; gap: 6px; padding: 0 18px;
    font-size: 12px; color: var(--vsc-num-col); user-select: none;
    overflow: hidden; white-space: nowrap;
  }
  html:not([data-vsc-crumb="1"]) #vsc-crumb { display: none; }
  #vsc-crumb .sep { opacity: .6; }

  #vsc-minimap {
    position: fixed; right: 0; top: var(--vsc-top); bottom: var(--vsc-status-h);
    width: var(--vsc-mini-w); background: var(--vsc-editor);
    z-index: 2147482998; overflow: hidden; pointer-events: none;
    border-left: 1px solid rgba(255,255,255,.04); padding: 4px 6px;
  }
  html:not([data-vsc-mini="1"]) #vsc-minimap { display: none; }
  @media (max-width: 1100px) { #vsc-minimap { display: none; } }
  #vsc-minimap i { display: block; height: 2px; margin-bottom: 2px; border-radius: 1px; opacity: .5; }
  #vsc-minimap .vp {
    position: absolute; left: 0; right: 0; background: rgba(255,255,255,.07);
    border-top: 1px solid rgba(255,255,255,.05); border-bottom: 1px solid rgba(255,255,255,.05);
  }

  #vsc-status {
    position: fixed; left: 0; bottom: 0; right: 0; height: var(--vsc-status-h);
    background: var(--vsc-status); z-index: 2147483001;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 10px; font-size: 12px; color: #fff; user-select: none;
  }
  #vsc-status .l, #vsc-status .r { display: flex; align-items: center; gap: 12px; }
  #vsc-status .st { display: flex; align-items: center; gap: 4px; white-space: nowrap; padding: 0 2px; }
  #vsc-status .st.click { cursor: pointer; }
  #vsc-status .st.click:hover { background: rgba(255,255,255,.18); }

  #vsc-toast {
    position: fixed; bottom: 32px; right: 14px;
    background: var(--vsc-panel); color: var(--vsc-text);
    border: 1px solid var(--vsc-border); border-left: 3px solid var(--vsc-status);
    padding: 8px 14px; border-radius: 3px; font-size: 12px;
    z-index: 2147483200; opacity: 0; transform: translateY(6px);
    transition: opacity .25s, transform .25s; pointer-events: none; max-width: 340px;
  }
  #vsc-toast.on { opacity: 1; transform: translateY(0); }

  /* ---------- 4.12 命令面板 ---------- */
  #vsc-palette {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 2147483300; display: none; background: rgba(0,0,0,.35);
  }
  #vsc-palette.on { display: block; }
  #vsc-palette .box {
    width: min(620px, 92vw); margin: 60px auto 0;
    background: var(--vsc-panel); border: 1px solid var(--vsc-border);
    border-radius: 4px; box-shadow: 0 8px 30px rgba(0,0,0,.6); overflow: hidden;
  }
  #vsc-palette input {
    width: 100%; background: var(--vsc-chip); color: var(--vsc-text);
    border: 1px solid var(--vsc-status); outline: none;
    padding: 8px 10px; font-size: 14px; font-family: var(--vsc-font);
  }
  #vsc-palette ul { list-style: none; margin: 0; padding: 4px 0; max-height: 46vh; overflow: auto; }
  #vsc-palette li {
    padding: 5px 12px; font-size: 13px; color: var(--vsc-text);
    display: flex; justify-content: space-between; gap: 12px; cursor: pointer;
  }
  #vsc-palette li .k { color: var(--vsc-num-col); font-size: 11px; }
  #vsc-palette li.sel { background: var(--vsc-status); color: #fff; }
  #vsc-palette li.sel .k { color: #e5eefa; }

  /* ---------- 4.13 Boss 模式覆盖层 ---------- */
  #vsc-boss {
    position: fixed; inset: 0; background: var(--vsc-editor);
    z-index: 2147483400; display: none; flex-direction: column;
  }
  #vsc-boss.on { display: flex; }
  #vsc-boss .act {
    position: fixed; left: 0; top: var(--vsc-tab-h); bottom: var(--vsc-status-h);
    width: var(--vsc-act-w); background: var(--vsc-activity); z-index: 1;
    display: flex; flex-direction: column; align-items: center; padding-top: 4px; gap: 2px;
  }
  #vsc-boss .act .ic {
    width: var(--vsc-act-w); height: 48px; display: flex; align-items: center; justify-content: center;
    font-size: 20px; color: var(--vsc-num-col);
  }
  #vsc-boss .tabs {
    height: var(--vsc-tab-h); background: var(--vsc-panel);
    display: flex; align-items: stretch; padding-left: var(--vsc-act-w);
    box-shadow: inset 0 -1px 0 var(--vsc-border); position: relative; z-index: 2;
  }
  #vsc-boss .tab {
    display: flex; align-items: center; gap: 8px; padding: 0 14px;
    background: var(--vsc-editor); border-right: 1px solid var(--vsc-border);
    border-top: 1px solid var(--vsc-status);
    color: var(--vsc-text); font-size: 13px;
  }
  #vsc-boss .tab.ghost { background: var(--vsc-panel); color: var(--vsc-num-col); border-top-color: transparent; }
  #vsc-boss .tab .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vsc-text); }
  #vsc-boss .wrap { flex: 1; display: flex; min-height: 0; margin-left: var(--vsc-act-w); }
  #vsc-boss .code {
    flex: 1; overflow: auto; padding: 6px 0 40px;
    line-height: 1.55; font-size: 13px; color: var(--vsc-text);
  }
  #vsc-boss .ln-row { display: flex; padding-right: 16px; }
  #vsc-boss .ln-row:hover { background: var(--vsc-hover); }
  #vsc-boss .ln-row.cur { background: rgba(255,255,255,.04); box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); }
  #vsc-boss .ln { width: 52px; text-align: right; color: var(--vsc-num-col); padding-right: 18px; user-select: none; flex-shrink: 0; }
  #vsc-boss .tx { white-space: pre; }
  #vsc-boss .caret {
    display: inline-block; width: 1px; height: 1.1em; background: var(--vsc-text);
    vertical-align: text-bottom; animation: vsc-blink 1.05s steps(1) infinite;
  }
  @keyframes vsc-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
  #vsc-boss .term {
    height: 148px; flex-shrink: 0; border-top: 1px solid var(--vsc-border);
    background: var(--vsc-editor); margin-left: var(--vsc-act-w);
    font-size: 12px; color: var(--vsc-text); display: flex; flex-direction: column;
  }
  #vsc-boss .term .bar {
    display: flex; gap: 16px; padding: 4px 14px; font-size: 11px;
    color: var(--vsc-num-col); border-bottom: 1px solid var(--vsc-border);
  }
  #vsc-boss .term .bar b { color: var(--vsc-text); font-weight: 400; border-bottom: 1px solid var(--vsc-text); padding-bottom: 3px; }
  #vsc-boss .term .out { padding: 6px 14px; overflow: auto; line-height: 1.6; }
  #vsc-boss .term .out div { white-space: pre-wrap; }
  #vsc-boss .status {
    height: var(--vsc-status-h); background: var(--vsc-status);
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 10px; font-size: 12px; color: #fff; position: relative; z-index: 2;
  }
  #vsc-boss .status .l, #vsc-boss .status .r { display: flex; gap: 12px; align-items: center; }
  #vsc-boss .tk-k { color: var(--vsc-ctrl); }
  #vsc-boss .tk-s { color: var(--vsc-string); }
  #vsc-boss .tk-c { color: var(--vsc-comment); }
  #vsc-boss .tk-n { color: var(--vsc-number); }
  #vsc-boss .tk-f { color: var(--vsc-fn); }
  #vsc-boss .tk-t { color: var(--vsc-type); }
  #vsc-boss .tk-d { color: var(--vsc-fn); }
  #vsc-boss .tk-v { color: var(--vsc-var); }
  `;

  /* ================================================================
   * 5. 分类 → 扩展名映射
   * ================================================================ */
  const EXT_MAP = {
    'Steam': 'ts', '盒友杂谈': 'md', '数码硬件': 'py', '三角洲行动': 'go',
    'PC游戏': 'java', 'CS2': 'cpp', '英雄联盟': 'rs', '明日方舟': 'json',
    '绝地求生': 'c', 'Apex 英雄': 'kt', '伊莫': 'swift', '战狗': 'rb',
  };
  const DEFAULT_EXT = 'js';
  const getExt = (cat) => (cat && EXT_MAP[cat.trim()]) || DEFAULT_EXT;
  const truncate = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : (s || ''));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

  /* ================================================================
   * 6. Boss 模式假代码 + 语法高亮
   *    高亮改成单遍分词器：原版的“占位符法”会被数字规则把
   *    \x00 12 \x00 里的索引数字再切一刀，导致还原错位。
   * ================================================================ */
  const FAKE_CODE = [
    '// src/services/data-processor.service.ts',
    'import { Injectable, Logger } from "@nestjs/common";',
    'import { InjectRepository } from "@nestjs/typeorm";',
    'import { Repository, In } from "typeorm";',
    'import { DataRecord } from "../entities/data-record.entity";',
    'import { CacheService } from "./cache.service";',
    'import { QueueService } from "./queue.service";',
    'import { RetryPolicy } from "../common/retry-policy";',
    '',
    'const BATCH_SIZE = 500;',
    'const MAX_RETRY = 3;',
    '',
    '@Injectable()',
    'export class DataProcessorService {',
    '  private readonly logger = new Logger(DataProcessorService.name);',
    '  private readonly retry = new RetryPolicy({ attempts: MAX_RETRY, backoff: 250 });',
    '',
    '  constructor(',
    '    @InjectRepository(DataRecord)',
    '    private readonly repo: Repository<DataRecord>,',
    '    private readonly cache: CacheService,',
    '    private readonly queue: QueueService,',
    '  ) {}',
    '',
    '  async processBatch(records: DataRecord[]): Promise<ProcessResult> {',
    '    this.logger.log("Processing batch of " + records.length + " records");',
    '    const started = Date.now();',
    '    const valid = records.filter(r => this.validate(r));',
    '    const cached = await this.cache.checkBulk(valid.map(r => r.id));',
    '    const fresh = valid.filter(r => !cached.has(r.id));',
    '',
    '    let ok = 0;',
    '    let failed = 0;',
    '',
    '    for (const record of fresh) {',
    '      try {',
    '        const enriched = await this.retry.run(() => this.enrich(record));',
    '        await this.repo.save(enriched);',
    '        await this.cache.set(record.id, enriched, 3600);',
    '        await this.queue.publish("record.updated", enriched);',
    '        ok++;',
    '      } catch (err) {',
    '        failed++;',
    '        this.logger.error("Failed to process " + record.id + ": " + err.message);',
    '      }',
    '    }',
    '',
    '    const elapsed = Date.now() - started;',
    '    this.logger.log("Batch complete in " + elapsed + "ms");',
    '    return { ok, failed, skipped: records.length - valid.length, elapsed };',
    '  }',
    '',
    '  private validate(record: DataRecord): boolean {',
    '    if (!record.id || !record.timestamp) return false;',
    '    if (record.value < 0) return false;',
    '    if (record.source && !ALLOWED_SOURCES.has(record.source)) return false;',
    '    return true;',
    '  }',
    '',
    '  private async enrich(record: DataRecord): Promise<DataRecord> {',
    '    const metadata = await this.fetchMetadata(record.source);',
    '    return { ...record, metadata, processedAt: new Date() };',
    '  }',
    '',
    '  private async fetchMetadata(source: string): Promise<Record<string, unknown>> {',
    '    const hit = await this.cache.get("meta:" + source);',
    '    if (hit) return hit;',
    '    // TODO: 外部 metadata 服务下周接入，先返回静态兜底',
    '    return { source, version: "1.0.0", region: "cn-north-1" };',
    '  }',
    '',
    '  async reconcile(ids: string[]): Promise<void> {',
    '    const rows = await this.repo.find({ where: { id: In(ids) } });',
    '    const missing = ids.filter(id => !rows.some(r => r.id === id));',
    '    if (missing.length) {',
    '      this.logger.warn("Missing " + missing.length + " records, requeueing");',
    '      await this.queue.publish("record.missing", { ids: missing });',
    '    }',
    '  }',
    '}',
  ];

  const KEYWORDS = ['import', 'export', 'from', 'const', 'let', 'var', 'function', 'class',
    'return', 'async', 'await', 'new', 'if', 'else', 'for', 'of', 'in', 'while', 'do',
    'try', 'catch', 'finally', 'throw', 'private', 'public', 'protected', 'readonly',
    'static', 'void', 'string', 'boolean', 'number', 'true', 'false', 'null', 'undefined',
    'this', 'extends', 'implements', 'interface', 'type', 'enum', 'namespace', 'default',
    'as', 'yield', 'delete', 'typeof', 'instanceof', 'super', 'constructor'];

  const TOKEN_RE = new RegExp(
    '(\\/\\/[^\\n]*)' +                              // 1 行注释
    '|(`[^`]*`|"[^"]*"|\'[^\']*\')' +                // 2 字符串
    '|\\b(0x[0-9a-fA-F]+|\\d+(?:\\.\\d+)?)\\b' +     // 3 数字
    '|(@[A-Za-z_][\\w.]*)' +                         // 4 装饰器
    '|\\b(' + KEYWORDS.join('|') + ')\\b' +          // 5 关键字
    '|\\b([A-Z][A-Za-z0-9_]*)\\b' +                  // 6 类型 / 常量
    '|\\b([A-Za-z_$][\\w$]*)(?=\\s*\\()',            // 7 函数调用
    'g');

  function highlight(line) {
    if (!line) return '';
    let out = '', last = 0, m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(line)) !== null) {
      if (m[0] === '') { TOKEN_RE.lastIndex++; continue; }
      const cls = m[1] ? 'tk-c' : m[2] ? 'tk-s' : m[3] ? 'tk-n'
        : m[4] ? 'tk-d' : m[5] ? 'tk-k' : m[6] ? 'tk-t' : 'tk-f';
      out += esc(line.slice(last, m.index));
      out += '<span class="' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + esc(line.slice(last));
  }

  /* ================================================================
   * 7. 运行时状态
   * ================================================================ */
  let skinOn = false;
  let bossOn = false;
  let paletteOn = false;
  let lastEsc = 0;
  let lastUrl = location.href;
  let origTitle = '';
  let origIcon = null;
  let titleObserver = null;
  const touched = new Set();    // 被写过 inline 样式的元素（仅切换主题时用）

  // 清空所有被写过的 inline 样式。
  // 必须连 seen 一起重置：否则那些已达复检上限的元素既不会被重新上色，
  // 也不再登记在 touched 里 —— 换主题时颜色卡在旧主题，关换肤时样式还原不掉。
  function resetTouched() {
    touched.forEach(e => {
      e.style.removeProperty('background-color');
      e.style.removeProperty('color');
      e.style.removeProperty('border-color');
      if (!e.getAttribute('style')) e.removeAttribute('style');
    });
    touched.clear();
    seen = new WeakMap();
  }

  // 兜底：扫一遍空的 style=""（竞态下可能有元素没登记进 touched 就被写过又清空）。
  // 只删空属性，绝不碰站点自己写的 inline 样式。
  function sweepEmptyStyles() {
    document.querySelectorAll('[style=""]').forEach(e => e.removeAttribute('style'));
  }

  const CODE_ICON = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="6" fill="#1e1e1e"/>' +
    '<path d="M11 9 4 16l7 7" stroke="#4fa6f0" stroke-width="3" fill="none" ' +
    'stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M21 9l7 7-7 7" stroke="#4fa6f0" stroke-width="3" fill="none" ' +
    'stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>');

  /* ================================================================
   * 8. 小工具
   * ================================================================ */
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    e.setAttribute('data-vsc-ui', '');
    if (attrs) Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k]));
    if (html != null) e.innerHTML = html;
    return e;
  }
  const $ = (id) => document.getElementById(id);

  // requestIdleCallback：让扫描在浏览器空闲时跑，不抢占主线程。
  // rAF 会在每帧强制执行，和站点的 Vue 渲染抢 CPU；
  // rIC 让浏览器自己决定何时调度，并在 200ms 内必须执行（避免饿死）。
  // 详情页卡死的根因就是 rAF + getComputedStyle 强制同步样式重算阻塞了站点渲染。
  const ric = window.requestIdleCallback
    ? (cb) => requestIdleCallback(cb, { timeout: 200 })
    : (cb) => requestAnimationFrame(cb);

  function toast(msg, ms) {
    const t = $('vsc-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove('on'), ms || 2400);
  }

  /* ---- 颜色判定：用于把残留的浅色底 / 深色字翻过来 ---- */
  function parseColor(str) {
    const m = str && str.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?/);
    if (!m) return null;
    let a = 1;
    if (m[4] !== undefined) a = m[4].indexOf('%') > -1 ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a: a };
  }
  const lumOf = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  const satOf = (c) => {
    const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };
  function lighten(c, target) {
    // 保留色相，只把亮度抬到可读区间
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0; const l = (mx + mn) / 2, d = mx - mn;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return 'hsl(' + Math.round(h) + ',' + Math.round(Math.min(1, s * 1.05) * 100) + '%,' +
      Math.round(Math.max(target, l) * 100) + '%)';
  }

  function mark(e, prop, val) {
    e.style.setProperty(prop, val, 'important');
    touched.add(e);
  }

  /* ================================================================
   * 9. [已移除] 残留浅色扫描
   *    v3.6.0 彻底删除：JS 扫描的 getComputedStyle 在详情页（上万节点）
   *    会导致主线程卡死、风扇狂转。换肤完全由 CSS 承担。
   *    以下 scan / runScan / scheduleScan / startObserver / stopObserver
   *    函数保留为空实现，避免其他代码调用时报错。
   * ================================================================ */
  function scan() {}
  function scheduleScan() {}
  function startObserver() {}
  function stopObserver() {}
  function resetTouched() {
    touched.forEach(e => {
      e.style.removeProperty('background-color');
      e.style.removeProperty('color');
      e.style.removeProperty('border-color');
      if (!e.getAttribute('style')) e.removeAttribute('style');
    });
    touched.clear();
  }
  function sweepEmptyStyles() {
    document.querySelectorAll('[style=""]').forEach(e => e.removeAttribute('style'));
  }

  /* ================================================================
   * 10. 外壳构建
   * ================================================================ */
  function buildFrame() {
    if ($('vsc-activity')) return;

    document.body.appendChild(el('div', { id: 'vsc-activity' }, `
      <div class="ic on" title="资源管理器">&#9776;</div>
      <div class="ic" title="搜索">&#8981;</div>
      <div class="ic" title="源代码管理">&#9880;</div>
      <div class="ic" title="运行和调试">&#9654;</div>
      <div class="ic" title="扩展">&#9670;</div>
      <div class="spacer"></div>
      <div class="ic" title="设置（命令面板 Ctrl+Shift+P）" data-vsc-act="palette">&#9881;</div>
    `));

    document.body.appendChild(el('div', { id: 'vsc-sidebar' }));
    document.body.appendChild(el('div', { id: 'vsc-tabbar' }));
    document.body.appendChild(el('div', { id: 'vsc-crumb' }));
    document.body.appendChild(el('div', { id: 'vsc-minimap' }));

    document.body.appendChild(el('div', { id: 'vsc-status' }, `
      <div class="l">
        <span class="st">&#9094; main*</span>
        <span class="st" id="vsc-problems">&#9888; 0 &#10005; 0</span>
      </div>
      <div class="r">
        <span class="st" id="vsc-cursor">Ln 1, Col 1</span>
        <span class="st">Spaces: 2</span>
        <span class="st">UTF-8</span>
        <span class="st">LF</span>
        <span class="st click" data-vsc-act="theme" title="切换主题">${themeOf().name}</span>
        <span class="st click" data-vsc-act="boss" title="Boss 模式 (Ctrl+\`)">&#9679; Boss</span>
      </div>
    `));

    document.body.appendChild(el('div', { id: 'vsc-toast' }));
    buildPalette();
    buildBoss();
    buildMinimap();

    toast('VS Code 换肤已启用 · Ctrl+` Boss 模式 · Ctrl+Shift+P 命令面板 · Ctrl+Alt+V 关闭', 5200);
  }

  function buildMinimap() {
    const mm = $('vsc-minimap');
    if (!mm || mm.childElementCount) return;
    const colors = ['--vsc-comment', '--vsc-keyword', '--vsc-string', '--vsc-fn', '--vsc-var', '--vsc-num-col'];
    let html = '<div class="vp"></div>';
    // 伪随机但固定，避免每次刷新跳动
    let s = 20240918;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 260; i++) {
      if (rnd() < 0.07) { html += '<i style="background:transparent"></i>'; continue; }
      const indent = Math.floor(rnd() * 4) * 5;
      const w = 5 + rnd() * 38;
      const c = colors[Math.floor(rnd() * colors.length)];
      html += `<i style="margin-left:${indent}px;width:${w.toFixed(0)}px;background:var(${c})"></i>`;
    }
    mm.innerHTML = html;
  }

  function currentPageName() {
    const p = location.pathname;
    if (p.includes('/app/bbs/home') || p === '/' || p === '/app/bbs') return 'index.ts';
    if (p.includes('/app/bbs/link/')) {
      const t = (origTitle || document.title || 'post').replace(/[-–—|]\s*小黑盒.*$/, '').trim();
      return truncate(t.replace(/[<>:"/\\|?*]/g, ''), 24) + '.ts';
    }
    if (p.includes('/app/user/')) return 'profile.ts';
    if (p.includes('/app/game')) return 'game.store.ts';
    return 'workspace.ts';
  }

  function updateTabBar() {
    const tb = $('vsc-tabbar');
    if (!tb) return;
    const name = currentPageName();
    tb.innerHTML =
      `<div class="tab"><span class="dot"></span><span class="lg">TS</span><span class="nm">${esc(name)}</span></div>` +
      `<div class="tab ghost" data-vsc-act="palette"><span class="lg">MD</span><span class="nm">README.md</span></div>` +
      `<div class="tab ghost" data-vsc-act="boss"><span class="lg">TS</span><span class="nm">data-processor.service.ts</span></div>`;
  }

  function updateCrumb() {
    const cb = $('vsc-crumb');
    if (!cb) return;
    const p = location.pathname;
    const parts = p.includes('/app/bbs/link/')
      ? ['src', 'modules', 'bbs', currentPageName(), 'renderContent()']
      : ['src', 'app', currentPageName(), 'default'];
    cb.innerHTML = parts.map((x, i) =>
      `<span>${esc(x)}</span>` + (i < parts.length - 1 ? '<span class="sep">&#8250;</span>' : '')
    ).join('');
  }

  function updateSidebar() {
    const sb = $('vsc-sidebar');
    if (!sb) return;
    const p = location.pathname;
    let html = '<div class="hd">资源管理器</div>';

    if (p.includes('/app/bbs/home') || p === '/' || p === '/app/bbs') {
      const cats = [].slice.call(document.querySelectorAll('button.bbs-home__topic-item'))
        .map(b => b.textContent.trim())
        .filter(t => t && t.length < 20)
        .filter((t, i, a) => a.indexOf(t) === i);

      const posts = [].slice.call(
        document.querySelectorAll('a.hb-cpt__bbs-list-content, main a[href*="/app/bbs/link/"]')
      ).filter(a => a.querySelector('.bbs-content__title'));

      if (cats.length) {
        cats.slice(0, 8).forEach((cat, ci) => {
          html += `<div class="it" data-vsc-cat="${escAttr(cat)}">` +
            `<span class="ic f-ic">${ci === 0 ? '&#9662;' : '&#9656;'}</span>` +
            `<span class="nm">${esc(cat)}</span></div>`;
          if (ci === 0 && posts.length) {
            posts.slice(0, 12).forEach(a => {
              const titleEl = a.querySelector('.bbs-content__title');
              const title = titleEl ? titleEl.textContent : '';
              const catEl = a.querySelector('.bbs-new-style-bottom__rich-node');
              const ext = getExt(catEl ? catEl.textContent.trim() : cat);
              // 留短一点，保证 .ts/.go 这类扩展名不被省略号吃掉 —— 扩展名才是"代码文件"感的来源
              const nm = truncate(title.replace(/[<>:"/\\|?*]/g, ''), 11);
              html += `<div class="it sub" data-vsc-href="${escAttr(a.getAttribute('href') || '')}">` +
                `<span class="ic c-${ext}">&#128196;</span>` +
                `<span class="nm c-${ext}">${esc(nm)}.${ext}</span></div>`;
            });
          }
        });
      } else {
        html += '<div class="it"><span class="ic f-ic">&#9662;</span><span class="nm">src</span></div>' +
          '<div class="it sub"><span class="ic c-ts">&#128196;</span><span class="nm c-ts">index.ts</span></div>';
      }
    } else if (p.includes('/app/bbs/link/')) {
      html += `
        <div class="it"><span class="ic f-ic">&#9662;</span><span class="nm">src</span></div>
        <div class="it sub on"><span class="ic c-ts">&#128196;</span><span class="nm c-ts">post.ts</span></div>
        <div class="it sub"><span class="ic c-md">&#128196;</span><span class="nm c-md">README.md</span></div>
        <div class="it"><span class="ic f-ic">&#9656;</span><span class="nm">tests</span></div>
        <div class="it sub"><span class="ic c-ts">&#128196;</span><span class="nm c-ts">post.spec.ts</span></div>
        <div class="hd" style="margin-top:8px">大纲</div>
        <div class="it"><span class="ic fn-ic">f</span><span class="nm">getPostData()</span></div>
        <div class="it"><span class="ic fn-ic">f</span><span class="nm">renderContent()</span></div>
        <div class="it"><span class="ic fn-ic">f</span><span class="nm">loadComments()</span></div>`;
    } else {
      html += '<div class="it"><span class="ic f-ic">&#9662;</span><span class="nm">workspace</span></div>' +
        '<div class="it sub"><span class="ic c-ts">&#128196;</span><span class="nm c-ts">main.ts</span></div>';
    }
    // 内容没变就别重写 innerHTML：无谓的 DOM 重建既费 CPU，
    // 又会再次惊动 MutationObserver
    if (html !== updateSidebar._last) {
      updateSidebar._last = html;
      sb.innerHTML = html;
    }

    const pb = $('vsc-problems');
    if (pb) {
      const n = document.querySelectorAll('.bbs-home__content-item, .link-comment__comment-item').length;
      const txt = '&#9888; ' + (n % 7) + ' &#10005; 0';
      if (pb.innerHTML !== txt) pb.innerHTML = txt;
    }
  }

  function updateStatusBar() {
    const c = $('vsc-cursor');
    if (c) {
      const y = window.scrollY;
      c.textContent = 'Ln ' + (Math.floor(y / 22) + 1) + ', Col ' + (Math.floor(y / 8) % 80 + 1);
    }
    const mm = $('vsc-minimap');
    if (mm) {
      const vp = mm.querySelector('.vp');
      if (vp) {
        const doc = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        const h = Math.max(24, mm.clientHeight * Math.min(1, innerHeight / document.documentElement.scrollHeight));
        vp.style.height = h + 'px';
        vp.style.top = ((mm.clientHeight - h) * (scrollY / doc)) + 'px';
      }
    }
  }

  /* ================================================================
   * 11. 标签页伪装（标题 / favicon）
   * ================================================================ */
  function applyDisguise() {
    if (cfg.fakeTitle) {
      if (!origTitle) origTitle = document.title;
      const want = currentPageName() + ' - xiaoheihe - Visual Studio Code';
      if (document.title !== want) document.title = want;
      // 站点 SPA 会自己改 title，这里只做“看到就盖回去”，不拦截任何逻辑
      if (!titleObserver) {
        const t = document.querySelector('title');
        if (t) {
          titleObserver = new MutationObserver(() => {
            if (!skinOn || !cfg.fakeTitle) return;
            const w = currentPageName() + ' - xiaoheihe - Visual Studio Code';
            if (document.title !== w) { origTitle = document.title; document.title = w; }
          });
          titleObserver.observe(t, { childList: true });
        }
      }
    }
    if (cfg.fakeFavicon) {
      let link = document.querySelector('link[rel~="icon"]');
      if (link && origIcon === null) origIcon = link.getAttribute('href');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
        link.setAttribute('data-vsc-ui', '');
      }
      link.setAttribute('href', CODE_ICON);
    }
  }

  function restoreDisguise() {
    if (titleObserver) { titleObserver.disconnect(); titleObserver = null; }
    if (origTitle) document.title = origTitle;
    const link = document.querySelector('link[rel~="icon"]');
    if (link) {
      if (link.hasAttribute('data-vsc-ui')) link.remove();
      else if (origIcon !== null) link.setAttribute('href', origIcon);
    }
  }

  /* ================================================================
   * 12. Boss 模式
   * ================================================================ */
  function buildBoss() {
    if ($('vsc-boss')) return;
    const code = FAKE_CODE.map((line, i) => {
      const cur = i === 38;
      return `<div class="ln-row${cur ? ' cur' : ''}"><span class="ln">${i + 1}</span>` +
        `<span class="tx">${highlight(line) || ' '}${cur ? '<span class="caret"></span>' : ''}</span></div>`;
    }).join('');

    document.body.appendChild(el('div', { id: 'vsc-boss' }, `
      <div class="tabs">
        <div class="tab"><span class="dot"></span><span>data-processor.service.ts</span></div>
        <div class="tab ghost"><span>cache.service.ts</span></div>
        <div class="tab ghost"><span>queue.service.ts</span></div>
      </div>
      <div class="act">
        <div class="ic">&#9776;</div><div class="ic">&#8981;</div>
        <div class="ic">&#9880;</div><div class="ic">&#9654;</div><div class="ic">&#9670;</div>
      </div>
      <div class="wrap"><div class="code">${code}</div></div>
      <div class="term">
        <div class="bar"><b>终端</b><span>问题</span><span>输出</span><span>调试控制台</span></div>
        <div class="out" id="vsc-term-out"></div>
      </div>
      <div class="status">
        <div class="l"><span>&#9094; main*</span><span>&#9888; 0 &#10005; 0</span></div>
        <div class="r">
          <span>Ln 39, Col 24</span><span>Spaces: 2</span><span>UTF-8</span>
          <span>LF</span><span>TypeScript 5.4.5</span>
        </div>
      </div>
    `));
  }

  const TERM_LINES = [
    '$ npm run start:dev',
    '',
    '> api@1.8.2 start:dev',
    '> nest start --watch',
    '',
    '[10:24:31] Starting compilation in watch mode...',
    '[10:24:38] Found 0 errors. Watching for file changes.',
    '[Nest] 48213  - LOG [NestFactory] Starting Nest application...',
    '[Nest] 48213  - LOG [InstanceLoader] TypeOrmModule dependencies initialized +48ms',
    '[Nest] 48213  - LOG [RoutesResolver] DataProcessorController {/records}: +3ms',
    '[Nest] 48213  - LOG [NestApplication] Nest application successfully started +6ms',
    '[Nest] 48213  - LOG [DataProcessorService] Processing batch of 500 records',
    '[Nest] 48213  - LOG [DataProcessorService] Batch complete in 1284ms',
  ];

  function fillTerminal() {
    const out = $('vsc-term-out');
    if (!out) return;
    out.innerHTML = TERM_LINES.map(l => '<div>' + esc(l) + '</div>').join('') +
      '<div>$ <span class="caret" style="display:inline-block;width:7px;height:13px;' +
      'background:var(--vsc-text);vertical-align:text-bottom"></span></div>';
    out.scrollTop = out.scrollHeight;
  }

  function toggleBoss(force) {
    const ov = $('vsc-boss');
    if (!ov) return;
    bossOn = force === undefined ? !bossOn : !!force;
    ov.classList.toggle('on', bossOn);
    if (bossOn) {
      fillTerminal();
      const c = ov.querySelector('.code');
      if (c) c.scrollTop = Math.max(0, c.scrollHeight * 0.32);
      document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    } else {
      document.documentElement.style.removeProperty('overflow');
      toast('已退出 Boss 模式');
    }
  }

  /* ================================================================
   * 13. 命令面板（接管被隐藏的站点导航，功能一个不丢）
   * ================================================================ */
  let paletteItems = [];
  let paletteIdx = 0;

  function buildPalette() {
    if ($('vsc-palette')) return;
    document.body.appendChild(el('div', { id: 'vsc-palette' }, `
      <div class="box">
        <input type="text" placeholder="输入命令或页面名称…" spellcheck="false">
        <ul></ul>
      </div>
    `));
    const box = $('vsc-palette');
    box.addEventListener('click', e => { if (e.target === box) togglePalette(false); });
    box.querySelector('input').addEventListener('input', renderPalette);
    box.querySelector('ul').addEventListener('click', e => {
      const li = e.target.closest('li');
      if (li) runPalette(+li.dataset.i);
    });
  }

  function collectPalette() {
    const items = [
      { label: 'Boss 模式：显示/隐藏假编辑器', key: 'Ctrl+`', run: () => toggleBoss() },
      { label: '换肤：开启 / 关闭（完全还原页面）', key: 'Ctrl+Alt+V', run: () => setSkin(!skinOn) },
      { label: '主题：切换配色', key: '', run: cycleTheme },
      { label: '视图：显示/隐藏缩略图', key: '', run: () => { cfg.minimap = !cfg.minimap; saveCfg(); applyFlags(); } },
      { label: '视图：显示/隐藏面包屑', key: '', run: () => { cfg.breadcrumb = !cfg.breadcrumb; saveCfg(); applyFlags(); } },
      { label: '图片：占位图标 / 半透明 / 原样', key: '', run: cycleImages },
      { label: '字体：等宽字体开关', key: '', run: () => { cfg.mono = !cfg.mono; saveCfg(); applyFlags(); } },
      { label: '标签页伪装：标题 + 图标开关', key: '', run: toggleDisguise },
    ];
    // 把原生 nav 里的链接原样收进来（不修改 nav 本身）
    [].slice.call(document.querySelectorAll('nav.nav a[href]')).forEach(a => {
      const t = (a.textContent || '').trim();
      if (!t || t.length > 14) return;
      if (items.some(x => x.label === '转到：' + t)) return;
      items.push({ label: '转到：' + t, key: 'nav', run: () => a.click() });
    });
    [].slice.call(document.querySelectorAll('button.bbs-home__topic-item')).forEach(b => {
      const t = (b.textContent || '').trim();
      if (!t || t.length > 14) return;
      items.push({ label: '分类：' + t, key: 'tab', run: () => b.click() });
    });
    return items;
  }

  function fuzzy(q, s) {
    if (!q) return true;
    s = s.toLowerCase(); q = q.toLowerCase();
    let i = 0;
    for (const ch of q) { i = s.indexOf(ch, i); if (i === -1) return false; i++; }
    return true;
  }

  function renderPalette() {
    const box = $('vsc-palette');
    const q = box.querySelector('input').value.trim();
    const ul = box.querySelector('ul');
    const shown = paletteItems.filter(it => fuzzy(q, it.label));
    paletteIdx = 0;
    ul.innerHTML = shown.map((it, i) =>
      `<li data-i="${paletteItems.indexOf(it)}" class="${i === 0 ? 'sel' : ''}">` +
      `<span>${esc(it.label)}</span><span class="k">${esc(it.key)}</span></li>`
    ).join('') || '<li class="k" style="padding:8px 12px">没有匹配的命令</li>';
  }

  function movePalette(d) {
    const ul = $('vsc-palette').querySelector('ul');
    const lis = ul.querySelectorAll('li[data-i]');
    if (!lis.length) return;
    paletteIdx = (paletteIdx + d + lis.length) % lis.length;
    lis.forEach((li, i) => li.classList.toggle('sel', i === paletteIdx));
    lis[paletteIdx].scrollIntoView({ block: 'nearest' });
  }

  function runPalette(i) {
    const it = paletteItems[i];
    togglePalette(false);
    if (it && it.run) setTimeout(it.run, 0);
  }

  function togglePalette(force) {
    const box = $('vsc-palette');
    if (!box) return;
    paletteOn = force === undefined ? !paletteOn : !!force;
    box.classList.toggle('on', paletteOn);
    if (paletteOn) {
      paletteItems = collectPalette();
      const input = box.querySelector('input');
      input.value = '';
      renderPalette();
      input.focus();
    }
  }

  /* ================================================================
   * 14. 设置切换
   * ================================================================ */
  function cycleTheme() {
    const keys = Object.keys(THEMES);
    cfg.theme = keys[(keys.indexOf(cfg.theme) + 1) % keys.length];
    saveCfg();
    const v = $('vsc-vars');
    if (v) v.textContent = buildVars();
    document.documentElement.setAttribute('data-vsc-theme', cfg.theme);
    const btn = document.querySelector('#vsc-status [data-vsc-act="theme"]');
    if (btn) btn.textContent = themeOf().name;
    // 之前被写进 inline 的颜色要跟着新主题重算
    resetTouched();
    // resetTouched 清除了 inline 样式，CSS 变量切换会自动应用新主题色。
    toast('主题：' + themeOf().name);
  }

  function cycleImages() {
    const modes = ['placeholder', 'dim', 'raw'];
    cfg.images = modes[(modes.indexOf(cfg.images) + 1) % modes.length];
    saveCfg(); applyFlags();
    toast('图片：' + ({ placeholder: '占位图标（悬停查看）', dim: '半透明', raw: '原样显示' })[cfg.images]);
  }

  function toggleDisguise() {
    const on = !(cfg.fakeTitle && cfg.fakeFavicon);
    cfg.fakeTitle = cfg.fakeFavicon = on;
    saveCfg();
    if (on) applyDisguise(); else restoreDisguise();
    toast('标签页伪装：' + (on ? '开' : '关'));
  }

  function applyFlags() {
    const h = document.documentElement;
    h.setAttribute('data-vsc-theme', cfg.theme);
    h.setAttribute('data-vsc-img', skinOn ? cfg.images : 'raw');
    h.setAttribute('data-vsc-mini', skinOn && cfg.minimap ? '1' : '0');
    h.setAttribute('data-vsc-crumb', skinOn && cfg.breadcrumb ? '1' : '0');
    h.setAttribute('data-vsc-mono', skinOn && cfg.mono ? '1' : '0');
  }

  /* ================================================================
   * 15. 换肤开关（还原是一等公民）
   * ================================================================ */
  function setSkin(on) {
    if (on === skinOn) return;
    skinOn = on;
    cfg.enabled = on;
    saveCfg();

    if (on) {
      document.documentElement.setAttribute('data-vsc', 'on');
      document.body.classList.add('vscode-mode');
      applyFlags();
      buildFrame();
      updateTabBar(); updateCrumb(); updateSidebar(); updateStatusBar();
      applyDisguise();
      // v3.6.0：不再启动 MutationObserver——零 JS 扫描 = 零卡死风险
      // 换肤完全由 CSS 承担
    } else {
      stopObserver();
      toggleBoss(false);
      togglePalette(false);
      document.documentElement.removeAttribute('data-vsc');
      document.body.classList.remove('vscode-mode');
      applyFlags();
      // 还原所有被写过的 inline 样式与标记
      resetTouched();
      document.querySelectorAll('.vsc-flat-pe').forEach(e => e.classList.remove('vsc-flat-pe'));
      document.querySelectorAll('[data-vsc-ui]').forEach(e => {
        if (e.tagName !== 'LINK') e.remove();
      });
      restoreDisguise();
      document.documentElement.style.removeProperty('overflow');
      // 扫描是分帧的，可能还有一两帧在路上；等它们停下后再兜底清一次
      setTimeout(sweepEmptyStyles, 0);
      setTimeout(sweepEmptyStyles, 400);
    }
  }

  /* ================================================================
   * 16. 事件
   * ================================================================ */
  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function bindEvents() {
    document.addEventListener('keydown', e => {
      // Ctrl+Alt+V：总开关，任何时候都能救场
      if (e.ctrlKey && e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault(); setSkin(!skinOn);
        toast(skinOn ? '换肤已开启' : '换肤已关闭，页面已还原');
        return;
      }
      if (!skinOn) return;

      if (paletteOn) {
        if (e.key === 'Escape') { e.preventDefault(); togglePalette(false); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); return; }
        if (e.key === 'Enter') {
          e.preventDefault();
          const sel = $('vsc-palette').querySelector('li.sel[data-i]');
          if (sel) runPalette(+sel.dataset.i);
          return;
        }
        return;
      }

      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault(); togglePalette(true); return;
      }
      if (e.key === 'F1' && !isTyping(e)) { e.preventDefault(); togglePalette(true); return; }
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); toggleBoss(); return; }
      if (e.key === 'Escape' && !isTyping(e)) {
        const now = Date.now();
        if (now - lastEsc < 400) { e.preventDefault(); toggleBoss(); lastEsc = 0; return; }
        lastEsc = now;
      }
    }, true);

    let raf = 0;
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; updateStatusBar(); });
    }, { passive: true });

    // 侧边栏 / 状态栏点击
    document.addEventListener('click', e => {
      if (!skinOn) return;
      const act = e.target.closest('[data-vsc-act]');
      if (act) {
        const a = act.getAttribute('data-vsc-act');
        if (a === 'boss') toggleBoss();
        else if (a === 'theme') cycleTheme();
        else if (a === 'palette') togglePalette(true);
        return;
      }
      const cat = e.target.closest('[data-vsc-cat]');
      if (cat) {
        // 触发站点真实按钮，不自己实现任何业务逻辑
        const name = cat.getAttribute('data-vsc-cat');
        const btn = [].slice.call(document.querySelectorAll('button.bbs-home__topic-item'))
          .find(b => b.textContent.trim() === name);
        if (btn) btn.click();
        return;
      }
      const file = e.target.closest('[data-vsc-href]');
      if (file) {
        const href = file.getAttribute('data-vsc-href');
        if (href) location.href = href;
      }
    }, true);

    // Boss 模式点击任意处退出
    document.addEventListener('click', e => {
      if (bossOn && e.target.closest('#vsc-boss')) toggleBoss(false);
    });

    if (cfg.bossOnBlur) {
      window.addEventListener('blur', () => { if (skinOn && !bossOn) toggleBoss(true); });
    }

    // SPA 路由：优先挂 history API，兜底轮询（比 MutationObserver 风暴省太多）
    ['pushState', 'replaceState'].forEach(fn => {
      const raw = history[fn];
      history[fn] = function () {
        const r = raw.apply(this, arguments);
        setTimeout(onRouteChange, 0);
        return r;
      };
    });
    window.addEventListener('popstate', () => setTimeout(onRouteChange, 0));
    setInterval(() => { if (location.href !== lastUrl) onRouteChange(); }, 900);
  }

  function onRouteChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    if (!skinOn) return;
    updateTabBar(); updateCrumb(); applyDisguise();
    setTimeout(() => { updateSidebar(); updateCrumb(); applyDisguise(); }, 450);
    setTimeout(() => { updateSidebar(); }, 1600);
  }

  /* ================================================================
   * 17. [已移除] 内容观察（无限滚动补刷）
   *    v3.6.0：MutationObserver 在详情页 Vue 渲染时每秒触发上百次，
   *    即使有沉淀期也会和 Vue 抢 CPU。彻底移除，换肤完全由 CSS 承担。
   *    startObserver/stopObserver 已在第 9 节定义为空函数。
   * ================================================================ */

  /* ================================================================
   * 18. 启动
   *    document-start 先把样式打进去，避免白屏闪一下再变黑。
   * ================================================================ */
  function injectStyles() {
    if ($('vsc-vars')) return;
    const head = document.head || document.documentElement;
    const v = document.createElement('style');
    v.id = 'vsc-vars'; v.textContent = buildVars();
    head.appendChild(v);
    const s = document.createElement('style');
    s.id = 'vsc-skin'; s.textContent = CSS;
    head.appendChild(s);
  }

  function whenBody(fn) {
    if (document.body) return fn();
    // 只观察 documentElement 的直接子节点。<body> 本来就是 <html> 的直接子节点，
    // 加 subtree:true 会让 HTML 解析期间每插入一个节点都回调一次（成千上万次），
    // 白白拖慢首屏。
    new MutationObserver((m, o) => {
      if (document.body) { o.disconnect(); fn(); }
    }).observe(document.documentElement, { childList: true });
  }

  injectStyles();
  if (cfg.enabled) document.documentElement.setAttribute('data-vsc', 'on');
  applyFlags();

  // 延迟启动：CSS 立即注入（轻量，不卡），但 JS 逻辑（MutationObserver、scan、外壳构建）
  // 延迟到 window load 事件后 800ms 再启动。
  // 原因：@run-at document-start 时，脚本在 HTML 刚开始解析就执行，
  // 此时 Vue 框架正在初始化、DOM 正在疯狂创建。
  // 如果此时就启动 MutationObserver + scan + getComputedStyle，
  // 会和 Vue 首屏渲染抢 CPU → 主线程打满 → 页面卡死、转圈不停。
  // 延迟启动让 Vue 先完成首屏渲染， JS 逻辑再进场补暗色。
  // CSS 在 body 出现时立即生效（加 vscode-mode class），避免白屏闪烁。
  function delayedInit() {
    whenBody(() => {
      // CSS 立即生效：加 class 让暗色主题在 Vue 渲染期间就已生效
      if (cfg.enabled) document.body.classList.add('vscode-mode');
      injectStyles();
      bindEvents();
      if (cfg.enabled) {
        skinOn = false;
        setSkin(true);
        setTimeout(() => { updateTabBar(); updateSidebar(); updateCrumb(); }, 1200);
        setTimeout(() => { updateSidebar(); }, 3000);
      } else {
        applyFlags();
      }
    });
  }

  if (document.readyState === 'complete') {
    setTimeout(delayedInit, 200);
  } else {
    window.addEventListener('load', () => setTimeout(delayedInit, 800));
  }
})();
