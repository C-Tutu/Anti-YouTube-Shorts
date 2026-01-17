/**
 * Anti YouTube Shorts v3.0.0 - Popup Controller
 * 最適化・エラーハンドリング強化
 */

/**
 * コンテンツスクリプトにメッセージを送信（リトライ付き）
 * @param {number} tabId - タブID
 * @param {object} message - 送信するメッセージ
 * @param {number} maxRetries - 最大リトライ回数
 * @returns {Promise<boolean>} 成功したかどうか
 */
async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
	const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			await chrome.tabs.sendMessage(tabId, message);
			return true;
		} catch {
			if (attempt === maxRetries - 1) {
				// 最後のリトライ：スクリプトを再注入
				try {
					await chrome.scripting.executeScript({
						target: { tabId },
						files: ['content_scripts/anti-shorts.js'],
					});
					await chrome.scripting.insertCSS({
						target: { tabId },
						files: ['content_scripts/anti-shorts.css'],
					});
					await delay(100);
					await chrome.tabs.sendMessage(tabId, message);
					return true;
				} catch (injectError) {
					console.warn('[Anti-Shorts] 再注入失敗:', injectError);
					return false;
				}
			}
			await delay(400);
		}
	}
	return false;
}

/**
 * 初期化
 */
document.addEventListener('DOMContentLoaded', async () => {
	const toggle = document.getElementById('toggle');
	if (!toggle) return;

	// 現在の状態を取得
	const { enabled = false } = await chrome.storage.sync.get({ enabled: false });
	toggle.checked = enabled;

	// トグル変更イベント
	toggle.addEventListener('change', async () => {
		const newState = toggle.checked;
		await chrome.storage.sync.set({ enabled: newState });

		// アクティブなYouTubeタブにメッセージ送信
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (tab?.id && tab.url?.includes('youtube.com')) {
			await sendMessageWithRetry(tab.id, {
				action: newState ? 'enable' : 'disable',
			});
		}
	});
});
