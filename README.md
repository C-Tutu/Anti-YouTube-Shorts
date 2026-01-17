<div align="center">

<img src="assets/icons/icon128.png" alt="Anti YouTube Shorts Logo" width="120" style="border-radius:20px;"><br>

# 🚫 Anti YouTube Shorts

**YouTube のショート動画を完全に非表示にして、あなたの大切な時間を守ります。**  
"つい見ちゃう"を卒業し、より穏やかなネット体験を。

![GitHub last commit](https://img.shields.io/github/last-commit/C-Tutu/anti-youtube-shorts?color=brightgreen)
![Version](https://img.shields.io/badge/version-3.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

</div>

---

## 🧩 概要

**Anti YouTube Shorts** は、YouTube 上に表示されるショート動画（Shorts）を自動的に非表示にする Chrome 拡張機能です。

ホーム画面・検索結果・サイドバー・タグ領域など、あらゆる場所に現れるショートをまとめて非表示にし、あなたの集中力と時間を守ります。

---

## ✨ v3.0.0 新機能

- 🔍 **検索結果からShortsを完全排除**
    - 検索ページでショート動画を一切表示しません
- ⚡ **大幅なパフォーマンス最適化**
    - Singleton パターンによるメモリ効率化
    - MutationObserver の最適化でCPU負荷を削減
- 🎨 **UIの改善**
    - ブロック時のオーバーレイデザインを刷新
    - ツールバーにON/OFFバッジを表示

---

## 🎯 主な特徴

| 機能                      | 説明                                             |
| ------------------------- | ------------------------------------------------ |
| 🎬 **完全非表示**         | ホーム / 検索結果 / タグ / サイドバー すべて対応 |
| 🔄 **ワンクリック切替**   | 拡張アイコンから ON / OFF を即時切り替え         |
| ⏳ **復元アニメーション** | OFF にすると滑らかなアニメーションで復元         |
| 🌙 **軽量設計**           | DOM監視を最適化、パフォーマンス影響最小限        |
| 🔗 **通常動画として視聴** | ブロック画面から直接ノーマルプレイヤーで再生可能 |

---

## 📦 インストール

### Chrome / Edge / Brave（Chromium 系ブラウザ）

1. **ダウンロード**
    - リポジトリ右上の **「Code → Download ZIP」** をクリック
    - ZIP を展開

2. **拡張機能を読み込む**
    - アドレスバーに `chrome://extensions/` を入力
    - 右上の「**デベロッパーモード**」を ON
    - 「**パッケージ化されていない拡張機能を読み込む**」をクリック
    - 展開したフォルダを選択

3. **動作確認**
    - [YouTube](https://www.youtube.com/) を開く
    - ツールバーのアイコンをクリック
    - トグルスイッチで ON / OFF を切り替え

---

## 🛠️ 使い方

| 状態       | 動作                                           |
| ---------- | ---------------------------------------------- |
| ✅ **ON**  | ショート動画がすべて非表示になります           |
| ❎ **OFF** | 復元アニメーション後、ショートが再表示されます |

Shorts ページ（`/shorts/xxx`）にアクセスした場合：

- ブロック画面が表示されます
- サムネイルをクリックすると**通常動画として視聴**できます

---

## 💬 FAQ

### Q. Shorts が消えないページがあります

YouTube の DOM 構造が変更された可能性があります。拡張機能を一度 OFF → ON にしてみてください。

### Q. 他の拡張機能と競合しますか？

YouTube 関連の他の拡張機能と競合する場合があります。問題が発生した場合は、他の拡張機能を一時的に無効にしてお試しください。

---

## 📁 ディレクトリ構成

```
Anti-YouTube-Shorts/
├── manifest.json          # 拡張機能の設定
├── background.js          # Service Worker
├── content_scripts/
│   ├── anti-shorts.js     # メイン処理（Singleton Pattern）
│   └── anti-shorts.css    # ブロックオーバーレイスタイル
├── popup/
│   ├── popup.html         # ポップアップUI
│   ├── popup.js           # ポップアップ制御
│   └── popup.css          # ポップアップスタイル
└── assets/
    ├── icons/             # アイコン画像
    └── font/              # カスタムフォント
```

---

## 📜 ライセンス

このプロジェクトは **MIT License** のもとで公開されています。  
商用・個人利用・改変すべて自由です。

---

<div align="center">

**Made with ❤️ to protect your time**

</div>
