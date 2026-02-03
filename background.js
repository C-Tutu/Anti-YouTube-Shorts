/**
 * Anti YouTube Shorts v3.1.0 - Service Worker
 * 拡張機能のバックグラウンドスクリプト
 */

// インストール/更新時の初期化
chrome.runtime.onInstalled.addListener(({ reason }) => {
	// デフォルト設定を初期化
	chrome.storage.sync.get({ enabled: false }, ({ enabled }) => {
		chrome.storage.sync.set({ enabled: !!enabled });
	});

	// 初回インストール時のログ
	if (reason === 'install') {
		console.log('[Anti-Shorts] v3.1.0 インストール完了');
	} else if (reason === 'update') {
		console.log('[Anti-Shorts] v3.1.0 アップデート完了');
	}
});

// アイコンクリック時のバッジ表示（オプション）
chrome.storage.onChanged.addListener((changes) => {
	if (changes.enabled) {
		const isEnabled = changes.enabled.newValue;
		chrome.action.setBadgeText({ text: isEnabled ? 'ON' : '' });
		chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
	}
});
