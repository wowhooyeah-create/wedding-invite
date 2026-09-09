# Apps Script 部署 SOP

這份是 Chian 手動操作的步驟（Claude 不會幫你點 Google 帳號登入畫面）。全部在瀏覽器裡完成，不需要裝任何東西。

## 一、建立試算表與貼上程式碼

1. 到 Google Sheets 建一個新試算表，命名「婚禮 RSVP」。
2. 上方選單「擴充功能」→「Apps Script」，會開一個新分頁的 Apps Script 編輯器。
3. 把編輯器裡預設的 `Code.gs` 內容整個刪掉，貼上這個資料夾裡的 `Code.gs` 全部內容。
4. 按左上角的儲存（磁片圖示）。

## 二、跑一次 setupStatsSheet，建立「統計」工作表

1. 在 Apps Script 編輯器上方，函式下拉選單選 `setupStatsSheet`。
2. 按「執行」。第一次執行 Google 會跳授權畫面，選你的帳號 →「進階」→「前往（專案名稱）(不安全)」→「允許」。這是正常的，因為這是你自己寫的腳本，Google 對所有未發布的個人腳本都會這樣警告。
3. 執行完成後回到試算表分頁，應該會看到多一個「統計」工作表，裡面已經有公式。
4. 之後只要「資料表」（試算表裡第一個工作表）有新資料，「統計」工作表的數字會自動更新，不用重跑這個函式。除非你想清空重建統計表格式，才需要再跑一次。

## 三、部署成 Web App

1. Apps Script 編輯器右上角「部署」→「新增部署作業」。
2. 齒輪圖示選類型「網頁應用程式」。
3. 設定：
   - 說明：隨意，例如「wedding rsvp v1」
   - 執行身分：**我**（用你自己的 Google 帳號執行，寫入權限才夠）
   - 具有存取權的使用者：**任何人**（表單要讓沒登入 Google 的賓客也能送出）
4. 按「部署」，會再跳一次授權畫面，照第二步驟一樣允許。
5. 部署完成後會出現一個網頁應用程式網址（結尾通常是 `/exec`），把它整個複製起來。

## 四、把網址填進前端

1. 在 `D:\wedding-invite` 專案根目錄新增 `.env.production`（這個檔案不會進版控，`.gitignore` 已經排除 `.env*.local`；`.env.production` 若要進版控也沒關係，因為裡面只有一個公開的 Web App 網址，不是密鑰——但正式流程建議走 GitHub Actions 的 Secrets，見下）。
2. 本機測試用：`.env.production` 或 `.env.local` 寫一行：
   ```
   VITE_RSVP_ENDPOINT=https://script.google.com/macros/s/xxxxxxxx/exec
   ```
3. 正式部署（GitHub Pages）：把同一個網址存進 repo 的 GitHub Secrets，名稱 `VITE_RSVP_ENDPOINT`（Settings → Secrets and variables → Actions → New repository secret）。`.github/workflows/deploy.yml` 會在 build 時自動注入。

## 五、之後改東西要注意

- **改了 `Code.gs` 內容之後，一定要重新部署才會生效**：部署 → 管理部署作業 → 點編輯（鉛筆圖示）→ 版本選「新版本」→ 部署。只存檔（Ctrl+S）不會更新網址背後跑的程式碼，這是 Apps Script 最容易踩的坑。
- 如果之後前端表單欄位有增減，`Code.gs` 最上面的 `COLUMNS`（英文代碼鍵名）跟 `HEADERS`（中文表頭）兩個陣列要一起改，兩邊順序要對齊、也要跟 Sheet 欄位對齊；如果新欄位是代碼值（像 relation／attend／diet／cake 這種），記得在對應的 `*_MAP` 對照表補上中文翻譯，不然會直接寫入英文代碼原文。同時 `setupStatsSheet` 裡引用到的欄位字母（E、F、H、J、K、L、M、N…）跟公式裡比對的中文值，也要跟著重新對一次，不然統計公式會抓錯欄或抓不到資料。
- Apps Script 的 Web App 回應預設會 302 轉址到 `script.googleusercontent.com`，瀏覽器 `fetch` 預設會自動 follow，不用特別處理。
- 如果 `fetch` 一直失敗、Network 面板看起來卡在 CORS，先確認「具有存取權的使用者」是不是選了「任何人」而不是「僅限本機構的使用者」。

## 六、資料表欄位對照

試算表看到的表頭已經是中文；前端 `src/rsvp.ts` 送出的仍是英文代碼（groom／attend／meat 這種），代碼翻中文是 `Code.gs` 的 `doPost` 在寫入前做的，前端完全沒改。

| 欄位 | 中文表頭 | 對應表單欄位（前端送來的代碼） | 寫進試算表的中文值 |
| :-- | :-- | :-- | :-- |
| A | 填寫時間 | （伺服器自動產生） | 送出當下的時間 |
| B | 姓名 | `name` | 原樣寫入 |
| C | 與新人關係 | `relation` | groom→男方親友／bride→女方親友／mutual→共同朋友／other→其他 |
| D | 關係補充 | `relation_other` | 原樣寫入（關係為 other 時的說明） |
| E | 出席狀態 | `attend` | attend→出席／gift-only→禮到人不到／absent→無法出席 |
| F | 出席人數 | `party_size` | 1／2／3 照寫，4+→4 人以上 |
| G | 同行者備註 | `party_note` | 原樣寫入（4 人以上時列出的同行者姓名） |
| H | 飲食 | `diet` | meat→葷食／veg→全素／蛋奶素／other→其他 |
| I | 飲食補充 | `diet_note` | 原樣寫入（diet 為 other 時的說明） |
| J | 兒童椅（張） | `kids_chair` | 數字照寫，空字串維持空白（不會變 0） |
| K | 兒童餐具（份） | `kids_tableware` | 數字照寫，空字串維持空白（不會變 0） |
| L | 喜餅領取 | `cake` | onsite→現場領取／mail→郵寄／none→不需要 |
| M | 聯絡電話 | `phone` | 原樣寫入 |
| N | 郵寄地址 | `address` | 原樣寫入（cake=mail 時才有值） |
| O | 祝福與備註 | `blessing` | 原樣寫入 |
| P | 瀏覽器 | `user_agent` | 原樣寫入，除錯用 |

找不到對照的代碼（例如前端以後新增了新選項但這裡忘記補對照表）會原樣寫入該代碼本身，不會丟資料，方便日後回頭查漏掉哪個。

「統計」工作表的公式都是照這個欄位順序、比對中文值寫的（見 `Code.gs` 的 `setupStatsSheet`）。除了原本的統計數字，現在還多了「出席名單」「禮到人不到／無法出席名單」兩塊清單，版面配置：

| 區塊 | 欄位範圍 | 內容 |
| :-- | :-- | :-- |
| 統計數字 | A:C | 出席組數、出席總人數、各飲食人數、兒童椅／餐具張數 |
| 喜餅郵寄清單 | E:G | 姓名 / 電話 / 地址（喜餅領取＝郵寄） |
| 出席名單 | I:P | 姓名、關係、人數、飲食、兒童椅、餐具、電話、備註（出席狀態＝出席，依填寫時間排序） |
| 禮到人不到／無法出席名單 | R:V | 姓名、關係、出席狀態、喜餅領取、電話（出席狀態≠出席且姓名不為空） |

四塊分別佔用不同欄位區間，各自往下長不會互相覆蓋。

**改完 `Code.gs` 之後要做的三步**：
1. 把新內容整個貼回 Apps Script 編輯器（覆蓋掉舊的 `Code.gs`），Ctrl+S 存檔。
2. 「部署」→「管理部署作業」→ 點編輯（鉛筆圖示）→ 版本選「新版本」→「部署」（網址不會變，前端 `.env` 或 GitHub Secrets 不用改）。
3. 回到試算表，Apps Script 編輯器函式下拉選單選 `setupStatsSheet`，執行一次，讓「統計」工作表照新版公式重建。
