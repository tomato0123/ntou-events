# 海大活動報名系統後端

使用 Node.js、Express 與 PostgreSQL。

## US-08 活動負責人（2026-11-15）

建立活動會將登入建立者保存為 `events.manager_id`；活動管理者只能查看本人負責活動的名單，admin 可查看全部。
舊活動的負責人先保持 NULL，僅 admin 可查名單，待團隊逐筆指定。
既有資料庫須先執行 `../database/add_events_manager_id.sql`，再啟動更新後的後端。
在本目錄執行 `npm.cmd run test:us08` 可驗證歸屬限制，不會寫入真實資料庫。
規格、遷移與原型登入限制請見 [活動負責人規格](../docs/event-ownership.md)。

US-08 名單 API 已改為每次查核資料庫目前角色；回應為 `{event_id,total_count,data}`，支援 `status=registered|cancelled`，活動 ID 嚴格限制為正 INTEGER。
測試使用 mock／注入 pool；正式登入及真實 PostgreSQL 整合驗證仍待完成。UI-06 頁面與串接契約見 [UI-06 文件](../docs/ui-06.md)。
遷移前後可用 `../database/verify_events_manager_id.sql` 唯讀檢查欄位與外鍵。
舊的 `test:us05`／`registrations-check.js` 會寫入現有資料庫，不應在正式資料上執行。

## UI-06 名單頁

啟動本伺服器後開啟 `/manager.html`；頁面使用 `/api/manage/events` 取得後端授權過濾的活動選單，再呼叫既有名單 API。首頁也提供「活動管理」入口。
正式登入仍待 US-02 串接；頁面沒有測試登入入口。執行 `npm.cmd run test:ui06` 驗證後端，`npm.cmd run preview:ui06` 啟動獨立 mock 預覽（8126 埠），開啟 `/preview` 或 `/__test__/runner` 驗證前端。

## 第一次使用

在終端機進入 server 資料夾，安裝套件：

```powershell
npm.cmd install
```

將 `.env.example` 複製一份，命名為 `.env`，填入自己電腦的資料庫連線設定。

注意：
- `.env` 包含資料庫密碼，不要上傳 GitHub。
- 需要先準備 PostgreSQL 資料庫及資料表（可使用 `database/schema.sql` 建立）。
- 下載專案不會自動建立資料庫，也不會取得其他人的資料庫資料。

## 檢查資料庫連線

```powershell
node --env-file=.env db-check.js
```

## 啟動後端

```powershell
node --env-file=.env index.js
```

開啟 http://127.0.0.1:8000/api/health 檢查是否正常運作。

---

## NTOU-US-07：建立活動

作為活動管理者或系統管理員，能建立並發布活動，以便讓校園使用者查看及報名。

### 核心功能與規範
- **端點**：`POST /api/events`（建立活動）、`GET /api/events`（公開列表查詢）、`GET /api/events/:id`（單一活動詳情）。
- **權限控制**：需在 Header 帶入 JWT Token（`Authorization: Bearer <token>`），且使用者角色必須為 `admin` 或 `event_manager`；一般使用者操作將回傳 `403 Forbidden`。
- **欄位檢核**：
  - 必填欄位：`title`（活動名稱）、`description`（說明）、`location`（地點）、`starts_at`（開始時間）、`ends_at`（結束時間）。缺漏時回傳 `400 Bad Request`。
  - 時間邏輯：檢查時間格式是否符合 ISO 8601，且 `ends_at` 必須晚於 `starts_at`。
  - 報名期間（若有設定）：報名截止時間需晚於報名開始時間，且不可晚於活動結束時間。

### 相關檔案
- `event-service.js`：活動欄位驗證、權限判斷與資料庫/儲存操作。
- `auth-middleware.js`：JWT 簽發、驗證與角色權限 Middleware。
- `events-check.js`：本機驗收測試程式（涵蓋服務層與 Express API 整合測試）。

### 執行 US-07 驗收測試

```powershell
node events-check.js
```
或搭配 `.env` 執行：
```powershell
node --env-file=.env events-check.js
```

測試涵蓋以下三項標準測試方法：
1. **建立合法活動**：以管理員/主辦人身分發布，確認訪客能透過公開 API 搜尋與查看。
2. **欄位缺漏與不合理時間設定**：驗證必填項缺漏、結束早於開始、無效格式皆能正確攔截並回傳 400。
3. **一般使用者嘗試建立活動**：驗證非管理者發布活動時操作遭拒絕（403 Forbidden），未帶 Token 則回傳 401。

---

## US-05：查看自己的報名與取消紀錄

目前已完成：
- 依使用者編號查詢報名紀錄。
- 回傳相關活動資訊。
- 包含 registered 與 cancelled 狀態。
- 沒有紀錄時回傳 {"data":[]}。

相關檔案：
- registration-service.js：查詢資料庫的功能。
- registrations-check.js：本機測試程式。

執行本機測試：

```powershell
node --env-file=.env registrations-check.js
```

---

## UI-02:活動詳情與線上報名頁

提供使用者查看單一活動完整資訊、報名期間與即時報名狀態，並可登入後進行線上報名。

### 核心功能與串接端點
- **單一活動詳情**：呼叫 `GET /api/events/:id` 取得活動資訊；若網址缺少 `id`、活動不存在或未公開則顯示錯誤提示。
- **線上報名**：呼叫 `POST /api/events/:id/registrations`（需在 Header 帶入 `Authorization: Bearer <token>`），依報名起訖與活動時間自動判斷開放狀態並鎖定按鈕。
- **前端預覽模式**：網址加上 `?mock=1`（例如 `/event-detail.html?mock=1`）可在未連線後端或資料庫無資料時預覽假資料 UI。

### 相關檔案
- 根目錄 `event-detail.html`、`event-detail.css`、`event-detail.js`：活動詳情與報名頁前端介面與互動邏輯。
- `tests/event-detail-test.js`：前端 DOM 結構、單一活動查詢與報名狀態互動測試（使用記憶體資料與注入 pool，不連線真實資料庫）。

### 執行活動詳情頁測試

在 `server` 目錄下執行：

```powershell
node --test tests/event-detail-test.js