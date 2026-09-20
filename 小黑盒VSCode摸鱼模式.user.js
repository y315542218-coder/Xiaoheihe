// ==UserScript==
// @name         小黑盒 VS Code 摸鱼模式
// @namespace    https://www.xiaoheihe.cn/
// @version      4.3.1
// @description  纯前端深色换肤：通过覆盖小黑盒自身的设计令牌(CSS 变量)把整站变成 VS Code 深色外观，内容、图片、排版全部保持原样。附 VS Code 编辑器外壳(活动栏/侧边栏/标签页/状态栏)。Ctrl+` Boss 模式 / Ctrl+Shift+P 命令面板 / Ctrl+Alt+V 一键开关还原。
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
   * 设计原则（v4 重写）
   * ----------------------------------------------------------------
   * 换肤的主力是「令牌覆盖」而不是「逐元素扫描」：
   *   小黑盒整站由一套 CSS 变量驱动 —— --hb-general-color-bg / text / stroke 系列、
   *   --hb-primary 系列，以及 Element Plus 的 --el- 系列。只要在 html[data-vsc=on] 上
   *   把这些令牌重定义成深色，整站(首页/详情页/所有组件)一次性变暗，
   *   且完全不改 DOM、不动布局、不碰图片 —— 图片照原样整齐排列。
   *
   * 相比 v3 的好处：
   *   1. 布局不再被 margin 硬推 —— 改用 body padding 给外壳让位，
   *      不与站点自身的居中/max-width 打架。
   *   2. 图片默认原样显示（你说过不需要改图片）。
   *   3. 几乎零常驻 CPU —— 不再每次 DOM 变动就 getComputedStyle 全页扫描。
   *   4. 详情页同样生效（用的是同一套令牌）。
   *
   * 逐元素扫描(deepScan)保留为「可选补漏」，默认关闭；
   * 令牌覆盖已经能盖住绝大多数情况。
   * ================================================================ */

  /* ================================================================
   * 1. 配置
   * ================================================================ */
  const LS_KEY = 'vscode-skin:cfg';
  const DEFAULTS = {
    enabled: true,
    theme: 'dark-plus',     // dark-plus | monokai | one-dark
    mono: true,             // 全站等宽字体
    minimap: true,          // 右侧缩略图
    breadcrumb: true,       // 面包屑栏
    codeDecor: true,        // 帖子行号 / 标题引号等代码装饰
    hideImages: true,       // 摸鱼用：把图片替换成代码占位（悬停显图）
    fakeTitle: true,        // 伪装标签页标题
    fakeFavicon: true,      // 伪装标签页图标
    bossOnBlur: false,      // 窗口失焦自动 Boss 模式
    deepScan: false,        // 逐元素补漏扫描（令牌覆盖不到的极少数硬编码颜色时才需要）
  };
  // v4.3.0：强制清除旧版遗留配置
  // 旧版 hideImages 默认是 false，localStorage 里存了 false 会覆盖新默认值 true，
  // 导致图片隐藏永远不生效。这里直接强制设为 true 并写回，不管旧值是什么。
  const cfg = Object.assign({}, DEFAULTS, readCfg());
  function readCfg() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (_) { return {}; } }
  function saveCfg() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (_) {} }
  if (cfg.hideImages !== true) { cfg.hideImages = true; saveCfg(); }

  /* ================================================================
   * 2. 主题
   * ================================================================ */
  const THEMES = {
    'dark-plus': {
      name: 'Dark+',
      editor: '#1e1e1e', panel: '#252526', activity: '#333333', status: '#007acc',
      border: '#3c3c3c', chip: '#2d2d2d', hover: '#2a2d2e', line: '#2d2d2d',
      text: '#d4d4d4', textDim: '#b5bac0', textFaint: '#8a9199', textRGB: '212,212,212',
      lineNum: '#858585', accent: '#007acc', mask: 'rgba(30,30,30,.7)',
      comment: '#6a9955', string: '#ce9178', keyword: '#569cd6', ctrl: '#c586c0',
      fn: '#dcdcaa', varc: '#9cdcfe', num: '#b5cea8', type: '#4ec9b0',
    },
    'monokai': {
      name: 'Monokai',
      editor: '#272822', panel: '#2d2e27', activity: '#1e1f1c', status: '#75715e',
      border: '#3e3d32', chip: '#3a3b32', hover: '#34352c', line: '#3e3d32',
      text: '#f8f8f2', textDim: '#d8d8cf', textFaint: '#a6a696', textRGB: '248,248,242',
      lineNum: '#90907a', accent: '#a6e22e', mask: 'rgba(39,40,34,.7)',
      comment: '#88846f', string: '#e6db74', keyword: '#f92672', ctrl: '#f92672',
      fn: '#a6e22e', varc: '#66d9ef', num: '#ae81ff', type: '#66d9ef',
    },
    'one-dark': {
      name: 'One Dark',
      editor: '#282c34', panel: '#21252b', activity: '#1b1f24', status: '#4d78cc',
      border: '#3e4451', chip: '#333842', hover: '#2c313a', line: '#3a3f4b',
      text: '#abb2bf', textDim: '#9aa2b1', textFaint: '#7f8796', textRGB: '171,178,191',
      lineNum: '#5c6370', accent: '#61afef', mask: 'rgba(40,44,52,.7)',
      comment: '#7f848e', string: '#98c379', keyword: '#c678dd', ctrl: '#c678dd',
      fn: '#61afef', varc: '#e06c75', num: '#d19a66', type: '#e5c07b',
    },
  };
  const themeOf = () => THEMES[cfg.theme] || THEMES['dark-plus'];
  const MONO_STACK = "Consolas, 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace";

  /* ================================================================
   * 3. 变量层：chrome 变量(:root) + 站点令牌覆盖(html[data-vsc]) + 响应式
   *    换主题只重写这一段。
   * ================================================================ */
  function buildVars() {
    const T = themeOf();
    return `
    :root {
      --vsc-editor:${T.editor}; --vsc-panel:${T.panel}; --vsc-activity:${T.activity};
      --vsc-status:${T.status}; --vsc-border:${T.border}; --vsc-chip:${T.chip};
      --vsc-hover:${T.hover}; --vsc-line:${T.line};
      --vsc-text:${T.text}; --vsc-dim:${T.textDim}; --vsc-faint:${T.textFaint};
      --vsc-num-col:${T.lineNum}; --vsc-accent:${T.accent};
      --vsc-comment:${T.comment}; --vsc-string:${T.string}; --vsc-keyword:${T.keyword};
      --vsc-ctrl:${T.ctrl}; --vsc-fn:${T.fn}; --vsc-var:${T.varc}; --vsc-number:${T.num};
      --vsc-type:${T.type}; --vsc-font:${MONO_STACK};

      --vsc-act-w:48px; --vsc-side-w:220px; --vsc-tab-h:35px; --vsc-crumb-h:22px;
      --vsc-status-h:22px; --vsc-mini-w:64px;
      --vsc-left:calc(var(--vsc-act-w) + var(--vsc-side-w));
      --vsc-top:calc(var(--vsc-tab-h) + var(--vsc-crumb-h));
    }
    html:not([data-vsc-crumb="1"]) { --vsc-crumb-h:0px; }
    html:not([data-vsc-mini="1"])  { --vsc-mini-w:0px; }
    html:not([data-vsc-side="1"])  { --vsc-side-w:0px; }
    /* :root(0,1,0) 优先级高于 html(0,0,1)，媒体查询里必须写 :root 才压得住上面的定义 */
    @media (max-width: 1100px) { :root { --vsc-mini-w:0px; } }
    @media (max-width: 980px)  { :root { --vsc-side-w:0px; } }

    /* ==== 站点设计令牌覆盖：整站换肤的主力，一次盖住首页/详情页/所有组件 ==== */
    html[data-vsc="on"] {
      --hb-general-color-bg-0:${T.editor}; --hb-general-color-bg-1:${T.editor};
      --hb-general-color-bg-2:${T.editor}; --hb-general-color-bg-3:${T.panel};
      --hb-general-color-bg-4:${T.panel}; --hb-general-color-plain:${T.panel};
      --hb-general-color-bg-5:rgba(20,22,26,.9); --hb-general-color-bg-6:rgba(255,255,255,.08);
      --hb-general-color-text-1:${T.text}; --hb-general-color-text-2:${T.textDim};
      --hb-general-color-text-3:${T.textFaint}; --hb-general-color-text-4:${T.textFaint};
      --hb-general-color-text-6:${T.text};
      --hb-general-color-stroke-0:${T.border}; --hb-general-color-stroke-1:${T.line};
      --hb-general-color-stroke-2:${T.line}; --hb-general-color-stroke-3:${T.line};
      --hb-primary:${T.text}; --hb-primary--value:${T.textRGB};
      --hb-primary-dynamic:${T.text}; --hb-primary-dynamic--value:${T.textRGB};
      --hb-general-color-primary:${T.text};

      --el-bg-color:${T.panel}; --el-bg-color-overlay:${T.panel}; --el-bg-color-page:${T.editor};
      --el-fill-color:${T.chip}; --el-fill-color-light:${T.chip}; --el-fill-color-lighter:${T.panel};
      --el-fill-color-blank:${T.panel}; --el-fill-color-dark:${T.chip}; --el-fill-color-darker:${T.chip};
      --el-fill-color-extra-light:${T.panel};
      --el-text-color-primary:${T.text}; --el-text-color-regular:${T.textDim};
      --el-text-color-secondary:${T.textFaint}; --el-text-color-placeholder:${T.textFaint};
      --el-border-color:${T.border}; --el-border-color-light:${T.line};
      --el-border-color-lighter:${T.line}; --el-border-color-extra-light:${T.line};
      --el-border-color-dark:${T.border}; --el-border-color-darker:${T.border};
      --el-border-color-hover:${T.border};
      --el-mask-color:${T.mask}; --el-mask-color-extra-light:rgba(0,0,0,.3);
      --el-menu-bg-color:${T.panel}; --el-menu-text-color:${T.textDim};
      --el-menu-hover-bg-color:${T.hover}; --el-menu-active-color:${T.text};
      --el-menu-hover-text-color:${T.text}; --el-menu-item-hover-fill:${T.hover};
      --el-disabled-bg-color:${T.chip}; --el-disabled-text-color:${T.textFaint};
      --swiper-theme-color:${T.accent};
    }`;
  }

  /* ================================================================
   * 4. 主样式：布局让位 + 编辑器外壳 + 少量代码装饰
   *    颜色一律走 var()，与主题无关，换主题不必重写这段。
   * ================================================================ */
  const CSS = `
  html[data-vsc="on"] { background: var(--vsc-editor) !important; }

  /* ---- 布局：用 body padding 给固定面板让位，不动站点自身布局 ----
     不再对 main 用 margin 硬推（会与站点居中/max-width 打架，把内容挤到一边）。 */
  body.vscode-mode {
    margin: 0 !important;
    box-sizing: border-box !important;
    padding-top: var(--vsc-top) !important;
    padding-left: var(--vsc-left) !important;
    padding-right: var(--vsc-mini-w) !important;
    padding-bottom: var(--vsc-status-h) !important;
    background: var(--vsc-editor) !important;
    min-height: 100vh;
  }
  /* 让正文填满编辑区，去掉站点的宽度上限造成的大片留白 */
  body.vscode-mode main { max-width: none !important; margin: 0 !important; }
  body.vscode-mode main > section,
  body.vscode-mode main > .layout-normal { max-width: none !important; margin: 0 !important; }

  /* 顶部搜索原本 sticky 在 80px(旧导航下)，改到我们的顶栏之下 */
  body.vscode-mode .bbs-community__search-module { top: var(--vsc-top) !important; }

  /* ================================================================
   * 实测补丁：以下这些在真实站点上「不走令牌、把颜色写死」，
   * 令牌覆盖管不到，必须点名。类名与数值都是在真实页面上实测得到的。
   * ================================================================ */

  /* body 本身没设 color，不补的话其余文字会继承默认黑色 */
  body.vscode-mode { color: var(--vsc-text) !important; }

  /* 写死白底的容器 */
  body.vscode-mode .hb-cpt__scroll-list,
  body.vscode-mode .bbs-home__content-list,
  body.vscode-mode .bbs-home__content-item,
  body.vscode-mode .hb-cpt__bbs-content,
  /* 详情页写死白底的容器 */
  body.vscode-mode .list,
  body.vscode-mode .hb-cpt-page-header,
  body.vscode-mode .hb-bbs-link__header,
  body.vscode-mode .page-header__container-bg,
  body.vscode-mode .header-image__item,
  body.vscode-mode .swiper-slide,
  body.vscode-mode .hb-bbs-image-text,
  body.vscode-mode .link-comment__comment-children,
  body.vscode-mode .link-reply,
  body.vscode-mode .link-comment__reply,
  body.vscode-mode .link-reply__input-wrapper,
  body.vscode-mode .page-header__back-btn,
  body.vscode-mode .hb-cpt__pagination,
  body.vscode-mode .bbs-link__related-recommend,
  body.vscode-mode .link-section-link-data,
  body.vscode-mode .link-section-tags,
  body.vscode-mode .link-section-user,
  body.vscode-mode .hb-article,
  body.vscode-mode .img-media,
  body.vscode-mode .img,
  /* Element Plus 组件暗色化(弹窗/下拉/卡片等) */
  body.vscode-mode .el-dialog,
  body.vscode-mode .el-message-box,
  body.vscode-mode .el-drawer,
  body.vscode-mode .el-popover,
  body.vscode-mode .el-popper,
  body.vscode-mode .el-select-dropdown,
  body.vscode-mode .el-autocomplete-suggestion,
  body.vscode-mode .el-card,
  body.vscode-mode .el-table,
  body.vscode-mode .el-table tr,
  body.vscode-mode .el-table th.el-table__cell,
  body.vscode-mode .el-table td.el-table__cell,
  body.vscode-mode .el-collapse-item__wrap,
  body.vscode-mode .el-tabs__content,
  body.vscode-mode .el-transfer-panel,
  body.vscode-mode .el-image-viewer__wrapper,
  body.vscode-mode .el-empty,
  body.vscode-mode .el-tag {
    background-color: transparent !important; background-image: none !important;
  }

  /* 写死浅灰的小块 */
  body.vscode-mode .bbs-new-style-bottom__rich-stack,
  body.vscode-mode .hb-cpt__image--default,
  body.vscode-mode .page-header__back-btn,
  body.vscode-mode .el-input__wrapper,
  body.vscode-mode .link-reply__input-wrapper,
  body.vscode-mode .hb-cpt__content-tag,
  body.vscode-mode .link-tags__tag-item { background-color: var(--vsc-chip) !important; }

  /* 写死深色文字的几处 */
  body.vscode-mode .bbs-content__title { color: var(--vsc-string) !important; }
  body.vscode-mode .bbs-content__content,
  body.vscode-mode .bbs-content__text { color: var(--vsc-comment) !important; }
  body.vscode-mode .bbs-home__topic-name { color: var(--vsc-dim) !important; }
  body.vscode-mode .el-input__inner { color: var(--vsc-text) !important; }
  body.vscode-mode .list-content__username { color: var(--vsc-fn) !important; }
  body.vscode-mode .section-title__content { color: var(--vsc-string) !important; }
  body.vscode-mode .comment-item__content { color: var(--vsc-text) !important; }

  /* 站点用伪元素画了大片白底板，一并压平。 */
  body.vscode-mode main > section::before, body.vscode-mode main > section::after,
  body.vscode-mode .list::before, body.vscode-mode .list::after,
  body.vscode-mode .layout-normal::before, body.vscode-mode .layout-normal::after,
  body.vscode-mode .hb-bbs-link::before, body.vscode-mode .hb-bbs-link::after,
  body.vscode-mode .bbs-home__content-item::before, body.vscode-mode .bbs-home__content-item::after,
  body.vscode-mode .bbs-home__topic-list-wrapper::before, body.vscode-mode .bbs-home__topic-list-wrapper::after,
  body.vscode-mode .hb-cpt__scroll-list::before, body.vscode-mode .hb-cpt__scroll-list::after,
  body.vscode-mode .bbs-home__content-list::before, body.vscode-mode .bbs-home__content-list::after,
  body.vscode-mode .link-comment__comment-item::before, body.vscode-mode .link-comment__comment-item::after,
  body.vscode-mode .link-reply::before, body.vscode-mode .link-reply::after,
  body.vscode-mode .link-comment__reply::before, body.vscode-mode .link-comment__reply::after,
  body.vscode-mode .hb-cpt__pagination::before, body.vscode-mode .hb-cpt__pagination::after,
  body.vscode-mode .hb-bbs-image-text::before, body.vscode-mode .hb-bbs-image-text::after,
  body.vscode-mode .page-header__container-bg::before, body.vscode-mode .page-header__container-bg::after {
    background-color: transparent !important; background-image: none !important; box-shadow: none !important;
  }

  /* 帖子之间的分隔线 */
  body.vscode-mode .bbs-home__content-item { border-bottom: 1px solid var(--vsc-line) !important; }

  /* 详情页 #page-bbs-link 下无 class 的白底壳：站点用 inline scoped 样式写死 */
  body.vscode-mode #page-bbs-link .layout-normal > div,
  body.vscode-mode #page-bbs-link .layout-normal > div > div {
    background-color: transparent !important; background-image: none !important;
  }

  /* 隐藏原导航(被标签栏+命令面板取代)与右侧推广位 */
  body.vscode-mode nav.nav,
  body.vscode-mode .cpt-right-side.right,
  body.vscode-mode .qr-section { display: none !important; }

  /* ---- Element Plus 弹窗/对话框/下拉菜单全面暗色化 ----
     Element Plus 的弹窗组件(.el-dialog/.el-message-box/.el-drawer 等)挂在 body 下，
     不在 main 内，站点令牌覆盖可能管不到，必须点名。 */
  body.vscode-mode .el-dialog,
  body.vscode-mode .el-message-box,
  body.vscode-mode .el-drawer,
  body.vscode-mode .el-popover,
  body.vscode-mode .el-popper,
  body.vscode-mode .el-select-dropdown,
  body.vscode-mode .el-select-dropdown__item,
  body.vscode-mode .el-autocomplete-suggestion,
  body.vscode-mode .el-cascader__dropdown,
  body.vscode-mode .el-cascader-menu,
  body.vscode-mode .el-color-picker__panel,
  body.vscode-mode .el-date-picker,
  body.vscode-mode .el-time-picker,
  body.vscode-mode .el-time-panel,
  body.vscode-mode .el-picker-panel,
  body.vscode-mode .el-calendar,
  body.vscode-mode .el-calendar-table .el-calendar-day,
  body.vscode-mode .el-card,
  body.vscode-mode .el-collapse-item__content,
  body.vscode-mode .el-collapse-item__wrap,
  body.vscode-mode .el-tabs__content,
  body.vscode-mode .el-tab-pane,
  body.vscode-mode .el-table,
  body.vscode-mode .el-table tr,
  body.vscode-mode .el-table th.el-table__cell,
  body.vscode-mode .el-table td.el-table__cell,
  body.vscode-mode .el-form-item__content,
  body.vscode-mode .el-transfer-panel,
  body.vscode-mode .el-image-viewer__wrapper,
  body.vscode-mode .el-image__placeholder,
  body.vscode-mode .el-image__error,
  body.vscode-mode .el-skeleton__item,
  body.vscode-mode .el-empty,
  body.vscode-mode .el-tag,
  body.vscode-mode .el-check-tag,
  body.vscode-mode .el-tooltip__content,
  body.vscode-mode [class*="el-popup"] {
    background-color: var(--vsc-panel) !important;
    color: var(--vsc-text) !important;
    border-color: var(--vsc-border) !important;
  }
  /* 弹窗内的次要背景 */
  body.vscode-mode .el-dialog__header,
  body.vscode-mode .el-dialog__body,
  body.vscode-mode .el-dialog__footer,
  body.vscode-mode .el-message-box__header,
  body.vscode-mode .el-message-box__content,
  body.vscode-mode .el-message-box__btns,
  body.vscode-mode .el-drawer__header,
  body.vscode-mode .el-drawer__body,
  body.vscode-mode .el-card__header,
  body.vscode-mode .el-card__body,
  body.vscode-mode .el-tabs__nav-wrap,
  body.vscode-mode .el-tabs__header,
  body.vscode-mode .el-collapse,
  body.vscode-mode .el-table__inner-wrapper,
  body.vscode-mode .el-table__body-wrapper {
    background-color: transparent !important;
    color: var(--vsc-text) !important;
  }
  /* 弹窗标题/正文文字色 */
  body.vscode-mode .el-dialog__title,
  body.vscode-mode .el-message-box__title,
  body.vscode-mode .el-message-box__message,
  body.vscode-mode .el-message-box__content p,
  body.vscode-mode .el-drawer__title {
    color: var(--vsc-text) !important;
  }
  /* 弹窗内列表项 hover */
  body.vscode-mode .el-select-dropdown__item.hover,
  body.vscode-mode .el-select-dropdown__item:hover,
  body.vscode-mode .el-autocomplete-suggestion li:hover,
  body.vscode-mode .el-cascader-node:hover,
  body.vscode-mode .el-tree-node__content:hover {
    background-color: var(--vsc-hover) !important;
    color: var(--vsc-text) !important;
  }
  body.vscode-mode .el-select-dropdown__item.selected { color: var(--vsc-accent) !important; }
  /* 弹窗内输入框 */
  body.vscode-mode .el-dialog input,
  body.vscode-mode .el-message-box input,
  body.vscode-mode .el-drawer input,
  body.vscode-mode .el-popover input,
  body.vscode-mode .el-dialog textarea,
  body.vscode-mode .el-drawer textarea {
    background-color: var(--vsc-chip) !important;
    color: var(--vsc-text) !important;
    border-color: var(--vsc-border) !important;
  }
  /* 弹窗遮罩层 */
  body.vscode-mode .el-overlay,
  body.vscode-mode .el-overlay-dialog {
    background-color: var(--vsc-mask) !important;
  }
  /* 弹窗内按钮 */
  body.vscode-mode .el-dialog .el-button,
  body.vscode-mode .el-message-box .el-button,
  body.vscode-mode .el-drawer .el-button {
    background-color: var(--vsc-chip) !important;
    color: var(--vsc-text) !important;
    border-color: var(--vsc-border) !important;
  }
  body.vscode-mode .el-dialog .el-button--primary,
  body.vscode-mode .el-message-box .el-button--primary,
  body.vscode-mode .el-drawer .el-button--primary {
    background-color: var(--vsc-status) !important;
    color: #fff !important;
    border-color: var(--vsc-status) !important;
  }
  /* 站点自定义弹窗（非 Element Plus） */
  body.vscode-mode [class*="modal-content" i],
  body.vscode-mode [class*="popup-content" i],
  body.vscode-mode [class*="dialog-content" i],
  body.vscode-mode .hb-cpt__modal,
  body.vscode-mode .hb-cpt__dialog,
  body.vscode-mode .hb-cpt__popup {
    background-color: var(--vsc-panel) !important;
    color: var(--vsc-text) !important;
    border-color: var(--vsc-border) !important;
  }
  /* 图片查看器 */
  body.vscode-mode .el-image-viewer__mask,
  body.vscode-mode .el-image-viewer__wrapper {
    background-color: rgba(0,0,0,.85) !important;
  }
  body.vscode-mode .el-image-viewer__btn { background-color: var(--vsc-chip) !important; color: var(--vsc-text) !important; }

  /* ---- 字体：等宽字体一把套上，再把图标字体还回去 ---- */
  html[data-vsc-mono="1"] body.vscode-mode,
  html[data-vsc-mono="1"] body.vscode-mode * { font-family: var(--vsc-font) !important; }
  html[data-vsc-mono="1"] body.vscode-mode i,
  html[data-vsc-mono="1"] body.vscode-mode .hb-icon,
  html[data-vsc-mono="1"] body.vscode-mode .el-icon,
  html[data-vsc-mono="1"] body.vscode-mode .el-icon *,
  html[data-vsc-mono="1"] body.vscode-mode [class^="icon-"],
  html[data-vsc-mono="1"] body.vscode-mode [class*=" icon-"],
  html[data-vsc-mono="1"] body.vscode-mode svg,
  html[data-vsc-mono="1"] body.vscode-mode svg * { font-family: revert !important; }

  body.vscode-mode ::selection { background: #264f78; color: #fff; }

  /* 滚动条 */
  body.vscode-mode ::-webkit-scrollbar { width: 12px; height: 12px; }
  body.vscode-mode ::-webkit-scrollbar-track { background: var(--vsc-editor); }
  body.vscode-mode ::-webkit-scrollbar-thumb { background: #424242; border-radius: 6px; border: 3px solid var(--vsc-editor); }
  body.vscode-mode ::-webkit-scrollbar-thumb:hover { background: #4f4f4f; }
  body.vscode-mode { scrollbar-color: #424242 var(--vsc-editor); scrollbar-width: thin; }

  /* ---- 代码装饰（可关）：只加 ::before/::after，不改真实内容与布局 ---- */
  html[data-vsc-decor="1"] body.vscode-mode .bbs-home__content-list { counter-reset: vsc-line; }
  html[data-vsc-decor="1"] body.vscode-mode .bbs-home__content-item {
    position: relative; padding-left: 46px !important;
  }
  html[data-vsc-decor="1"] body.vscode-mode .bbs-home__content-item::before {
    counter-increment: vsc-line; content: counter(vsc-line);
    position: absolute; left: 0; top: 14px; width: 34px; text-align: right;
    color: var(--vsc-num-col); font-size: 12px; user-select: none; pointer-events: none;
    font-family: var(--vsc-font);
  }
  html[data-vsc-decor="1"] body.vscode-mode .bbs-content__title::before,
  html[data-vsc-decor="1"] body.vscode-mode .bbs-content__title::after {
    content: '"'; color: var(--vsc-string); opacity: .8;
  }
  html[data-vsc-decor="1"] body.vscode-mode .list-content__username::before {
    content: '@'; color: var(--vsc-fn); margin-right: 1px;
  }

  /* ---- 摸鱼：把所有图片替换成代码占位，悬停显图 ----
     原则：只改 opacity，不动 width/height/display/position，保证布局与懒加载不受影响。
     覆盖：帖子缩略图、详情页正文配图、用户头像、视频封面、分类图标。 */
  /* 所有图片透明 */
  html[data-vsc-img="hide"] body.vscode-mode .hb-cpt__image .hb-cpt__image-elem,
  html[data-vsc-img="hide"] body.vscode-mode .bbs-content__video-cover,
  html[data-vsc-img="hide"] body.vscode-mode .hb-article img.img-item,
  html[data-vsc-img="hide"] body.vscode-mode .hb-cpt-avatar img.hb-avatar__image,
  html[data-vsc-img="hide"] body.vscode-mode img.bbs-home__topic-item-icon,
  html[data-vsc-img="hide"] body.vscode-mode .header-image__item img,
  html[data-vsc-img="hide"] body.vscode-mode .link-section-user img,
  html[data-vsc-img="hide"] body.vscode-mode .comment-item__user-avatar img {
    opacity: 0; transition: opacity .12s ease;
  }

  /* 帖子缩略图：{ } 占位
     注意：不要改 .hb-cpt__image 的 position！
     小黑盒缩略图是 absolute 定位拼的瀑布流，改 relative 会把整排图打回普通流 → 堆叠错位。
     站点已定好位，这里只加 ::after 占位层。 */
  html[data-vsc-img="hide"] body.vscode-mode .hb-cpt__image::after {
    content: '{ }'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: var(--vsc-chip); color: var(--vsc-comment); border: 1px solid var(--vsc-border);
    border-radius: 3px; font-family: var(--vsc-font); pointer-events: none;
  }
  html[data-vsc-img="hide"] body.vscode-mode .hb-cpt__image:hover .hb-cpt__image-elem { opacity: 1; z-index: 2; }
  html[data-vsc-img="hide"] body.vscode-mode .hb-cpt__image:hover::after { content: none; }

  /* 详情页正文配图：< /> 占位 */
  html[data-vsc-img="hide"] body.vscode-mode .hb-article .img-media,
  html[data-vsc-img="hide"] body.vscode-mode .hb-article .img { position: relative; }
  html[data-vsc-img="hide"] body.vscode-mode .hb-article .img-media::after,
  html[data-vsc-img="hide"] body.vscode-mode .hb-article .img::after {
    content: '< />'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: var(--vsc-chip); color: var(--vsc-fn); border: 1px solid var(--vsc-border);
    border-radius: 3px; font-family: var(--vsc-font); font-size: 16px; pointer-events: none;
  }
  html[data-vsc-img="hide"] body.vscode-mode .hb-article .img-media:hover img.img-item,
  html[data-vsc-img="hide"] body.vscode-mode .hb-article .img:hover img.img-item { opacity: 1; z-index: 2; }
  html[data-vsc-img="hide"] body.vscode-mode .hb-article .img-media:hover::after,
  html[data-vsc-img="hide"] body.vscode-mode .hb-article .img:hover::after { content: none; }

  /* 用户头像：@ 占位 */
  html[data-vsc-img="hide"] body.vscode-mode .hb-cpt-avatar { position: relative; }
  html[data-vsc-img="hide"] body.vscode-mode .hb-cpt-avatar::after {
    content: '@'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: var(--vsc-chip); color: var(--vsc-string); border-radius: 50%; pointer-events: none; font-size: 12px;
  }
  html[data-vsc-img="hide"] body.vscode-mode .hb-cpt-avatar:hover img.hb-avatar__image { opacity: 1; z-index: 2; }
  html[data-vsc-img="hide"] body.vscode-mode .hb-cpt-avatar:hover::after { content: none; }
  html[data-vsc-img="hide"] body.vscode-mode .hb-cpt-avatar__avatar-decoration { opacity: 0; }

  /* 分类栏游戏图标：直接隐藏（不需要悬停，这些图标太小没意义） */
  html[data-vsc-img="hide"] body.vscode-mode img.bbs-home__topic-item-icon {
    width: 0 !important; height: 0 !important; margin: 0 !important; padding: 0 !important; opacity: 0 !important;
  }

  /* 详情页头图 */
  html[data-vsc-img="hide"] body.vscode-mode .header-image__item { position: relative; }
  html[data-vsc-img="hide"] body.vscode-mode .header-image__item::after {
    content: '< />'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: var(--vsc-chip); color: var(--vsc-fn); pointer-events: none;
  }
  html[data-vsc-img="hide"] body.vscode-mode .header-image__item:hover img { opacity: 1; z-index: 2; }
  html[data-vsc-img="hide"] body.vscode-mode .header-image__item:hover::after { content: none; }

  /* 评论区头像 */
  html[data-vsc-img="hide"] body.vscode-mode .comment-item__user-avatar { position: relative; }
  html[data-vsc-img="hide"] body.vscode-mode .comment-item__user-avatar::after {
    content: '@'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: var(--vsc-chip); color: var(--vsc-string); border-radius: 50%; pointer-events: none; font-size: 10px;
  }
  html[data-vsc-img="hide"] body.vscode-mode .comment-item__user-avatar:hover img { opacity: 1; z-index: 2; }
  html[data-vsc-img="hide"] body.vscode-mode .comment-item__user-avatar:hover::after { content: none; }

  /* ================================================================
   * 编辑器外壳（全部是脚本自建 fixed 元素，与页面互不干涉）
   * ================================================================ */
  [data-vsc-ui] { box-sizing: border-box; font-family: var(--vsc-font); }

  #vsc-activity {
    position: fixed; left: 0; top: var(--vsc-tab-h); bottom: var(--vsc-status-h);
    width: var(--vsc-act-w); background: var(--vsc-activity); z-index: 2147483000;
    display: flex; flex-direction: column; align-items: center; padding-top: 4px; gap: 2px;
  }
  #vsc-activity .ic {
    width: var(--vsc-act-w); height: 48px; display: flex; align-items: center; justify-content: center;
    font-size: 20px; color: var(--vsc-faint); cursor: pointer; user-select: none; border-left: 2px solid transparent;
  }
  #vsc-activity .ic:hover { color: var(--vsc-text); }
  #vsc-activity .ic.on { color: #fff; border-left-color: #fff; }
  #vsc-activity .spacer { flex: 1; }

  #vsc-sidebar {
    position: fixed; left: var(--vsc-act-w); top: var(--vsc-tab-h); bottom: var(--vsc-status-h);
    width: var(--vsc-side-w); background: var(--vsc-panel); z-index: 2147482999;
    overflow: hidden auto; font-size: 13px; line-height: 1.85; padding: 4px 0;
    color: var(--vsc-text); user-select: none;
  }
  html:not([data-vsc-side="1"]) #vsc-sidebar { display: none; }
  #vsc-sidebar .hd { font-size: 11px; color: var(--vsc-faint); padding: 6px 16px 4px; letter-spacing: .5px; font-weight: 700; text-transform: uppercase; }
  #vsc-sidebar .it { display: flex; align-items: center; gap: 6px; padding: 1px 10px 1px 16px; cursor: pointer; white-space: nowrap; overflow: hidden; }
  #vsc-sidebar .it:hover { background: var(--vsc-hover); }
  #vsc-sidebar .it.on { background: #37373d; }
  #vsc-sidebar .it .ic { flex-shrink: 0; width: 16px; text-align: center; font-size: 11px; }
  #vsc-sidebar .it .nm { overflow: hidden; text-overflow: ellipsis; }
  #vsc-sidebar .sub { padding-left: 16px; }
  #vsc-sidebar .c-ts,#vsc-sidebar .c-md,#vsc-sidebar .c-cpp,#vsc-sidebar .c-c,#vsc-sidebar .c-kt { color: #519aba; }
  #vsc-sidebar .c-js,#vsc-sidebar .c-json { color: #cbcb41; }
  #vsc-sidebar .c-py { color: #4b8bbe; }
  #vsc-sidebar .c-go,#vsc-sidebar .c-java,#vsc-sidebar .c-rs,#vsc-sidebar .c-swift,#vsc-sidebar .c-rb { color: var(--vsc-number); }
  #vsc-sidebar .f-ic { color: #dcb67a; }
  #vsc-sidebar .fn-ic { color: var(--vsc-fn); font-style: italic; }

  #vsc-tabbar {
    position: fixed; left: 0; top: 0; right: 0; height: var(--vsc-tab-h);
    background: var(--vsc-panel); z-index: 2147483001; display: flex; align-items: stretch;
    padding-left: var(--vsc-left); box-shadow: inset 0 -1px 0 var(--vsc-border);
  }
  #vsc-tabbar .tab { display: flex; align-items: center; gap: 8px; padding: 0 14px; background: var(--vsc-editor);
    border-right: 1px solid var(--vsc-border); color: var(--vsc-text); font-size: 13px; max-width: 300px;
    cursor: default; border-top: 1px solid var(--vsc-status); }
  #vsc-tabbar .tab.ghost { background: var(--vsc-panel); color: var(--vsc-faint); border-top-color: transparent; cursor: pointer; }
  #vsc-tabbar .tab.ghost:hover { color: var(--vsc-text); }
  #vsc-tabbar .tab .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vsc-text); flex-shrink: 0; }
  #vsc-tabbar .tab .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #vsc-tabbar .tab .lg { color: #519aba; flex-shrink: 0; font-size: 11px; }

  #vsc-crumb {
    position: fixed; left: var(--vsc-left); right: var(--vsc-mini-w); top: var(--vsc-tab-h); height: var(--vsc-crumb-h);
    background: var(--vsc-editor); z-index: 2147483000; display: flex; align-items: center; gap: 6px;
    padding: 0 18px; font-size: 12px; color: var(--vsc-faint); user-select: none; overflow: hidden; white-space: nowrap;
  }
  html:not([data-vsc-crumb="1"]) #vsc-crumb { display: none; }
  #vsc-crumb .sep { opacity: .6; }

  #vsc-minimap {
    position: fixed; right: 0; top: var(--vsc-top); bottom: var(--vsc-status-h); width: var(--vsc-mini-w);
    background: var(--vsc-editor); z-index: 2147482998; overflow: hidden; pointer-events: none;
    border-left: 1px solid rgba(255,255,255,.04); padding: 4px 6px;
  }
  html:not([data-vsc-mini="1"]) #vsc-minimap { display: none; }
  #vsc-minimap i { display: block; height: 2px; margin-bottom: 2px; border-radius: 1px; opacity: .5; }
  #vsc-minimap .vp { position: absolute; left: 0; right: 0; background: rgba(255,255,255,.07);
    border-top: 1px solid rgba(255,255,255,.05); border-bottom: 1px solid rgba(255,255,255,.05); }

  #vsc-status {
    position: fixed; left: 0; bottom: 0; right: 0; height: var(--vsc-status-h); background: var(--vsc-status);
    z-index: 2147483001; display: flex; align-items: center; justify-content: space-between; padding: 0 10px;
    font-size: 12px; color: #fff; user-select: none;
  }
  #vsc-status .l, #vsc-status .r { display: flex; align-items: center; gap: 12px; }
  #vsc-status .st { display: flex; align-items: center; gap: 4px; white-space: nowrap; padding: 0 2px; }
  #vsc-status .st.click { cursor: pointer; }
  #vsc-status .st.click:hover { background: rgba(255,255,255,.18); }

  #vsc-toast {
    position: fixed; bottom: 32px; right: 14px; background: var(--vsc-panel); color: var(--vsc-text);
    border: 1px solid var(--vsc-border); border-left: 3px solid var(--vsc-status); padding: 8px 14px;
    border-radius: 3px; font-size: 12px; z-index: 2147483200; opacity: 0; transform: translateY(6px);
    transition: opacity .25s, transform .25s; pointer-events: none; max-width: 340px;
  }
  #vsc-toast.on { opacity: 1; transform: translateY(0); }

  /* ---- 命令面板 ---- */
  #vsc-palette { position: fixed; inset: 0; z-index: 2147483300; display: none; background: rgba(0,0,0,.35); }
  #vsc-palette.on { display: block; }
  #vsc-palette .box { width: min(620px,92vw); margin: 60px auto 0; background: var(--vsc-panel);
    border: 1px solid var(--vsc-border); border-radius: 4px; box-shadow: 0 8px 30px rgba(0,0,0,.6); overflow: hidden; }
  #vsc-palette input { width: 100%; background: var(--vsc-chip); color: var(--vsc-text); border: 1px solid var(--vsc-status);
    outline: none; padding: 8px 10px; font-size: 14px; font-family: var(--vsc-font); }
  #vsc-palette ul { list-style: none; margin: 0; padding: 4px 0; max-height: 46vh; overflow: auto; }
  #vsc-palette li { padding: 5px 12px; font-size: 13px; color: var(--vsc-text); display: flex; justify-content: space-between; gap: 12px; cursor: pointer; }
  #vsc-palette li .k { color: var(--vsc-faint); font-size: 11px; }
  #vsc-palette li.sel { background: var(--vsc-status); color: #fff; }
  #vsc-palette li.sel .k { color: #e5eefa; }

  /* ---- Boss 模式 ---- */
  #vsc-boss { position: fixed; inset: 0; background: var(--vsc-editor); z-index: 2147483400; display: none; flex-direction: column; }
  #vsc-boss.on { display: flex; }
  #vsc-boss .act { position: fixed; left: 0; top: var(--vsc-tab-h); bottom: var(--vsc-status-h); width: var(--vsc-act-w);
    background: var(--vsc-activity); z-index: 1; display: flex; flex-direction: column; align-items: center; padding-top: 4px; gap: 2px; }
  #vsc-boss .act .ic { width: var(--vsc-act-w); height: 48px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: var(--vsc-faint); }
  #vsc-boss .tabs { height: var(--vsc-tab-h); background: var(--vsc-panel); display: flex; align-items: stretch;
    padding-left: var(--vsc-act-w); box-shadow: inset 0 -1px 0 var(--vsc-border); position: relative; z-index: 2; }
  #vsc-boss .tab { display: flex; align-items: center; gap: 8px; padding: 0 14px; background: var(--vsc-editor);
    border-right: 1px solid var(--vsc-border); border-top: 1px solid var(--vsc-status); color: var(--vsc-text); font-size: 13px; }
  #vsc-boss .tab.ghost { background: var(--vsc-panel); color: var(--vsc-faint); border-top-color: transparent; }
  #vsc-boss .tab .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vsc-text); }
  #vsc-boss .wrap { flex: 1; display: flex; min-height: 0; margin-left: var(--vsc-act-w); }
  #vsc-boss .code { flex: 1; overflow: auto; padding: 6px 0 40px; line-height: 1.55; font-size: 13px; color: var(--vsc-text); }
  #vsc-boss .ln-row { display: flex; padding-right: 16px; }
  #vsc-boss .ln-row:hover { background: var(--vsc-hover); }
  #vsc-boss .ln-row.cur { background: rgba(255,255,255,.04); box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); }
  #vsc-boss .ln { width: 52px; text-align: right; color: var(--vsc-num-col); padding-right: 18px; user-select: none; flex-shrink: 0; }
  #vsc-boss .tx { white-space: pre; }
  #vsc-boss .caret { display: inline-block; width: 1px; height: 1.1em; background: var(--vsc-text); vertical-align: text-bottom; animation: vsc-blink 1.05s steps(1) infinite; }
  @keyframes vsc-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
  #vsc-boss .term { height: 148px; flex-shrink: 0; border-top: 1px solid var(--vsc-border); background: var(--vsc-editor);
    margin-left: var(--vsc-act-w); font-size: 12px; color: var(--vsc-text); display: flex; flex-direction: column; }
  #vsc-boss .term .bar { display: flex; gap: 16px; padding: 4px 14px; font-size: 11px; color: var(--vsc-faint); border-bottom: 1px solid var(--vsc-border); }
  #vsc-boss .term .bar b { color: var(--vsc-text); font-weight: 400; border-bottom: 1px solid var(--vsc-text); padding-bottom: 3px; }
  #vsc-boss .term .out { padding: 6px 14px; overflow: auto; line-height: 1.6; }
  #vsc-boss .term .out div { white-space: pre-wrap; }
  #vsc-boss .status { height: var(--vsc-status-h); background: var(--vsc-status); display: flex; align-items: center;
    justify-content: space-between; padding: 0 10px; font-size: 12px; color: #fff; position: relative; z-index: 2; }
  #vsc-boss .status .l, #vsc-boss .status .r { display: flex; gap: 12px; align-items: center; }
  #vsc-boss .tk-k { color: var(--vsc-ctrl); } #vsc-boss .tk-s { color: var(--vsc-string); }
  #vsc-boss .tk-c { color: var(--vsc-comment); } #vsc-boss .tk-n { color: var(--vsc-number); }
  #vsc-boss .tk-f { color: var(--vsc-fn); } #vsc-boss .tk-t { color: var(--vsc-type); }
  #vsc-boss .tk-d { color: var(--vsc-fn); } #vsc-boss .tk-v { color: var(--vsc-var); }
  `;

  /* ================================================================
   * 5. 分类 → 扩展名
   * ================================================================ */
  const EXT_MAP = {
    'Steam': 'ts', '盒友杂谈': 'md', '数码硬件': 'py', '三角洲行动': 'go', 'PC游戏': 'java',
    'CS2': 'cpp', '英雄联盟': 'rs', '明日方舟': 'json', '绝地求生': 'c', 'Apex 英雄': 'kt',
    'CodeX': 'ts', '黑神话': 'go', '原神': 'json', '战锤40K': 'cpp',
  };
  const getExt = (cat) => (cat && EXT_MAP[cat.trim()]) || 'js';
  const truncate = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : (s || ''));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

  /* ================================================================
   * 6. Boss 模式假代码 + 语法高亮（单遍分词器）
   * ================================================================ */
  const FAKE_CODE = [
    '// src/services/data-processor.service.ts',
    'import { Injectable, Logger } from "@nestjs/common";',
    'import { InjectRepository } from "@nestjs/typeorm";',
    'import { Repository, In } from "typeorm";',
    'import { DataRecord } from "../entities/data-record.entity";',
    'import { CacheService } from "./cache.service";',
    'import { QueueService } from "./queue.service";',
    '',
    'const BATCH_SIZE = 500;',
    'const MAX_RETRY = 3;',
    '',
    '@Injectable()',
    'export class DataProcessorService {',
    '  private readonly logger = new Logger(DataProcessorService.name);',
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
    '        const enriched = await this.enrich(record);',
    '        await this.repo.save(enriched);',
    '        await this.cache.set(record.id, enriched, 3600);',
    '        await this.queue.publish("record.updated", enriched);',
    '        ok++;',
    '      } catch (err) {',
    '        failed++;',
    '        this.logger.error("Failed to process " + record.id);',
    '      }',
    '    }',
    '',
    '    const elapsed = Date.now() - started;',
    '    return { ok, failed, skipped: records.length - valid.length, elapsed };',
    '  }',
    '',
    '  private validate(record: DataRecord): boolean {',
    '    if (!record.id || !record.timestamp) return false;',
    '    if (record.value < 0) return false;',
    '    return true;',
    '  }',
    '',
    '  private async enrich(record: DataRecord): Promise<DataRecord> {',
    '    const metadata = await this.fetchMetadata(record.source);',
    '    return { ...record, metadata, processedAt: new Date() };',
    '  }',
    '}',
  ];
  const KEYWORDS = ['import','export','from','const','let','var','function','class','return','async','await',
    'new','if','else','for','of','in','while','do','try','catch','finally','throw','private','public','protected',
    'readonly','static','void','string','boolean','number','true','false','null','undefined','this','extends',
    'implements','interface','type','enum','namespace','default','as','yield','delete','typeof','instanceof','super','constructor'];
  const TOKEN_RE = new RegExp(
    '(\\/\\/[^\\n]*)|(`[^`]*`|"[^"]*"|\'[^\']*\')|\\b(0x[0-9a-fA-F]+|\\d+(?:\\.\\d+)?)\\b' +
    '|(@[A-Za-z_][\\w.]*)|\\b(' + KEYWORDS.join('|') + ')\\b|\\b([A-Z][A-Za-z0-9_]*)\\b|\\b([A-Za-z_$][\\w$]*)(?=\\s*\\()', 'g');
  function highlight(line) {
    if (!line) return '';
    let out = '', last = 0, m; TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(line)) !== null) {
      if (m[0] === '') { TOKEN_RE.lastIndex++; continue; }
      const cls = m[1] ? 'tk-c' : m[2] ? 'tk-s' : m[3] ? 'tk-n' : m[4] ? 'tk-d' : m[5] ? 'tk-k' : m[6] ? 'tk-t' : 'tk-f';
      out += esc(line.slice(last, m.index)) + '<span class="' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + esc(line.slice(last));
  }

  /* ================================================================
   * 7. 运行时状态
   * ================================================================ */
  let skinOn = false, bossOn = false, paletteOn = false;
  let lastEsc = 0, lastUrl = location.href, scanTimer = 0, mo = null;
  let origTitle = '', origIcon = null, titleObserver = null;
  let seen = new WeakMap();
  const touched = new Set();

  const CODE_ICON = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#1e1e1e"/>' +
    '<path d="M11 9 4 16l7 7" stroke="#4fa6f0" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M21 9l7 7-7 7" stroke="#4fa6f0" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>');

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
  function toast(msg, ms) {
    const t = $('vsc-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('on'), ms || 2400);
  }

  /* ---- deepScan 用到的颜色工具（默认不跑） ---- */
  function parseColor(str) {
    const m = str && str.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?/);
    if (!m) return null;
    let a = 1; if (m[4] !== undefined) a = m[4].indexOf('%') > -1 ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  const lumOf = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  const satOf = (c) => { const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b); return mx === 0 ? 0 : (mx - mn) / mx; };
  function lighten(c, target) {
    const r = c.r/255, g = c.g/255, b = c.b/255, mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    let h = 0; const l = (mx+mn)/2, d = mx-mn; const s = d === 0 ? 0 : d/(1-Math.abs(2*l-1));
    if (d !== 0) { if (mx===r) h=((g-b)/d)%6; else if (mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; if(h<0)h+=360; }
    return 'hsl(' + Math.round(h) + ',' + Math.round(Math.min(1,s*1.05)*100) + '%,' + Math.round(Math.max(target,l)*100) + '%)';
  }
  function mark(e, prop, val) { e.style.setProperty(prop, val, 'important'); touched.add(e); }
  function resetTouched() {
    touched.forEach(e => {
      e.style.removeProperty('background-color'); e.style.removeProperty('color'); e.style.removeProperty('border-color');
      if (!e.getAttribute('style')) e.removeAttribute('style');
    });
    touched.clear(); seen = new WeakMap();
  }
  function sweepEmptyStyles() { document.querySelectorAll('[style=""]').forEach(e => e.removeAttribute('style')); }

  const SKIP_TAGS = { SVG:1,IMG:1,VIDEO:1,CANVAS:1,SCRIPT:1,STYLE:1,PATH:1,LINK:1,META:1,BR:1,USE:1,DEFS:1 };
  const peProbed = new Map();
  function pseudoIsLight(e) {
    const sig = e.className; if (typeof sig !== 'string') return false;
    if (peProbed.has(sig)) return peProbed.get(sig);
    const bef = parseColor(getComputedStyle(e, '::before').backgroundColor);
    const aft = parseColor(getComputedStyle(e, '::after').backgroundColor);
    const light = !!((bef && bef.a > .05 && lumOf(bef) > .72) || (aft && aft.a > .05 && lumOf(aft) > .72));
    if (peProbed.size < 400) peProbed.set(sig, light);
    return light;
  }
  // 令牌覆盖不到的极少数硬编码浅色，可选补漏。默认关（cfg.deepScan=false）。
  function scan(root) {
    if (!skinOn || !cfg.deepScan) return;
    const scope = root && root.nodeType === 1 && root.isConnected ? root : document.body;
    const T = themeOf();
    const list = [scope].concat([].slice.call(scope.querySelectorAll('*')));
    let i = 0;
    const step = () => {
      if (!skinOn || !cfg.deepScan) return;
      const end = Math.min(i + 400, list.length); const writes = [];
      for (; i < end; i++) {
        const e = list[i];
        if (!e || e.nodeType !== 1 || !e.isConnected) continue;
        const n = seen.get(e) || 0; if (n >= 2) continue;
        if (SKIP_TAGS[e.tagName]) { seen.set(e, 2); continue; }
        if (e.hasAttribute('data-vsc-ui') || e.closest('[data-vsc-ui]')) { seen.set(e, 2); continue; }
        seen.set(e, n + 1);
        const st = getComputedStyle(e);
        const bg = parseColor(st.backgroundColor);
        if (bg && bg.a > .05 && lumOf(bg) > .72) {
          const chip = e.clientHeight > 0 && e.clientHeight <= 34 && e.clientWidth <= 220;
          writes.push([e, 'background-color', chip ? T.chip : 'transparent']);
        }
        const fg = parseColor(st.color);
        if (fg && fg.a > .1 && lumOf(fg) < .5) writes.push([e, 'color', satOf(fg) < .22 ? T.text : lighten(fg, .66)]);
        if (pseudoIsLight(e)) e.classList.add('vsc-flat-pe');
      }
      for (let w = 0; w < writes.length; w++) mark(writes[w][0], writes[w][1], writes[w][2]);
      if (i < list.length) requestAnimationFrame(step);
    };
    step();
  }
  function scheduleScan(root) {
    if (!cfg.deepScan) return;
    if (root && root.nodeType === 1) { scan(root); return; }
    clearTimeout(scanTimer); scanTimer = setTimeout(() => scan(), 300);
  }

  /* ================================================================
   * 9. 编辑器外壳
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
      <div class="ic" title="命令面板 (Ctrl+Shift+P)" data-vsc-act="palette">&#9881;</div>`));
    document.body.appendChild(el('div', { id: 'vsc-sidebar' }));
    document.body.appendChild(el('div', { id: 'vsc-tabbar' }));
    document.body.appendChild(el('div', { id: 'vsc-crumb' }));
    document.body.appendChild(el('div', { id: 'vsc-minimap' }));
    document.body.appendChild(el('div', { id: 'vsc-status' }, `
      <div class="l"><span class="st">&#9094; main*</span><span class="st" id="vsc-problems">&#9888; 0 &#10005; 0</span></div>
      <div class="r">
        <span class="st" id="vsc-cursor">Ln 1, Col 1</span>
        <span class="st">Spaces: 2</span><span class="st">UTF-8</span><span class="st">LF</span>
        <span class="st click" data-vsc-act="theme" title="切换主题">${themeOf().name}</span>
        <span class="st click" data-vsc-act="boss" title="Boss 模式 (Ctrl+\`)">&#9679; Boss</span>
      </div>`));
    document.body.appendChild(el('div', { id: 'vsc-toast' }));
    buildPalette(); buildBoss(); buildMinimap();
    toast('VS Code 换肤已启用 · Ctrl+` Boss · Ctrl+Shift+P 命令面板 · Ctrl+Alt+V 关闭', 5000);
  }

  function buildMinimap() {
    const mm = $('vsc-minimap'); if (!mm || mm.childElementCount) return;
    const cols = ['--vsc-comment','--vsc-keyword','--vsc-string','--vsc-fn','--vsc-var','--vsc-num-col'];
    let html = '<div class="vp"></div>', s = 20260920;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 260; i++) {
      if (rnd() < 0.07) { html += '<i style="background:transparent"></i>'; continue; }
      html += `<i style="margin-left:${Math.floor(rnd()*4)*5}px;width:${(5+rnd()*38).toFixed(0)}px;background:var(${cols[Math.floor(rnd()*cols.length)]})"></i>`;
    }
    mm.innerHTML = html;
  }

  function currentPageName() {
    const p = location.pathname;
    if (p.includes('/bbs/home') || p === '/' || p === '/app/bbs') return 'index.ts';
    if (p.includes('/bbs/link/')) {
      const t = (origTitle || document.title || 'post').replace(/[-–—|]\s*小黑盒.*$/, '').trim();
      return truncate(t.replace(/[<>:"/\\|?*]/g, ''), 22) + '.ts';
    }
    if (p.includes('/user/') || p.includes('/account')) return 'profile.ts';
    if (p.includes('/game')) return 'game.store.ts';
    return 'workspace.ts';
  }

  function updateTabBar() {
    const tb = $('vsc-tabbar'); if (!tb) return;
    const name = currentPageName();
    tb.innerHTML =
      `<div class="tab"><span class="dot"></span><span class="lg">TS</span><span class="nm">${esc(name)}</span></div>` +
      `<div class="tab ghost" data-vsc-act="palette"><span class="lg">MD</span><span class="nm">README.md</span></div>` +
      `<div class="tab ghost" data-vsc-act="boss"><span class="lg">TS</span><span class="nm">data-processor.service.ts</span></div>`;
  }

  function updateCrumb() {
    const cb = $('vsc-crumb'); if (!cb) return;
    const p = location.pathname;
    const parts = p.includes('/bbs/link/')
      ? ['src', 'modules', 'bbs', currentPageName(), 'renderContent()']
      : ['src', 'app', currentPageName(), 'default'];
    cb.innerHTML = parts.map((x, i) => `<span>${esc(x)}</span>` + (i < parts.length - 1 ? '<span class="sep">&#8250;</span>' : '')).join('');
  }

  function updateSidebar() {
    const sb = $('vsc-sidebar'); if (!sb) return;
    const p = location.pathname;
    let html = '<div class="hd">资源管理器</div>';
    if (p.includes('/bbs/home') || p === '/' || p === '/app/bbs') {
      const cats = [].slice.call(document.querySelectorAll('button.bbs-home__topic-item, .bbs-home__topic-name'))
        .map(b => b.textContent.trim()).filter(t => t && t.length < 20).filter((t, i, a) => a.indexOf(t) === i);
      const posts = [].slice.call(document.querySelectorAll('a.hb-cpt__bbs-list-content, main a[href*="/bbs/link/"]'))
        .filter(a => a.querySelector('.bbs-content__title'));
      if (cats.length) {
        cats.slice(0, 8).forEach((cat, ci) => {
          html += `<div class="it" data-vsc-cat="${escAttr(cat)}"><span class="ic f-ic">${ci === 0 ? '&#9662;' : '&#9656;'}</span><span class="nm">${esc(cat)}</span></div>`;
          if (ci === 0 && posts.length) {
            posts.slice(0, 12).forEach(a => {
              const titleEl = a.querySelector('.bbs-content__title');
              const title = titleEl ? titleEl.textContent : '';
              const catEl = a.querySelector('.bbs-new-style-bottom__rich-node, .bbs-new-style-bottom__rich');
              const ext = getExt(catEl ? catEl.textContent.trim() : cat);
              const nm = truncate(title.replace(/[<>:"/\\|?*]/g, ''), 11);
              html += `<div class="it sub" data-vsc-href="${escAttr(a.getAttribute('href') || '')}"><span class="ic c-${ext}">&#128196;</span><span class="nm c-${ext}">${esc(nm)}.${ext}</span></div>`;
            });
          }
        });
      } else {
        html += '<div class="it"><span class="ic f-ic">&#9662;</span><span class="nm">src</span></div><div class="it sub"><span class="ic c-ts">&#128196;</span><span class="nm c-ts">index.ts</span></div>';
      }
    } else if (p.includes('/bbs/link/')) {
      html += `
        <div class="it"><span class="ic f-ic">&#9662;</span><span class="nm">src</span></div>
        <div class="it sub on"><span class="ic c-ts">&#128196;</span><span class="nm c-ts">post.ts</span></div>
        <div class="it sub"><span class="ic c-md">&#128196;</span><span class="nm c-md">README.md</span></div>
        <div class="it"><span class="ic f-ic">&#9656;</span><span class="nm">tests</span></div>
        <div class="hd" style="margin-top:8px">大纲</div>
        <div class="it"><span class="ic fn-ic">f</span><span class="nm">getPostData()</span></div>
        <div class="it"><span class="ic fn-ic">f</span><span class="nm">renderContent()</span></div>
        <div class="it"><span class="ic fn-ic">f</span><span class="nm">loadComments()</span></div>`;
    } else {
      html += '<div class="it"><span class="ic f-ic">&#9662;</span><span class="nm">workspace</span></div><div class="it sub"><span class="ic c-ts">&#128196;</span><span class="nm c-ts">main.ts</span></div>';
    }
    if (html !== updateSidebar._last) { updateSidebar._last = html; sb.innerHTML = html; }
    const pb = $('vsc-problems');
    if (pb) {
      const n = document.querySelectorAll('.bbs-home__content-item, .link-comment__comment-item, .comment-item').length;
      const txt = '&#9888; ' + (n % 7) + ' &#10005; 0';
      if (pb.innerHTML !== txt) pb.innerHTML = txt;
    }
  }

  function updateStatusBar() {
    const c = $('vsc-cursor');
    if (c) { const y = window.scrollY; c.textContent = 'Ln ' + (Math.floor(y/22)+1) + ', Col ' + (Math.floor(y/8)%80+1); }
    const mm = $('vsc-minimap');
    if (mm) { const vp = mm.querySelector('.vp');
      if (vp) { const doc = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        const h = Math.max(24, mm.clientHeight * Math.min(1, innerHeight / document.documentElement.scrollHeight));
        vp.style.height = h + 'px'; vp.style.top = ((mm.clientHeight - h) * (scrollY / doc)) + 'px'; } }
  }

  /* ================================================================
   * 10. 标签页伪装
   * ================================================================ */
  /* ----------------------------------------------------------------
   * 标题伪装：这里必须极其小心。
   *
   * 小黑盒是 Vue 应用，详情页数据到位后会把 <title> 改回站点标题。
   * 如果监听到变化就立刻改回来，就会和站点形成「你改我改」的死循环：
   * 实测单核 CPU 100% 打满、页面连 DOMContentLoaded 都到不了、
   * 标签页标题在两个名字之间疯狂闪烁 —— 也就是「二级页面打不开一直转圈」。
   *
   * 防护三件套：
   *   1. 自己写入时打标记，不让自己的写入再触发一轮；
   *   2. 改写一律走防抖，绝不在观察者回调里同步写；
   *   3. 站点若持续抢标题，立刻永久让步（本页/本次会话不再伪装），
   *      宁可不伪装，也绝不允许出现互改循环。
   * ---------------------------------------------------------------- */
  const TITLE_SUFFIX = ' - xiaoheihe - Visual Studio Code';
  let lastWritten = '', titleFights = 0, titleWindow = 0;
  let titleGaveUp = false, titleGiveUpCount = 0, titleTimer = 0;

  const isOurTitle = (t) => typeof t === 'string' && t.endsWith(TITLE_SUFFIX);
  const fakeTitleText = () => currentPageName() + TITLE_SUFFIX;

  // 用「上次写入的值」而不是布尔标记来识别自己的写入：
  // MutationObserver 会把多条变更合并成一次回调，布尔标记会把
  // 「我的写入」和紧随其后「站点的写回」一起吞掉，判断就失准了。
  function writeFakeTitle() {
    if (!skinOn || !cfg.fakeTitle || titleGaveUp) return;
    const want = fakeTitleText();
    if (document.title === want) return;
    lastWritten = want;
    document.title = want;
  }

  function applyDisguise() {
    if (cfg.fakeTitle && !titleGaveUp) {
      if (!origTitle && !isOurTitle(document.title)) origTitle = document.title;
      writeFakeTitle();
      if (!titleObserver) {
        const t = document.querySelector('title');
        if (t) {
          titleObserver = new MutationObserver(() => {
            if (!skinOn || !cfg.fakeTitle || titleGaveUp) return;
            if (document.title === lastWritten) return;            // 当前就是我们写进去的值
            if (isOurTitle(document.title)) return;                // 已经是我们的标题

            // 走到这里：站点把标题改回去了，记一次「对抗」
            origTitle = document.title;
            const now = Date.now();
            if (now - titleWindow > 3000) { titleWindow = now; titleFights = 0; }
            if (++titleFights > 3) {
              titleGaveUp = true;
              if (titleObserver) { titleObserver.disconnect(); titleObserver = null; }
              if (++titleGiveUpCount >= 2) cfg.fakeTitle = false;  // 整站都在抢，本次会话彻底关掉
              toast('标签页标题伪装已自动关闭（本页会持续改写标题，继续伪装会导致卡死）', 4000);
              return;
            }
            clearTimeout(titleTimer);
            titleTimer = setTimeout(writeFakeTitle, 250);          // 防抖，绝不同步改写
          });
          titleObserver.observe(t, { childList: true });
        }
      }
    }
    if (cfg.fakeFavicon) {
      let link = document.querySelector('link[rel~="icon"]');
      if (link && origIcon === null) origIcon = link.getAttribute('href');
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); link.setAttribute('data-vsc-ui', ''); }
      link.setAttribute('href', CODE_ICON);
    }
  }
  function restoreDisguise() {
    if (titleObserver) { titleObserver.disconnect(); titleObserver = null; }
    clearTimeout(titleTimer);
    lastWritten = ""; titleFights = 0; titleGaveUp = false;
    if (origTitle && !isOurTitle(origTitle)) document.title = origTitle;
    const link = document.querySelector('link[rel~="icon"]');
    if (link) { if (link.hasAttribute('data-vsc-ui')) link.remove(); else if (origIcon !== null) link.setAttribute('href', origIcon); }
  }

  /* ================================================================
   * 11. Boss 模式
   * ================================================================ */
  function buildBoss() {
    if ($('vsc-boss')) return;
    const code = FAKE_CODE.map((line, i) => {
      const cur = i === 36;
      return `<div class="ln-row${cur ? ' cur' : ''}"><span class="ln">${i + 1}</span><span class="tx">${highlight(line) || ' '}${cur ? '<span class="caret"></span>' : ''}</span></div>`;
    }).join('');
    document.body.appendChild(el('div', { id: 'vsc-boss' }, `
      <div class="tabs"><div class="tab"><span class="dot"></span><span>data-processor.service.ts</span></div>
        <div class="tab ghost"><span>cache.service.ts</span></div><div class="tab ghost"><span>queue.service.ts</span></div></div>
      <div class="act"><div class="ic">&#9776;</div><div class="ic">&#8981;</div><div class="ic">&#9880;</div><div class="ic">&#9654;</div><div class="ic">&#9670;</div></div>
      <div class="wrap"><div class="code">${code}</div></div>
      <div class="term"><div class="bar"><b>终端</b><span>问题</span><span>输出</span><span>调试控制台</span></div><div class="out" id="vsc-term-out"></div></div>
      <div class="status"><div class="l"><span>&#9094; main*</span><span>&#9888; 0 &#10005; 0</span></div>
        <div class="r"><span>Ln 37, Col 24</span><span>Spaces: 2</span><span>UTF-8</span><span>LF</span><span>TypeScript 5.4.5</span></div></div>`));
  }
  const TERM_LINES = [
    '$ npm run start:dev', '', '> api@1.8.2 start:dev', '> nest start --watch', '',
    '[10:24:31] Starting compilation in watch mode...', '[10:24:38] Found 0 errors. Watching for file changes.',
    '[Nest] 48213  - LOG [InstanceLoader] TypeOrmModule dependencies initialized +48ms',
    '[Nest] 48213  - LOG [RoutesResolver] DataProcessorController {/records}: +3ms',
    '[Nest] 48213  - LOG [NestApplication] Nest application successfully started +6ms',
    '[Nest] 48213  - LOG [DataProcessorService] Processing batch of 500 records',
    '[Nest] 48213  - LOG [DataProcessorService] Batch complete in 1284ms',
  ];
  function fillTerminal() {
    const out = $('vsc-term-out'); if (!out) return;
    out.innerHTML = TERM_LINES.map(l => '<div>' + esc(l) + '</div>').join('') +
      '<div>$ <span class="caret" style="display:inline-block;width:7px;height:13px;background:var(--vsc-text);vertical-align:text-bottom"></span></div>';
    out.scrollTop = out.scrollHeight;
  }
  function toggleBoss(force) {
    const ov = $('vsc-boss'); if (!ov) return;
    bossOn = force === undefined ? !bossOn : !!force;
    ov.classList.toggle('on', bossOn);
    if (bossOn) { fillTerminal(); const c = ov.querySelector('.code'); if (c) c.scrollTop = Math.max(0, c.scrollHeight * 0.3);
      document.documentElement.style.setProperty('overflow', 'hidden', 'important'); }
    else { document.documentElement.style.removeProperty('overflow'); toast('已退出 Boss 模式'); }
  }

  /* ================================================================
   * 12. 命令面板
   * ================================================================ */
  let paletteItems = [], paletteIdx = 0;
  function buildPalette() {
    if ($('vsc-palette')) return;
    document.body.appendChild(el('div', { id: 'vsc-palette' }, `<div class="box"><input type="text" placeholder="输入命令或页面名称…" spellcheck="false"><ul></ul></div>`));
    const box = $('vsc-palette');
    box.addEventListener('click', e => { if (e.target === box) togglePalette(false); });
    box.querySelector('input').addEventListener('input', renderPalette);
    box.querySelector('ul').addEventListener('click', e => { const li = e.target.closest('li'); if (li && li.dataset.i) runPalette(+li.dataset.i); });
  }
  function collectPalette() {
    const items = [
      { label: 'Boss 模式：显示/隐藏假编辑器', key: 'Ctrl+`', run: () => toggleBoss() },
      { label: '换肤：开启 / 关闭（完全还原页面）', key: 'Ctrl+Alt+V', run: () => setSkin(!skinOn) },
      { label: '主题：切换配色', key: '', run: cycleTheme },
      { label: '视图：缩略图开关', key: '', run: () => { cfg.minimap = !cfg.minimap; saveCfg(); applyFlags(); } },
      { label: '视图：面包屑开关', key: '', run: () => { cfg.breadcrumb = !cfg.breadcrumb; saveCfg(); applyFlags(); } },
      { label: '视图：侧边栏(资源管理器)开关', key: '', run: () => { cfg.__sideForce = undefined; toggleSidebar(); } },
      { label: '装饰：帖子行号/引号开关', key: '', run: () => { cfg.codeDecor = !cfg.codeDecor; saveCfg(); applyFlags(); toast('代码装饰：' + (cfg.codeDecor ? '开' : '关')); } },
      { label: '图片：正常显示 / 代码占位（摸鱼）', key: '', run: () => { cfg.hideImages = !cfg.hideImages; saveCfg(); applyFlags(); toast('图片：' + (cfg.hideImages ? '代码占位（悬停显图）' : '正常显示')); } },
      { label: '字体：等宽字体开关', key: '', run: () => { cfg.mono = !cfg.mono; saveCfg(); applyFlags(); } },
      { label: '标签页伪装：标题+图标开关', key: '', run: toggleDisguise },
      { label: '性能：兜底扫描开关（一般不需要）', key: '', run: () => { cfg.deepScan = !cfg.deepScan; saveCfg(); if (cfg.deepScan) scan(); else resetTouched(); toast('兜底扫描：' + (cfg.deepScan ? '开' : '关')); } },
    ];
    [].slice.call(document.querySelectorAll('nav.nav a[href]')).forEach(a => {
      const t = (a.textContent || '').trim(); if (!t || t.length > 14) return;
      if (items.some(x => x.label === '转到：' + t)) return;
      items.push({ label: '转到：' + t, key: 'nav', run: () => a.click() });
    });
    [].slice.call(document.querySelectorAll('button.bbs-home__topic-item')).forEach(b => {
      const t = (b.textContent || '').trim(); if (!t || t.length > 14) return;
      items.push({ label: '分类：' + t, key: 'tab', run: () => b.click() });
    });
    return items;
  }
  function fuzzy(q, s) { if (!q) return true; s = s.toLowerCase(); q = q.toLowerCase(); let i = 0; for (const ch of q) { i = s.indexOf(ch, i); if (i === -1) return false; i++; } return true; }
  function renderPalette() {
    const box = $('vsc-palette'); const q = box.querySelector('input').value.trim(); const ul = box.querySelector('ul');
    const shown = paletteItems.filter(it => fuzzy(q, it.label)); paletteIdx = 0;
    ul.innerHTML = shown.map((it, i) => `<li data-i="${paletteItems.indexOf(it)}" class="${i === 0 ? 'sel' : ''}"><span>${esc(it.label)}</span><span class="k">${esc(it.key)}</span></li>`).join('') || '<li class="k" style="padding:8px 12px">没有匹配的命令</li>';
  }
  function movePalette(d) {
    const ul = $('vsc-palette').querySelector('ul'); const lis = ul.querySelectorAll('li[data-i]'); if (!lis.length) return;
    paletteIdx = (paletteIdx + d + lis.length) % lis.length;
    lis.forEach((li, i) => li.classList.toggle('sel', i === paletteIdx)); lis[paletteIdx].scrollIntoView({ block: 'nearest' });
  }
  function runPalette(i) { const it = paletteItems[i]; togglePalette(false); if (it && it.run) setTimeout(it.run, 0); }
  function togglePalette(force) {
    const box = $('vsc-palette'); if (!box) return;
    paletteOn = force === undefined ? !paletteOn : !!force;
    box.classList.toggle('on', paletteOn);
    if (paletteOn) { paletteItems = collectPalette(); const input = box.querySelector('input'); input.value = ''; renderPalette(); input.focus(); }
  }

  /* ================================================================
   * 13. 设置切换
   * ================================================================ */
  function cycleTheme() {
    const keys = Object.keys(THEMES);
    cfg.theme = keys[(keys.indexOf(cfg.theme) + 1) % keys.length]; saveCfg();
    const v = $('vsc-vars'); if (v) v.textContent = buildVars();
    document.documentElement.setAttribute('data-vsc-theme', cfg.theme);
    const btn = document.querySelector('#vsc-status [data-vsc-act="theme"]'); if (btn) btn.textContent = themeOf().name;
    resetTouched(); if (cfg.deepScan) scan();
    toast('主题：' + themeOf().name);
  }
  function toggleDisguise() {
    const on = !(cfg.fakeTitle && cfg.fakeFavicon);
    cfg.fakeTitle = cfg.fakeFavicon = on; saveCfg();
    if (on) applyDisguise(); else restoreDisguise();
    toast('标签页伪装：' + (on ? '开' : '关'));
  }
  function toggleSidebar() { cfg.__sideOff = !cfg.__sideOff; applyFlags(); }
  function applyFlags() {
    const h = document.documentElement;
    h.setAttribute('data-vsc-theme', cfg.theme);
    h.setAttribute('data-vsc-mini', skinOn && cfg.minimap ? '1' : '0');
    h.setAttribute('data-vsc-crumb', skinOn && cfg.breadcrumb ? '1' : '0');
    h.setAttribute('data-vsc-side', skinOn && !cfg.__sideOff ? '1' : '0');
    h.setAttribute('data-vsc-mono', skinOn && cfg.mono ? '1' : '0');
    h.setAttribute('data-vsc-decor', skinOn && cfg.codeDecor ? '1' : '0');
    h.setAttribute('data-vsc-img', skinOn && cfg.hideImages ? 'hide' : 'show');
  }

  /* ================================================================
   * 14. 换肤开关
   * ================================================================ */
  function setSkin(on) {
    if (on === skinOn) return;
    skinOn = on; cfg.enabled = on; saveCfg();
    if (on) {
      document.documentElement.setAttribute('data-vsc', 'on');
      document.body.classList.add('vscode-mode');
      applyFlags(); buildFrame();
      updateTabBar(); updateCrumb(); updateSidebar(); updateStatusBar();
      applyDisguise(); if (cfg.deepScan) scan(); startObserver();
    } else {
      stopObserver(); toggleBoss(false); togglePalette(false);
      document.documentElement.removeAttribute('data-vsc');
      document.body.classList.remove('vscode-mode');
      applyFlags();
      resetTouched();
      document.querySelectorAll('.vsc-flat-pe').forEach(e => e.classList.remove('vsc-flat-pe'));
      document.querySelectorAll('[data-vsc-ui]').forEach(e => { if (e.tagName !== 'LINK') e.remove(); });
      restoreDisguise();
      document.documentElement.style.removeProperty('overflow');
      setTimeout(sweepEmptyStyles, 0); setTimeout(sweepEmptyStyles, 400);
    }
  }

  /* ================================================================
   * 15. 事件
   * ================================================================ */
  function isTyping(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  function bindEvents() {
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault(); setSkin(!skinOn); toast(skinOn ? '换肤已开启' : '换肤已关闭，页面已还原'); return;
      }
      if (!skinOn) return;
      if (paletteOn) {
        if (e.key === 'Escape') { e.preventDefault(); togglePalette(false); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); return; }
        if (e.key === 'Enter') { e.preventDefault(); const sel = $('vsc-palette').querySelector('li.sel[data-i]'); if (sel) runPalette(+sel.dataset.i); return; }
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); togglePalette(true); return; }
      if (e.key === 'F1' && !isTyping(e)) { e.preventDefault(); togglePalette(true); return; }
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); toggleBoss(); return; }
      if (e.key === 'Escape' && !isTyping(e)) { const now = Date.now(); if (now - lastEsc < 400) { e.preventDefault(); toggleBoss(); lastEsc = 0; return; } lastEsc = now; }
    }, true);

    let raf = 0;
    window.addEventListener('scroll', () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; updateStatusBar(); }); }, { passive: true });

    document.addEventListener('click', e => {
      if (!skinOn) return;
      const act = e.target.closest('[data-vsc-act]');
      if (act) { const a = act.getAttribute('data-vsc-act'); if (a === 'boss') toggleBoss(); else if (a === 'theme') cycleTheme(); else if (a === 'palette') togglePalette(true); return; }
      const cat = e.target.closest('[data-vsc-cat]');
      if (cat) { const name = cat.getAttribute('data-vsc-cat');
        const btn = [].slice.call(document.querySelectorAll('button.bbs-home__topic-item')).find(b => b.textContent.trim() === name);
        if (btn) btn.click(); return; }
      const file = e.target.closest('[data-vsc-href]');
      if (file) { const href = file.getAttribute('data-vsc-href'); if (href) location.href = href; }
    }, true);

    document.addEventListener('click', e => { if (bossOn && e.target.closest('#vsc-boss')) toggleBoss(false); });
    if (cfg.bossOnBlur) window.addEventListener('blur', () => { if (skinOn && !bossOn) toggleBoss(true); });

    ['pushState', 'replaceState'].forEach(fn => {
      const raw = history[fn];
      history[fn] = function () { const r = raw.apply(this, arguments); setTimeout(onRouteChange, 0); return r; };
    });
    window.addEventListener('popstate', () => setTimeout(onRouteChange, 0));
    setInterval(() => { if (location.href !== lastUrl) onRouteChange(); }, 900);
  }

  function onRouteChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    if (!skinOn) return;
    // 换页了：新页面未必也抢标题，允许重试一次（但整站都抢时 fakeTitle 已被永久关掉）
    if (titleGiveUpCount < 2) { titleGaveUp = false; titleFights = 0; }
    origTitle = '';
    updateTabBar(); updateCrumb(); applyDisguise();
    setTimeout(() => { updateSidebar(); updateCrumb(); applyDisguise(); scheduleScan(); }, 450);
    setTimeout(() => { updateSidebar(); scheduleScan(); }, 1600);
  }

  /* ================================================================
   * 16. 内容观察（无限滚动补刷侧边栏；不再触发全页扫描）
   * ================================================================ */
  function startObserver() {
    if (mo) return;
    mo = new MutationObserver(muts => {
      if (!skinOn) return;
      let roots = null;
      for (const m of muts) {
        const t = m.target;
        // 忽略脚本自己 UI 内部的变动，避免「重建侧栏→观察到→再重建」的自激循环
        if (t && t.nodeType === 1 && (t.hasAttribute('data-vsc-ui') || t.closest('[data-vsc-ui]'))) continue;
        for (const n of m.addedNodes) { if (n.nodeType !== 1 || n.hasAttribute('data-vsc-ui')) continue; (roots || (roots = [])).push(n); }
      }
      if (!roots) return;
      if (cfg.deepScan) for (let i = 0; i < roots.length && i < 40; i++) scheduleScan(roots[i]);
      clearTimeout(startObserver._sb);
      startObserver._sb = setTimeout(() => { updateSidebar(); updateStatusBar(); }, 900);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  function stopObserver() { if (mo) { mo.disconnect(); mo = null; } }

  /* ================================================================
   * 17. 启动
   * ================================================================ */
  function injectStyles() {
    const head = document.head || document.documentElement;
    if (!$('vsc-vars')) { const v = document.createElement('style'); v.id = 'vsc-vars'; v.textContent = buildVars(); head.appendChild(v); }
    if (!$('vsc-skin')) { const s = document.createElement('style'); s.id = 'vsc-skin'; s.textContent = CSS; head.appendChild(s); }
  }
  function whenBody(fn) {
    if (document.body) return fn();
    new MutationObserver((m, o) => { if (document.body) { o.disconnect(); fn(); } }).observe(document.documentElement, { childList: true });
  }

  injectStyles();
  if (cfg.enabled) document.documentElement.setAttribute('data-vsc', 'on');
  applyFlags();

  whenBody(() => {
    injectStyles();
    bindEvents();
    if (cfg.enabled) {
      skinOn = false; setSkin(true);
      setTimeout(() => { updateTabBar(); updateSidebar(); updateCrumb(); }, 1200);
      setTimeout(() => { updateSidebar(); }, 3000);
    } else { applyFlags(); }
  });
})();
