/**
 * Anti YouTube Shorts — メタデータ取得モジュール
 * YouTube oEmbed APIおよびDOM解析による動画情報の取得を担当する
 */
import { RE_LIKES_FORMAT, RE_LIKE_COUNT } from '../constants';
import type { VideoMeta, OEmbedResponse } from '../types';

/** いいね数取得に使用するDOMセレクタ群（優先度順） */
const LIKE_SELECTORS: readonly string[] = [
	'ytd-reel-video-renderer[is-active] #like-button yt-formatted-string',
	'#like-button button span[role="text"]',
	'like-button-view-model button span',
] as const;

/**
 * YouTube動画のメタデータ（タイトル・いいね数）を取得する
 *
 * 取得手段を優先度順に複数保持し、
 * 前段の取得が失敗した場合に次の手段へフォールバックする。
 */
export class MetaFetcher {
	/**
	 * DOMから現在表示中の動画メタデータを取得する
	 *
	 * document.titleおよびog:titleメタタグを参照し、
	 * いいね数はDOMセレクタで取得する。
	 * @returns 動画メタデータ
	 */
	getFromDOM(): VideoMeta {
		const title = this.extractTitle();
		const likeCount = this.extractLikesFromDOM();
		return { title, likeCount };
	}

	/**
	 * YouTube oEmbed APIから動画タイトルを取得する
	 *
	 * @param videoId - YouTube動画ID
	 * @returns タイトル文字列。取得失敗時は空文字列
	 */
	async fetchTitle(videoId: string): Promise<string> {
		try {
			const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/shorts/${videoId}&format=json`;
			const response = await fetch(url);
			if (!response.ok) return '';

			const data = (await response.json()) as OEmbedResponse;
			return data.title ?? '';
		} catch {
			return '';
		}
	}

	/**
	 * YouTubeのHTMLソースからいいね数を取得する
	 *
	 * oEmbed APIではいいね数が提供されないため、
	 * ShortsページのHTMLを取得しJSON埋め込みデータから抽出する。
	 *
	 * @param videoId - YouTube動画ID
	 * @returns いいね数文字列。取得失敗時は空文字列
	 */
	async fetchLikeCount(videoId: string): Promise<string> {
		try {
			const response = await fetch(`https://www.youtube.com/shorts/${videoId}`);
			if (!response.ok) return '';

			const html = await response.text();
			const match = html.match(RE_LIKE_COUNT);
			return match?.[1] ?? '';
		} catch {
			return '';
		}
	}

	/**
	 * document.titleまたはog:titleからタイトルを抽出する
	 */
	private extractTitle(): string {
		const suffix = ' - YouTube';

		if (document.title !== 'YouTube') {
			const cleaned = document.title.endsWith(suffix)
				? document.title.slice(0, -suffix.length).trim()
				: document.title.trim();
			if (cleaned) return cleaned;
		}

		const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
		if (ogTitle?.content) {
			return ogTitle.content.endsWith(suffix)
				? ogTitle.content.slice(0, -suffix.length).trim()
				: ogTitle.content.trim();
		}

		return '';
	}

	/**
	 * DOM要素からいいね数を抽出する
	 *
	 * 複数のセレクタを優先度順に試行し、
	 * 数値フォーマットに合致するテキストを返す。
	 */
	private extractLikesFromDOM(): string {
		for (const selector of LIKE_SELECTORS) {
			const element = document.querySelector(selector);
			const text = element?.textContent?.trim() ?? '';
			if (text && RE_LIKES_FORMAT.test(text)) {
				return text;
			}
		}
		return '';
	}
}
