<p align="center">
  <a href="../README.md">English</a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="../web/images/brand/logo.svg" alt="hololive OFFICIAL CARD GAME" width="400">
</p>

<h3 align="center">Fan-made 練習網站</h3>

<p align="center">
  <strong>hololive OFFICIAL CARD GAME (hOCG)</strong> 的同人環境資料庫與線上對戰模擬器
</p>

<p align="center">
  <a href="https://hololive-official-cardgame.com" target="_blank">官方網站</a> ·
  <a href="https://github.com/hololive-cardgame/cards">卡牌資料庫</a> ·
  <a href="https://www.holocardstrategy.jp/">ホロカ攻略ギルド</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/卡牌-1%2C052-blue?style=flat-square" alt="Cards">
  <img src="https://img.shields.io/badge/效果-1%2C300%2B-green?style=flat-square" alt="Effects">
  <img src="https://img.shields.io/badge/語言-4-orange?style=flat-square" alt="Languages">
  <img src="https://img.shields.io/badge/授權-MIT-brightgreen?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/框架-vanilla%20JS-yellow?style=flat-square" alt="Vanilla JS">
</p>

---

## 功能特色

### 環境資料庫

- **環境排名** — 根據大賽結果的牌組排名
- **牌組攻略** — 大賽得獎牌組配方與策略解析
- **大賽數據** — 官方與社群大賽結果
- **卡片搜尋** — 瀏覽全部 1,052 張卡牌，支援顏色、類型、綻放等級、標籤篩選
- **規則教學** — 完整規則指南（附圖解）
- **多語言** — 繁體中文 / English / 日本語 / Français

### 對戰模擬器

- **完整規則實作** — 6 個階段：重置 → 抽牌 → 應援 → 主要 → 表演 → 結束
- **1,300+ 效果處理器** — 卡牌效果自動化，含玩家選擇 UI
- **本地雙人** — 同螢幕輪流操作
- **線上對戰** — 基於 WebSocket 的區網/網路對戰，支援房間代碼
- **拖曳放置** — 拖曳放置成員、綻放、裝備支援卡、聯動
- **牌組選擇** — 從官方/大賽牌組配方中選擇
- **骰子 UI** — 視覺化骰子效果
- **傷害動畫** — 浮動傷害數字、擊倒閃紅

### 卡牌效果系統

| 層級 | 說明 | 覆蓋範圍 |
|------|------|----------|
| 模板 | 模式匹配處理器（傷害加成、搜尋、吶喊等） | ~400 張 |
| 卡牌專用 | 針對複雜效果的專用處理器 | ~600 張 |
| 選擇 UI | 展示/搜尋/存檔的玩家選擇介面 | 70+ 個提示 |
| 放回排序 | 放回牌組下方時選擇順序 | 33 張 |
| 手動調整 | 邊界情況的備用面板 | 全部卡牌 |

---

## 技術架構

| 元件 | 技術 |
|------|------|
| 前端 | 原生 ES Modules（無框架、無建置步驟） |
| 遊戲引擎 | 純函數狀態機 `(state, action) → newState` |
| 渲染 | DOM + CSS（基於遊戲墊的棋盤佈局） |
| 多人連線 | Node.js + `ws` WebSocket 伺服器 |
| 資料 | JSON（卡牌、牌組、大賽、首頁） |
| 爬蟲 | Python 腳本（卡牌資料與首頁更新） |
| 多語言 | i18n 即時語系切換 |

---

## 快速開始

### 前置需求

- **Node.js** ≥ 18
- **Python** ≥ 3.9

### 安裝

```bash
git clone https://github.com/H2KFORGIVEN/hololive-cardgame-fanmade.git
cd hololive-cardgame-fanmade
npm install
```

### 啟動（本地）

```bash
# 啟動網頁伺服器
npm run serve
# 開啟 http://localhost:8080
```

### 啟動（線上對戰）

```bash
# 終端 1：啟動 WebSocket 伺服器
npm run server

# 終端 2：啟動網頁伺服器
npm run serve

# 玩家 1：http://localhost:8080/game/ → 線上對戰 → 建立房間
# 玩家 2：http://<IP>:8080/game/ → 線上對戰 → 輸入房間碼
```

### 更新首頁內容

```bash
npm run update:homepage
```

---

## 遊戲架構

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  客戶端 A   │◄───►│  WS 伺服器   │◄───►│  客戶端 B   │
│ （瀏覽器）  │ WS  │  (Node.js)   │ WS  │ （瀏覽器）  │
├─────────────┤     ├──────────────┤     ├─────────────┤
│  遊戲棋盤   │     │  遊戲引擎    │     │  遊戲棋盤   │
│  操作面板   │     │  效果系統    │     │  操作面板   │
│  WS 適配器  │     │  房間管理    │     │  WS 適配器  │
└─────────────┘     │  狀態過濾    │     └─────────────┘
                    └──────────────┘
```

**伺服器權威制**：伺服器執行 `GameEngine`，驗證所有動作，並向每位玩家廣播過濾後的狀態（對手手牌/牌組隱藏）。

---

## 開發藍圖

- [x] Phase 1A — 核心對戰系統（6 階段、全部動作）
- [x] Phase 1B — 1,300+ 卡牌效果處理器與選擇 UI
- [x] Phase 1C — 動畫、拖曳放置、骰子 UI、傷害特效
- [x] Phase 2A — WebSocket 線上對戰（房間代碼）
- [x] 首頁 — 從官網動態更新內容
- [ ] Phase 2B — 斷線重連、觀戰模式
- [ ] Phase 3 — Electron 桌面應用程式（DMG / EXE）
- [ ] Phase 4 — 雲端伺服器部署

---

## 資料來源

- [hololive OFFICIAL CARD GAME](https://hololive-official-cardgame.com) — 官方遊戲網站
- [hololive-cardgame/cards](https://github.com/hololive-cardgame/cards) — 社群卡牌資料庫（1,600+ 筆、4 種語言）
- [ホロカ攻略ギルド](https://www.holocardstrategy.jp/) — 攻略、環境排名與大賽數據
- [Bushiroad Deck Log](https://decklog-en.bushiroad.com/) — 官方牌組配方

---

## 免責聲明

> 本專案為**同人作品**，僅供練習與教育用途。
> 與 COVER Corp.、Bushiroad、hololive production 無任何關聯或背書。
> 所有卡牌資料、圖片及遊戲規則均為其各自所有者之財產。
>
> © 2016 COVER Corp. / hololive OFFICIAL CARD GAME

---

<p align="center">
  <sub>使用原生 JavaScript 建置 — 不用框架、不用建置工具，就像真正的卡牌遊戲一樣，保持簡單。</sub>
</p>
