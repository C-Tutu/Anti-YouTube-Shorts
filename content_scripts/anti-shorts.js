// content_scripts/anti-shorts.js
(() => {
	if (window.hasAntiShortsScript) return;
	window.hasAntiShortsScript = true;

	// ===== 定数の定義 =====
	const STYLE_ID = 'anti-shorts-style';
	const OVERLAY_ID = 'anti-shorts-overlay';
	const SHORTS_BLOCK_OVERLAY_ID = 'anti-shorts-overlay'; // ショートブロック時に表示するオーバーレイのID（CSSと一致）
	const HIDDEN_MARK = 'data-anti-shorts-hidden';
	const DEBOUNCE_MS = 300; // 安定性のため200から300に増加
	const STYLE_REAPPLY_INTERVAL = 2000;
	const INITIAL_SCAN_RETRY = 5;
	const SCAN_INTERVAL = 300;
	const RESTORE_DELAY = 4000;

	// YouTube Shorts関連要素を特定するCSSセレクタ一覧
	const STYLE_SELECTORS = [
		'a[href^="/shorts/"]', // URLが/shorts/で始まるリンク（標準的なショート動画リンク）
		'a[href*="/shorts/"]', // URLに/shorts/を含むリンク
		'ytd-reel-shelf-renderer', // ホーム画面などのショート動画棚（PC版）
		'ytd-reel-video-renderer', // ショート動画プレーヤー本体
		'ytm-shorts-lockup-view-model', // ショート動画のUIコンポーネント（モバイル/新デザイン）
		'ytm-shorts-lockup-view-model-v2', // 上記のv2
		'ytd-horizontal-card-list-renderer:has(a[href^="/shorts"])', // ショート動画リンクを含む横スクロールリスト
		'ytd-mini-guide-entry-renderer[aria-label*="ショート"]', // ミニガイド（左側細いメニュー）のショートボタン
		'#endpoint[title="ショート"]', // サイドバーメニューのショートボタン
		'tp-yt-paper-item[title="ショート"]', // メニュー内のショート項目
		'yt-tab-shape[tab-title="ショート"]', // チャンネルページなどのショートタブ
	];

	// ===== 内部状態変数 =====
	let isEnabled = false;
	let observer = null;
	let debounceTimer = null;
	let styleTimer = null;
	let processed = new WeakSet();

	// ===== スタイル関連処理 =====
	const injectStyle = () => {
		if (document.getElementById(STYLE_ID)) return;
		const style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = `
      ${STYLE_SELECTORS.map(
			(s) => `${s}{display:none!important;visibility:hidden!important;}`
		).join('\n')}
      [${HIDDEN_MARK}="1"]{display:none!important;visibility:hidden!important;}
    `;
		document.documentElement.appendChild(style);
	};

	const removeStyle = () => {
		const style = document.getElementById(STYLE_ID);
		if (style) style.remove();
	};

	// ===== 非表示処理ロジック =====
	const hideShortBlocks = () => {
		//ここにあったytd-item-section-rendererを削除すると、履歴がおかしくなるバグ(https://github.com/C-Tutu/Anti-YouTube-Shorts/issues/4)を解消した。
		//なんかおかしくなったらここにあるかも
		const blocks = document.querySelectorAll(
			'grid-shelf-view-model,  ytd-grid-shelf-renderer, ytd-rich-shelf-renderer, ytd-rich-section-renderer'
		);
		for (const block of blocks) {
			if (processed.has(block)) continue;
			const title = block.querySelector(
				'.yt-shelf-header-layout__title, h2, .yt-core-attributed-string'
			);
			if (title && /ショート|shorts/i.test(title.textContent)) {
				block.setAttribute(HIDDEN_MARK, '1');
				processed.add(block);
			}
		}
	};

	const hideByTextScan = () => {
		const els = document.querySelectorAll(
			'#video-title, a.yt-simple-endpoint, yt-formatted-string'
		);
		for (const el of els) {
			if (processed.has(el)) continue;
			const txt = (el.textContent || '').toLowerCase();
			if (txt.includes('#shorts') || txt.includes('shorts') || txt.includes('ショート')) {
				const parent = el.closest(
					'ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-rich-item-renderer'
				);
				if (parent) {
					parent.setAttribute(HIDDEN_MARK, '1');
					processed.add(parent);
				}
			}
		}
	};

	const hideShortTags = () => {
		const tags = document.querySelectorAll(
			'yt-chip-cloud-chip-renderer, #chip-shape-container'
		);
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

	const showShortsBlockOverlay = (videoId) => {
		if (document.getElementById(SHORTS_BLOCK_OVERLAY_ID)) return;

		// DOMから動画メタデータを抽出
		const extractMetadata = () => {
			const metadata = {
				title: '',
				likes: '',
			};

			// 1. document.title から取得
			if (document.title && document.title !== 'YouTube') {
				metadata.title = document.title.replace(' - YouTube', '').trim();
			}

			// 2. Metaタグから取得 (og:title)
			if (!metadata.title) {
				const ogTitle = document.querySelector('meta[property="og:title"]');
				if (ogTitle && ogTitle.content) {
					metadata.title = ogTitle.content.replace(' - YouTube', '').trim();
				}
			}

			// 3. DOM要素から取得
			if (!metadata.title) {
				const titleSelectors = [
					'#shorts-player h2.title yt-formatted-string',
					'ytd-reel-player-header-renderer h2',
					'#reel-heading yt-formatted-string',
					'ytm-reel-player-header-renderer .reel-player-header-title',
					'h1.ytd-watch-metadata yt-formatted-string',
				];
				for (const selector of titleSelectors) {
					const el = document.querySelector(selector);
					if (el && el.textContent.trim()) {
						metadata.title = el.textContent.trim();
						break;
					}
				}
			}

			// いいね数を取得
			const likeSelectors = [
				'ytd-toggle-button-renderer[target-id="engagement-panel-structured-description"] button span',
				'#like-button button span',
				'ytm-like-button-renderer button span',
				'like-button-view-model button span',
				'segmented-like-dislike-button-view-model button span',
			];
			for (const selector of likeSelectors) {
				const elements = document.querySelectorAll(selector);
				for (const el of elements) {
					const text = el.textContent.trim();
					if (text && /\d/.test(text)) {
						metadata.likes = text;
						break;
					}
				}
				if (metadata.likes) break;
			}

			return metadata;
		};

		// OEmbed APIを使用してメタデータを非同期で取得（DOM非表示対策）
		const fetchOembedData = async () => {
			try {
				const response = await fetch(
					`https://www.youtube.com/oembed?url=https://www.youtube.com/shorts/${videoId}&format=json`
				);
				if (response.ok) {
					const data = await response.json();
					return {
						title: data.title,
						author_name: data.author_name,
					};
				}
			} catch (e) {
				console.warn('[Anti-Shorts] OEmbed fetch failed:', e);
			}
			return null;
		};

		// ページソースからいいね数を取得（DOM非表示対策）
		const fetchLikeCount = async () => {
			try {
				const response = await fetch(`https://www.youtube.com/shorts/${videoId}`);
				if (response.ok) {
					const text = await response.text();
					// パターン1: "likeCountText":{"displayText":{"simpleText":"1.2万"}}
					const match1 = text.match(
						/"likeCountText":\s*\{\s*"displayText":\s*\{\s*"simpleText":\s*"(.*?)"\s*\}/
					);
					if (match1 && match1[1]) return match1[1];

					// パターン2: "simpleText":"1.2万" ... "iconType":"LIKE" (近くにある場合)
					const match2 = text.match(/"simpleText":"([^"]+)"\}[^}]*?\{"iconType":"LIKE"/);
					if (match2 && match2[1]) return match2[1];

					// パターン3: "defaultText":{"simpleText":"1.2万"} ... "iconType":"LIKE"
					const match3 = text.match(
						/"defaultText":\s*\{\s*"simpleText":\s*"(.*?)"\s*\}\s*,\s*"defaultIcon":\s*\{\s*"iconType":\s*"LIKE"/
					);
					if (match3 && match3[1]) return match3[1];
				}
			} catch (e) {
				console.warn('[Anti-Shorts] Like count fetch failed:', e);
			}
			return null;
		};

		let metadata = extractMetadata();
		// タイトルがまだ取得できていない場合は仮の表示
		const displayTitle =
			metadata.title && metadata.title !== 'YouTube' ? metadata.title : '読み込み中...';

		const overlay = document.createElement('div');
		overlay.id = SHORTS_BLOCK_OVERLAY_ID;
		overlay.dataset.videoId = videoId;

		const iconUrl = chrome.runtime.getURL('assets/icons/icon48.png');
		const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

		overlay.innerHTML = `
			<div class="panel">
				<header class="header">
					<img src="${iconUrl}" alt="logo" class="logo" />
					<h1 class="title">ANTI YT SHORTS - β</h1>
				</header>
				<main class="main">
					<div class="label">
						<h1 id="anti-shorts-title-msg">「${displayTitle}」がブロックされています。</h1>
						
						<div class="video-info">
							<div class="video-stats">
								<span id="anti-shorts-likes">イイネ数：${metadata.likes || '---'}</span>
							</div>
						</div>

						<a href="https://www.youtube.com/watch?v=${videoId}" class="thumbnail-link">
							<img src="${thumbnailUrl}" 
								 alt="動画サムネイル" 
								 class="video-thumbnail"
								 onerror="this.src='https://img.youtube.com/vi/${videoId}/hqdefault.jpg'">
							<div class="play-button-overlay">
								<svg height="100%" version="1.1" viewBox="0 0 68 48" width="100%">
									<path d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z" fill="#f00"></path>
									<path d="M 45,24 27,14 27,34" fill="#fff"></path>
								</svg>
							</div>
						</a>
						<p class="watch-instruction">クリックして通常動画として視聴</p>
						<br>
						<a href="https://www.youtube.com" class="youtube-link">YouTube ホームに戻る</a>
					</div>
				</main>
			</div>
		`;

		document.body.appendChild(overlay);

		// メタデータの定期更新（読み込み完了待ち）
		const updateMetadata = () => {
			const newMetadata = extractMetadata();
			const titleMsg = overlay.querySelector('#anti-shorts-title-msg');
			const likesMsg = overlay.querySelector('#anti-shorts-likes');

			if (newMetadata.title && newMetadata.title !== 'YouTube') {
				if (titleMsg)
					titleMsg.textContent = `「${newMetadata.title}」がブロックされています。`;
			}
			if (newMetadata.likes) {
				if (likesMsg) likesMsg.textContent = `イイネ数：${newMetadata.likes}`;
			}
		};

		// OEmbedで確実にタイトルを取得する
		if (!metadata.title || metadata.title === 'YouTube') {
			fetchOembedData().then((data) => {
				if (data && data.title) {
					const titleMsg = overlay.querySelector('#anti-shorts-title-msg');
					if (titleMsg)
						titleMsg.textContent = `「${data.title}」がブロックされています。`;
				}
			});
		}

		// いいね数が取得できていない場合はページソースから取得を試みる
		if (!metadata.likes) {
			fetchLikeCount().then((likes) => {
				if (likes) {
					const likesMsg = overlay.querySelector('#anti-shorts-likes');
					if (likesMsg) likesMsg.textContent = `イイネ数：${likes}`;
				}
			});
		}

		// バックグラウンド動画の停止処理とメタデータ更新を同時に行う
		const stopBackgroundVideo = () => {
			const videos = document.querySelectorAll('video');
			videos.forEach((v) => {
				if (!v.paused) {
					v.pause();
					v.muted = true;
				}
			});
			updateMetadata(); // ついでにメタデータも更新
		};

		stopBackgroundVideo();
		const stopInterval = setInterval(stopBackgroundVideo, 500);
		overlay.dataset.stopIntervalId = String(stopInterval);
	};

	// ===== 非表示処理の統合実行 =====
	const runHideCycle = () => {
		if (!isEnabled) return;
		hideShortBlocks();
		hideByTextScan();
		hideShortTags();
		hideShortTabs();
	};

	// ===== デバウンス処理 =====
	const debouncedHide = () => {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(runHideCycle, DEBOUNCE_MS);
	};

	// ===== MutationObserver制御 =====
	const startObserver = () => {
		if (observer) return;
		observer = new MutationObserver(debouncedHide);
		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
	};

	const stopObserver = () => {
		if (observer) {
			observer.disconnect();
			observer = null;
		}
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		if (styleTimer) {
			clearInterval(styleTimer);
			styleTimer = null;
		}
	};

	// ===== Shorts URL検出とオーバーレイ管理 =====
	const isShortsUrl = (url) => {
		return /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/.test(url || window.location.href);
	};

	const extractVideoIdFromUrl = (url) => {
		const match = (url || window.location.href).match(/\/shorts\/([a-zA-Z0-9_-]+)/);
		return match ? match[1] : null;
	};

	const removeOverlayIfExists = () => {
		const existing = document.getElementById(SHORTS_BLOCK_OVERLAY_ID);
		if (existing) {
			const intervalId = existing.dataset.stopIntervalId;
			if (intervalId) {
				clearInterval(Number(intervalId));
			}
			existing.remove();
		}
	};

	const checkAndShowOverlay = () => {
		if (!isEnabled) return;

		if (isShortsUrl()) {
			const videoId = extractVideoIdFromUrl();
			if (videoId) {
				// 既存のオーバーレイを削除してから新しいものを表示
				removeOverlayIfExists();
				showShortsBlockOverlay(videoId);
			}
		} else {
			// Shortsページでない場合はオーバーレイを削除
			removeOverlayIfExists();
		}
	};

	// ===== オーバーレイ表示と復元処理 =====
	const showOverlayThenRestore = () => {
		const ov = document.createElement('div');
		ov.id = OVERLAY_ID;
		ov.innerHTML = `
      <style>
        #${OVERLAY_ID} {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(10px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 99999;
          transition: opacity 0.6s ease;
          opacity: 1;
        }
        #${OVERLAY_ID} .loader {
          width: 40px;
          height: 40px;
          border: 3px solid #fff;
          border-top: 3px solid transparent;
          border-radius: 50%;
          margin: 0 auto 10px;
          animation: spin 1s linear infinite;
        }
        #${OVERLAY_ID} .panel {
          color: white;
          font-size: 16px;
          text-align: center;
          animation: pulse 1s infinite;
        }
        @keyframes spin {from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes pulse {0%{opacity:0.8}50%{opacity:1}100%{opacity:0.8}}
      </style>
      <div class="panel">
        <div class="loader"></div>
        <p>Anti-Shortsを無効化しています...</p>
      </div>
    `;

		// Apply styles directly for robustness (though CSS in innerHTML is also used)
		Object.assign(ov.style, {
			position: 'fixed',
			top: '0',
			left: '0',
			width: '100%',
			height: '100%',
			background: 'rgba(0,0,0,0.75)',
			backdropFilter: 'blur(10px)',
			display: 'flex',
			justifyContent: 'center',
			alignItems: 'center',
			zIndex: 99999,
			transition: 'opacity 0.6s ease',
			opacity: 1,
		});

		const loader = ov.querySelector('.loader');
		Object.assign(loader.style, {
			width: '40px',
			height: '40px',
			border: '3px solid #fff',
			borderTop: '3px solid transparent',
			borderRadius: '50%',
			margin: '0 auto 10px',
			animation: 'spin 1s linear infinite',
		});

		const panel = ov.querySelector('.panel');
		panel.style.cssText =
			'color:white;font-size:16px;text-align:center;animation:pulse 1s infinite;';

		const style = document.createElement('style');
		style.textContent = `
      @keyframes spin {from{transform:rotate(0)}to{transform:rotate(360deg)}}
      @keyframes pulse {0%{opacity:0.8}50%{opacity:1}100%{opacity:0.8}}
    `;
		document.head.appendChild(style);
		document.body.appendChild(ov);

		stopObserver();
		removeStyle();
		isEnabled = false;

		setTimeout(() => {
			ov.style.opacity = '0';
			ov.addEventListener(
				'transitionend',
				() => {
					ov.remove();
					processed = new WeakSet();
				},
				{ once: true }
			);
		}, RESTORE_DELAY);
	};

	// ===== 有効化 / 無効化 =====
	const enable = () => {
		if (isEnabled) return;
		isEnabled = true;
		injectStyle();
		startObserver();
		runHideCycle();

		// Shorts URLをチェックしてオーバーレイ表示
		checkAndShowOverlay();

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
		// Shortsオーバーレイをクリーンアップ
		removeOverlayIfExists();
		showOverlayThenRestore();
	};

	// ===== ページ遷移イベント検知 =====
	const handleNav = () => {
		if (!isEnabled) return;
		injectStyle();
		runHideCycle();
		// URL変更時にShortsページかチェックしてオーバーレイを管理
		checkAndShowOverlay();
	};

	['yt-navigate-start', 'yt-navigate-finish', 'popstate', 'pageshow', 'DOMContentLoaded'].forEach(
		(e) => window.addEventListener(e, handleNav, { passive: true })
	);

	// ===== メッセージ受信 =====
	chrome.runtime.onMessage.addListener((msg) => {
		if (!msg || !msg.action) return;
		if (msg.action === 'enable') enable();
		if (msg.action === 'disable') disable();
	});

	// ===== ストレージから有効状態を取得 =====
	chrome.storage.sync.get({ enabled: false }, (res) => {
		if (res.enabled) enable();
	});
})();
