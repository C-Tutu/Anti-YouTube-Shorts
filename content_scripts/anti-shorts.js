// content_scripts/anti-shorts.js
(() => {
  const STYLE_ID = 'anti-shorts-style';
  const OVERLAY_ID = 'anti-shorts-overlay';
  const HIDDEN_MARK = 'data-anti-shorts-hidden';
  const DEBOUNCE_MS = 200;
  const STYLE_REAPPLY_INTERVAL = 2000;
  const INITIAL_SCAN_RETRY = 5;
  const SCAN_INTERVAL = 300;
  const RESTORE_DELAY = 4000; // ローディング演出時間(ミリ秒)

  const STYLE_SELECTORS = [
    'a[href^="/shorts/"]',
    'a[href*="/shorts/"]',
    'ytd-reel-shelf-renderer',
    'ytd-reel-video-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'ytd-horizontal-card-list-renderer:has(a[href^="/shorts"])',
    'grid-shelf-view-model',
    '.ytGridShelfViewModelHost',
    'ytd-grid-shelf-renderer',
    'ytd-rich-section-renderer',
    'ytd-rich-shelf-renderer',
    'ytd-mini-guide-entry-renderer[aria-label*="ショート"]',
    '#endpoint[title="ショート"]',
    'tp-yt-paper-item[title="ショート"]',
    'yt-tab-shape[tab-title="ショート"]'
  ];

  let isEnabled = false;
  let observer = null;
  let debounceTimer = null;
  let styleTimer = null;
  let processed = new WeakSet();

  // ========== Style Control ==========
  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${STYLE_SELECTORS.map(s => `${s}{display:none!important;visibility:hidden!important;}`).join('\n')}
      [${HIDDEN_MARK}="1"]{display:none!important;visibility:hidden!important;}
    `;
    document.documentElement.appendChild(style);
  };

  const removeStyle = () => {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  };

  // ========== Hide Logic ==========
  const hideShortBlocks = () => {
    const blocks = document.querySelectorAll('grid-shelf-view-model, ytd-item-section-renderer, ytd-grid-shelf-renderer, ytd-rich-shelf-renderer');
    for (const block of blocks) {
      if (processed.has(block)) continue;
      const title = block.querySelector('.yt-shelf-header-layout__title, h2, .yt-core-attributed-string');
      if (title && /ショート|shorts/i.test(title.textContent)) {
        block.setAttribute(HIDDEN_MARK, '1');
        processed.add(block);
      }
    }
  };

  const hideByTextScan = () => {
    const els = document.querySelectorAll('#video-title, a.yt-simple-endpoint, yt-formatted-string');
    for (const el of els) {
      if (processed.has(el)) continue;
      const txt = (el.textContent || '').toLowerCase();
      if (txt.includes('#shorts') || txt.includes('shorts') || txt.includes('ショート')) {
        const parent = el.closest('ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-rich-item-renderer');
        if (parent) {
          parent.setAttribute(HIDDEN_MARK, '1');
          processed.add(parent);
        }
      }
    }
  };

  const hideShortTags = () => {
    const tags = document.querySelectorAll('yt-chip-cloud-chip-renderer, #chip-shape-container');
    for (const tag of tags) {
      if (processed.has(tag)) continue;
      const txt = (tag.textContent || '').trim();
      if (/^ショート$/i.test(txt)) {
        tag.setAttribute(HIDDEN_MARK, '1');
        processed.add(tag);
      }
    }
  };

  const hideShortTabs = () => {
    const tabs = document.querySelectorAll('yt-tab-shape');
    for (const tab of tabs) {
      if (processed.has(tab)) continue;
      const title = tab.getAttribute('tab-title') || tab.textContent || '';
      if (/ショート/i.test(title.trim())) {
        tab.setAttribute(HIDDEN_MARK, '1');
        processed.add(tab);
      }
    }
  };

  const runHideCycle = () => {
    if (!isEnabled) return;
    hideShortBlocks();
    hideByTextScan();
    hideShortTags();
    hideShortTabs();
  };

  // ========== Observer ==========
  const startObserver = () => {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runHideCycle, DEBOUNCE_MS);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  const stopObserver = () => {
    if (observer) observer.disconnect();
    observer = null;
  };

  // ========== Overlay (復元演出) ==========
  const showOverlayThenRestore = () => {
    if (document.getElementById(OVERLAY_ID)) return;
    const ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.innerHTML = `
      <div class="panel">
        <div class="loader"></div>
        <p>ショートを復元中です...</p>
      </div>`;
    Object.assign(ov.style, {
      position: 'fixed',
      top: 0, left: 0,
      width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 99999,
      transition: 'opacity 0.6s ease',
      opacity: 1
    });

    const loader = ov.querySelector('.loader');
    Object.assign(loader.style, {
      width: '40px',
      height: '40px',
      border: '3px solid #fff',
      borderTop: '3px solid transparent',
      borderRadius: '50%',
      margin: '0 auto 10px',
      animation: 'spin 1s linear infinite'
    });

    const panel = ov.querySelector('.panel');
    panel.style.cssText = 'color:white;font-size:16px;text-align:center;animation:pulse 1s infinite;';

    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {from{transform:rotate(0)}to{transform:rotate(360deg)}}
      @keyframes pulse {0%{opacity:0.8}50%{opacity:1}100%{opacity:0.8}}
    `;
    document.head.appendChild(style);
    document.body.appendChild(ov);

    // 一旦完全停止してローディング表示
    stopObserver();
    removeStyle();
    isEnabled = false;

    // 復元演出が終わったあとに完全復元
    setTimeout(() => {
      ov.style.opacity = '0';
      ov.addEventListener('transitionend', () => {
        ov.remove();
        processed = new WeakSet();
      }, { once: true });
    }, RESTORE_DELAY);
  };

  // ========== Enable / Disable ==========
  const enable = () => {
    if (isEnabled) return;
    isEnabled = true;
    injectStyle();
    startObserver();
    runHideCycle();

    let retry = 0;
    const retryInterval = setInterval(() => {
      if (!isEnabled || retry++ >= INITIAL_SCAN_RETRY) clearInterval(retryInterval);
      runHideCycle();
    }, SCAN_INTERVAL);

    styleTimer = setInterval(() => {
      if (isEnabled && !document.getElementById(STYLE_ID)) injectStyle();
    }, STYLE_REAPPLY_INTERVAL);
  };

  const disable = () => {
    if (!isEnabled) return;
    showOverlayThenRestore();
  };

  // ========== Navigation & Events ==========
  const handleNav = () => {
    if (!isEnabled) return;
    injectStyle();
    runHideCycle();
  };
  ['yt-navigate-start','yt-navigate-finish','popstate','pageshow','DOMContentLoaded']
    .forEach(e=>window.addEventListener(e,handleNav,{passive:true}));

  // ========== Messaging & Storage ==========
  chrome.runtime.onMessage.addListener(msg => {
    if (!msg || !msg.action) return;
    if (msg.action === 'enable') enable();
    if (msg.action === 'disable') disable();
  });

  chrome.storage.sync.get({ enabled: false }, res => {
    if (res.enabled) enable();
  });

})();
