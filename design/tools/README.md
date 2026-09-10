# unwhite.js — 白底去背腳本

把白底（近白、帶紙紋）的 JPG 花簇素材，依四角背景色去背，輸出透明背景 PNG。用在 `design/assets/raw/` 裡的原始水彩素材。

## 安裝

```bash
cd design/tools
npm i
```

## 用法

**這個腳本不吃命令列參數**，是寫死清單處理固定 6 個檔名：

```bash
node unwhite.js
```

跑完會印出每張的背景色、透明像素比例、驗證結果（四角是否全透明、中心是否有不透明像素）。

### 重要：輸入/輸出路徑是寫死的相對路徑

腳本內 `ASSETS_DIR = path.resolve(__dirname, '..')`，也就是**腳本自己所在目錄的上一層**。以現在 `design/tools/unwhite.js` 的位置來說，`ASSETS_DIR` 會解析成 `design/`，**不是** `design/assets/`。

腳本內 `FILES` 陣列寫死這 6 個檔名（副檔名必須是 `.jpg`）：

```
corner-large.jpg
corner-small.jpg
garland-horizontal.jpg
garland-vertical.jpg
wreath-half.jpg
wreath-corner-pinecone.jpg
```

若要重新對某張素材跑去背，實際步驟：

1. 把要處理的白底原圖改名成上面對應的 `.jpg` 檔名（`design/assets/raw/` 裡現在放的是 `.jfif`，內容其實就是 JPEG，複製一份改副檔名即可，不用重新編碼）。
2. 把改名後的 `.jpg` 放到 `design/`（`tools/` 的上一層），不是 `design/assets/`。
3. 在 `design/tools/` 執行 `node unwhite.js`。
4. 輸出的同名 `.png` 會出現在 `design/` 底下，跑完自己搬到 `design/assets/`，原始 `.jpg` 用完可以刪掉或搬回 `design/assets/raw/`。

也可以視需要直接改 `unwhite.js` 開頭的 `ASSETS_DIR` 或 `FILES`，讓路徑對應現在的 `design/assets/` 結構，比每次手動搬檔案省事。

## 演算法（腳本內註解摘要）

1. 取四個角落各 40×40 像素，逐通道算中位數 → 背景色 `bg`
2. 每像素算 `d = max(|r-bg.r|, |g-bg.g|, |b-bg.b|)`
3. `alpha = smoothstep(d, 12, 70)`：差異小於等於 12 全透明，大於等於 70 全不透明，中間平滑內插
4. 反預乘還原真實色值：`c' = clamp((c - (1-alpha)*bg) / alpha)`，alpha=0 時 `c'=0`
5. 輸出同名 `.png`

## 已知限制

- 白色系花瓣（五瓣小白花）去背後會偏半透明，深底卡片上顏色會偏淡；若要更乾淨的白花，需要請圖像生成工具重出「非白底」版本，這個腳本本身無法解決。
- 依賴 `jpeg-js` 解碼，只認得 JPEG 內容（`.jfif` 只是副檔名不同，本質也是 JPEG，可以直接複製改名使用）。
