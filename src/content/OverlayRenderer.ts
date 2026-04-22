/**
 * Anti YouTube Shorts — オーバーレイ描画モジュール
 * Shortsページおよび復元時のUI描画を担当する
 *
 * セキュリティ方針:
 * - innerHTMLによる動的コンテンツ挿入を排除
 * - 全テキストをtextContentへ設定しXSS脆弱性を防止
 * - 静的HTMLのみinnerHTMLで構築（動的値を含まない）
 */
import { OVERLAY_ID, RESTORE_DURATION_MS } from '../constants';
import type { VideoMeta } from '../types';

/**
 * ブロックオーバーレイおよび復元アニメーションのDOM生成を担当する
 *
 * document.createElementを用いた安全なDOM構築を基本とし、
 * ユーザー入力やAPI取得データはtextContentでのみ設定する。
 */
export class OverlayRenderer {
	/**
	 * Shortsブロックオーバーレイを生成しdocument.bodyへ追加する
	 *
	 * @param videoId - YouTube動画ID
	 * @param meta - 動画メタデータ（タイトル・いいね数）
	 * @returns 生成されたオーバーレイ要素
	 */
	showBlockOverlay(videoId: string, meta: VideoMeta): HTMLDivElement {
		// 既存オーバーレイが存在すれば再生成しない
		const existing = document.getElementById(OVERLAY_ID);
		if (existing) return existing as HTMLDivElement;

		const iconUrl = chrome.runtime.getURL('assets/icons/icon48.png');
		const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
		const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/maxresdefault.jpg`;
		const thumbFallback = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;

		// ルートオーバーレイ
		const overlay = document.createElement('div');
		overlay.id = OVERLAY_ID;
		overlay.dataset.videoId = videoId;

		// パネル
		const panel = document.createElement('div');
		panel.className = 'panel';

		// ヘッダー
		const header = document.createElement('header');
		header.className = 'header';

		const logo = document.createElement('img');
		logo.src = iconUrl;
		logo.alt = 'Anti YouTube Shorts';
		logo.className = 'logo';

		const titleEl = document.createElement('h1');
		titleEl.className = 'title';
		titleEl.textContent = 'ANTI YT SHORTS';

		header.appendChild(logo);
		header.appendChild(titleEl);

		// メインコンテンツ
		const main = document.createElement('main');
		main.className = 'main';

		const label = document.createElement('div');
		label.className = 'label';

		// ブロックメッセージ
		const blockMsg = document.createElement('h1');
		blockMsg.id = 'anti-shorts-title-msg';
		blockMsg.textContent = `「${meta.title || '読み込み中...'}」がブロックされています。`;

		// 動画情報
		const videoInfo = document.createElement('div');
		videoInfo.className = 'video-info';

		const videoStats = document.createElement('div');
		videoStats.className = 'video-stats';

		const likesSpan = document.createElement('span');
		likesSpan.id = 'anti-shorts-likes';
		likesSpan.textContent = `イイネ数：${meta.likeCount || '---'}`;

		videoStats.appendChild(likesSpan);
		videoInfo.appendChild(videoStats);

		// サムネイルリンク
		const thumbLink = document.createElement('a');
		thumbLink.href = watchUrl;
		thumbLink.className = 'thumbnail-link';

		const thumbImg = document.createElement('img');
		thumbImg.src = thumbUrl;
		thumbImg.alt = '';
		thumbImg.className = 'video-thumbnail';
		thumbImg.addEventListener('error', () => {
			thumbImg.src = thumbFallback;
		}, { once: true });

		// 再生ボタンオーバーレイ（SVGは静的コンテンツのためinnerHTMLを使用）
		const playOverlay = document.createElement('div');
		playOverlay.className = 'play-button-overlay';
		playOverlay.innerHTML =
			'<svg height="100%" viewBox="0 0 68 48" width="100%">' +
			'<path d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z" fill="#f00"></path>' +
			'<path d="M 45,24 27,14 27,34" fill="#fff"></path>' +
			'</svg>';

		thumbLink.appendChild(thumbImg);
		thumbLink.appendChild(playOverlay);

		// 操作案内
		const watchInstruction = document.createElement('p');
		watchInstruction.className = 'watch-instruction';
		watchInstruction.textContent = 'クリックして通常動画として視聴';

		// ホームリンク
		const homeLink = document.createElement('a');
		homeLink.href = 'https://www.youtube.com';
		homeLink.className = 'youtube-link';
		homeLink.textContent = 'YouTube ホームに戻る';

		// 組み立て
		label.appendChild(blockMsg);
		label.appendChild(videoInfo);
		label.appendChild(thumbLink);
		label.appendChild(watchInstruction);
		label.appendChild(document.createElement('br'));
		label.appendChild(homeLink);

		main.appendChild(label);
		panel.appendChild(header);
		panel.appendChild(main);
		overlay.appendChild(panel);

		document.body.appendChild(overlay);
		return overlay;
	}

	/**
	 * ブロックオーバーレイを削除する
	 */
	removeOverlay(): void {
		document.getElementById(OVERLAY_ID)?.remove();
	}

	/**
	 * オーバーレイ上のタイトルテキストを更新する
	 *
	 * @param title - 更新するタイトル文字列
	 */
	updateTitle(title: string): void {
		const el = document.getElementById('anti-shorts-title-msg');
		if (el) {
			el.textContent = `「${title}」がブロックされています。`;
		}
	}

	/**
	 * オーバーレイ上のいいね数テキストを更新する
	 *
	 * @param likeCount - いいね数文字列
	 */
	updateLikeCount(likeCount: string): void {
		const el = document.getElementById('anti-shorts-likes');
		if (el) {
			el.textContent = `イイネ数：${likeCount}`;
		}
	}

	/**
	 * 復元アニメーションオーバーレイを表示する
	 *
	 * 進捗バーアニメーションを表示し、完了後にコールバックを実行する。
	 *
	 * @param onComplete - アニメーション完了後のコールバック
	 */
	showRestoreAnimation(onComplete: () => void): void {
		const overlay = document.createElement('div');
		overlay.id = 'anti-shorts-restore-overlay';

		Object.assign(overlay.style, {
			position: 'fixed',
			inset: '0',
			zIndex: '2147483647',
			background: 'linear-gradient(180deg,#0f0f0f,#1a1a1a)',
			display: 'flex',
			flexDirection: 'column',
			justifyContent: 'center',
			alignItems: 'center',
			transition: 'opacity .5s',
			opacity: '1',
			fontFamily: 'sans-serif',
		} satisfies Partial<Record<string, string>>);

		const iconUrl = chrome.runtime.getURL('assets/icons/icon48.png');

		// 復元UIは静的コンテンツのみのためinnerHTMLを使用（動的値を含まない）
		const container = document.createElement('div');
		Object.assign(container.style, {
			width: '80%',
			maxWidth: '500px',
			textAlign: 'center',
		} satisfies Partial<Record<string, string>>);

		const heading = document.createElement('h2');
		Object.assign(heading.style, {
			fontSize: '28px',
			fontWeight: '700',
			color: '#fff',
			letterSpacing: '3px',
			marginBottom: '8px',
		} satisfies Partial<Record<string, string>>);
		heading.textContent = 'RESTORING...';

		const percentEl = document.createElement('div');
		percentEl.id = 'restore-percent';
		Object.assign(percentEl.style, {
			fontSize: '48px',
			fontWeight: '700',
			color: '#f00',
			marginBottom: '24px',
		} satisfies Partial<Record<string, string>>);
		percentEl.textContent = '0%';

		// プログレスバー構造
		const barWrapper = document.createElement('div');
		Object.assign(barWrapper.style, {
			position: 'relative',
			width: '100%',
			height: '6px',
			background: 'rgba(255,255,255,.15)',
			borderRadius: '3px',
			marginBottom: '16px',
			overflow: 'visible',
		} satisfies Partial<Record<string, string>>);

		const progressBar = document.createElement('div');
		progressBar.id = 'restore-progress';
		Object.assign(progressBar.style, {
			position: 'absolute',
			left: '0',
			top: '0',
			height: '100%',
			width: '0%',
			background: 'linear-gradient(90deg,#f00,#f44)',
			borderRadius: '3px',
		} satisfies Partial<Record<string, string>>);

		const playhead = document.createElement('div');
		playhead.id = 'restore-playhead';
		Object.assign(playhead.style, {
			position: 'absolute',
			top: '50%',
			left: '0%',
			transform: 'translateY(-50%)',
			width: '36px',
			height: '36px',
			marginLeft: '-18px',
			borderRadius: '50%',
			background: '#1a1a1a',
			border: '3px solid #f00',
			display: 'flex',
			justifyContent: 'center',
			alignItems: 'center',
		} satisfies Partial<Record<string, string>>);

		const playheadIcon = document.createElement('img');
		playheadIcon.src = iconUrl;
		Object.assign(playheadIcon.style, {
			width: '22px',
			height: '22px',
			borderRadius: '4px',
		} satisfies Partial<Record<string, string>>);
		playhead.appendChild(playheadIcon);

		barWrapper.appendChild(progressBar);
		barWrapper.appendChild(playhead);

		const statusText = document.createElement('p');
		Object.assign(statusText.style, {
			fontSize: '14px',
			color: '#888',
			margin: '0',
		} satisfies Partial<Record<string, string>>);
		statusText.textContent = '時間泥棒を解放中...';

		container.appendChild(heading);
		container.appendChild(percentEl);
		container.appendChild(barWrapper);
		container.appendChild(statusText);
		overlay.appendChild(container);
		document.body.appendChild(overlay);

		// アニメーションループ
		const startTime = performance.now();

		const animate = (now: number): void => {
			const elapsed = Math.min((now - startTime) / RESTORE_DURATION_MS, 1);
			const value = elapsed * 100;

			progressBar.style.width = `${value}%`;
			playhead.style.left = `${value}%`;
			percentEl.textContent = `${Math.round(value)}%`;

			if (elapsed < 1) {
				requestAnimationFrame(animate);
			} else {
				onComplete();

				overlay.style.opacity = '0';
				overlay.addEventListener(
					'transitionend',
					() => overlay.remove(),
					{ once: true },
				);
			}
		};

		requestAnimationFrame(animate);
	}
}
