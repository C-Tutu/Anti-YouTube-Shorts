<div align="center">

<img src="assets/icons/icon128.png" alt="Anti YouTube Shorts Logo" width="120" style="border-radius:20px;"><br>

# 🚫 Anti YouTube Shorts

**YouTube のショート動画を完全に非表示にして、あなたの大切な時間を守ります。**  
"つい見ちゃう"を卒業し、より穏やかなネット体験を。

![GitHub last commit](https://img.shields.io/github/last-commit/C-Tutu/anti-youtube-shorts?color=brightgreen)
![Version](https://img.shields.io/badge/version-3.1.2-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

</div>

---

## 概要

YouTube のホーム、検索結果、サイドバー、タグ領域から Shorts 項目を検出し、非表示にします。  
ショート動画へ直接アクセスした場合、オーバーレイでブロックし、通常プレイヤーでの再生オプションを提供します。

## 主な機能 (v3.1.2)

- **完全なショート非表示**: ホーム、検索結果、関連動画などあらゆる場所からShortsを排除。
- **誤爆防止**: 通常の動画や検索結果を誤って隠さないよう、検出ロジックを強化。
- **パフォーマンス最適化**: 事前コンパイル済みのセレクタとキャッシュを活用し、ブラウザへの負荷を最小限に。
- **ブロック機能**: `/shorts/` URLへの直接アクセスを遮断し、誘惑を断ち切ります。
- **通常再生**: ブロック画面のサムネイルをクリックすると、通常のYouTubeプレイヤーで再生できます。

## インストール

1. 右上の **「Code → Download ZIP」** からソースコードをダウンロード・展開。
2. Chrome で `chrome://extensions/` を開く。
3. 「**デベロッパーモード**」を有効化。
4. 「**パッケージ化されていない拡張機能を読み込む**」から展開したフォルダを選択。

## 使い方

- **有効化 (ON)**: 自動的にすべての Shorts が非表示になります。
- **無効化 (OFF)**: アイコンをクリックしてスイッチを OFF にすると、Shorts が再表示されます。
- **動画ブロック解除**: `/shorts/` URL にアクセス時、サムネイルをクリックすると通常プレイヤー（`/watch?v=...`）で再生できます。

## トラブルシューティング

- **Shorts が消えない**: YouTube の仕様変更の可能性があります。拡張機能を再読み込み（OFF→ON）してください。
- **フル動画が見られない**: バージョン v3.1.2 以降で修正済みです。最新版をご利用ください。
- **表示崩れ**: 検索結果等で若干の空白が生じるのは仕様です（仮想スクロール最適化のため）。

## ライセンス

[MIT License](LICENSE)
