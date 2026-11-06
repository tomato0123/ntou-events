# 活動報名與結果確認｜JavaScript 後端

純後端 REST API，使用 Node.js、內建 HTTP 模組與 SQLite，沒有前端頁面，也不需要安裝第三方套件。實作範圍為附件中的使用者活動報名、報名結果查詢、我的報名及取消流程。

## 啟動

使用 **Node.js 24.12 以上的 24.x 版本**；本專案已在 24.12.0 驗證。無須執行 `npm install`。

在專案資料夾執行：

```sh
npm run seed
npm start
```

API 預設位址：`http://127.0.0.1:3000`。可用 `GET /api/health` 檢查是否啟動成功。根路徑 `/` 沒有網頁。

`npm run seed` 會新增三場測試活動，活動時間以第一次新增時的伺服器時間向後推算，初始沒有任何報名。重複執行不會覆寫活動時間或報名紀錄。

| 活動 ID | 正取名額 | 額滿後候補 |
| --- | ---: | --- |
| `ocean-workshop` | 2 | 開放 |
| `career-talk` | 1 | 不開放 |
| `coastal-walk` | 30 | 開放 |

若需要調整範例，修改 `src/database.js` 的 `seedDatabase`。既有活動不會被 seed 覆寫；請使用新的活動 ID 新增。

Node.js 24.12.0 的 `node:sqlite` 可能顯示 ExperimentalWarning，仍可正常執行。相關介面見 [Node.js SQLite 文件](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)。

## 功能

- 註冊、登入、登出與取得本人資料。密碼經 scrypt 加鹽雜湊，登入採用 8 小時有效的 Bearer session token，資料庫僅保留 token 的 SHA-256 雜湊。
- 公開活動列表與詳情，支援搜尋、分類及分頁。
- 登入後報名：有名額時正取，額滿後依活動設定登記候補或回傳額滿。
- 查詢自己的報名結果、候補名次及全部／指定狀態的報名紀錄。
- 活動開始前可取消。正取取消時，依報名順序將最早的候補遞補為正取；候補名次會動態更新。
- 取消紀錄保留；取消後可在報名期間重新報名，會產生新的編號並重新排隊。
- 防止重複報名、超過名額、冒用他人 ID、查詢或取消他人的報名。

## 測試與呼叫範例

```sh
npm test
```

測試使用獨立的記憶體或暫存資料庫，會啟動本機 HTTP 伺服器，不會修改正式的 `data/events.sqlite`。

伺服器啟動後，在另一個終端機執行完整呼叫範例：

```sh
npm run example
```

範例會建立一個虛構測試帳號，完成「報名 → 查詢我的報名 → 取消 → 登出」，並保留測試帳號及取消紀錄。此腳本不輸出 token 或密碼。

手動測試可以參考 `requests.http`；完整請求與回應格式請看 [API.md](API.md)。

## 設定

可將 `.env.example` 複製為 `.env` 後調整：

| 環境變數 | 預設值 | 說明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 預設僅接受本機連線 |
| `PORT` | `3000` | HTTP 埠號 |
| `DATABASE_PATH` | `./data/events.sqlite` | SQLite 資料庫檔案，以啟動目錄為基準 |
| `ALLOWED_ORIGINS` | 空白 | 可呼叫 API 的瀏覽器來源，以逗號分隔，例如 `http://localhost:5173` |

跨來源的前端需設定 `ALLOWED_ORIGINS`，請填完整來源且不要加結尾斜線。Postman、curl 或程式呼叫不需要設定 CORS。API 回傳時間為 ISO 8601 UTC 格式；前端可轉換為台灣時間顯示。

## 名額與結果規則

1. 使用者身分取自登入 token，報名端點不接受 `userId` 或 `status` 等欄位。
2. 報名時間區間為 `registrationOpensAt <= 現在 < registrationClosesAt`。到截止時間當下即拒絕新報名。
3. 每個使用者對同一活動最多一筆有效報名，由資料庫的部分唯一索引保護。
4. 使用 SQLite `BEGIN IMMEDIATE` 交易，將計算名額、判定狀態與寫入報名一起完成。候補不佔正取名額。
5. 候補順序使用資料庫遞增序號，不受同一時間戳記的先後不明影響。
6. 正取取消後，在同一交易中自動遞補；報名截止後但活動開始前仍會遞補已在隊列中的候補。
7. 取消採用軟刪除，重複取消回傳相同取消結果，不會重複釋出名額。活動開始後拒絕新取消。

## 檔案結構

```text
src/
  server.js          啟動、環境設定與關閉
  app.js             HTTP 路由、JSON、CORS、IP 限流與錯誤處理
  auth.js            帳號、密碼與登入 session
  registrations.js   活動、報名、結果查詢、取消與候補遞補
  database.js        資料表、索引、交易與示範活動
  validation.js      欄位與分頁驗證
  errors.js          統一錯誤類型
scripts/
  seed.js            新增示範活動
  example.js         API 完整呼叫範例
tests/
  api.test.js        HTTP 整合測試
  database.test.js   檔案持久化及多連線同時報名測試
  registration-worker.js  獨立資料庫連線測試工作執行緒
```

資料庫包含 `users`、`sessions`、`events`、`registrations` 四張表。SQL 使用參數綁定；報名結果不包含他人的個人資料。密碼處理參考 [Node.js crypto 文件](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)。

## 範圍

此交付包含可執行的本機後端及測試活動，不含前端、校務 SSO、信箱驗證、電子郵件通知、管理者建立活動／名單匯出 API。註冊的 `identity` 僅為使用者填寫的身分標籤，不授予管理權限。

若接入既有登入系統，可替換 `AuthService.authenticate`，保留以驗證過的使用者 ID 呼叫 `RegistrationService` 的流程。

SQLite 資料需存於可持久化的本機磁碟。正式對外服務應由 HTTPS 反向代理提供連線；本程式的登入限流為單一程序的記憶體計數，不會跨機器共用，也不信任 `X-Forwarded-For`。此處未配置正式部署環境。
