// content_scripts/anti-shorts.js
// Anti YouTube Shorts v3.1.0 - Bug Fix Update
// Singleton Pattern + 最適化MutationObserver + Strict Security + Video Suppressor
(() => {
	'use strict';

	// 多重実行防止
	if (window.__antiShortsInitialized) return;
	window.__antiShortsInitialized = true;

	/** @type {ShortsConfig} */
	const CONFIG = Object.freeze({
		STYLE_ID: 'anti-shorts-style',
		OVERLAY_ID: 'anti-shorts-overlay',
		HIDDEN_ATTR: 'data-anti-shorts-hidden',
		DEBOUNCE_MS: 80, // 80msに短縮（レスポンス向上）
		STYLE_CHECK_INTERVAL: 2000,
		RESTORE_DELAY: 3500,
		NAVIGATION_RECHECK_MS: 500, // ナビゲーション後の再確認遅延
	});

	// CSS非表示用セレクタ（安全なもののみ）
	// 注意: ytd-reel-video-renderer は「おすすめ」サイドバーにも使われるため除外
	// Shortsの個別アイテムはJS処理で対応
	const SHORTS_SELECTORS = Object.freeze([
		'ytd-reel-shelf-renderer', // Shortsシェルフ全体
		// ナビゲーション要素のみ
		'ytd-mini-guide-entry-renderer[aria-label*="ショート"]',
		'#endpoint[title="ショート"]',
		'tp-yt-paper-item[title="ショート"]',
		'yt-tab-shape[tab-title="ショート"]',
	]);

	// 検索結果ページ専用セレクタ
	const SEARCH_SHORTS_SELECTORS = Object.freeze([
		'ytd-reel-shelf-renderer',
		'ytd-horizontal-card-list-renderer:has(a[href^="/shorts/"])',
	]);

	// ブロック対象コンテナセレクタ
	const BLOCK_CONTAINER_SELECTORS = Object.freeze([
		'ytd-rich-shelf-renderer',
		'ytd-rich-section-renderer',
		'ytd-item-section-renderer',
		'ytd-grid-shelf-renderer',
	]);

	// 個別動画アイテムセレクタ
	const VIDEO_ITEM_SELECTORS = Object.freeze([
		'ytd-video-renderer',
		'ytd-grid-video-renderer',
		'ytd-compact-video-renderer',
		'ytd-rich-item-renderer',
	]);

	class AntiShortsManager {
		static #instance = null;
		#enabled = false;
		#observer = null;
		#debounceTimer = null;
		#styleCheckTimer = null;
		#suppressorTimer = null;
		#processedElements = new WeakSet();
		#currentUrl = '';
		#navigationRecheckTimer = null;

		static getInstance() {
			if (!AntiShortsManager.#instance) {
				AntiShortsManager.#instance = new AntiShortsManager();
			}
			return AntiShortsManager.#instance;
		}

		constructor() {
			this.#setupEventListeners();
			this.#setupMessageListener();
			this.#loadInitialState();
		}

		#setupEventListeners() {
			// YouTube SPA ナビゲーションイベント（全パターン対応）
			const navigationEvents = [
				'yt-navigate-start',
				'yt-navigate-finish',
				'yt-page-data-updated',
				'yt-page-data-fetched',
				'popstate',
				'pageshow',
			];
			navigationEvents.forEach((event) => {
				window.addEventListener(event, () => this.#handleNavigation(), { passive: true });
			});

			// History API のオーバーライド（URLパラメータ変更検知）
			this.#hookHistoryAPI();

			// DOMContentLoaded
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', () => this.#handleNavigation(), {
					once: true,
				});
			}

			// visibilitychange: タブがアクティブになった時
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible' && this.#enabled) {
					this.#handleNavigation();
				}
			});
		}

		#hookHistoryAPI() {
			// pushState/replaceStateをフックして検索パラメータ変更を検知
			const originalPushState = history.pushState.bind(history);
			const originalReplaceState = history.replaceState.bind(history);

			history.pushState = (...args) => {
				originalPushState(...args);
				this.#handleNavigation();
			};

			history.replaceState = (...args) => {
				originalReplaceState(...args);
				this.#handleNavigation();
			};
		}

		#setupMessageListener() {
			chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
				if (!message?.action) return false;
				if (message.action === 'enable') this.enable();
				if (message.action === 'disable') this.disable();
				sendResponse({ success: true });
				return true;
			});
		}

		#loadInitialState() {
			chrome.storage.sync.get({ enabled: false }, (result) => {
				if (result.enabled) this.enable();
			});
		}

		enable() {
			if (this.#enabled) return;
			this.#enabled = true;
			this.#injectStyles();
			this.#startObserver();
			this.#scheduleHideCycle();
			this.#checkShortsPage();
			this.#styleCheckTimer = setInterval(() => {
				if (this.#enabled && !document.getElementById(CONFIG.STYLE_ID)) {
					this.#injectStyles();
				}
			}, CONFIG.STYLE_CHECK_INTERVAL);
		}

		disable() {
			if (!this.#enabled) return;
			this.#removeBlockOverlay();
			this.#showRestoreOverlay();
		}

		#injectStyles() {
			if (document.getElementById(CONFIG.STYLE_ID)) return;
			const style = document.createElement('style');
			style.id = CONFIG.STYLE_ID;
			const hideSelectors = [...SHORTS_SELECTORS, `[${CONFIG.HIDDEN_ATTR}="1"]`];
			style.textContent = `${hideSelectors.join(',')}{display:none!important;visibility:hidden!important}`;
			document.documentElement.appendChild(style);
		}

		#removeStyles() {
			document.getElementById(CONFIG.STYLE_ID)?.remove();
		}

		#startObserver() {
			if (this.#observer) return;
			if (!document.body) {
				document.addEventListener('DOMContentLoaded', () => this.#startObserver(), {
					once: true,
				});
				return;
			}

			// パフォーマンス最適化: 可能な限り対象コンテナのみ監視
			const targetNode =
				document.querySelector('#content, ytd-page-manager') || document.body;

			this.#observer = new MutationObserver((mutations) => {
				// 高速フィルタ: 追加されたノードがある場合のみ処理
				let hasAddedNodes = false;
				for (const mutation of mutations) {
					if (mutation.addedNodes.length > 0) {
						hasAddedNodes = true;
						break;
					}
				}
				if (hasAddedNodes) {
					this.#debouncedHide();
				}
			});
			this.#observer.observe(targetNode, { childList: true, subtree: true });
		}

		#stopObserver() {
			this.#observer?.disconnect();
			this.#observer = null;
			if (this.#debounceTimer) {
				clearTimeout(this.#debounceTimer);
				this.#debounceTimer = null;
			}
			if (this.#styleCheckTimer) {
				clearInterval(this.#styleCheckTimer);
				this.#styleCheckTimer = null;
			}
			if (this.#navigationRecheckTimer) {
				clearTimeout(this.#navigationRecheckTimer);
				this.#navigationRecheckTimer = null;
			}
		}

		#debouncedHide() {
			if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
			this.#debounceTimer = setTimeout(() => this.#scheduleHideCycle(), CONFIG.DEBOUNCE_MS);
		}

		#scheduleHideCycle() {
			if (!this.#enabled) return;
			// requestAnimationFrameでメインスレッドブロックを回避
			requestAnimationFrame(() => this.#runHideCycle());
		}

		#runHideCycle() {
			if (!this.#enabled) return;
			this.#hideShortBlocks();
			this.#hideShortsItems();
			this.#hideShortTags();
			this.#hideSearchShorts();
		}

		/**
		 * Shortsシェルフ全体を非表示にする
		 * タイトルに「ショート」「Shorts」がある場合のみ
		 */
		#hideShortBlocks() {
			const notHidden = `:not([${CONFIG.HIDDEN_ATTR}="1"])`;
			const selector = BLOCK_CONTAINER_SELECTORS.map((s) => s + notHidden).join(',');
			const containers = document.querySelectorAll(selector);
			for (const container of containers) {
				if (this.#processedElements.has(container)) continue;
				const titleEl = container.querySelector(
					'.yt-shelf-header-layout__title, h2, .yt-core-attributed-string, span#title',
				);
				if (titleEl && /^ショート$|^shorts$/i.test((titleEl.textContent || '').trim())) {
					container.setAttribute(CONFIG.HIDDEN_ATTR, '1');
					this.#processedElements.add(container);
				}
			}
		}

		/**
		 * 個別のShorts動画アイテムを非表示にする
		 * ★ 厳格なURL判定: href="/shorts/" を含むリンクがある場合のみ
		 */
		#hideShortsItems() {
			const notHidden = `:not([${CONFIG.HIDDEN_ATTR}="1"])`;
			const selector = VIDEO_ITEM_SELECTORS.map((s) => s + notHidden).join(',');
			const items = document.querySelectorAll(selector);

			for (const item of items) {
				if (this.#processedElements.has(item)) continue;

				// ★ 厳格なURL判定: /shorts/ リンクがある場合のみ非表示
				const shortsLink = item.querySelector('a[href^="/shorts/"], a[href*="/shorts/"]');
				if (shortsLink) {
					item.setAttribute(CONFIG.HIDDEN_ATTR, '1');
					this.#processedElements.add(item);
				}
			}
		}

		/**
		 * Shortsタグチップを非表示にする
		 */
		#hideShortTags() {
			const notHidden = `:not([${CONFIG.HIDDEN_ATTR}="1"])`;
			const selector = `yt-chip-cloud-chip-renderer${notHidden}`;
			const tags = document.querySelectorAll(selector);
			for (const tag of tags) {
				if (this.#processedElements.has(tag)) continue;
				const text = (tag.textContent || '').trim();
				if (/^ショート$/i.test(text) || /^shorts$/i.test(text)) {
					tag.setAttribute(CONFIG.HIDDEN_ATTR, '1');
					this.#processedElements.add(tag);
				}
			}
		}

		/**
		 * 検索結果ページ専用のShorts非表示処理
		 */
		#hideSearchShorts() {
			if (!window.location.pathname.startsWith('/results')) return;

			const notHidden = `:not([${CONFIG.HIDDEN_ATTR}="1"])`;

			// Shortsセクション全体を非表示
			const sectionSelector = SEARCH_SHORTS_SELECTORS.map((s) => s + notHidden).join(',');
			const shortsElements = document.querySelectorAll(sectionSelector);
			for (const el of shortsElements) {
				el.setAttribute(CONFIG.HIDDEN_ATTR, '1');
				this.#processedElements.add(el);
			}

			// 個別のShorts動画を非表示（検索結果内）
			const videoLinks = document.querySelectorAll(`a[href^="/shorts/"]`);
			for (const link of videoLinks) {
				const videoContainer = link.closest(VIDEO_ITEM_SELECTORS.join(','));
				if (!videoContainer || videoContainer.getAttribute(CONFIG.HIDDEN_ATTR) === '1')
					continue;
				videoContainer.setAttribute(CONFIG.HIDDEN_ATTR, '1');
				this.#processedElements.add(videoContainer);
			}
		}

		#handleNavigation() {
			if (!this.#enabled) return;

			const newUrl = window.location.href;
			const urlChanged = newUrl !== this.#currentUrl;

			if (urlChanged) {
				this.#currentUrl = newUrl;
				// URL変更時は処理済み要素をリセット（新しいコンテンツが読み込まれるため）
				this.#processedElements = new WeakSet();
			}

			// 常にスタイル注入とhide処理を実行（SPA対応）
			this.#injectStyles();
			this.#scheduleHideCycle();
			this.#checkShortsPage();

			// ★ 遅延再チェック: DOMの遅延ロードに対応
			if (this.#navigationRecheckTimer) {
				clearTimeout(this.#navigationRecheckTimer);
			}
			this.#navigationRecheckTimer = setTimeout(() => {
				if (this.#enabled) {
					this.#scheduleHideCycle();
				}
			}, CONFIG.NAVIGATION_RECHECK_MS);
		}

		#checkShortsPage() {
			const match = window.location.href.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
			if (match) {
				// ★ 即時に動画を停止 (UX改善: オーバーレイ表示前に停止)
				this.#instantVideoPause();
				this.#showBlockOverlay(match[1]);
			} else {
				this.#removeBlockOverlay();
			}
		}

		#instantVideoPause() {
			document.querySelectorAll('video').forEach((video) => {
				video.pause();
				video.muted = true;
				video.currentTime = 0;
			});
		}

		#showBlockOverlay(videoId) {
			if (document.getElementById(CONFIG.OVERLAY_ID)) return;
			this.#startVideoSuppressor();
			const metadata = this.#extractMetadata();
			const overlay = document.createElement('div');
			overlay.id = CONFIG.OVERLAY_ID;
			overlay.dataset.videoId = videoId;

			const iconUrl = chrome.runtime.getURL('assets/icons/icon48.png');
			const thumbHQ = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
			const thumbFallback = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

			const container = document.createElement('div');
			container.className = 'panel';

			const header = document.createElement('header');
			header.className = 'header';
			const logo = document.createElement('img');
			logo.src = iconUrl;
			logo.alt = 'logo';
			logo.className = 'logo';
			const titleH1 = document.createElement('h1');
			titleH1.className = 'title';
			titleH1.textContent = 'ANTI YT SHORTS';
			header.append(logo, titleH1);

			const main = document.createElement('main');
			main.className = 'main';
			const label = document.createElement('div');
			label.className = 'label';

			const titleMsg = document.createElement('h1');
			titleMsg.id = 'anti-shorts-title-msg';
			titleMsg.textContent = `「${metadata.title || '読み込み中...'}」がブロックされています。`;

			const videoInfo = document.createElement('div');
			videoInfo.className = 'video-info';
			const stats = document.createElement('div');
			stats.className = 'video-stats';
			const likesSpan = document.createElement('span');
			likesSpan.id = 'anti-shorts-likes';
			likesSpan.textContent = `イイネ数：${metadata.likes || '---'}`;
			stats.appendChild(likesSpan);
			videoInfo.appendChild(stats);

			const thumbLink = document.createElement('a');
			thumbLink.href = `https://www.youtube.com/watch?v=${videoId}`;
			thumbLink.className = 'thumbnail-link';
			const thumbImg = document.createElement('img');
			thumbImg.src = thumbHQ;
			thumbImg.alt = '動画サムネイル';
			thumbImg.className = 'video-thumbnail';
			thumbImg.addEventListener(
				'error',
				() => {
					if (thumbImg.src !== thumbFallback) thumbImg.src = thumbFallback;
					else thumbImg.style.display = 'none';
				},
				{ once: true },
			);

			const playOverlay = document.createElement('div');
			playOverlay.className = 'play-button-overlay';
			playOverlay.innerHTML = `<svg height="100%" viewBox="0 0 68 48" width="100%"><path d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z" fill="#f00"></path><path d="M 45,24 27,14 27,34" fill="#fff"></path></svg>`;
			thumbLink.append(thumbImg, playOverlay);

			const instr = document.createElement('p');
			instr.className = 'watch-instruction';
			instr.textContent = 'クリックして通常動画として視聴';

			const homeLink = document.createElement('a');
			homeLink.href = 'https://www.youtube.com';
			homeLink.className = 'youtube-link';
			homeLink.textContent = 'YouTube ホームに戻る';

			label.append(
				titleMsg,
				videoInfo,
				thumbLink,
				instr,
				document.createElement('br'),
				homeLink,
			);
			main.appendChild(label);
			container.append(header, main);
			overlay.appendChild(container);
			document.body.appendChild(overlay);
			this.#fetchAndUpdateMetadata(videoId, overlay);
		}

		#startVideoSuppressor() {
			if (this.#suppressorTimer) return;
			const suppress = () => {
				document.querySelectorAll('video').forEach((video) => {
					if (!video.paused) {
						video.pause();
						video.muted = true;
					}
				});
			};
			suppress();
			this.#suppressorTimer = setInterval(suppress, 400);
		}

		#stopVideoSuppressor() {
			if (this.#suppressorTimer) {
				clearInterval(this.#suppressorTimer);
				this.#suppressorTimer = null;
			}
		}

		#extractMetadata() {
			let title = '';
			let likes = '';

			// タイトル取得
			if (document.title && document.title !== 'YouTube') {
				title = document.title.replace(' - YouTube', '').trim();
			}
			if (!title) {
				const ogTitle = document.querySelector('meta[property="og:title"]');
				if (ogTitle?.content) title = ogTitle.content.replace(' - YouTube', '').trim();
			}

			// いいね数をDOMから直接取得（複数パターン対応）
			likes = this.#extractLikesFromDOM();

			return { title, likes };
		}

		/**
		 * ★ 強化版: いいね数をDOMから抽出
		 * YouTubeのDOM構造変更に対応するため複数パターンを試行
		 */
		#extractLikesFromDOM() {
			// パターン1: Shorts専用セレクタ（新UI）
			const shortsLikeSelectors = [
				'ytd-reel-video-renderer[is-active] #like-button yt-formatted-string',
				'ytd-shorts-player-controls #like-button span',
				'#like-button button span[role="text"]',
				'like-button-view-model button span',
				'.YtShortsLikeButtonViewModelHost span',
			];

			for (const selector of shortsLikeSelectors) {
				try {
					const el = document.querySelector(selector);
					if (el?.textContent) {
						const text = el.textContent.trim();
						if (/^[\d,.]+[万億KMB]?$/.test(text) || text === '0') {
							return text;
						}
					}
				} catch {
					/* continue */
				}
			}

			// パターン2: 汎用セレクタ
			const genericSelectors = [
				'ytd-toggle-button-renderer#like-button yt-formatted-string',
				'#like-button yt-formatted-string',
				'[aria-label*="いいね"] yt-formatted-string',
				'[aria-label*="like"] yt-formatted-string',
				'ytd-menu-renderer yt-formatted-string.ytd-toggle-button-renderer',
			];

			for (const selector of genericSelectors) {
				try {
					const el = document.querySelector(selector);
					if (el?.textContent) {
						const text = el.textContent.trim();
						if (/^[\d,.]+[万億KMB]?$/.test(text) || text === '0') {
							return text;
						}
					}
				} catch {
					/* continue */
				}
			}

			// パターン3: aria-labelから抽出
			const ariaElements = document.querySelectorAll('[aria-label]');
			for (const el of ariaElements) {
				const label = el.getAttribute('aria-label') || '';
				// 日本語: "1.2万 件の高評価" or "高評価 1,234"
				const jpMatch = label.match(
					/([\d,.]+[万億]?)\s*件?の?高評価|高評価\s*([\d,.]+[万億]?)/,
				);
				if (jpMatch) return jpMatch[1] || jpMatch[2];
				// 英語: "1.2K likes"
				const enMatch = label.match(/([\d,.]+[KMB]?)\s*likes?/i);
				if (enMatch) return enMatch[1];
			}

			return '';
		}

		async #fetchLikeCount(videoId) {
			try {
				const response = await fetch(`https://www.youtube.com/shorts/${videoId}`);
				if (response.ok) {
					const text = await response.text();
					const patterns = [
						/"toggledText":\s*\{[^}]*"simpleText":\s*"([\d,.]+[万億KMB]?)"/,
						/"likeCount":\s*"?([\d,.]+)"/,
						/"likeCountText":[^}]*"simpleText":\s*"([\d,.]+[万億KMB]?)"/,
						/"accessibilityText":\s*"[^"]*?([\d,.]+[万億KMB]?)\s*件?の?(?:高評価|likes?)"/i,
					];
					for (const regex of patterns) {
						const match = text.match(regex);
						if (match?.[1]) return match[1];
					}
				}
			} catch {
				/* silent */
			}
			return null;
		}

		async #fetchAndUpdateMetadata(videoId, overlay) {
			try {
				const response = await fetch(
					`https://www.youtube.com/oembed?url=https://www.youtube.com/shorts/${videoId}&format=json`,
				);
				if (response.ok) {
					const data = await response.json();
					const titleEl = overlay.querySelector('#anti-shorts-title-msg');
					if (titleEl && data.title)
						titleEl.textContent = `「${data.title}」がブロックされています。`;
				}
			} catch {
				/* ignore */
			}

			// DOMからの再取得を試行（遅延ロード対応）
			let likes = this.#extractLikesFromDOM();
			if (!likes) {
				likes = await this.#fetchLikeCount(videoId);
			}
			if (likes) {
				const likesEl = overlay.querySelector('#anti-shorts-likes');
				if (likesEl) likesEl.textContent = `イイネ数：${likes}`;
			}
		}

		#removeBlockOverlay() {
			document.getElementById(CONFIG.OVERLAY_ID)?.remove();
			this.#stopVideoSuppressor();
		}

		#cleanupAndRestore() {
			document.querySelectorAll('video').forEach((video) => {
				video.muted = false;
				video.play().catch(() => {});
			});
			document
				.querySelectorAll(`[${CONFIG.HIDDEN_ATTR}="1"]`)
				.forEach((el) => el.removeAttribute(CONFIG.HIDDEN_ATTR));
		}

		#showRestoreOverlay() {
			const overlay = document.createElement('div');
			overlay.id = 'anti-shorts-restore-overlay';

			Object.assign(overlay.style, {
				position: 'fixed',
				inset: '0',
				zIndex: '2147483647',
				background: 'linear-gradient(180deg, #0f0f0f 0%, #1a1a1a 100%)',
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'center',
				alignItems: 'center',
				transition: 'opacity 0.5s ease',
				opacity: '1',
				fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
			});

			const iconUrl = chrome.runtime.getURL('assets/icons/icon48.png');

			// ===== コンテナ =====
			const container = document.createElement('div');
			Object.assign(container.style, {
				width: '80%',
				maxWidth: '500px',
				textAlign: 'center',
			});

			// ===== タイトル =====
			const title = document.createElement('h2');
			title.textContent = 'RESTORING...';
			Object.assign(title.style, {
				fontSize: '28px',
				fontWeight: '700',
				color: '#fff',
				fontFamily: '"BebasNeue", sans-serif',
				letterSpacing: '3px',
				marginBottom: '8px',
				textShadow: '0 2px 10px rgba(255, 0, 0, 0.3)',
			});

			// ===== パーセント表示 =====
			const percentText = document.createElement('div');
			percentText.id = 'restore-percent';
			percentText.textContent = '0%';
			Object.assign(percentText.style, {
				fontSize: '48px',
				fontWeight: '700',
				color: '#ff0000',
				fontFamily: '"BebasNeue", sans-serif',
				marginBottom: '24px',
				textShadow: '0 0 20px rgba(255, 0, 0, 0.5)',
			});

			// ===== シークバー (YouTube風) =====
			const seekBarContainer = document.createElement('div');
			Object.assign(seekBarContainer.style, {
				position: 'relative',
				width: '100%',
				height: '6px',
				background: 'rgba(255, 255, 255, 0.15)',
				borderRadius: '3px',
				marginBottom: '16px',
				overflow: 'visible',
			});

			// 進行バー (赤)
			const progressBar = document.createElement('div');
			progressBar.id = 'restore-progress';
			Object.assign(progressBar.style, {
				position: 'absolute',
				left: '0',
				top: '0',
				height: '100%',
				width: '0%',
				background: 'linear-gradient(90deg, #ff0000, #ff4444)',
				borderRadius: '3px',
			});

			// ロゴ (再生ヘッド)
			const playhead = document.createElement('div');
			playhead.id = 'restore-playhead';
			Object.assign(playhead.style, {
				position: 'absolute',
				top: '50%',
				left: '0%',
				transform: 'translateY(-50%)',
				width: '36px',
				height: '36px',
				marginLeft: '-18px',
				borderRadius: '50%',
				background: '#1a1a1a',
				border: '3px solid #ff0000',
				boxShadow: '0 0 15px rgba(255, 0, 0, 0.6), 0 4px 8px rgba(0,0,0,0.5)',
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
			});

			const logoImg = document.createElement('img');
			logoImg.src = iconUrl;
			Object.assign(logoImg.style, {
				width: '22px',
				height: '22px',
				borderRadius: '4px',
			});
			playhead.appendChild(logoImg);

			seekBarContainer.append(progressBar, playhead);

			// ===== サブテキスト =====
			const subText = document.createElement('p');
			subText.textContent = '時間泥棒を解放中...';
			Object.assign(subText.style, {
				fontSize: '14px',
				color: '#888',
				margin: '0',
			});

			container.append(title, percentText, seekBarContainer, subText);
			overlay.appendChild(container);

			document.body.appendChild(overlay);

			// ===== アニメーションロジック =====
			const duration = CONFIG.RESTORE_DELAY;
			const startTime = Date.now();

			const keyframes = [
				{ time: 0, value: 0 },
				{ time: 0.15, value: 20 },
				{ time: 0.2, value: 15 },
				{ time: 0.35, value: 40 },
				{ time: 0.4, value: 35 },
				{ time: 0.55, value: 60 },
				{ time: 0.65, value: 75 },
				{ time: 0.7, value: 70 },
				{ time: 0.85, value: 90 },
				{ time: 0.9, value: 85 },
				{ time: 1.0, value: 100 },
			];

			const interpolate = (progress) => {
				for (let i = 0; i < keyframes.length - 1; i++) {
					const curr = keyframes[i];
					const next = keyframes[i + 1];
					if (progress >= curr.time && progress <= next.time) {
						const localProgress = (progress - curr.time) / (next.time - curr.time);
						const eased =
							localProgress < 0.5
								? 2 * localProgress * localProgress
								: 1 - Math.pow(-2 * localProgress + 2, 2) / 2;
						return curr.value + (next.value - curr.value) * eased;
					}
				}
				return 100;
			};

			const animate = () => {
				const elapsed = Date.now() - startTime;
				const progress = Math.min(elapsed / duration, 1);
				const value = interpolate(progress);

				progressBar.style.width = `${value}%`;
				playhead.style.left = `${value}%`;
				percentText.textContent = `${Math.round(value)}%`;

				if (progress < 1) {
					requestAnimationFrame(animate);
				}
			};

			requestAnimationFrame(animate);

			// ===== 状態リセット =====
			this.#stopObserver();
			this.#removeStyles();
			this.#enabled = false;

			// ===== アニメーション完了後に復元 & フェードアウト =====
			setTimeout(() => {
				this.#cleanupAndRestore();
				overlay.style.opacity = '0';
				overlay.addEventListener(
					'transitionend',
					() => {
						overlay.remove();
						this.#processedElements = new WeakSet();
					},
					{ once: true },
				);
			}, duration);
		}
	}

	AntiShortsManager.getInstance();
})();
