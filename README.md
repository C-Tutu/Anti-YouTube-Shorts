<div align="center">

<img src="assets/icons/icon128.png" alt="Anti YouTube Shorts Logo" width="120" style="border-radius:20px;"><br>

# 🚫 Anti YouTube Shorts

**YouTube のショート動画を非表示にして、あなたの大切な時間を守ります。**  
“つい見ちゃう”を卒業し、より穏やかなネット体験を。

![GitHub last commit](https://img.shields.io/github/last-commit/C-Tutu/anti-youtube-shorts?color=brightgreen)
![Version](https://img.shields.io/badge/version-2.2.1-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

</div>

---

## 🧩 概要

**Anti YouTube Shorts**は、YouTube 上に表示されるショート動画（Shorts）を自動的に非表示にする
Chrome 拡張機能です。検索結果やサイドバー、タグ領域に現れるショートまで、すべてをまとめて非表示にし、
あなたの大切な時間を守ります。

一時的にオフにすると、グラスモーフィズム風の**復元ローディング**が表示され、
5 秒後にショートが再び表示されます。

---

## ✨ 主な特徴

-   🎬 **YouTube Shorts を完全非表示**
    -   ホーム / 検索結果 / タグ / サイドバー すべて対応。
-   🔄 **ワンクリック切替**
    -   拡張アイコンから「ON / OFF」を即時切替。
-   ⏳ **復元時ローディング**
    -   オフにすると 5 秒間のグラスモーフィズム UI が現れ、誘惑抑制。
-   🌙 **軽量・シンプル**
    -   DOM 監視最適化済み、再描画ループなし。
-   🧠 **自動再試行**
    -   YouTube の動的ロードにも自動対応。

---

## 📦 ダウンロードと導入手順

以下の手順で、Chrome / Edge / Brave 等の Chromium 系ブラウザに導入できます。

### ✅ 1. ダウンロード

1. このリポジトリ右上の **「Code → Download ZIP」** をクリック。
2. ZIP を展開し、フォルダ名が `anti-youtube-shorts-main` などになっていることを確認。

### ⚙️ 2. 拡張機能を読み込む

1. Chrome アドレスバーに以下を入力し開く：
   `chrome://extensions/`
2. 右上の「デベロッパーモード」を ON にする。
3. 「パッケージ化されていない拡張機能を読み込む」をクリック。
4. 展開したフォルダ（例：anti-youtube-shorts-main/）を選択。

### 🎛️ 3. 動作確認

1. [YouTube](https://www.youtube.com/) を開く。
2. ツールバーから本アイコンをクリック。
3. トグルスイッチで「Shorts を非表示 / 表示」を切り替え。

-   ✅ ON → ショート動画が全て消えます
-   ❎ OFF → 「ショートを復元中...」が 5 秒表示されたあと再表示されます

### 💬 よくある質問

#### Q. Shorts が消えないページがあります。

→ YouTube 側の DOM 構造が変わった可能性があります。拡張機能を一度 OFF→ON にして再試行してください。

#### Q. スタイルが崩れます。

→ 他の YouTube 関連拡張と競合している場合があります。「Anti YouTube Shorts」を優先的に動作させてください。

### 📜 ライセンス

このプロジェクトは MIT License
のもとで公開されています。
商用・個人利用・改変すべて自由です。
