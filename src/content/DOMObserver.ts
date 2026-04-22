/**
 * Anti YouTube Shorts — DOM監視モジュール
 * MutationObserverによるDOM変更検知とデバウンス制御を担当する
 */
import { DEBOUNCE_MS } from '../constants';

/** DOM変更検知時に実行されるコールバック型 */
type MutationCallback = () => void;

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
			// 追加ノードが1件でもあればコールバックをスケジュール
			for (const mutation of mutations) {
				if (mutation.addedNodes.length > 0) {
					this.scheduleCallback();
					return;
				}
			}
		});

		this.observer.observe(target, { childList: true, subtree: true });
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
	}

	/**
	 * デバウンス付きでコールバックをスケジュールする
	 *
	 * 短時間に複数回呼ばれた場合、最後の呼び出しから
	 * debounceMs経過後にrequestAnimationFrame経由で実行される。
	 */
	scheduleCallback(): void {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			requestAnimationFrame(() => this.onMutation());
		}, this.debounceMs);
	}
}
