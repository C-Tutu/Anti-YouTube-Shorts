/**
 * Anti YouTube Shorts — 共通型定義
 * 拡張機能全体で使用するインターフェースおよび型エイリアスを定義する
 */

/** chrome.storage に永続化する設定データ */
export interface ExtensionSettings {
	/** Shorts非表示機能の有効/無効 */
	readonly enabled: boolean;
}

/** デフォルト設定値 */
export const DEFAULT_SETTINGS: Readonly<ExtensionSettings> = {
	enabled: false,
} as const;

/** コンテンツスクリプトへ送信するメッセージ */
export interface ContentMessage {
	readonly action: 'enable' | 'disable';
}

/** コンテンツスクリプトからの応答 */
export interface ContentResponse {
	readonly success: boolean;
}

/** YouTube oEmbed APIのレスポンス */
export interface OEmbedResponse {
	readonly title: string;
	readonly author_name: string;
	readonly author_url: string;
	readonly type: string;
	readonly height: number;
	readonly width: number;
	readonly version: string;
	readonly provider_name: string;
	readonly provider_url: string;
	readonly thumbnail_height: number;
	readonly thumbnail_width: number;
	readonly thumbnail_url: string;
	readonly html: string;
}

/** 動画メタデータ（オーバーレイ表示用） */
export interface VideoMeta {
	readonly title: string;
	readonly likeCount: string;
}
