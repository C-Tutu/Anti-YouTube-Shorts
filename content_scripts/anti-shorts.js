(() => {
  const STYLE_ID = 'anti-shorts-style';
  const OVERLAY_ID = 'anti-shorts-overlay';
  const HIDDEN_MARK = 'data-anti-shorts-hidden';
  const DEBOUNCE_MS = 300;
  const RETRY_INTERVAL = 500;

  let observer = null;
  let debounceTimer = null;
  let styleInserted = false;
  let locked = false;
  let processed = new WeakSet();

  // --- 非表示対象セレクタ ---
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
    'tp-yt-paper-item[title="ショート"]'
  ];

  const waitForBody = (timeout = 5000) =>
    new Promise(resolve => {
      if (document.body) return resolve(true);
      const t = setTimeout(() => resolve(false), timeout);
      const mo = new MutationObserver(() => {
        if (document.body) {
          mo.disconnect();
          clearTimeout(t);
          resolve(true);
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    });

  const insertBaseStyle = () => {
    if (styleInserted) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      ...STYLE_SELECTORS.map(s => `${s} { display: none !important; }`),
      `[${HIDDEN_MARK}="1"] { display: none !important; }`
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
    styleInserted = true;
  };

  const removeBaseStyle = () => {
    const el = document.getElementById(STYLE_ID);
    if (el) el.remove();
    styleInserted = false;
  };

  // --- ブロック単位でのショート検出 ---
  const hideShortBlocks = () => {
    const blocks = document.querySelectorAll(
      'grid-shelf-view-model, ytd-item-section-renderer, ytd-grid-shelf-renderer, ytd-rich-shelf-renderer'
    );
    for (const block of blocks) {
      if (processed.has(block)) continue;
      const title = block.querySelector('.yt-shelf-header-layout__title, h2, .yt-core-attributed-string');
      if (title && /ショート|Shorts/i.test(title.innerText)) {
        block.setAttribute(HIDDEN_MARK, '1');
        processed.add(block);
      }
    }
  };

  // --- タイトルやリンクからショートを検出 ---
  const hideByTextScan = () => {
    const els = document.querySelectorAll('#video-title, a.yt-simple-endpoint, yt-formatted-string');
    for (const el of els) {
      if (processed.has(el)) continue;
      const text = (el.innerText || '').toLowerCase();
      if (text && (text.includes('#shorts') || text.includes('shorts') || text.includes('ショート'))) {
        const parent = el.closest(
          'ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-rich-item-renderer'
        );
        if (parent && !processed.has(parent)) {
          parent.setAttribute(HIDDEN_MARK, '1');
          processed.add(parent);
        }
      }
    }
  };

  // --- タグ領域からショートカテゴリを除去 ---
  const hideShortTags = () => {
    const tags = document.querySelectorAll('yt-chip-cloud-chip-renderer, #chip-shape-container');
    for (const tag of tags) {
      if (processed.has(tag)) continue;
      const text = (tag.innerText || '').trim();
      // 「ショート」完全一致のみを非表示
      if (/^ショート$/i.test(text)) {
        tag.setAttribute(HIDDEN_MARK, '1');
        processed.add(tag);
      }
    }
  };

  const runHideCycle = async () => {
    if (locked) return;
    locked = true;
    insertBaseStyle();
    await Promise.resolve();
    hideShortBlocks();
    hideByTextScan();
    hideShortTags();
    requestAnimationFrame(() => {
      locked = false;
    });
  };

  const startObserver = () => {
    if (observer) observer.disconnect();
    const target = document.body || document.documentElement;
    if (!target) {
      setTimeout(startObserver, RETRY_INTERVAL);
      return;
    }
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runHideCycle, DEBOUNCE_MS);
    });
    observer.observe(target, { childList: true, subtree: true });
    runHideCycle();
  };

  const stopObserver = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    removeBaseStyle();
    processed = new WeakSet();
    document.querySelectorAll(`[${HIDDEN_MARK}="1"]`).forEach(el => el.removeAttribute(HIDDEN_MARK));
  };

  const showOverlayThenRestore = () => {
    if (document.getElementById(OVERLAY_ID)) return;
    const ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.innerHTML = `
      <div class="panel">
        <div style="margin-bottom:12px;font-size:18px;color:#ffcccc">ショートを復元中...</div>
        <div style="font-size:12px;opacity:0.95">5秒お待ちください</div>
      </div>`;
    Object.assign(ov.style, {
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(18px)', backgroundColor: 'rgba(0,0,0,0.85)',
      zIndex: 2147483647, transition: 'opacity .4s', pointerEvents: 'all'
    });
    const panel = ov.querySelector('.panel');
    Object.assign(panel.style, {
      padding: '22px 36px', borderRadius: '16px', background: 'rgba(10,10,10,0.9)',
      color: '#fff', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.7)'
    });
    document.body.appendChild(ov);
    locked = true;
    setTimeout(() => {
      stopObserver();
      ov.style.opacity = '0';
      setTimeout(() => {
        ov.remove();
        locked = false;
        chrome.storage.sync.set({ enabled: false });
      }, 420);
    }, 5000);
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.action) return;
    if (msg.action === 'enable') {
      waitForBody().then(ok => ok ? startObserver() : setTimeout(startObserver, RETRY_INTERVAL));
    } else if (msg.action === 'disable') {
      if (msg.userInitiated && location.hostname.includes('youtube.com')) {
        showOverlayThenRestore();
      } else {
        stopObserver();
      }
    }
  });

  chrome.storage.sync.get({ enabled: false }, (res) => {
    if (res.enabled) {
      waitForBody().then(ok => ok ? startObserver() : setTimeout(startObserver, RETRY_INTERVAL));
    } else {
      stopObserver();
    }
  });
})();
