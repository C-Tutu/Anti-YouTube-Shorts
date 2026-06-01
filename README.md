<div align="center">

<img src="assets/icons/icon128.png" alt="Anti YouTube Shorts Logo" width="120" style="border-radius:20px;"><br>

# Anti YouTube Shorts

YouTube の Shorts 動画、Shorts タブ、サイドバー導線を非表示にする Chromium 拡張機能です。

![Version](https://img.shields.io/badge/version-3.3.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

</div>

---

## 概要

Anti YouTube Shorts は、YouTube 上に現れる Shorts 関連要素を検出して非表示にします。ホーム、検索結果、関連動画、サイドバー、チャンネルページの Shorts タブ、Shorts 選択バーを対象にします。

`/shorts/` ページへ直接アクセスした場合は動画再生を止め、ブロック画面を表示します。必要な場合はサムネイルから通常の `/watch?v=...` 形式で開けます。

## 主な機能

- Shorts 動画カード、棚、検索結果、関連動画を非表示
- サイドバーの「ショート」導線を非表示
- チャンネルページの Shorts タブを非表示
- `/shorts/` URL の直接再生をブロック

## 対応環境

| OS            | ブラウザ                                             |
| ------------- | ---------------------------------------------------- |
| Windows 10/11 | Google Chrome, Microsoft Edge, Brave, Vivaldi, Opera |
| macOS 12 以降 | Google Chrome, Microsoft Edge, Brave, Vivaldi, Opera |

Manifest V3 に対応した Chromium ベースブラウザで動作します。

## インストール

1. このリポジトリをダウンロードまたはクローンします。
2. 依存関係をインストールしてビルドします。

```bash
npm install
npm run build
```

3. ブラウザの拡張機能管理ページを開きます。
    - Chrome: `chrome://extensions/`
    - Edge: `edge://extensions/`
    - Brave: `brave://extensions/`
4. デベロッパーモードを有効化します。
5. 「パッケージ化されていない拡張機能を読み込む」から `dist/` を選択します。

開発中にリポジトリルートを読み込む場合も、`background.js`、`content_scripts/anti-shorts.js`、`popup/popup.js` を最新ビルドと同期してください。

## 使い方

- 拡張機能を ON にすると Shorts 関連要素を自動で非表示にします。
- 拡張機能を OFF にすると非表示マーカーと補正済みタブバーを復元します。
- Shorts ブロック画面では、サムネイルから通常動画ページへ移動できます。

## 開発

```bash
npm install
npm run typecheck
npm run build
npm run build:prod
npm run watch
```

| コマンド             | 内容                      |
| -------------------- | ------------------------- |
| `npm run typecheck`  | TypeScript の型チェック   |
| `npm run build`      | 開発ビルドと `dist/` 生成 |
| `npm run build:prod` | ミニファイ付き本番ビルド  |
| `npm run watch`      | 変更監視ビルド            |

## 実装メモ

- `src/content/ShortsManager.ts`: Shorts 判定、非表示、タブバー補正、URL ブロックを統合
- `src/content/DOMObserver.ts`: DOM 変更をデバウンスし、変更近傍だけをスキャン
- `src/content/VideoController.ts`: Shorts ページ上の動画停止と復元を担当
- `src/content/MetaFetcher.ts`: タイトルやいいね数の取得とキャッシュを担当
- `src/content/OverlayRenderer.ts`: ブロック画面と復元画面を安全に DOM 構築
- `src/constants.ts`: セレクタ、正規表現、タイミング値を集約

## パフォーマンス方針

- CSS で即時に隠せる要素は先に隠す
- DOM 監視は `href`、`title`、`aria-label`、`aria-selected`、`tab-title` を中心に見る
- 高頻度な `style` / `class` 変更はチャンネルタブ周辺だけ処理する
- `Shorts` 判定用セレクタは事前生成し、スキャン時の文字列再生成を避ける
- YouTube の仮想 DOM 再利用に備え、通常コンテンツへ変わった要素は復元する

## トラブルシューティング

- Shorts が残る場合は、拡張機能を OFF から ON に戻して YouTube を再読み込みしてください。
- チャンネルページの下線バーがずれる場合は、最新ビルドの `dist/` を読み込んでいるか確認してください。
- `/shorts/` ページで音が出る場合は、拡張機能が有効か、対象サイト権限が付いているか確認してください。
- ビルドに失敗する場合は、`node_modules` を削除して `npm install` を再実行してください。

## ライセンス

[MIT License](LICENSE)

> ※README.mdはCodexが記述しています。
