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
- 如果之後前端表單欄位有增減，`Code.gs` 最上面的 `COLUMNS` 陣列要跟著改，順序要跟 Sheet 欄位對齊；同時 `setupStatsSheet` 裡引用到的欄位字母（E、F、H、J、K、L、M、N…）也要跟著重新對一次，不然統計公式會抓錯欄。
- Apps Script 的 Web App 回應預設會 302 轉址到 `script.googleusercontent.com`，瀏覽器 `fetch` 預設會自動 follow，不用特別處理。
- 如果 `fetch` 一直失敗、Network 面板看起來卡在 CORS，先確認「具有存取權的使用者」是不是選了「任何人」而不是「僅限本機構的使用者」。

## 六、資料表欄位對照

| 欄位 | 對應表單欄位 | 說明 |
| :-- | :-- | :-- |
| A timestamp | （伺服器自動產生） | 送出當下的時間 |
| B name | `name` | 姓名 |
| C relation | `relation` | groom／bride／mutual／other |
| D relation_other | `relation_other` | 關係為 other 時的說明 |
| E attend | `attend` | attend／gift-only／absent |
| F party_size | `party_size` | 1／2／3／4+ |
| G party_note | `party_note` | 4+ 時列出的同行者姓名 |
| H diet | `diet` | meat／veg／other |
| I diet_note | `diet_note` | diet 為 other 時的說明 |
| J kids_chair | `kids_chair` | 兒童椅張數 |
| K kids_tableware | `kids_tableware` | 兒童餐具份數 |
| L cake | `cake` | onsite／mail／none |
| M phone | `phone` | 聯絡電話 |
| N address | `address` | 郵寄地址（cake=mail 時才有值） |
| O blessing | `blessing` | 祝福與備註 |
| P user_agent | `user_agent` | 瀏覽器資訊，除錯用 |

「統計」工作表的公式都是照這個欄位順序寫的（見 `Code.gs` 的 `setupStatsSheet`）。
