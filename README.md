<div align="center">

<img src="assets/icons/icon128.png" alt="Anti YouTube Shorts Logo" width="120" style="border-radius:20px;"><br>

# 🚫 Anti YouTube Shorts

**YouTube のショート動画を完全に非表示にして、あなたの大切な時間を守ります。**  
"つい見ちゃう"を卒業し、より穏やかなネット体験を。

![GitHub last commit](https://img.shields.io/github/last-commit/C-Tutu/anti-youtube-shorts?color=brightgreen)
![Version](https://img.shields.io/badge/version-3.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)

</div>

---

## 概要

YouTube のホーム、検索結果、サイドバー、タグ領域から Shorts 項目を検出し、非表示にします。  
ショート動画へ直接アクセスした場合、オーバーレイでブロックし、通常プレイヤーでの再生オプションを提供します。

## 動作環境

| OS | ブラウザ |
|---|---|
| Windows 10/11 | Google Chrome, Microsoft Edge, Brave, Vivaldi, Opera |
| macOS 12+ (Monterey 以降) | Google Chrome, Microsoft Edge, Brave, Vivaldi, Opera |

> **対応基準**: Chromium ベースのブラウザで Manifest V3 をサポートするすべてのブラウザで動作します。

## 主な機能 (v3.2.0)

- **完全なショート非表示**: ホーム、検索結果、関連動画などあらゆる場所からShortsを排除。
- **誤爆防止**: 通常の動画や検索結果を誤って隠さないよう、検出ロジックを強化。
- **パフォーマンス最適化**: 事前コンパイル済みのセレクタとキャッシュを活用し、ブラウザへの負荷を最小限に。
- **ブロック機能**: `/shorts/` URLへの直接アクセスを遮断し、誘惑を断ち切ります。
- **通常再生**: ブロック画面のサムネイルをクリックすると、通常のYouTubeプレイヤーで再生できます。
- **セキュリティ強化**: XSS脆弱性を排除し、安全なDOM構築を採用。

## インストール

### ユーザー向け（ビルド済み配布）

1. 右上の **「Code → Download ZIP」** からソースコードをダウンロード・展開。
2. 以下の手順でビルドを実行:
   ```bash
   npm install
   npm run build
   ```
3. ブラウザで拡張機能の管理ページを開く：
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
   - **Brave**: `brave://extensions/`
4. 「**デベロッパーモード**」を有効化。
5. 「**パッケージ化されていない拡張機能を読み込む**」から **`dist/`** フォルダを選択。

## 使い方

- **有効化 (ON)**: 自動的にすべての Shorts が非表示になります。
- **無効化 (OFF)**: アイコンをクリックしてスイッチを OFF にすると、Shorts が再表示されます。
- **動画ブロック解除**: `/shorts/` URL にアクセス時、サムネイルをクリックすると通常プレイヤー（`/watch?v=...`）で再生できます。

## 開発

### 前提条件

- **Node.js** 18 以上
- **npm** 9 以上

### セットアップ

```bash
# 依存パッケージのインストール
npm install

# 開発ビルド（ソースマップ付き）
npm run build

# ファイル変更の自動検知ビルド
npm run watch

# 型チェック
npm run typecheck

# プロダクションビルド（ミニファイ）
npm run build:prod
```

### プロジェクト構造

```
Anti-YouTube-Shorts/
├── src/                          # TypeScript ソースコード
│   ├── types.ts                  # 共通型定義
│   ├── constants.ts              # 定数・セレクタ・正規表現
│   ├── background/
│   │   └── index.ts              # Service Worker
│   ├── content/
│   │   ├── index.ts              # コンテンツスクリプト エントリポイント
│   │   ├── ShortsManager.ts      # Shorts管理統合モジュール
│   │   ├── DOMObserver.ts        # DOM監視モジュール
│   │   ├── VideoController.ts    # 動画制御モジュール
│   │   ├── MetaFetcher.ts        # メタデータ取得モジュール
│   │   └── OverlayRenderer.ts    # オーバーレイ描画モジュール
│   └── popup/
│       └── popup.ts              # ポップアップ制御
├── content_scripts/
│   └── anti-shorts.css           # コンテンツスタイル
├── popup/
│   ├── popup.html                # ポップアップ UI
│   └── popup.css                 # ポップアップスタイル
├── assets/                       # アイコン・フォント
├── dist/                         # ビルド出力（.gitignore 対象）
├── manifest.json                 # 拡張機能マニフェスト (V3)
├── tsconfig.json                 # TypeScript 設定
├── build.mjs                     # esbuild ビルドスクリプト
└── package.json
```

### 技術スタック

| 項目 | 詳細 |
|---|---|
| 言語 | TypeScript 5.8 (Strict Mode) |
| ビルドツール | esbuild |
| マニフェスト | Chrome Extensions Manifest V3 |
| 型チェック | `tsc --noEmit --strict` |

## トラブルシューティング

- **Shorts が消えない**: YouTube の仕様変更の可能性があります。拡張機能を再読み込み（OFF→ON）してください。
- **フル動画が見られない**: バージョン v3.2.0 以降で修正済みです。最新版をご利用ください。
- **表示崩れ**: 検索結果等で若干の空白が生じるのは仕様です（仮想スクロール最適化のため）。
- **ビルドエラー**: `node_modules` を削除し `npm install` を再実行してください。

## ライセンス

[MIT License](LICENSE)
