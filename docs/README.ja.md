<p align="center">
  <a href="../README.md">English</a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="../web/images/brand/logo.svg" alt="hololive OFFICIAL CARD GAME" width="400">
</p>

<h3 align="center">Fan-made 練習サイト</h3>

<p align="center">
  <strong>hololive OFFICIAL CARD GAME (hOCG)</strong> のファンメイド環境データベース＆オンラインバトルシミュレーター
</p>

<p align="center">
  <a href="https://hololive-official-cardgame.com" target="_blank">公式サイト</a> ·
  <a href="https://github.com/hololive-cardgame/cards">カードデータベース</a> ·
  <a href="https://www.holocardstrategy.jp/">ホロカ攻略ギルド</a>
</p>

<p align="center">
  <a href="https://h2kforgiven.github.io/hololive-cardgame-fanmade/">
    <img src="assets/btn-browser.jpg" alt="Open Browser" height="80">
  </a>
  <a href="https://github.com/H2KFORGIVEN/hololive-cardgame-fanmade/releases">
    <img src="assets/btn-macos.jpg" alt="Download macOS" height="80">
  </a>
  <a href="https://github.com/H2KFORGIVEN/hololive-cardgame-fanmade/releases">
    <img src="assets/btn-windows.jpg" alt="Download Windows" height="80">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/カード-1%2C052-blue?style=flat-square" alt="Cards">
  <img src="https://img.shields.io/badge/エフェクト-1%2C300%2B-green?style=flat-square" alt="Effects">
  <img src="https://img.shields.io/badge/言語-4-orange?style=flat-square" alt="Languages">
  <img src="https://img.shields.io/badge/ライセンス-MIT-brightgreen?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/フレームワーク-vanilla%20JS-yellow?style=flat-square" alt="Vanilla JS">
</p>

> [!NOTE]
> カード効果は現在も修正・改善中です。一部の効果が正しく動作しない場合や、手動調整が必要な場合があります。バグ報告や修正への協力を歓迎します！

---

## 機能

### 環境データベース

- **Tier リスト** — 大会結果に基づくデッキランキング
- **デッキガイド** — 大会優勝デッキレシピと戦略解説
- **大会データ** — 公式・コミュニティ大会の結果
- **カード検索** — 1,052 種のカードを色・タイプ・ブルームレベル・タグでフィルタ
- **ルール教室** — 図解付きの完全ルールガイド
- **多言語対応** — 繁體中文 / English / 日本語 / Français

### バトルシミュレーター

- **完全ルール実装** — 全6フェーズ：リセット → ドロー → エール → メイン → パフォーマンス → エンド
- **1,300 以上のエフェクトハンドラー** — カード効果を自動処理、プレイヤー選択UI付き
- **ローカル2人対戦** — 同じ画面で交互にプレイ
- **オンライン対戦** — WebSocket ベースの LAN / インターネット対戦（ルームコード対応）
- **ドラッグ＆ドロップ** — メンバー配置、ブルーム、サポート装備、コラボをドラッグで操作
- **デッキ選択** — 公式 / 大会デッキレシピから選択
- **ダイス UI** — 視覚的なダイスロール演出
- **ダメージアニメーション** — フローティングダメージ数値、ノックダウンフラッシュ

### カードエフェクトシステム

| レイヤー | 説明 | カバー範囲 |
|----------|------|-----------|
| テンプレート | パターンマッチハンドラー（ダメージブースト、サーチ、エール等） | 約400枚 |
| カード専用 | 複雑な効果の専用ハンドラー | 約600枚 |
| 選択 UI | 公開・サーチ・アーカイブの選択インターフェース | 70以上のプロンプト |
| 並び替え | デッキ下に戻す際の順番選択 | 33枚 |
| 手動調整 | エッジケース用のフォールバックパネル | 全カード |

---

## 技術スタック

| コンポーネント | 技術 |
|---------------|------|
| フロントエンド | ネイティブ ES Modules（フレームワーク・ビルドステップ不要） |
| ゲームエンジン | 純粋関数ステートマシン `(state, action) → newState` |
| レンダリング | DOM + CSS（プレイシートベースのボードレイアウト） |
| マルチプレイヤー | Node.js + `ws` WebSocket サーバー |
| データ | JSON（カード、デッキ、大会、ホームページ） |
| スクレイピング | Python スクリプト（カードデータ・ホームページ更新） |
| 多言語 | i18n ランタイムロケール切り替え |

---

## はじめ方

### 前提条件

- **Node.js** ≥ 18
- **Python** ≥ 3.9

### インストール

```bash
git clone https://github.com/H2KFORGIVEN/hololive-cardgame-fanmade.git
cd hololive-cardgame-fanmade
npm install
```

### 起動（ローカル）

```bash
# Web サーバーを起動
npm run serve
# http://localhost:8080 を開く
```

### 起動（オンライン対戦）

```bash
# ターミナル 1：WebSocket サーバーを起動
npm run server

# ターミナル 2：Web サーバーを起動
npm run serve

# プレイヤー 1：http://localhost:8080/game/ → オンライン対戦 → ルーム作成
# プレイヤー 2：http://<IP>:8080/game/ → オンライン対戦 → ルームコード入力
```

### ホームページ更新

```bash
npm run update:homepage
```

---

## ゲームアーキテクチャ

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│ クライアントA │◄───►│  WS サーバー  │◄───►│ クライアントB │
│（ブラウザ）   │ WS  │  (Node.js)    │ WS  │（ブラウザ）   │
├──────────────┤     ├───────────────┤     ├──────────────┤
│ ゲームボード  │     │ ゲームエンジン │     │ ゲームボード  │
│ アクションパネル│     │ エフェクト     │     │ アクションパネル│
│ WS アダプター │     │ ルーム管理     │     │ WS アダプター │
└──────────────┘     │ ステート編集   │     └──────────────┘
                     └───────────────┘
```

**サーバー権威制**：サーバーが `GameEngine` を実行し、すべてのアクションを検証。各プレイヤーには編集済みのステートをブロードキャスト（相手の手札・デッキは非公開）。

---

## ロードマップ

- [x] Phase 1A — コアバトルシステム（6フェーズ、全アクション）
- [x] Phase 1B — 1,300以上のカードエフェクトハンドラーと選択UI
- [x] Phase 1C — アニメーション、ドラッグ＆ドロップ、ダイスUI、ダメージ演出
- [x] Phase 2A — WebSocket オンライン対戦（ルームコード）
- [x] ホームページ — 公式サイトからの動的コンテンツ更新
- [ ] Phase 2B — 再接続、観戦モード
- [ ] Phase 3 — Electron デスクトップアプリ（DMG / EXE）
- [ ] Phase 4 — クラウドサーバーデプロイ

---

## データソース

- [hololive OFFICIAL CARD GAME](https://hololive-official-cardgame.com) — 公式ゲームサイト
- [hololive-cardgame/cards](https://github.com/hololive-cardgame/cards) — コミュニティカードデータベース（1,600件以上、4言語）
- [ホロカ攻略ギルド](https://www.holocardstrategy.jp/) — 攻略、Tierリスト＆大会データ
- [Bushiroad Deck Log](https://decklog-en.bushiroad.com/) — 公式デッキレシピ

---

## 免責事項

> 本プロジェクトは**ファンメイド**であり、練習・教育目的で作成されています。
> COVER Corp.、ブシロード、ホロライブプロダクションとは一切関係ありません。
> すべてのカードデータ、画像、ゲームルールは各権利者の所有物です。
>
> © 2016 COVER Corp. / hololive OFFICIAL CARD GAME

---

<p align="center">
  <sub>バニラ JavaScript で構築 — フレームワークなし、ビルドツールなし。リアルカードゲームのようにシンプルに。</sub>
</p>
