/**
 * Anti YouTube Shorts — DOM監視モジュール
 * MutationObserverによるDOM変更検知とデバウンス制御を担当する
 */
import {
	DEBOUNCE_MS,
	SHORTS_SELECTION_INDICATOR_SELECTOR,
	TAB_CONTAINER_SELECTOR,
} from '../constants';

/** DOM変更検知時に実行されるコールバック型 */
type MutationCallback = (roots?: readonly Element[]) => void;

/**
 * DOMツリーの変更を効率的に監視するオブザーバー
 *
 * MutationObserverのラッパーとして機能し、
 * デバウンス処理とrequestAnimationFrameの統合を行う。
 * 不要な全件スキャンを回避し、追加ノードが存在する場合のみコールバックを発火する。
 */
export class DOMObserver {
	/** MutationObserverインスタンス */
	private observer: MutationObserver | null = null;

	/** デバウンスタイマーのID */
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	/** 次回スキャン対象の変更近傍 */
	private pendingRoots = new Set<Element>();

	/** 次回はdocument全体をスキャンするか */
	private fullScanPending = false;

	/** コールバック関数 */
	private readonly onMutation: MutationCallback;

	/** デバウンス間隔 */
	private readonly debounceMs: number;

	/**
	 * @param onMutation - DOM変更検知時に実行するコールバック
	 * @param debounceMs - デバウンス間隔（ミリ秒）
	 */
	constructor(onMutation: MutationCallback, debounceMs: number = DEBOUNCE_MS) {
		this.onMutation = onMutation;
		this.debounceMs = debounceMs;
	}

	/**
	 * DOM監視を開始する
	 *
	 * document.bodyが未生成の場合はDOMContentLoadedまで待機する。
	 * 観測対象は#contentまたはytd-page-managerを優先し、
	 * 存在しない場合はdocument.bodyをフォールバックとする。
	 */
	start(): void {
		if (this.observer) return;

		if (!document.body) {
			document.addEventListener('DOMContentLoaded', () => this.start(), { once: true });
			return;
		}

		const target =
			document.querySelector('#content') ??
			document.querySelector('ytd-page-manager') ??
			document.body;

		this.observer = new MutationObserver((mutations: MutationRecord[]) => {
			const roots = new Set<Element>();

			for (const mutation of mutations) {
				if (mutation.type === 'childList') {
					const targetElement = this.toElement(mutation.target);
					if (targetElement) roots.add(targetElement);

					for (const node of mutation.addedNodes) {
						const element = this.toElement(node);
						if (element) roots.add(element);
					}
				} else if (mutation.type === 'attributes') {
					const element = this.toElement(mutation.target);
					if (element && this.shouldTrackAttributeMutation(element, mutation.attributeName)) {
						roots.add(element);
					}
				}
			}

			if (roots.size > 0) {
				this.scheduleCallback([...roots]);
			}
		});

		this.observer.observe(target, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: [
				'href',
				'title',
				'aria-label',
				'aria-selected',
				'tab-title',
				'class',
				'style',
			],
		});
	}

	/**
	 * DOM監視を停止し、全タイマーをクリアする
	 */
	stop(): void {
		this.observer?.disconnect();
		this.observer = null;
		this.cancelPending();
	}

	/**
	 * 保留中のデバウンスタイマーをキャンセルする
	 */
	cancelPending(): void {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.pendingRoots.clear();
		this.fullScanPending = false;
	}

	/**
	 * デバウンス付きでコールバックをスケジュールする
	 *
	 * 短時間に複数回呼ばれた場合、最後の呼び出しから
	 * debounceMs経過後にrequestAnimationFrame経由で実行される。
	 */
	scheduleCallback(roots?: readonly Element[]): void {
		if (roots === undefined) {
			this.fullScanPending = true;
			this.pendingRoots.clear();
		} else if (!this.fullScanPending) {
			for (const root of roots) {
				this.pendingRoots.add(root);
				if (root.parentElement) {
					this.pendingRoots.add(root.parentElement);
				}
			}
		}

		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			const rootsForCallback = this.fullScanPending
				? undefined
				: [...this.pendingRoots];
			this.pendingRoots.clear();
			this.fullScanPending = false;
			requestAnimationFrame(() => this.onMutation(rootsForCallback));
		}, this.debounceMs);
	}

	/**
	 * MutationRecordのtargetをスキャン可能なElementへ正規化する
	 */
	private toElement(node: Node): Element | null {
		if (node.nodeType === Node.ELEMENT_NODE) {
			return node as Element;
		}
		return node.parentElement;
	}

	/**
	 * 高頻度なstyle/class変更はタブ周辺だけに絞る
	 */
	private shouldTrackAttributeMutation(
		element: Element,
		attributeName: string | null,
	): boolean {
		if (attributeName !== 'style' && attributeName !== 'class') {
			return true;
		}

		return element.matches(SHORTS_SELECTION_INDICATOR_SELECTOR) ||
			element.closest(TAB_CONTAINER_SELECTOR) !== null;
	}
}
