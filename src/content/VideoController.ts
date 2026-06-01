/**
 * Anti YouTube Shorts — 動画制御モジュール
 * Shortsページにおける動画要素の一時停止・ミュート・抑制を担当する
 */

/**
 * ページ内の全video要素に対する一括制御を提供する
 *
 * Shortsページ検出時に動画の再生を強制停止し、
 * 音漏れや意図しない自動再生を防止する。
 */
interface VideoState {
	readonly muted: boolean;
	readonly paused: boolean;
	readonly currentTime: number;
}

export class VideoController {
	/** 動画再生抑制タイマーのID */
	private suppressorInterval: ReturnType<typeof setInterval> | null = null;

	/** 拡張機能が状態を変更した動画 */
	private touchedVideos = new Set<HTMLVideoElement>();

	/** 動画ごとの変更前状態 */
	private videoStates = new WeakMap<HTMLVideoElement, VideoState>();

	/**
	 * ページ内の全動画を即座に停止・ミュートする
	 */
	pauseAll(): void {
		const videos = document.querySelectorAll<HTMLVideoElement>('video');
		for (const video of videos) {
			this.rememberState(video);
			video.pause();
			video.muted = true;
			this.setCurrentTime(video, 0);
		}
	}

	/**
	 * 動画再生の継続的な抑制を開始する
	 *
	 * YouTubeのSPAが動的に動画を再開する場合に備え、
	 * 300ms間隔で再生中の動画を検知し停止する。
	 */
	startSuppression(): void {
		if (this.suppressorInterval !== null) return;

		const suppress = (): void => {
			const videos = document.querySelectorAll<HTMLVideoElement>('video');
			for (const video of videos) {
				if (!video.paused) {
					this.rememberState(video);
					video.pause();
					video.muted = true;
				}
			}
		};

		suppress();
		this.suppressorInterval = setInterval(suppress, 300);
	}

	/**
	 * 動画再生の抑制を停止する
	 */
	stopSuppression(): void {
		if (this.suppressorInterval !== null) {
			clearInterval(this.suppressorInterval);
			this.suppressorInterval = null;
		}
	}

	/**
	 * 全動画のミュートを解除し再生を試みる
	 *
	 * 機能無効化時に呼び出され、ユーザーの通常視聴を復元する。
	 * 自動再生ポリシーにより再生が拒否される場合は無視する。
	 */
	resumeAll(): void {
		for (const video of this.touchedVideos) {
			const state = this.videoStates.get(video);
			if (!state) continue;

			video.muted = state.muted;
			this.setCurrentTime(video, state.currentTime);

			if (state.paused) {
				video.pause();
			} else {
				video.play().catch(() => {
					// 自動再生ポリシーによる拒否は無視
				});
			}
		}

		this.touchedVideos.clear();
		this.videoStates = new WeakMap<HTMLVideoElement, VideoState>();
	}

	/**
	 * 変更前の動画状態を一度だけ保存する
	 */
	private rememberState(video: HTMLVideoElement): void {
		if (this.videoStates.has(video)) return;

		this.videoStates.set(video, {
			muted: video.muted,
			paused: video.paused,
			currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
		});
		this.touchedVideos.add(video);
	}

	/**
	 * currentTimeの復元失敗を通常操作へ漏らさない
	 */
	private setCurrentTime(video: HTMLVideoElement, currentTime: number): void {
		try {
			video.currentTime = currentTime;
		} catch {
			// メディア状態によってcurrentTime変更が拒否される場合は無視
		}
	}
}
