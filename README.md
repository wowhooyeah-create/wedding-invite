# 林承宇 & 陳沛瑜 — 婚禮邀請函 + RSVP

> 接手這個 repo 的新人／新娘請先看 [`docs/HANDOFF.md`](docs/HANDOFF.md)（交接文件，非工程師也看得懂）。

單頁靜態網站：上半是深松綠半圈花環的婚禮邀請函，下半是米白卡片的出席意願表單，送出後寫進 Google Sheet。

技術：Vite 6+ / vanilla TypeScript，零框架；後端用 Google Apps Script Web App（`doPost` 寫入 Sheet），零伺服器；部署到 GitHub Pages。

## 本機開發

需要 Node 20（見 `.nvmrc`）。全域 Node 若不是 20，先切版本：

```bash
nvm use 20
npm install
npm run dev
```

開發模式下，如果 `.env.local` 沒有設定 `VITE_RSVP_ENDPOINT`，表單送出會改成在 console 印出 payload、模擬 800ms 後顯示成功畫面，不需要真的部署 Apps Script 也能測條件邏輯與三態顯示。

## 圖片壓縮

素材原始檔（去背 PNG）放在 `scripts/raw/`（不進版控，體積大）。改圖之後重新壓縮：

```bash
nvm use 20
npm run images
```

輸出到 `public/art/`，同時產生 WebP（主要格式，帶 alpha 透明）與 PNG fallback（給不支援 WebP 的舊瀏覽器）。腳本執行完會列出每張檔案大小，若超過 250KB 會印警告。

## 建置

```bash
nvm use 20
npm run build
```

`base` 設在 `vite.config.ts`，對應 GitHub Pages 子路徑 `/wedding-invite/`。本機要預覽 build 結果：`npm run preview`，開 `http://localhost:4173/wedding-invite/`。

## RSVP 表單 → Google Sheet

後端程式碼與部署步驟在 `apps-script/`：

- `apps-script/Code.gs`：Apps Script 原始碼，`doPost` 驗證必填欄位後 `appendRow` 寫入 Sheet，`setupStatsSheet` 建立「統計」工作表公式。
- `apps-script/README.md`：完整部署 SOP（建 Sheet → 貼程式碼 → 部署成 Web App → 把網址填進環境變數）。

環境變數：`.env.example` 列出需要的 `VITE_RSVP_ENDPOINT`，本機測試複製成 `.env.local` 並填入 Apps Script 部署後拿到的網址。

## 部署到 GitHub Pages

`.github/workflows/deploy.yml`：push 到 `main` 分支時自動 `npm ci` → `npm run build` → 部署到 GitHub Pages。`VITE_RSVP_ENDPOINT` 從 repo 的 GitHub Secrets 注入，不會出現在程式碼裡。

首次啟用需要（GitHub 網站上手動做，不在這次範圍內）：

1. Repo 設定 → Pages → Source 選「GitHub Actions」。
2. Settings → Secrets and variables → Actions → 新增 `VITE_RSVP_ENDPOINT`，值是 Apps Script 部署網址。
3. Push 到 `main`，Actions 分頁看部署進度，完成後網址是 `https://<github帳號>.github.io/wedding-invite/`。

> 目前是假資料，GitHub Pages 免費方案要 public repo。換成真實新人資料前，重新評估要升 GitHub Pro 還是改用支援 private repo 的 Cloudflare Pages。

## 目錄結構

```
index.html              頁面結構（hero / couple / details / rsvp / footer 五個 section）
src/style.css           樣式（CSS variables 做 design tokens）
src/main.ts             入口，載入樣式與 rsvp.ts，加捲動進場動效
src/rsvp.ts             RSVP 表單條件邏輯、驗證、蜜罐、送出三態
src/vite-env.d.ts       VITE_RSVP_ENDPOINT 的型別
scripts/optimize-images.mjs   圖片壓縮腳本（sharp）
scripts/raw/            素材原始檔（不進版控）
public/art/             壓縮後的 WebP + PNG fallback
apps-script/            Apps Script 原始碼與部署 SOP
docs/screenshots/       本機驗收截圖（不進版控）
design/                 設計資產與設計規格（給設計師調整版型/素材用，見 design/DESIGN-SPEC.md）
```

## 不包含在這次範圍

- 後台管理頁、登入、Email 或 LINE 通知
- 地圖嵌入（只放 Google Maps 連結）、倒數計時、照片牆、多語
- 真實新人資料與自訂網域
- 防同一人重複送出（Sheet 端用公式去重即可）
