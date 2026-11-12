# 海大活動報名系統後端

使用 Node.js、Express 與 PostgreSQL，API Base URL 為 `http://127.0.0.1:8000/api`。

## 第一次使用

在 `server/` 安裝套件：

```powershell
npm.cmd install
```

將 `.env.example` 複製為 `.env`，設定 PostgreSQL 連線資料及至少 32 字元的 `JWT_SECRET`。`.env` 含密碼與密鑰，不可提交至 Git。

新資料庫請執行 `database/schema.sql`。既有資料庫若尚未建立防重複報名索引，請先備份，再執行 `database/add_registrations_one_active.sql`；若已有重複有效報名，腳本會停止且不會自行刪除資料。

## 啟動與測試

```powershell
npm.cmd test
npm.cmd start
```

也可以分別執行：

```powershell
npm.cmd run test:us03
npm.cmd run test:us07
npm.cmd run test:us05
```

`test:us05` 會連接本機 PostgreSQL，需先完成 `.env` 與資料庫設定。健康檢查為 `GET /api/health`。

## 身分驗證

原型登入端點為 `POST /api/auth/login`。受保護的 API 必須帶入：

```http
Authorization: Bearer <jwt>
```

後端會從 JWT 的 `sub`、`id` 或 `user_id` 取得正整數使用者編號，不接受前端自行指定 `user_id`。

## US-03：活動報名與結果確認

### 報名活動

```http
POST /api/events/101/register
Authorization: Bearer <jwt>
```

成功回傳 `201 Created`：

```json
{
  "message": "報名成功",
  "data": {
    "id": 5001,
    "user_id": 1,
    "event_id": 101,
    "status": "registered",
    "registered_at": "2026-10-21T12:30:00.000Z"
  }
}
```

同一使用者對同一活動只能有一筆 `registered` 紀錄；重複報名回傳 `409`。取消紀錄不受唯一索引限制，因此取消後可重新報名並保留舊紀錄。

### 查看自己的報名結果與歷程

```http
GET /api/users/me/registrations
Authorization: Bearer <jwt>
```

回傳同時包含 `registered` 與 `cancelled`，依 `registered_at DESC, id DESC` 排序；沒有紀錄時回傳 `{ "data": [] }`。錯誤格式統一為 `{ "error": "錯誤原因描述" }`。

目前資料表沒有名額、候補或取消時間欄位，因此 US-03 不處理這些尚未定義的資料。

## US-07：建立與查詢活動

- `GET /api/events`：公開查詢活動，可用 `search` 查詢參數。
- `GET /api/events/:id`：公開查看活動詳情。
- `POST /api/events`：僅 `admin` 或 `event_manager` 可建立活動。

`event-service.js` 負責活動欄位驗證與資料存取，`events-check.js` 為本機驗收測試。

## US-05：查看報名與取消紀錄

`registration-service.js` 依登入者編號查詢報名紀錄及活動資訊，包含 `registered` 與 `cancelled` 狀態；`registrations-check.js` 可用真實資料庫進行本機檢查。
