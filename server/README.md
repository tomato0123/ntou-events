# 海大活動報名系統後端

使用 Node.js、Express 與 PostgreSQL，API Base URL 為 `http://127.0.0.1:8000/api`。

## 第一次使用

在 `server/` 安裝套件：

```powershell
npm.cmd install
```

將 `.env.example` 複製為 `.env`，設定 PostgreSQL 連線資料及 `JWT_SECRET`。`.env` 含密碼與密鑰，不可提交至 Git。

新資料庫請執行 `database/schema.sql`。既有資料庫若尚未建立防重複報名索引，請先備份，再執行 `database/add_registrations_one_active.sql`；若已有重複有效報名，腳本會停止且不會自行刪除資料。

## 啟動與測試

```powershell
npm.cmd test
npm.cmd start
```

健康檢查：`GET http://127.0.0.1:8000/api/health`

## US-03：活動報名與結果確認

以下 API 都從 JWT Bearer Token 取得登入者編號，不接受前端傳入 `user_id`。JWT payload 可使用 `sub`、`id` 或 `user_id` 保存正整數使用者編號，簽章演算法為 HS256。

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

同一使用者對同一活動只能有一筆 `registered` 紀錄；重複報名回傳 `409`。取消紀錄不受唯一索引限制，因此取消後可新增一筆報名並保留原紀錄。

### 查看自己的報名結果與歷程

```http
GET /api/users/me/registrations
Authorization: Bearer <jwt>
```

回傳內容同時包含 `registered` 與 `cancelled`，並依 `registered_at DESC, id DESC` 排序。沒有紀錄時回傳：

```json
{ "data": [] }
```

所有錯誤統一為：

```json
{ "error": "錯誤原因描述" }
```

本實作依據團隊的資料庫與 API 規格，不包含尚未存在於資料表的名額、候補或取消時間欄位。
