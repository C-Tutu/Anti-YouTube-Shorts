// Anti YouTube Shorts v3.2.1
(() => {
	'use strict';
	if (window.__antiShortsInitialized) return;
	window.__antiShortsInitialized = true;

	const STYLE_ID = 'anti-shorts-style';
	const OVERLAY_ID = 'anti-shorts-overlay';
	const HIDDEN_ATTR = 'data-anti-shorts-hidden';
	const DEBOUNCE_MS = 50;
	const STYLE_CHECK_MS = 3000;
	const RESTORE_DELAY = 3000;

	const CSS_HIDE = [
		'ytd-reel-shelf-renderer',
		'ytd-mini-guide-entry-renderer[aria-label*="ショート"]',
		'#endpoint[title="ショート"]',
		'tp-yt-paper-item[title="ショート"]',
		'yt-tab-shape[tab-title="ショート"]',
	];

	const CONTAINER_SEL = [
		'ytd-rich-shelf-renderer',
		'ytd-rich-section-renderer',
		'ytd-grid-shelf-renderer',
		'grid-shelf-view-model',
	];

	const ITEM_SEL = [
		'ytd-video-renderer',
		'ytd-grid-video-renderer',
		'ytd-compact-video-renderer',
		'ytd-rich-item-renderer',
		'ytm-shorts-lockup-view-model',
		'ytm-shorts-lockup-view-model-v2',
		'ytd-reel-item-renderer',
	];

	const SEARCH_CLEANUP_SEL = ['yt-search-query-correction', 'ytd-hashtag-tile-renderer'];

	class Manager {
		static #i = null;
		#on = false;
		#obs = null;
		#dt = null;
		#st = null;
		#sup = null;
		#proc = new WeakSet();
		#url = '';
		#nt = null;
		#isShortsPage = false;

		static get() {
			return Manager.#i || (Manager.#i = new Manager());
		}

		constructor() {
			this.#init();
		}

		#init() {
			const nav = () => this.#nav();
			[
				'yt-navigate-start',
				'yt-navigate-finish',
				'yt-page-data-updated',
				'popstate',
				'pageshow',
			].forEach((e) => window.addEventListener(e, nav, { passive: true }));

			const origPush = history.pushState.bind(history);
			const origReplace = history.replaceState.bind(history);
			history.pushState = (...a) => {
				origPush(...a);
				nav();
			};
			history.replaceState = (...a) => {
				origReplace(...a);
				nav();
			};

			if (document.readyState === 'loading')
				document.addEventListener('DOMContentLoaded', nav, { once: true });
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible' && this.#on) nav();
			});

			chrome.runtime.onMessage.addListener((m, _, r) => {
				if (!m?.action) return false;
				m.action === 'enable' ? this.enable() : m.action === 'disable' && this.disable();
				r({ success: true });
				return true;
			});

			chrome.storage.sync.get({ enabled: false }, (res) => res.enabled && this.enable());
		}

		enable() {
			if (this.#on) return;
			this.#on = true;
			this.#injectCSS();
			this.#nav();
			this.#st = setInterval(
				() => this.#on && !document.getElementById(STYLE_ID) && this.#injectCSS(),
				STYLE_CHECK_MS,
			);
		}

		disable() {
			if (!this.#on) return;
			this.#removeOverlay();
			this.#showRestore();
		}

		#injectCSS() {
			if (document.getElementById(STYLE_ID)) return;
			const s = document.createElement('style');
			s.id = STYLE_ID;
			s.textContent = `${[...CSS_HIDE, `[${HIDDEN_ATTR}="1"]`].join(',')}{display:none!important;visibility:hidden!important}`;
			document.documentElement.appendChild(s);
		}

		#removeCSS() {
			document.getElementById(STYLE_ID)?.remove();
		}

		#startObs() {
			if (this.#obs || this.#isShortsPage) return;
			if (!document.body) {
				document.addEventListener('DOMContentLoaded', () => this.#startObs(), {
					once: true,
				});
				return;
			}
			const target = document.querySelector('#content, ytd-page-manager') || document.body;
			this.#obs = new MutationObserver((muts) => {
				for (const m of muts)
					if (m.addedNodes.length) {
						this.#debounce();
						break;
					}
			});
			this.#obs.observe(target, { childList: true, subtree: true });
		}

		#stopObs() {
			this.#obs?.disconnect();
			this.#obs = null;
			this.#dt && (clearTimeout(this.#dt), (this.#dt = null));
			this.#st && (clearInterval(this.#st), (this.#st = null));
			this.#nt && (clearTimeout(this.#nt), (this.#nt = null));
		}

		#debounce() {
			this.#dt && clearTimeout(this.#dt);
			this.#dt = setTimeout(() => requestAnimationFrame(() => this.#hide()), DEBOUNCE_MS);
		}

		#hide() {
			if (!this.#on || this.#isShortsPage) return;
			const nh = `:not([${HIDDEN_ATTR}="1"])`;

			// コンテナ
			document.querySelectorAll(CONTAINER_SEL.map((s) => s + nh).join(',')).forEach((c) => {
				if (this.#proc.has(c)) return;

				// タイトルによる判定
				const t = c.querySelector(
					'.yt-shelf-header-layout__title,h2,.yt-core-attributed-string,span#title',
				);
				const isShortsTitle =
					t &&
					/^(ショート|shorts|エンターテインメント|コメディ|生活様式|ゲーム文化)$/i.test(
						t.textContent?.trim() || '',
					);

				// コンテンツによる判定（内部にShortsアイテムがあるか）
				const hasShortsItems = c.querySelector(
					'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-reel-item-renderer',
				);

				// リンクによる判定（/shorts/へのリンクを含むか）
				// 注: 誤爆を防ぐため、grid-shelf-view-modelなど明確なシェルフ構造の場合に有効
				const hasShortsLinks = c.querySelector('a[href^="/shorts/"]');

				if (isShortsTitle || hasShortsItems || hasShortsLinks) {
					c.setAttribute(HIDDEN_ATTR, '1');
					this.#proc.add(c);
					this.#checkEmptySection(c);
				}
			});

			// 個別アイテム
			document.querySelectorAll(ITEM_SEL.map((s) => s + nh).join(',')).forEach((el) => {
				if (this.#proc.has(el)) return;
				// 個別アイテム自体がShortsコンポーネントか、Shortsリンクを含んでいれば隠す
				if (
					el.tagName.toLowerCase().includes('shorts') ||
					el.querySelector('a[href^="/shorts/"],a[href*="/shorts/"]')
				) {
					el.setAttribute(HIDDEN_ATTR, '1');
					this.#proc.add(el);
					this.#checkEmptySection(el);
				}
			});

			// タグ
			document.querySelectorAll(`yt-chip-cloud-chip-renderer${nh}`).forEach((el) => {
				if (this.#proc.has(el)) return;
				if (/^(ショート|shorts)$/i.test(el.textContent?.trim() || '')) {
					el.setAttribute(HIDDEN_ATTR, '1');
					this.#proc.add(el);
				}
			});

			// 検索結果ページのクリーンアップ
			if (location.pathname.startsWith('/results')) {
				// #shorts ハッシュタグや検索修正の非表示
				const cleanupSel = SEARCH_CLEANUP_SEL.map((s) => s + nh).join(',');
				document.querySelectorAll(cleanupSel).forEach((el) => {
					if (/shorts/i.test(el.textContent || '')) {
						el.setAttribute(HIDDEN_ATTR, '1');
						this.#proc.add(el);
					}
				});

				// 通常の検索結果内Shorts
				[
					'ytd-reel-shelf-renderer',
					'ytd-horizontal-card-list-renderer:has(a[href^="/shorts/"])',
				].forEach((sel) => {
					document.querySelectorAll(`${sel}${nh}`).forEach((el) => {
						el.setAttribute(HIDDEN_ATTR, '1');
						this.#proc.add(el);
						this.#checkEmptySection(el);
					});
				});

				document.querySelectorAll('a[href^="/shorts/"]').forEach((a) => {
					const c = a.closest(ITEM_SEL.join(','));
					if (c && c.getAttribute(HIDDEN_ATTR) !== '1') {
						c.setAttribute(HIDDEN_ATTR, '1');
						this.#proc.add(c);
						this.#checkEmptySection(c);
					}
				});
			}
		}

		/**
		 * 要素を非表示にした結果、親のセクションが実質空になったかチェックし、
		 * 空であれば親セクションごと非表示にする（区切り線や余白の除去）
		 */
		#checkEmptySection(el) {
			const section = el.closest('ytd-item-section-renderer');
			if (!section || section.getAttribute(HIDDEN_ATTR) === '1') return;

			// セクション内の主要なコンテンツ要素を取得
			// 注: ここにリストアップされていない要素（Adやメッセージなど）がある場合は非表示にしない安全設計
			const contentSelector = [
				...CONTAINER_SEL,
				...ITEM_SEL,
				'ytd-playlist-renderer',
				'ytd-channel-renderer',
				'ytd-shelf-renderer',
				'yt-lockup-view-model',
			].join(',');

			const children = section.querySelectorAll(contentSelector);
			let allHidden = true;
			let hasShorts = false;

			for (const child of children) {
				// childrenの中に自分自身(el)も含まれる可能性があるため、隠蔽属性をチェック
				// まだ属性が付与されていないが、これから隠される要素も考慮が必要だが、
				// 基本的に hidden 属性がついているかどうかで判定
				if (child.getAttribute(HIDDEN_ATTR) === '1') {
					hasShorts = true;
				} else {
					allHidden = false;
					break;
				}
			}

			// すべての主要コンテンツが非表示であれば、セクション全体を隠す
			if (hasShorts && allHidden) {
				section.setAttribute(HIDDEN_ATTR, '1');
				this.#proc.add(section);
			}
		}

		#nav() {
			if (!this.#on) return;
			const newUrl = location.href;
			if (newUrl !== this.#url) {
				this.#url = newUrl;
				this.#proc = new WeakSet();
			}

			this.#isShortsPage = /youtube\.com\/shorts\/[a-zA-Z0-9_-]+/.test(newUrl);

			if (this.#isShortsPage) {
				this.#stopObs();
				this.#pauseVideos();
				this.#showOverlay();
			} else {
				this.#removeOverlay();
				this.#injectCSS();
				this.#startObs();
				this.#debounce();
				this.#nt && clearTimeout(this.#nt);
				this.#nt = setTimeout(() => this.#on && this.#debounce(), 300);
			}
		}

		#pauseVideos() {
			document.querySelectorAll('video').forEach((v) => {
				v.pause();
				v.muted = true;
				v.currentTime = 0;
			});
		}

		#showOverlay() {
			if (document.getElementById(OVERLAY_ID)) return;
			this.#startSup();
			const m = this.#url.match(/shorts\/([a-zA-Z0-9_-]+)/);
			const vid = m ? m[1] : '';
			const meta = this.#getMeta();

			const o = document.createElement('div');
			o.id = OVERLAY_ID;
			o.dataset.videoId = vid;

			const icon = chrome.runtime.getURL('assets/icons/icon48.png');
			const thumb = `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`;
			const thumbFB = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

			o.innerHTML = `<div class="panel"><header class="header"><img src="${icon}" alt="logo" class="logo"><h1 class="title">ANTI YT SHORTS</h1></header><main class="main"><div class="label"><h1 id="anti-shorts-title-msg">「${meta.title || '読み込み中...'}」がブロックされています。</h1><div class="video-info"><div class="video-stats"><span id="anti-shorts-likes">イイネ数：${meta.likes || '---'}</span></div></div><a href="https://www.youtube.com/watch?v=${vid}" class="thumbnail-link"><img src="${thumb}" alt="" class="video-thumbnail" onerror="this.src='${thumbFB}'"><div class="play-button-overlay"><svg height="100%" viewBox="0 0 68 48" width="100%"><path d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z" fill="#f00"></path><path d="M 45,24 27,14 27,34" fill="#fff"></path></svg></div></a><p class="watch-instruction">クリックして通常動画として視聴</p><br><a href="https://www.youtube.com" class="youtube-link">YouTube ホームに戻る</a></div></main></div>`;

			document.body.appendChild(o);
			this.#fetchMeta(vid, o);
		}

		#startSup() {
			if (this.#sup) return;
			const fn = () =>
				document.querySelectorAll('video').forEach((v) => {
					if (!v.paused) {
						v.pause();
						v.muted = true;
					}
				});
			fn();
			this.#sup = setInterval(fn, 300);
		}

		#stopSup() {
			this.#sup && (clearInterval(this.#sup), (this.#sup = null));
		}

		#getMeta() {
			let title =
				document.title !== 'YouTube' ? document.title.replace(' - YouTube', '').trim() : '';
			if (!title) {
				const og = document.querySelector('meta[property="og:title"]');
				if (og?.content) title = og.content.replace(' - YouTube', '').trim();
			}
			return { title, likes: this.#getLikes() };
		}

		#getLikes() {
			const sels = [
				'ytd-reel-video-renderer[is-active] #like-button yt-formatted-string',
				'#like-button button span[role="text"]',
				'like-button-view-model button span',
			];
			for (const s of sels) {
				const el = document.querySelector(s);
				if (el?.textContent && /^[\d,.]+[万億KMB]?$/.test(el.textContent.trim()))
					return el.textContent.trim();
			}
			return '';
		}

		async #fetchMeta(vid, o) {
			try {
				const res = await fetch(
					`https://www.youtube.com/oembed?url=https://www.youtube.com/shorts/${vid}&format=json`,
				);
				if (res.ok) {
					const d = await res.json();
					const t = o.querySelector('#anti-shorts-title-msg');
					if (t && d.title) t.textContent = `「${d.title}」がブロックされています。`;
				}
			} catch {}
			let likes = this.#getLikes();
			if (!likes)
				try {
					const r = await fetch(`https://www.youtube.com/shorts/${vid}`);
					if (r.ok) {
						const txt = await r.text();
						const m = txt.match(/"likeCount":\s*"?(\d+)/);
						if (m) likes = m[1];
					}
				} catch {}
			if (likes) {
				const l = o.querySelector('#anti-shorts-likes');
				if (l) l.textContent = `イイネ数：${likes}`;
			}
		}

		#removeOverlay() {
			document.getElementById(OVERLAY_ID)?.remove();
			this.#stopSup();
		}

		#showRestore() {
			const o = document.createElement('div');
			o.id = 'anti-shorts-restore-overlay';
			Object.assign(o.style, {
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

			const icon = chrome.runtime.getURL('assets/icons/icon48.png');
			o.innerHTML = `<div style="width:80%;max-width:500px;text-align:center"><h2 style="font-size:28px;font-weight:700;color:#fff;letter-spacing:3px;margin-bottom:8px">RESTORING...</h2><div id="restore-percent" style="font-size:48px;font-weight:700;color:#f00;margin-bottom:24px">0%</div><div style="position:relative;width:100%;height:6px;background:rgba(255,255,255,.15);border-radius:3px;margin-bottom:16px;overflow:visible"><div id="restore-progress" style="position:absolute;left:0;top:0;height:100%;width:0%;background:linear-gradient(90deg,#f00,#f44);border-radius:3px"></div><div id="restore-playhead" style="position:absolute;top:50%;left:0%;transform:translateY(-50%);width:36px;height:36px;margin-left:-18px;border-radius:50%;background:#1a1a1a;border:3px solid #f00;display:flex;justify-content:center;align-items:center"><img src="${icon}" style="width:22px;height:22px;border-radius:4px"></div></div><p style="font-size:14px;color:#888;margin:0">時間泥棒を解放中...</p></div>`;
			document.body.appendChild(o);

			const prog = o.querySelector('#restore-progress'),
				ph = o.querySelector('#restore-playhead'),
				pct = o.querySelector('#restore-percent');
			const start = Date.now();
			const anim = () => {
				const p = Math.min((Date.now() - start) / RESTORE_DELAY, 1);
				const v = p * 100;
				prog.style.width = `${v}%`;
				ph.style.left = `${v}%`;
				pct.textContent = `${Math.round(v)}%`;
				p < 1
					? requestAnimationFrame(anim)
					: setTimeout(() => {
							document.querySelectorAll('video').forEach((v) => {
								v.muted = false;
								v.play().catch(() => {});
							});
							document
								.querySelectorAll(`[${HIDDEN_ATTR}="1"]`)
								.forEach((el) => el.removeAttribute(HIDDEN_ATTR));
							o.style.opacity = '0';
							o.addEventListener(
								'transitionend',
								() => {
									o.remove();
									this.#proc = new WeakSet();
								},
								{ once: true },
							);
						}, 0);
			};
			requestAnimationFrame(anim);

			this.#stopObs();
			this.#removeCSS();
			this.#on = false;
		}
	}

	Manager.get();
})();
