/**
 * Anti YouTube Shorts v3.1.2
 * パフォーマンス最適化版
 */
(() => {
	'use strict';
	if (window.__antiShortsInitialized) return;
	window.__antiShortsInitialized = true;

	// === 定数定義 ===
	const STYLE_ID = 'anti-shorts-style';
	const OVERLAY_ID = 'anti-shorts-overlay';
	const HIDDEN_ATTR = 'data-anti-shorts-hidden';
	const DEBOUNCE_MS = 50;
	const STYLE_CHECK_MS = 3000;
	const RESTORE_DELAY = 3000;

	// === セレクタ（事前結合済み） ===
	const CSS_HIDE_RULES = [
		'ytd-reel-shelf-renderer',
		'ytd-mini-guide-entry-renderer[aria-label*="ショート"]',
		'#endpoint[title="ショート"]',
		'tp-yt-paper-item[title="ショート"]',
		'yt-tab-shape[tab-title="ショート"]',
		`[${HIDDEN_ATTR}="1"]`,
	].join(',');

	const CONTAINER_SEL =
		'ytd-rich-shelf-renderer,ytd-rich-section-renderer,ytd-grid-shelf-renderer,grid-shelf-view-model';
	const ITEM_SEL =
		'ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,ytd-rich-item-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2,ytd-reel-item-renderer';
	const SHORTS_ITEM_SEL =
		'ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2,ytd-reel-item-renderer';
	const SEARCH_CLEANUP_SEL = 'yt-search-query-correction,ytd-hashtag-tile-renderer';
	const SEARCH_SHELF_SEL =
		'ytd-reel-shelf-renderer,ytd-horizontal-card-list-renderer:has(a[href^="/shorts/"])';
	const SECTION_CONTENT_SEL = `${CONTAINER_SEL},${ITEM_SEL},ytd-playlist-renderer,ytd-channel-renderer,ytd-shelf-renderer,yt-lockup-view-model`;
	const TITLE_SEL = '.yt-shelf-header-layout__title,h2,.yt-core-attributed-string,span#title';

	// === 事前コンパイル済み正規表現 ===
	const RE_SHORTS_TITLE = /^(ショート|shorts)$/i;
	const RE_SHORTS_TAG = /^(ショート|shorts)$/i;
	const RE_SHORTS_TEXT = /shorts/i;
	const RE_SHORTS_URL = /youtube\.com\/shorts\/[a-zA-Z0-9_-]+/;
	const RE_VIDEO_ID = /shorts\/([a-zA-Z0-9_-]+)/;
	const RE_LIKES = /^[\d,.]+[万億KMB]?$/;
	const RE_LIKE_COUNT = /"likeCount":\s*"?(\d+)/;

	class Manager {
		static #instance = null;
		#enabled = false;
		#observer = null;
		#debounceTimer = null;
		#styleCheckTimer = null;
		#videoSuppressor = null;
		#navTimer = null;
		#processed = new WeakSet();
		#currentUrl = '';
		#isShortsPage = false;

		static get() {
			return Manager.#instance || (Manager.#instance = new Manager());
		}

		constructor() {
			this.#init();
		}

		// === 初期化 ===
		#init() {
			const nav = () => this.#onNavigate();

			// YouTubeのSPA遷移イベント
			[
				'yt-navigate-start',
				'yt-navigate-finish',
				'yt-page-data-updated',
				'popstate',
				'pageshow',
			].forEach((e) => window.addEventListener(e, nav, { passive: true }));

			// History APIフック
			const origPush = history.pushState.bind(history);
			const origReplace = history.replaceState.bind(history);
			history.pushState = (...args) => {
				origPush(...args);
				nav();
			};
			history.replaceState = (...args) => {
				origReplace(...args);
				nav();
			};

			// DOM準備待ち
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', nav, { once: true });
			}

			// 可視性変更時の再チェック
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible' && this.#enabled) nav();
			});

			// メッセージリスナー
			chrome.runtime.onMessage.addListener((msg, _, respond) => {
				if (!msg?.action) return false;
				msg.action === 'enable'
					? this.enable()
					: msg.action === 'disable' && this.disable();
				respond({ success: true });
				return true;
			});

			// 初期状態読み込み
			chrome.storage.sync.get({ enabled: false }, (res) => res.enabled && this.enable());
		}

		// === 有効化/無効化 ===
		enable() {
			if (this.#enabled) return;
			this.#enabled = true;
			this.#injectCSS();
			this.#onNavigate();
			this.#styleCheckTimer = setInterval(() => {
				if (this.#enabled && !document.getElementById(STYLE_ID)) this.#injectCSS();
			}, STYLE_CHECK_MS);
		}

		disable() {
			if (!this.#enabled) return;
			this.#removeOverlay();
			this.#showRestoreAnimation();
		}

		// === CSS管理 ===
		#injectCSS() {
			if (document.getElementById(STYLE_ID)) return;
			const style = document.createElement('style');
			style.id = STYLE_ID;
			style.textContent = `${CSS_HIDE_RULES}{display:none!important;visibility:hidden!important}`;
			document.documentElement.appendChild(style);
		}

		#removeCSS() {
			document.getElementById(STYLE_ID)?.remove();
		}

		// === MutationObserver管理 ===
		#startObserver() {
			if (this.#observer || this.#isShortsPage) return;
			if (!document.body) {
				document.addEventListener('DOMContentLoaded', () => this.#startObserver(), {
					once: true,
				});
				return;
			}

			const target = document.querySelector('#content,ytd-page-manager') || document.body;
			this.#observer = new MutationObserver((mutations) => {
				for (const m of mutations) {
					if (m.addedNodes.length) {
						this.#scheduleHide();
						break;
					}
				}
			});
			this.#observer.observe(target, { childList: true, subtree: true });
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
			if (this.#navTimer) {
				clearTimeout(this.#navTimer);
				this.#navTimer = null;
			}
		}

		#scheduleHide() {
			if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
			this.#debounceTimer = setTimeout(
				() => requestAnimationFrame(() => this.#hideShorts()),
				DEBOUNCE_MS,
			);
		}

		// === Shorts非表示ロジック ===
		#hideShorts() {
			if (!this.#enabled || this.#isShortsPage) return;
			const notHidden = `:not([${HIDDEN_ATTR}="1"])`;

			// コンテナ（シェルフ）の処理
			document.querySelectorAll(`${CONTAINER_SEL}${notHidden}`).forEach((container) => {
				if (this.#processed.has(container)) return;
				if (this.#isShortContainer(container)) {
					this.#hideElement(container);
				}
			});

			// 個別アイテムの処理
			document.querySelectorAll(`${ITEM_SEL}${notHidden}`).forEach((item) => {
				if (this.#processed.has(item)) return;
				if (this.#isShortItem(item)) {
					this.#hideElement(item);
				}
			});

			// タグチップの処理
			document.querySelectorAll(`yt-chip-cloud-chip-renderer${notHidden}`).forEach((chip) => {
				if (this.#processed.has(chip)) return;
				if (RE_SHORTS_TAG.test(chip.textContent?.trim() || '')) {
					chip.setAttribute(HIDDEN_ATTR, '1');
					this.#processed.add(chip);
				}
			});

			// 検索結果ページ固有の処理
			if (location.pathname.startsWith('/results')) {
				this.#hideSearchPageShorts(notHidden);
			}
		}

		#isShortContainer(el) {
			// Shortsアイテムを含むか
			if (el.querySelector(SHORTS_ITEM_SEL)) return true;
			// Shortsリンクを含むか
			if (el.querySelector('a[href^="/shorts/"]')) return true;
			// タイトルがShortsか
			const title = el.querySelector(TITLE_SEL);
			return title && RE_SHORTS_TITLE.test(title.textContent?.trim() || '');
		}

		#isShortItem(el) {
			const tag = el.tagName.toLowerCase();
			return tag.includes('shorts') || !!el.querySelector('a[href^="/shorts/"]');
		}

		#hideElement(el) {
			el.setAttribute(HIDDEN_ATTR, '1');
			this.#processed.add(el);
			this.#checkEmptySection(el);
		}

		#hideSearchPageShorts(notHidden) {
			// ハッシュタグ・検索修正テキスト
			document.querySelectorAll(`${SEARCH_CLEANUP_SEL}${notHidden}`).forEach((el) => {
				if (RE_SHORTS_TEXT.test(el.textContent || '')) {
					el.setAttribute(HIDDEN_ATTR, '1');
					this.#processed.add(el);
				}
			});

			// Shortsシェルフ
			document.querySelectorAll(`${SEARCH_SHELF_SEL}${notHidden}`).forEach((el) => {
				this.#hideElement(el);
			});

			// Shortsリンクを含むアイテム
			document.querySelectorAll('a[href^="/shorts/"]').forEach((link) => {
				const item = link.closest(ITEM_SEL);
				if (item && item.getAttribute(HIDDEN_ATTR) !== '1') {
					this.#hideElement(item);
				}
			});
		}

		#checkEmptySection(el) {
			const section = el.closest('ytd-item-section-renderer');
			if (!section || section.getAttribute(HIDDEN_ATTR) === '1') return;

			const children = section.querySelectorAll(SECTION_CONTENT_SEL);
			let hasHidden = false;

			for (const child of children) {
				if (child.getAttribute(HIDDEN_ATTR) !== '1') return; // 非表示でない要素があれば終了
				hasHidden = true;
			}

			if (hasHidden) {
				section.setAttribute(HIDDEN_ATTR, '1');
				this.#processed.add(section);
			}
		}

		// === ナビゲーション処理 ===
		#onNavigate() {
			if (!this.#enabled) return;

			const url = location.href;
			if (url !== this.#currentUrl) {
				this.#currentUrl = url;
				this.#processed = new WeakSet();
			}

			this.#isShortsPage = RE_SHORTS_URL.test(url);

			if (this.#isShortsPage) {
				this.#stopObserver();
				this.#pauseAllVideos();
				this.#showBlockOverlay();
			} else {
				this.#removeOverlay();
				this.#injectCSS();
				this.#startObserver();
				this.#scheduleHide();
				if (this.#navTimer) clearTimeout(this.#navTimer);
				this.#navTimer = setTimeout(() => this.#enabled && this.#scheduleHide(), 300);
			}
		}

		// === 動画制御 ===
		#pauseAllVideos() {
			document.querySelectorAll('video').forEach((v) => {
				v.pause();
				v.muted = true;
				v.currentTime = 0;
			});
		}

		#startVideoSuppressor() {
			if (this.#videoSuppressor) return;
			const suppress = () => {
				document.querySelectorAll('video').forEach((v) => {
					if (!v.paused) {
						v.pause();
						v.muted = true;
					}
				});
			};
			suppress();
			this.#videoSuppressor = setInterval(suppress, 300);
		}

		#stopVideoSuppressor() {
			if (this.#videoSuppressor) {
				clearInterval(this.#videoSuppressor);
				this.#videoSuppressor = null;
			}
		}

		// === オーバーレイ表示 ===
		#showBlockOverlay() {
			if (document.getElementById(OVERLAY_ID)) return;
			this.#startVideoSuppressor();

			const match = this.#currentUrl.match(RE_VIDEO_ID);
			const videoId = match ? match[1] : '';
			const meta = this.#getVideoMeta();

			const overlay = document.createElement('div');
			overlay.id = OVERLAY_ID;
			overlay.dataset.videoId = videoId;

			const iconUrl = chrome.runtime.getURL('assets/icons/icon48.png');
			const thumbUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
			const thumbFallback = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

			overlay.innerHTML = `
				<div class="panel">
					<header class="header">
						<img src="${iconUrl}" alt="logo" class="logo">
						<h1 class="title">ANTI YT SHORTS</h1>
					</header>
					<main class="main">
						<div class="label">
							<h1 id="anti-shorts-title-msg">「${meta.title || '読み込み中...'}」がブロックされています。</h1>
							<div class="video-info">
								<div class="video-stats">
									<span id="anti-shorts-likes">イイネ数：${meta.likes || '---'}</span>
								</div>
							</div>
							<a href="https://www.youtube.com/watch?v=${videoId}" class="thumbnail-link">
								<img src="${thumbUrl}" alt="" class="video-thumbnail" onerror="this.src='${thumbFallback}'">
								<div class="play-button-overlay">
									<svg height="100%" viewBox="0 0 68 48" width="100%">
										<path d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z" fill="#f00"></path>
										<path d="M 45,24 27,14 27,34" fill="#fff"></path>
									</svg>
								</div>
							</a>
							<p class="watch-instruction">クリックして通常動画として視聴</p>
							<br>
							<a href="https://www.youtube.com" class="youtube-link">YouTube ホームに戻る</a>
						</div>
					</main>
				</div>`;

			document.body.appendChild(overlay);
			this.#fetchVideoMeta(videoId, overlay);
		}

		#removeOverlay() {
			document.getElementById(OVERLAY_ID)?.remove();
			this.#stopVideoSuppressor();
		}

		// === メタデータ取得 ===
		#getVideoMeta() {
			let title =
				document.title !== 'YouTube' ? document.title.replace(' - YouTube', '').trim() : '';
			if (!title) {
				const og = document.querySelector('meta[property="og:title"]');
				if (og?.content) title = og.content.replace(' - YouTube', '').trim();
			}
			return { title, likes: this.#getLikesFromDOM() };
		}

		#getLikesFromDOM() {
			const selectors = [
				'ytd-reel-video-renderer[is-active] #like-button yt-formatted-string',
				'#like-button button span[role="text"]',
				'like-button-view-model button span',
			];
			for (const sel of selectors) {
				const el = document.querySelector(sel);
				if (el?.textContent && RE_LIKES.test(el.textContent.trim())) {
					return el.textContent.trim();
				}
			}
			return '';
		}

		async #fetchVideoMeta(videoId, overlay) {
			// タイトル取得
			try {
				const res = await fetch(
					`https://www.youtube.com/oembed?url=https://www.youtube.com/shorts/${videoId}&format=json`,
				);
				if (res.ok) {
					const data = await res.json();
					const titleEl = overlay.querySelector('#anti-shorts-title-msg');
					if (titleEl && data.title) {
						titleEl.textContent = `「${data.title}」がブロックされています。`;
					}
				}
			} catch {}

			// いいね数取得
			let likes = this.#getLikesFromDOM();
			if (!likes) {
				try {
					const res = await fetch(`https://www.youtube.com/shorts/${videoId}`);
					if (res.ok) {
						const html = await res.text();
						const match = html.match(RE_LIKE_COUNT);
						if (match) likes = match[1];
					}
				} catch {}
			}
			if (likes) {
				const likesEl = overlay.querySelector('#anti-shorts-likes');
				if (likesEl) likesEl.textContent = `イイネ数：${likes}`;
			}
		}

		// === 復元アニメーション ===
		#showRestoreAnimation() {
			const overlay = document.createElement('div');
			overlay.id = 'anti-shorts-restore-overlay';
			Object.assign(overlay.style, {
				position: 'fixed',
				inset: '0',
				zIndex: '2147483647',
				background: 'linear-gradient(180deg,#0f0f0f,#1a1a1a)',
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'center',
				alignItems: 'center',
				transition: 'opacity .5s',
				opacity: '1',
				fontFamily: 'sans-serif',
			});

			const iconUrl = chrome.runtime.getURL('assets/icons/icon48.png');
			overlay.innerHTML = `
				<div style="width:80%;max-width:500px;text-align:center">
					<h2 style="font-size:28px;font-weight:700;color:#fff;letter-spacing:3px;margin-bottom:8px">RESTORING...</h2>
					<div id="restore-percent" style="font-size:48px;font-weight:700;color:#f00;margin-bottom:24px">0%</div>
					<div style="position:relative;width:100%;height:6px;background:rgba(255,255,255,.15);border-radius:3px;margin-bottom:16px;overflow:visible">
						<div id="restore-progress" style="position:absolute;left:0;top:0;height:100%;width:0%;background:linear-gradient(90deg,#f00,#f44);border-radius:3px"></div>
						<div id="restore-playhead" style="position:absolute;top:50%;left:0%;transform:translateY(-50%);width:36px;height:36px;margin-left:-18px;border-radius:50%;background:#1a1a1a;border:3px solid #f00;display:flex;justify-content:center;align-items:center">
							<img src="${iconUrl}" style="width:22px;height:22px;border-radius:4px">
						</div>
					</div>
					<p style="font-size:14px;color:#888;margin:0">時間泥棒を解放中...</p>
				</div>`;
			document.body.appendChild(overlay);

			const progress = overlay.querySelector('#restore-progress');
			const playhead = overlay.querySelector('#restore-playhead');
			const percent = overlay.querySelector('#restore-percent');
			const startTime = Date.now();

			const animate = () => {
				const elapsed = Math.min((Date.now() - startTime) / RESTORE_DELAY, 1);
				const value = elapsed * 100;
				progress.style.width = `${value}%`;
				playhead.style.left = `${value}%`;
				percent.textContent = `${Math.round(value)}%`;

				if (elapsed < 1) {
					requestAnimationFrame(animate);
				} else {
					// 復元処理: CSS除去 → HIDDEN_ATTR除去 → オーバーレイフェードアウト
					this.#stopObserver();
					this.#removeCSS();
					this.#enabled = false;

					document.querySelectorAll('video').forEach((v) => {
						v.muted = false;
						v.play().catch(() => {});
					});
					document
						.querySelectorAll(`[${HIDDEN_ATTR}="1"]`)
						.forEach((el) => el.removeAttribute(HIDDEN_ATTR));

					overlay.style.opacity = '0';
					overlay.addEventListener(
						'transitionend',
						() => {
							overlay.remove();
							this.#processed = new WeakSet();
						},
						{ once: true },
					);
				}
			};
			requestAnimationFrame(animate);
		}
	}

	Manager.get();
})();
