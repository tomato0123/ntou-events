# 海大活動報名系統後端

使用 Node.js、Express 與 PostgreSQL。

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

## US-04：取消本人報名

登入者可取消自己的有效報名：

```http
DELETE /api/users/me/registrations/51
Authorization: Bearer <jwt>
```

成功時回傳：

```json
{
  "message": "取消報名成功",
  "data": {
    "id": 51,
    "user_id": 7,
    "event_id": 101,
    "status": "cancelled",
    "registered_at": "2026-11-01T08:00:00.000Z"
  }
}
```

後端會從 JWT 取得使用者編號，並只更新同時符合下列條件的紀錄：

- 報名編號與網址中的 `:id` 相同。
- `user_id` 屬於目前登入者。
- 狀態仍為 `registered`。

別人的、已取消或不存在的報名都回傳 `404`；無效報名編號回傳 `400`。
執行 US-04 測試：

```powershell
npm.cmd run test:us04
```
