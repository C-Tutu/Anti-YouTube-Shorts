/**
 * Anti YouTube Shorts — Shorts管理統合モジュール
 * 各サブモジュールを統合し、Shorts検出・非表示・ブロックの全ライフサイクルを制御する
 */
import {
	STYLE_ID,
	HIDDEN_ATTR,
	HIDDEN_VALUE,
	STYLE_CHECK_INTERVAL_MS,
	NAV_RESCAN_DELAY_MS,
	CSS_HIDE_RULES,
	CONTAINER_SELECTOR,
	ITEM_SELECTOR,
	SHORTS_ITEM_SELECTOR,
	SEARCH_CLEANUP_SELECTOR,
	SEARCH_SHELF_SELECTOR,
	SECTION_CONTENT_SELECTOR,
	TITLE_SELECTOR,
	RE_SHORTS_TITLE,
	RE_SHORTS_TAG,
	RE_SHORTS_TEXT,
	RE_SHORTS_URL,
	RE_VIDEO_ID,
	YT_NAVIGATION_EVENTS,
} from '../constants';
import type { ContentMessage, ContentResponse, ExtensionSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { DOMObserver } from './DOMObserver';
import { VideoController } from './VideoController';
import { MetaFetcher } from './MetaFetcher';
import { OverlayRenderer } from './OverlayRenderer';

/**
 * Shorts非表示機能の全体管理クラス
 *
 * シングルトンパターンで動作し、以下の責務を各サブモジュールへ委譲する:
 * - DOM監視とShortsの非表示 → DOMObserver
 * - 動画要素の再生制御 → VideoController
 * - メタデータ取得 → MetaFetcher
 * - オーバーレイUI描画 → OverlayRenderer
 *
 * 本クラス自体はナビゲーションの検知、有効/無効の状態管理、
 * History APIのフックを担当する。
 */
export class ShortsManager {
	/** シングルトンインスタンス */
	private static instance: ShortsManager | null = null;

	/** 機能有効状態 */
	private enabled = false;

	/** 現在のURL（変更検知用） */
	private currentUrl = '';

	/** 現在Shortsページにいるか */
	private isShortsPage = false;

	/** 処理済みDOM要素の追跡 */
	private processed = new WeakSet<Element>();

	/** スタイル要素の定期チェックタイマー */
	private styleCheckTimer: ReturnType<typeof setInterval> | null = null;

	/** ナビゲーション後の再スキャンタイマー */
	private navRescanTimer: ReturnType<typeof setTimeout> | null = null;

	/** DOM監視 */
	private readonly domObserver: DOMObserver;

	/** 動画制御 */
	private readonly videoController: VideoController;

	/** メタデータ取得 */
	private readonly metaFetcher: MetaFetcher;

	/** オーバーレイ描画 */
	private readonly overlayRenderer: OverlayRenderer;

	/**
	 * シングルトンインスタンスを取得する
	 */
	static getInstance(): ShortsManager {
		if (!ShortsManager.instance) {
			ShortsManager.instance = new ShortsManager();
		}
		return ShortsManager.instance;
	}

	private constructor() {
		this.domObserver = new DOMObserver(() => this.hideShorts());
		this.videoController = new VideoController();
		this.metaFetcher = new MetaFetcher();
		this.overlayRenderer = new OverlayRenderer();
		this.initialize();
	}

	// ============================
	// 初期化
	// ============================

	/**
	 * イベントリスナーとHistory APIフックを設定する
	 */
	private initialize(): void {
		const onNavigate = (): void => this.handleNavigation();

		// YouTubeのSPA遷移イベントを監視
		for (const eventName of YT_NAVIGATION_EVENTS) {
			window.addEventListener(eventName, onNavigate, { passive: true });
		}

		// History APIをフックしSPA遷移を捕捉
		const originalPushState = history.pushState.bind(history);
		const originalReplaceState = history.replaceState.bind(history);

		history.pushState = (...args: Parameters<typeof history.pushState>): void => {
			originalPushState(...args);
			onNavigate();
		};

		history.replaceState = (...args: Parameters<typeof history.replaceState>): void => {
			originalReplaceState(...args);
			onNavigate();
		};

		// DOM準備待ち
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', onNavigate, { once: true });
		}

		// タブ復帰時の再チェック
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible' && this.enabled) {
				onNavigate();
			}
		});

		// chrome.runtime メッセージリスナー
		chrome.runtime.onMessage.addListener(
			(
				message: ContentMessage,
				_sender: chrome.runtime.MessageSender,
				sendResponse: (response: ContentResponse) => void,
			): boolean => {
				if (!message?.action) return false;

				if (message.action === 'enable') {
					this.enable();
				} else if (message.action === 'disable') {
					this.disable();
				}

				sendResponse({ success: true });
				return true;
			},
		);

		// 初期状態をストレージから復元
		chrome.storage.sync.get(
			DEFAULT_SETTINGS,
			(result: ExtensionSettings) => {
				if (result.enabled) this.enable();
			},
		);
	}

	// ============================
	// 有効化 / 無効化
	// ============================

	/**
	 * Shorts非表示機能を有効化する
	 */
	enable(): void {
		if (this.enabled) return;
		this.enabled = true;

		this.injectCSS();
		this.handleNavigation();

		// スタイル要素がYouTubeのSPAにより削除された場合の復旧タイマー
		this.styleCheckTimer = setInterval(() => {
			if (this.enabled && !document.getElementById(STYLE_ID)) {
				this.injectCSS();
			}
		}, STYLE_CHECK_INTERVAL_MS);
	}

	/**
	 * Shorts非表示機能を無効化する
	 *
	 * 復元アニメーションを表示後、全Shorts要素を可視状態に戻す。
	 */
	disable(): void {
		if (!this.enabled) return;

		this.overlayRenderer.removeOverlay();
		this.videoController.stopSuppression();

		this.overlayRenderer.showRestoreAnimation(() => {
			this.stopAllTimers();
			this.domObserver.stop();
			this.removeCSS();
			this.enabled = false;

			// 動画の再生を復元
			this.videoController.resumeAll();

			// 非表示マーカーを全除去
			const hiddenElements = document.querySelectorAll(`[${HIDDEN_ATTR}="${HIDDEN_VALUE}"]`);
			for (const el of hiddenElements) {
				el.removeAttribute(HIDDEN_ATTR);
			}

			this.processed = new WeakSet<Element>();
		});
	}

	// ============================
	// CSS管理
	// ============================

	/**
	 * Shorts非表示用のCSSルールをdocumentに注入する
	 */
	private injectCSS(): void {
		if (document.getElementById(STYLE_ID)) return;

		const style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = `${CSS_HIDE_RULES}{display:none!important;visibility:hidden!important}`;
		document.documentElement.appendChild(style);
	}

	/**
	 * 注入済みのCSSルールを除去する
	 */
	private removeCSS(): void {
		document.getElementById(STYLE_ID)?.remove();
	}

	// ============================
	// ナビゲーション処理
	// ============================

	/**
	 * URL変更時のハンドラ
	 *
	 * Shortsページか否かを判定し、
	 * 適切なモード（オーバーレイ表示 or DOM非表示）を起動する。
	 */
	private handleNavigation(): void {
		if (!this.enabled) return;

		const url = location.href;

		// URL変更時に処理済みセットをリセット
		if (url !== this.currentUrl) {
			this.currentUrl = url;
			this.processed = new WeakSet<Element>();
		}

		this.isShortsPage = RE_SHORTS_URL.test(url);

		if (this.isShortsPage) {
			this.domObserver.stop();
			this.videoController.pauseAll();
			this.showShortsBlockOverlay();
		} else {
			this.overlayRenderer.removeOverlay();
			this.videoController.stopSuppression();
			this.injectCSS();
			this.domObserver.start();
			this.domObserver.scheduleCallback();

			// 遅延再スキャン（遅延ロードされるコンテンツへの対応）
			if (this.navRescanTimer !== null) {
				clearTimeout(this.navRescanTimer);
			}
			this.navRescanTimer = setTimeout(() => {
				if (this.enabled) {
					this.domObserver.scheduleCallback();
				}
			}, NAV_RESCAN_DELAY_MS);
		}
	}

	// ============================
	// Shorts非表示ロジック
	// ============================

	/**
	 * DOM内のShorts関連要素を検出し非表示にする
	 *
	 * コンテナ（シェルフ）、個別アイテム、タグチップの3段階で処理し、
	 * 検索結果ページでは追加のクリーンアップを実行する。
	 */
	private hideShorts(): void {
		if (!this.enabled || this.isShortsPage) return;

		const notHidden = `:not([${HIDDEN_ATTR}="${HIDDEN_VALUE}"])`;

		// コンテナ（シェルフ）の処理
		const containers = document.querySelectorAll(`${CONTAINER_SELECTOR}${notHidden}`);
		for (const container of containers) {
			if (this.processed.has(container)) continue;
			if (this.isShortContainer(container)) {
				this.hideElement(container);
			}
		}

		// 個別アイテムの処理
		const items = document.querySelectorAll(`${ITEM_SELECTOR}${notHidden}`);
		for (const item of items) {
			if (this.processed.has(item)) continue;
			if (this.isShortItem(item)) {
				this.hideElement(item);
			}
		}

		// タグチップの処理
		const chips = document.querySelectorAll(`yt-chip-cloud-chip-renderer${notHidden}`);
		for (const chip of chips) {
			if (this.processed.has(chip)) continue;
			if (RE_SHORTS_TAG.test(chip.textContent?.trim() ?? '')) {
				chip.setAttribute(HIDDEN_ATTR, HIDDEN_VALUE);
				this.processed.add(chip);
			}
		}

		// 検索結果ページ固有の処理
		if (location.pathname.startsWith('/results')) {
			this.hideSearchPageShorts(notHidden);
		}
	}

	/**
	 * コンテナ要素がShortsシェルフか判定する
	 *
	 * @param element - 判定対象のコンテナ要素
	 * @returns Shortsシェルフの場合true
	 */
	private isShortContainer(element: Element): boolean {
		// Shorts固有のアイテムを含むか
		if (element.querySelector(SHORTS_ITEM_SELECTOR)) return true;

		// Shortsリンクを含むか
		if (element.querySelector('a[href^="/shorts/"]')) return true;

		// タイトルテキストがShortsか
		const title = element.querySelector(TITLE_SELECTOR);
		return title !== null && RE_SHORTS_TITLE.test(title.textContent?.trim() ?? '');
	}

	/**
	 * 個別アイテムがShorts動画か判定する
	 *
	 * @param element - 判定対象のアイテム要素
	 * @returns Shorts動画の場合true
	 */
	private isShortItem(element: Element): boolean {
		const tagName = element.tagName.toLowerCase();
		return tagName.includes('shorts') || element.querySelector('a[href^="/shorts/"]') !== null;
	}

	/**
	 * 要素を非表示にし、処理済みとしてマークする
	 *
	 * @param element - 非表示にする要素
	 */
	private hideElement(element: Element): void {
		element.setAttribute(HIDDEN_ATTR, HIDDEN_VALUE);
		this.processed.add(element);
		this.checkEmptySection(element);
	}

	/**
	 * 検索結果ページ固有のShorts非表示処理
	 *
	 * @param notHiddenSuffix - 未処理要素のセレクタ接尾辞
	 */
	private hideSearchPageShorts(notHiddenSuffix: string): void {
		// ハッシュタグ・検索修正テキスト
		const cleanupElements = document.querySelectorAll(
			`${SEARCH_CLEANUP_SELECTOR}${notHiddenSuffix}`,
		);
		for (const el of cleanupElements) {
			if (RE_SHORTS_TEXT.test(el.textContent ?? '')) {
				el.setAttribute(HIDDEN_ATTR, HIDDEN_VALUE);
				this.processed.add(el);
			}
		}

		// Shortsシェルフ
		const shelves = document.querySelectorAll(
			`${SEARCH_SHELF_SELECTOR}${notHiddenSuffix}`,
		);
		for (const shelf of shelves) {
			this.hideElement(shelf);
		}

		// Shortsリンクを含むアイテム
		const shortsLinks = document.querySelectorAll('a[href^="/shorts/"]');
		for (const link of shortsLinks) {
			const item = link.closest(ITEM_SELECTOR);
			if (item && item.getAttribute(HIDDEN_ATTR) !== HIDDEN_VALUE) {
				this.hideElement(item);
			}
		}
	}

	/**
	 * セクション内の全子要素が非表示の場合、セクション自体も非表示にする
	 *
	 * @param element - 非表示にされた要素
	 */
	private checkEmptySection(element: Element): void {
		const section = element.closest('ytd-item-section-renderer');
		if (!section || section.getAttribute(HIDDEN_ATTR) === HIDDEN_VALUE) return;

		const children = section.querySelectorAll(SECTION_CONTENT_SELECTOR);
		let hasHiddenChild = false;

		for (const child of children) {
			if (child.getAttribute(HIDDEN_ATTR) !== HIDDEN_VALUE) return;
			hasHiddenChild = true;
		}

		if (hasHiddenChild) {
			section.setAttribute(HIDDEN_ATTR, HIDDEN_VALUE);
			this.processed.add(section);
		}
	}

	// ============================
	// Shortsブロックオーバーレイ
	// ============================

	/**
	 * Shortsページ用ブロックオーバーレイを表示し、メタデータを非同期で取得する
	 */
	private showShortsBlockOverlay(): void {
		const match = this.currentUrl.match(RE_VIDEO_ID);
		const videoId = match?.[1] ?? '';
		const meta = this.metaFetcher.getFromDOM();

		const overlay = this.overlayRenderer.showBlockOverlay(videoId, meta);
		this.videoController.startSuppression();

		// 非同期でメタデータを更新
		void this.updateOverlayMeta(videoId, overlay);
	}

	/**
	 * オーバーレイのメタデータを非同期で更新する
	 *
	 * @param videoId - YouTube動画ID
	 * @param _overlay - オーバーレイ要素（将来の拡張用）
	 */
	private async updateOverlayMeta(videoId: string, _overlay: HTMLDivElement): Promise<void> {
		// タイトル取得
		const title = await this.metaFetcher.fetchTitle(videoId);
		if (title) {
			this.overlayRenderer.updateTitle(title);
		}

		// いいね数取得（DOM → HTMLフェッチのフォールバック）
		let likeCount = this.metaFetcher.getFromDOM().likeCount;
		if (!likeCount) {
			likeCount = await this.metaFetcher.fetchLikeCount(videoId);
		}
		if (likeCount) {
			this.overlayRenderer.updateLikeCount(likeCount);
		}
	}

	// ============================
	// タイマー管理
	// ============================

	/**
	 * 全タイマーを停止する
	 */
	private stopAllTimers(): void {
		if (this.styleCheckTimer !== null) {
			clearInterval(this.styleCheckTimer);
			this.styleCheckTimer = null;
		}
		if (this.navRescanTimer !== null) {
			clearTimeout(this.navRescanTimer);
			this.navRescanTimer = null;
		}
	}
}
