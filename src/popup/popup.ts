/**
 * Anti YouTube Shorts — Popup Controller
 * トグルスイッチによるShorts非表示機能の有効/無効切り替えを担当する
 */
import type { ContentMessage, ExtensionSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

/** メッセージ送信の最大リトライ回数 */
const MAX_RETRIES = 3 as const;

/** リトライ間隔 (ms) */
const RETRY_DELAY_MS = 400 as const;

/** コンテンツスクリプト再注入後の待機時間 (ms) */
const INJECT_SETTLE_MS = 100 as const;

/**
 * 指定ミリ秒の遅延を返すPromise
 *
 * @param ms - 待機ミリ秒
 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * コンテンツスクリプトへメッセージを送信する（リトライ機構付き）
 *
 * 送信先のコンテンツスクリプトが未初期化の場合、
 * 最終リトライで動的にスクリプトとCSSを注入してから再送信する。
 *
 * @param tabId - 送信先タブID
 * @param message - 送信メッセージ
 * @returns 送信成功の場合true
 */
async function sendMessageWithRetry(tabId: number, message: ContentMessage): Promise<boolean> {
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			await chrome.tabs.sendMessage(tabId, message);
			return true;
		} catch {
			if (attempt === MAX_RETRIES - 1) {
				// 最終リトライ: コンテンツスクリプトを再注入
				return await reinjectAndSend(tabId, message);
			}
			await delay(RETRY_DELAY_MS);
		}
	}
	return false;
}

/**
 * コンテンツスクリプトを動的に注入し、メッセージを送信する
 *
 * @param tabId - 対象タブID
 * @param message - 送信メッセージ
 * @returns 送信成功の場合true
 */
async function reinjectAndSend(tabId: number, message: ContentMessage): Promise<boolean> {
	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			files: ['content_scripts/anti-shorts.js'],
		});
		await chrome.scripting.insertCSS({
			target: { tabId },
			files: ['content_scripts/anti-shorts.css'],
		});
		await delay(INJECT_SETTLE_MS);
		await chrome.tabs.sendMessage(tabId, message);
		return true;
	} catch (error: unknown) {
		console.warn('[Anti-Shorts] コンテンツスクリプト再注入失敗:', error);
		return false;
	}
}

/**
 * DOMContentLoaded時にポップアップUIを初期化する
 *
 * トグルスイッチの初期状態をストレージから復元し、
 * 変更イベントに対してストレージ更新とコンテンツスクリプトへの通知を行う。
 */
document.addEventListener('DOMContentLoaded', async () => {
	const toggle = document.getElementById('toggle') as HTMLInputElement | null;
	if (!toggle) return;

	// 現在の設定を取得しUIに反映
	const settings: ExtensionSettings = await chrome.storage.sync.get(DEFAULT_SETTINGS) as ExtensionSettings;
	toggle.checked = settings.enabled;

	// トグル変更時のハンドラ
	toggle.addEventListener('change', async () => {
		const newState = toggle.checked;
		await chrome.storage.sync.set({ enabled: newState });

		// アクティブなYouTubeタブへメッセージ送信
		const [activeTab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});

		if (activeTab?.id !== undefined && activeTab.url?.includes('youtube.com')) {
			const message: ContentMessage = {
				action: newState ? 'enable' : 'disable',
			};
			await sendMessageWithRetry(activeTab.id, message);
		}
	});
});
