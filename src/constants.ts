/**
 * Anti YouTube Shorts — 定数定義
 * セレクタ・正規表現・タイミング定数を一元管理する
 */

// ============================
// DOM要素識別子
// ============================

/** 動的注入CSSのID */
export const STYLE_ID = 'anti-shorts-style' as const;

/** ブロックオーバーレイのID */
export const OVERLAY_ID = 'anti-shorts-overlay' as const;

/** 非表示マーカー属性名 */
export const HIDDEN_ATTR = 'data-anti-shorts-hidden' as const;

/** 非表示マーカー属性値 */
export const HIDDEN_VALUE = '1' as const;

// ============================
// タイミング定数
// ============================

/** MutationObserverコールバックのデバウンス間隔 (ms) */
export const DEBOUNCE_MS = 50 as const;

/** スタイル要素の存在チェック間隔 (ms) */
export const STYLE_CHECK_INTERVAL_MS = 3000 as const;

/** 復元アニメーションの所要時間 (ms) */
export const RESTORE_DURATION_MS = 3000 as const;

/** ナビゲーション後の再スキャン遅延 (ms) */
export const NAV_RESCAN_DELAY_MS = 300 as const;

// ============================
// CSSセレクタ
// ============================

/** CSS非表示ルールに含めるセレクタ群 */
export const CSS_HIDE_SELECTORS: readonly string[] = [
	'ytd-reel-shelf-renderer',
	'ytd-mini-guide-entry-renderer[aria-label*="ショート"]',
	'#endpoint[title="ショート"]',
	'tp-yt-paper-item[title="ショート"]',
	'yt-tab-shape[tab-title="ショート"]',
	`[${HIDDEN_ATTR}="${HIDDEN_VALUE}"]`,
] as const;

/** 結合済みCSS非表示ルール */
export const CSS_HIDE_RULES: string = CSS_HIDE_SELECTORS.join(',');

/** Shortsを含み得るコンテナセレクタ */
export const CONTAINER_SELECTOR =
	'ytd-rich-shelf-renderer,ytd-rich-section-renderer,ytd-grid-shelf-renderer,grid-shelf-view-model' as const;

/** 個別動画アイテムセレクタ */
export const ITEM_SELECTOR =
	'ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,ytd-rich-item-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2,ytd-reel-item-renderer' as const;

/** Shorts固有のアイテムセレクタ */
export const SHORTS_ITEM_SELECTOR =
	'ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2,ytd-reel-item-renderer' as const;

/** 検索結果ページで追加削除する要素セレクタ */
export const SEARCH_CLEANUP_SELECTOR =
	'yt-search-query-correction,ytd-hashtag-tile-renderer' as const;

/** 検索結果ページのShortsシェルフセレクタ */
export const SEARCH_SHELF_SELECTOR =
	'ytd-reel-shelf-renderer,ytd-horizontal-card-list-renderer:has(a[href^="/shorts/"])' as const;

/** セクション内コンテンツセレクタ（空セクション判定用） */
export const SECTION_CONTENT_SELECTOR =
	`${CONTAINER_SELECTOR},${ITEM_SELECTOR},ytd-playlist-renderer,ytd-channel-renderer,ytd-shelf-renderer,yt-lockup-view-model` as const;

/** シェルフタイトルセレクタ */
export const TITLE_SELECTOR =
	'.yt-shelf-header-layout__title,h2,.yt-core-attributed-string,span#title' as const;

// ============================
// 正規表現
// ============================

/** シェルフのタイトルテキストがShortsか判定 */
export const RE_SHORTS_TITLE = /^(ショート|shorts)$/i;

/** タグチップのテキストがShortsか判定 */
export const RE_SHORTS_TAG = /^(ショート|shorts)$/i;

/** テキスト中に "shorts" を含むか判定 */
export const RE_SHORTS_TEXT = /shorts/i;

/** URLがShortsページか判定 */
export const RE_SHORTS_URL = /youtube\.com\/shorts\/[a-zA-Z0-9_-]+/;

/** ShortsURLから動画IDを抽出 */
export const RE_VIDEO_ID = /shorts\/([a-zA-Z0-9_-]+)/;

/** いいね数表示のフォーマット判定 */
export const RE_LIKES_FORMAT = /^[\d,.]+[万億KMB]?$/;

/** HTMLソースからいいね数を抽出 */
export const RE_LIKE_COUNT = /"likeCount":\s*"?(\d+)/;

// ============================
// YouTubeイベント名
// ============================

/** YouTubeのSPA遷移で監視すべきイベント群 */
export const YT_NAVIGATION_EVENTS: readonly string[] = [
	'yt-navigate-start',
	'yt-navigate-finish',
	'yt-page-data-updated',
	'popstate',
	'pageshow',
] as const;
