/**
 * Anti YouTube Shorts — Shorts管理統合モジュール
 * 各サブモジュールを統合し、Shorts検出・非表示・ブロックの全ライフサイクルを制御する
 */
import {
	STYLE_ID,
	HIDDEN_ATTR,
	HIDDEN_VALUE,
	HIDDEN_SELECTOR,
	TAB_INDICATOR_ALIGNED_ATTR,
	TAB_INDICATOR_ORIGINAL_STYLE_ATTR,
	STYLE_CHECK_INTERVAL_MS,
	NAV_RESCAN_DELAY_MS,
	CSS_HIDE_RULES,
	CONTAINER_SELECTOR,
	NAVIGATION_ITEM_SELECTOR,
	ITEM_SELECTOR,
	SHORTS_ITEM_SELECTOR,
	SHORTS_SELECTION_INDICATOR_SELECTOR,
	SHORTS_LINK_SELECTOR,
	SHORTS_TAB_SELECTOR,
	SELECTED_SHORTS_TAB_SELECTOR,
	TAB_CONTAINER_SELECTOR,
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

const CHIP_SELECTOR = 'yt-chip-cloud-chip-renderer' as const;
const SELECTED_TAB_SELECTOR =
	'yt-tab-shape[aria-selected="true"],yt-tab-shape:has(.ytTabShapeTabSelected)' as const;
const PAPER_SELECTION_INDICATOR_SELECTOR = '#selectionBar,.selection-bar' as const;

const withNotHidden = (selector: string): string => {
	return selector
		.split(',')
		.map((part) => `${part.trim()}:not(${HIDDEN_SELECTOR})`)
		.join(',');
};

const NOT_HIDDEN_CONTAINER_SELECTOR = withNotHidden(CONTAINER_SELECTOR);
const NOT_HIDDEN_ITEM_SELECTOR = withNotHidden(ITEM_SELECTOR);
const NOT_HIDDEN_NAVIGATION_SELECTOR = withNotHidden(NAVIGATION_ITEM_SELECTOR);
const NOT_HIDDEN_CHIP_SELECTOR = withNotHidden(CHIP_SELECTOR);
const NOT_HIDDEN_SEARCH_CLEANUP_SELECTOR = withNotHidden(SEARCH_CLEANUP_SELECTOR);
const NOT_HIDDEN_SEARCH_SHELF_SELECTOR = withNotHidden(SEARCH_SHELF_SELECTOR);

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

	/** 復元アニメーション中か */
	private restoring = false;

	/** 現在ブロック中のShorts動画ID */
	private currentShortsVideoId = '';

	/** メタデータ取得結果の世代管理 */
	private metaRequestSerial = 0;

	/** スタイル要素の定期チェックタイマー */
	private styleCheckTimer: ReturnType<typeof setInterval> | null = null;

	/** ナビゲーション後の再スキャンタイマー */
	private navRescanTimer: ReturnType<typeof setTimeout> | null = null;

	/** 復元アニメーションのキャンセル関数 */
	private restoreCancel: (() => void) | null = null;

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
		this.domObserver = new DOMObserver((roots) => this.hideShorts(roots));
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
		if (this.enabled && !this.restoring) return;

		if (this.restoring) {
			this.cancelRestore();
		}

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
		if (!this.enabled || this.restoring) return;

		this.enabled = false;
		this.restoring = true;
		this.metaRequestSerial++;
		this.currentShortsVideoId = '';
		this.stopAllTimers();
		this.domObserver.stop();

		this.overlayRenderer.removeOverlay();
		this.videoController.stopSuppression();

		this.restoreCancel = this.overlayRenderer.showRestoreAnimation(() => {
			this.removeCSS();

			// 動画の再生を復元
			this.videoController.resumeAll();

			// 非表示マーカーを全除去
			const hiddenElements = document.querySelectorAll(`[${HIDDEN_ATTR}="${HIDDEN_VALUE}"]`);
			for (const el of hiddenElements) {
				el.removeAttribute(HIDDEN_ATTR);
			}
			this.restoreAlignedTabIndicators();

			this.restoring = false;
			this.restoreCancel = null;
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

		if (url !== this.currentUrl) {
			this.currentUrl = url;
		}

		this.isShortsPage = RE_SHORTS_URL.test(url);

		if (this.isShortsPage) {
			this.clearNavRescanTimer();
			this.domObserver.stop();
			this.videoController.pauseAll();
			this.showShortsBlockOverlay();
		} else {
			this.metaRequestSerial++;
			this.currentShortsVideoId = '';
			this.overlayRenderer.removeOverlay();
			this.videoController.stopSuppression();
			this.injectCSS();
			this.domObserver.start();
			this.domObserver.scheduleCallback();

			// 遅延再スキャン（遅延ロードされるコンテンツへの対応）
			this.clearNavRescanTimer();
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
	private hideShorts(roots?: readonly Element[]): void {
		if (!this.enabled || this.isShortsPage) return;

		const scanRoots: readonly ParentNode[] =
			roots && roots.length > 0 ? roots : [document];
		const seen = new Set<Element>();

		for (const root of scanRoots) {
			this.reconcileHiddenElements(root);
		}

		this.hideShortsNavigation(scanRoots, seen);
		this.syncShortsTabSelectionIndicators(scanRoots);

		// コンテナ（シェルフ）の処理
		for (const root of scanRoots) {
			const containers = this.queryCandidates(root, NOT_HIDDEN_CONTAINER_SELECTOR);
			for (const container of containers) {
				if (seen.has(container)) continue;
				seen.add(container);
				if (this.isShortContainer(container)) {
					this.hideElement(container);
				}
			}
		}

		// 個別アイテムの処理
		for (const root of scanRoots) {
			const items = this.queryCandidates(root, NOT_HIDDEN_ITEM_SELECTOR);
			for (const item of items) {
				if (seen.has(item)) continue;
				seen.add(item);
				if (this.isShortItem(item)) {
					this.hideElement(item);
				}
			}
		}

		// /shorts/リンクを起点に、仮想DOMで差し替わった親アイテムも拾う
		for (const root of scanRoots) {
			const shortsLinks = this.queryCandidates(root, SHORTS_LINK_SELECTOR);
			for (const link of shortsLinks) {
				const item = link.closest(ITEM_SELECTOR);
				if (item && item.getAttribute(HIDDEN_ATTR) !== HIDDEN_VALUE) {
					this.hideElement(item);
					continue;
				}

				const container = link.closest(CONTAINER_SELECTOR);
				if (container && container.getAttribute(HIDDEN_ATTR) !== HIDDEN_VALUE) {
					this.hideElement(container);
				}
			}
		}

		// タグチップの処理
		for (const root of scanRoots) {
			const chips = this.queryCandidates(root, NOT_HIDDEN_CHIP_SELECTOR);
			for (const chip of chips) {
				if (seen.has(chip)) continue;
				seen.add(chip);
				if (RE_SHORTS_TAG.test(chip.textContent?.trim() ?? '')) {
					chip.setAttribute(HIDDEN_ATTR, HIDDEN_VALUE);
				}
			}
		}

		// 検索結果ページ固有の処理
		if (location.pathname.startsWith('/results')) {
			this.hideSearchPageShorts(scanRoots);
		}
	}

	/**
	 * root自身も含めてselectorに合致する要素を取得する
	 */
	private queryCandidates(root: ParentNode, selector: string): Element[] {
		const candidates: Element[] = [];

		if (root instanceof Element && root.matches(selector)) {
			candidates.push(root);
		}
		candidates.push(...root.querySelectorAll(selector));

		return candidates;
	}

	/**
	 * YouTubeの仮想DOM再利用により通常コンテンツへ変わった要素を復元する
	 */
	private reconcileHiddenElements(root: ParentNode): void {
		const hiddenElements = this.queryCandidates(root, HIDDEN_SELECTOR);
		const hiddenSet = new Set(hiddenElements);

		let ancestor = root instanceof Element ? root : null;
		while (ancestor) {
			if (
				ancestor.getAttribute(HIDDEN_ATTR) === HIDDEN_VALUE &&
				!hiddenSet.has(ancestor)
			) {
				hiddenElements.push(ancestor);
				hiddenSet.add(ancestor);
			}
			ancestor = ancestor.parentElement;
		}

		for (const element of hiddenElements) {
			if (!this.shouldRemainHidden(element)) {
				element.removeAttribute(HIDDEN_ATTR);
			}
		}
	}

	/**
	 * 既に非表示にした要素が現在もShorts関連か判定する
	 */
	private shouldRemainHidden(element: Element): boolean {
		if (element.matches('ytd-item-section-renderer')) {
			return this.isEmptySection(element);
		}

		if (element.matches(CONTAINER_SELECTOR)) {
			return this.isShortContainer(element);
		}

		if (element.matches(NAVIGATION_ITEM_SELECTOR)) {
			return this.isShortsNavigationItem(element);
		}

		if (element.matches(SHORTS_SELECTION_INDICATOR_SELECTOR)) {
			return this.shouldHideSelectionIndicator(element);
		}

		if (element.matches(ITEM_SELECTOR)) {
			return this.isShortItem(element);
		}

		if (element.matches(CHIP_SELECTOR)) {
			return RE_SHORTS_TAG.test(element.textContent?.trim() ?? '');
		}

		if (location.pathname.startsWith('/results')) {
			if (element.matches(SEARCH_CLEANUP_SELECTOR)) {
				return RE_SHORTS_TEXT.test(element.textContent ?? '');
			}
			if (element.matches(SEARCH_SHELF_SELECTOR)) {
				return this.isSearchShortsShelf(element);
			}
		}

		return false;
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
		if (element.querySelector(SHORTS_LINK_SELECTOR)) return true;

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
		return tagName.includes('shorts') || element.querySelector(SHORTS_LINK_SELECTOR) !== null;
	}

	/**
	 * サイドバーやチャンネルタブがShorts導線か判定する
	 */
	private isShortsNavigationItem(element: Element): boolean {
		if (element.matches(SHORTS_TAB_SELECTOR)) return true;

		const labels = [
			element.getAttribute('title'),
			element.getAttribute('aria-label'),
			element.getAttribute('tab-title'),
			element.querySelector('.title')?.textContent,
			element.querySelector('.ytTabShapeTab')?.textContent,
		];

		const labeledDescendants = element.querySelectorAll('[title],[aria-label],[tab-title]');
		for (const descendant of labeledDescendants) {
			labels.push(
				descendant.getAttribute('title'),
				descendant.getAttribute('aria-label'),
				descendant.getAttribute('tab-title'),
			);
		}

		return labels.some((label) => RE_SHORTS_TITLE.test(label?.trim() ?? ''));
	}

	/**
	 * Shortsタブ選択中の下線・スライダーか判定する
	 */
	private shouldHideSelectionIndicator(element: Element): boolean {
		const tabGroup = element.closest('yt-tab-group-shape');
		if (tabGroup?.querySelector(SELECTED_SHORTS_TAB_SELECTOR)) return true;

		const paperTabs = element.closest('tp-yt-paper-tabs');
		return paperTabs?.querySelector(SELECTED_SHORTS_TAB_SELECTOR) !== null;
	}

	/**
	 * 検索結果ページの棚がShorts棚か判定する
	 */
	private isSearchShortsShelf(element: Element): boolean {
		return element.tagName.toLowerCase() === 'ytd-reel-shelf-renderer' ||
			element.querySelector(SHORTS_LINK_SELECTOR) !== null;
	}

	/**
	 * 要素を非表示にする
	 *
	 * @param element - 非表示にする要素
	 */
	private hideElement(element: Element): void {
		if (element.getAttribute(HIDDEN_ATTR) === HIDDEN_VALUE) return;

		element.setAttribute(HIDDEN_ATTR, HIDDEN_VALUE);
		this.checkEmptySection(element);
	}

	/**
	 * サイドバー・チャンネルタブなど、動画以外のShorts導線を非表示にする
	 */
	private hideShortsNavigation(
		roots: readonly ParentNode[],
		seen: Set<Element>,
	): void {
		for (const root of roots) {
			const navItems = this.queryCandidates(root, NOT_HIDDEN_NAVIGATION_SELECTOR);
			for (const navItem of navItems) {
				if (seen.has(navItem)) continue;
				seen.add(navItem);
				if (this.isShortsNavigationItem(navItem)) {
					this.hideElement(navItem);
				}
			}
		}
	}

	/**
	 * Shortsタブ削除後の選択バーを、現在選択中の表示タブへ同期する
	 */
	private syncShortsTabSelectionIndicators(roots: readonly ParentNode[]): void {
		const tabContainers = new Set<Element>();

		for (const root of roots) {
			this.collectTabContainers(root, tabContainers);
		}

		for (const tabContainer of tabContainers) {
			if (tabContainer.matches('yt-tab-group-shape')) {
				this.syncTabGroupShapeIndicator(tabContainer);
			} else if (tabContainer.matches('tp-yt-paper-tabs')) {
				this.syncPaperTabsSelectionIndicator(tabContainer);
			}
		}
	}

	/**
	 * 変更近傍からタブコンテナを集める
	 */
	private collectTabContainers(root: ParentNode, tabContainers: Set<Element>): void {
		if (root instanceof Element) {
			const ownContainer = root.closest(TAB_CONTAINER_SELECTOR);
			if (ownContainer) tabContainers.add(ownContainer);
		}

		const containers = this.queryCandidates(root, TAB_CONTAINER_SELECTOR);
		for (const container of containers) {
			tabContainers.add(container);
		}
	}

	/**
	 * yt-tab-group-shape の外側スライダーを表示中の選択タブへ再配置する
	 */
	private syncTabGroupShapeIndicator(tabGroup: Element): void {
		const slider = tabGroup.querySelector('.tabGroupShapeSlider');
		if (!slider) return;

		if (tabGroup.querySelector(SHORTS_TAB_SELECTOR) === null) {
			this.restoreTabIndicator(slider);
			return;
		}

		const selectedTab = tabGroup.querySelector(SELECTED_TAB_SELECTOR);

		if (!selectedTab || selectedTab.matches(SHORTS_TAB_SELECTOR)) {
			this.hideElement(slider);
			return;
		}

		slider.removeAttribute(HIDDEN_ATTR);
		this.alignTabIndicatorToTab(slider, selectedTab);
	}

	/**
	 * tp-yt-paper-tabs の選択バーはShorts選択中のみ非表示にする
	 */
	private syncPaperTabsSelectionIndicator(paperTabs: Element): void {
		const selectionIndicators = paperTabs.querySelectorAll(PAPER_SELECTION_INDICATOR_SELECTOR);
		const selectedShortsTab = paperTabs.querySelector(SELECTED_SHORTS_TAB_SELECTOR);

		for (const indicator of selectionIndicators) {
			if (selectedShortsTab) {
				this.hideElement(indicator);
			} else {
				indicator.removeAttribute(HIDDEN_ATTR);
				this.restoreTabIndicator(indicator);
			}
		}
	}

	/**
	 * 選択バーを選択中タブの表示位置へ合わせる
	 */
	private alignTabIndicatorToTab(indicator: Element, selectedTab: Element): void {
		if (!(indicator instanceof HTMLElement) || !(selectedTab instanceof HTMLElement)) return;

		const indicatorParent = indicator.parentElement;
		const parentRect = indicatorParent?.getBoundingClientRect();
		const tabRect = selectedTab.getBoundingClientRect();
		const width = Math.round(tabRect.width || selectedTab.offsetWidth);

		if (width <= 0) {
			this.hideElement(indicator);
			return;
		}

		const left = Math.max(
			0,
			Math.round(
				parentRect
					? tabRect.left - parentRect.left + (indicatorParent?.scrollLeft ?? 0)
					: selectedTab.offsetLeft,
			),
		);
		const nextWidth = `${width}px`;
		const nextTransform = `translateX(${left}px)`;

		this.rememberTabIndicatorStyle(indicator);
		indicator.setAttribute(TAB_INDICATOR_ALIGNED_ATTR, HIDDEN_VALUE);

		if (indicator.style.width !== nextWidth) {
			indicator.style.width = nextWidth;
		}
		if (indicator.style.transform !== nextTransform) {
			indicator.style.transform = nextTransform;
		}
	}

	/**
	 * 選択バー補正前のstyleを退避する
	 */
	private rememberTabIndicatorStyle(indicator: Element): void {
		if (!indicator.hasAttribute(TAB_INDICATOR_ORIGINAL_STYLE_ATTR)) {
			indicator.setAttribute(
				TAB_INDICATOR_ORIGINAL_STYLE_ATTR,
				indicator.getAttribute('style') ?? '',
			);
		}
	}

	/**
	 * 補正した選択バーをYouTube側の元styleへ戻す
	 */
	private restoreTabIndicator(indicator: Element): void {
		const originalStyle = indicator.getAttribute(TAB_INDICATOR_ORIGINAL_STYLE_ATTR);
		if (originalStyle !== null) {
			if (originalStyle) {
				indicator.setAttribute('style', originalStyle);
			} else {
				indicator.removeAttribute('style');
			}
		}

		indicator.removeAttribute(TAB_INDICATOR_ALIGNED_ATTR);
		indicator.removeAttribute(TAB_INDICATOR_ORIGINAL_STYLE_ATTR);
	}

	/**
	 * 位置補正した選択バーをすべて復元する
	 */
	private restoreAlignedTabIndicators(): void {
		const indicators = document.querySelectorAll(`[${TAB_INDICATOR_ALIGNED_ATTR}]`);
		for (const indicator of indicators) {
			this.restoreTabIndicator(indicator);
		}
	}

	/**
	 * 検索結果ページ固有のShorts非表示処理
	 *
	 * @param roots - スキャン対象のroot
	 */
	private hideSearchPageShorts(
		roots: readonly ParentNode[],
	): void {
		const seen = new Set<Element>();

		// ハッシュタグ・検索修正テキスト
		for (const root of roots) {
			const cleanupElements = this.queryCandidates(
				root,
				NOT_HIDDEN_SEARCH_CLEANUP_SELECTOR,
			);
			for (const el of cleanupElements) {
				if (seen.has(el)) continue;
				seen.add(el);
				if (RE_SHORTS_TEXT.test(el.textContent ?? '')) {
					el.setAttribute(HIDDEN_ATTR, HIDDEN_VALUE);
				}
			}
		}

		// Shortsシェルフ
		for (const root of roots) {
			const shelves = this.queryCandidates(
				root,
				NOT_HIDDEN_SEARCH_SHELF_SELECTOR,
			);
			for (const shelf of shelves) {
				if (seen.has(shelf)) continue;
				seen.add(shelf);
				if (this.isSearchShortsShelf(shelf)) {
					this.hideElement(shelf);
				}
			}
		}

		// Shortsリンクを含むアイテム
		for (const root of roots) {
			const shortsLinks = this.queryCandidates(root, SHORTS_LINK_SELECTOR);
			for (const link of shortsLinks) {
				const item = link.closest(ITEM_SELECTOR);
				if (item && item.getAttribute(HIDDEN_ATTR) !== HIDDEN_VALUE) {
					this.hideElement(item);
				}
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

		if (this.isEmptySection(section)) {
			section.setAttribute(HIDDEN_ATTR, HIDDEN_VALUE);
		}
	}

	/**
	 * セクション直下の主要コンテンツがすべて非表示か判定する
	 */
	private isEmptySection(section: Element): boolean {
		const children = this.getSectionContentChildren(section);
		return children.length > 0 &&
			children.every((child) => child.getAttribute(HIDDEN_ATTR) === HIDDEN_VALUE);
	}

	/**
	 * 空セクション判定に使う直下の主要コンテンツ要素を取得する
	 */
	private getSectionContentChildren(section: Element): Element[] {
		const contentRoot = section.querySelector(':scope > #contents') ?? section;
		const children = Array.from(contentRoot.children);
		return children.filter((child): child is Element => {
			return child instanceof Element && child.matches(SECTION_CONTENT_SELECTOR);
		});
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
		this.currentShortsVideoId = videoId;
		const requestSerial = ++this.metaRequestSerial;
		const meta = this.metaFetcher.getFromDOM();

		this.overlayRenderer.showBlockOverlay(videoId, meta);
		this.videoController.startSuppression();

		// 非同期でメタデータを更新
		void this.updateOverlayMeta(videoId, requestSerial);
	}

	/**
	 * オーバーレイのメタデータを非同期で更新する
	 *
	 * @param videoId - YouTube動画ID
	 * @param requestSerial - メタデータ取得の世代番号
	 */
	private async updateOverlayMeta(videoId: string, requestSerial: number): Promise<void> {
		if (!videoId) return;

		const titleUpdate = this.metaFetcher.fetchTitle(videoId).then((title) => {
			if (title && this.isActiveMetaRequest(videoId, requestSerial)) {
				this.overlayRenderer.updateTitle(title, videoId);
			}
		});

		const domLikeCount = this.metaFetcher.getLikeCountFromDOM();
		if (domLikeCount && this.isActiveMetaRequest(videoId, requestSerial)) {
			this.overlayRenderer.updateLikeCount(domLikeCount, videoId);
		}

		const likeUpdate = domLikeCount
			? Promise.resolve()
			: this.metaFetcher.fetchLikeCount(videoId).then((likeCount) => {
				if (likeCount && this.isActiveMetaRequest(videoId, requestSerial)) {
					this.overlayRenderer.updateLikeCount(likeCount, videoId);
				}
			});

		await Promise.allSettled([titleUpdate, likeUpdate]);
	}

	/**
	 * 非同期取得結果を現在のShorts overlayへ反映してよいか判定する
	 */
	private isActiveMetaRequest(videoId: string, requestSerial: number): boolean {
		return this.enabled &&
			this.isShortsPage &&
			this.currentShortsVideoId === videoId &&
			this.metaRequestSerial === requestSerial;
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
		this.clearNavRescanTimer();
	}

	/**
	 * ナビゲーション後の遅延再スキャンタイマーを停止する
	 */
	private clearNavRescanTimer(): void {
		if (this.navRescanTimer !== null) {
			clearTimeout(this.navRescanTimer);
			this.navRescanTimer = null;
		}
	}

	/**
	 * 復元アニメーションをキャンセルして有効化へ戻れる状態にする
	 */
	private cancelRestore(): void {
		this.restoreCancel?.();
		this.restoreCancel = null;
		this.restoring = false;
		this.overlayRenderer.removeRestoreOverlay();
	}
}
