// content_scripts/anti-shorts.js
(() => {
  // ===== 定数の定義 =====
  const STYLE_ID = 'anti-shorts-style'; // 挿入するCSSスタイル要素のID
  const OVERLAY_ID = 'anti-shorts-overlay'; // 復元中に表示するオーバーレイのID
  const OPEN_OVERLAY_ID='shorts-open-overlay'//ショートを開いたときに表示するオーバーレイのID
  const HIDDEN_MARK = 'data-anti-shorts-hidden'; // 非表示にした要素を識別するための属性
  const DEBOUNCE_MS = 200; // MutationObserver発火の間引き時間(ms)
  const STYLE_REAPPLY_INTERVAL = 2000; // スタイルが消えた場合に再適用する間隔(ms)
  const INITIAL_SCAN_RETRY = 5; // 初回スキャンの再試行回数
  const SCAN_INTERVAL = 300; // スキャン間隔(ms)
  const RESTORE_DELAY = 4000; // 復元演出の継続時間(ms)

  // YouTube Shorts関連要素を特定するCSSセレクタ一覧
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

  // ===== 内部状態変数 =====
  let isEnabled = false; // 拡張機能が有効かどうか
  let observer = null; // DOM監視用MutationObserver
  let debounceTimer = null; // 変更検知のデバウンス用タイマー
  let styleTimer = null; // スタイル再適用タイマー
  let processed = new WeakSet(); // 処理済み要素の記録
  let url=window.location.href //URLを取得

  // ===== スタイル関連処理 =====
  const injectStyle = () => {
    // 既にCSSが挿入されている場合はスキップ
    if (document.getElementById(STYLE_ID)) return;

    // 非表示スタイルを生成して挿入
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${STYLE_SELECTORS.map(s => `${s}{display:none!important;visibility:hidden!important;}`).join('\n')}
      [${HIDDEN_MARK}="1"]{display:none!important;visibility:hidden!important;}
    `;
    document.documentElement.appendChild(style);
  };

  const removeStyle = () => {
    // スタイルを削除して元に戻す
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  };

  // ===== 非表示処理ロジック =====
  const hideShortBlocks = () => {
    // ショート関連セクションを探索して非表示にする
    const blocks = document.querySelectorAll('grid-shelf-view-model, ytd-item-section-renderer, ytd-grid-shelf-renderer, ytd-rich-shelf-renderer');
    for (const block of blocks) {
      if (processed.has(block)) continue; // 処理済みならスキップ
      const title = block.querySelector('.yt-shelf-header-layout__title, h2, .yt-core-attributed-string');
      if (title && /ショート|shorts/i.test(title.textContent)) {
        block.setAttribute(HIDDEN_MARK, '1'); // 非表示マークを付与
        processed.add(block);
      }
    }
  };

  const hideByTextScan = () => {
    // タイトルやリンク文字列からショート関連を検出
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
    // 「ショート」タグを持つ要素を非表示に
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
    // 「ショート」タブを非表示に
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

  const shortopenblock=()=>{
      url=window.location.href //URLを取得
      url_token=url.split("/")
      if (url_token[3]=="shorts"){
        document.body.innerHTML = "<h1>書き換え完了！</h1>";
        
      }
      // console.log(url_token)
  }


  const runHideCycle = () => {
    // 各非表示処理を順番に実行
    if (!isEnabled) return;
    hideShortBlocks();
    hideByTextScan();
    hideShortTags();
    hideShortTabs();
    shortopenblock();
  };

  // ===== DOM監視処理 =====
  const startObserver = () => {
    // DOM変化を監視し、変化があれば非表示処理を再実行
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runHideCycle, DEBOUNCE_MS);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  const stopObserver = () => {
    // 監視を停止
    if (observer) observer.disconnect();
    observer = null;
  };

  // ===== 復元演出オーバーレイ =====
  const showOverlayThenRestore = () => {
    // 既にオーバーレイが存在する場合はスキップ
    if (document.getElementById(OVERLAY_ID)) return;

    // オーバーレイ要素を生成
    const ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.innerHTML = `
      <div class="panel">
        <div class="loader"></div>
        <p>ショートを復元中です...</p>
      </div>`;

    // スタイル適用
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

    // ローディングアニメーション
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

    // テキスト部分のアニメーション
    const panel = ov.querySelector('.panel');
    panel.style.cssText = 'color:white;font-size:16px;text-align:center;animation:pulse 1s infinite;';

    // アニメーションCSSを挿入
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {from{transform:rotate(0)}to{transform:rotate(360deg)}}
      @keyframes pulse {0%{opacity:0.8}50%{opacity:1}100%{opacity:0.8}}
    `;
    document.head.appendChild(style);
    document.body.appendChild(ov);

    // 完全停止してオーバーレイを表示
    stopObserver();
    removeStyle();
    isEnabled = false;

    // 一定時間後に復元アニメーションを終了
    setTimeout(() => {
      ov.style.opacity = '0';
      ov.addEventListener('transitionend', () => {
        ov.remove();
        processed = new WeakSet(); // 処理済みデータをリセット
      }, { once: true });
    }, RESTORE_DELAY);
  };

  // ===== 有効化 / 無効化 =====
  const enable = () => {
    if (isEnabled) return;
    isEnabled = true;
    injectStyle(); // CSS挿入
    startObserver(); // DOM監視開始
    runHideCycle(); // 初回非表示実行

    // 初回リトライスキャン
    let retry = 0;
    const retryInterval = setInterval(() => {
      if (!isEnabled || retry++ >= INITIAL_SCAN_RETRY) clearInterval(retryInterval);
      runHideCycle();
    }, SCAN_INTERVAL);

    // 定期的にスタイルが残っているか確認
    styleTimer = setInterval(() => {
      if (isEnabled && !document.getElementById(STYLE_ID)) injectStyle();
    }, STYLE_REAPPLY_INTERVAL);
  };

  const disable = () => {
    // 無効化時は復元演出を表示
    if (!isEnabled) return;
    showOverlayThenRestore();
  };

  // ===== ページ遷移イベント検知 =====
  const handleNav = () => {
    if (!isEnabled) return;
    injectStyle();
    runHideCycle();
  };

  // YouTube独自イベントなどを監視
  ['yt-navigate-start','yt-navigate-finish','popstate','pageshow','DOMContentLoaded']
    .forEach(e=>window.addEventListener(e,handleNav,{passive:true}));

  // ===== メッセージ受信 (拡張機能ポップアップ等から) =====
  chrome.runtime.onMessage.addListener(msg => {
    if (!msg || !msg.action) return;
    if (msg.action === 'enable') enable();
    if (msg.action === 'disable') disable();
  });

  // ===== ストレージから有効状態を取得 =====
  chrome.storage.sync.get({ enabled: false }, res => {
    if (res.enabled) enable(); // 有効設定なら起動
  });

})();
