/**
 * Anti YouTube Shorts — コンテンツスクリプト エントリポイント
 * 多重初期化を防止しShortsManagerを起動する
 */
import { ShortsManager } from './ShortsManager';

(() => {
	'use strict';

	// グローバルフラグによる多重初期化の防止
	const globalContext = window as typeof window & {
		__antiShortsInitialized?: boolean;
	};

	if (globalContext.__antiShortsInitialized) return;
	globalContext.__antiShortsInitialized = true;

	ShortsManager.getInstance();
})();
