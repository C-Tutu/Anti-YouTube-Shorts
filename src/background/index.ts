/**
 * Anti YouTube Shorts — Service Worker (Background Script)
 * 拡張機能のライフサイクルイベントとバッジ状態管理を担当する
 */
import type { ExtensionSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

/** 拡張機能のバージョン */
const EXTENSION_VERSION = '3.2.0' as const;

/**
 * インストールまたはアップデート時の初期化処理
 *
 * ストレージに設定が存在しない場合はデフォルト値で初期化する。
 */
chrome.runtime.onInstalled.addListener(({ reason }: chrome.runtime.InstalledDetails) => {
	chrome.storage.sync.get(DEFAULT_SETTINGS, (result: ExtensionSettings) => {
		chrome.storage.sync.set({ enabled: !!result.enabled });
	});

	if (reason === 'install') {
		console.log(`[Anti-Shorts] v${EXTENSION_VERSION} インストール完了`);
	} else if (reason === 'update') {
		console.log(`[Anti-Shorts] v${EXTENSION_VERSION} アップデート完了`);
	}
});

/**
 * ストレージ変更時のバッジ表示更新
 *
 * enabledの値が変更された場合、アクションバッジのテキストと背景色を更新する。
 */
chrome.storage.onChanged.addListener(
	(changes: { [key: string]: chrome.storage.StorageChange }) => {
		const enabledChange = changes['enabled'];
		if (enabledChange) {
			const isEnabled = enabledChange.newValue as boolean;
			void chrome.action.setBadgeText({ text: isEnabled ? 'ON' : '' });
			void chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
		}
	},
);
