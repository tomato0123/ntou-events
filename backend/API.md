# API 使用說明

Base URL：`http://127.0.0.1:3000`

所有成功回應使用 `{ "success": true, "data": ... }`。錯誤使用：

```json
{
  "success": false,
  "error": {
    "code": "ALREADY_REGISTERED",
    "message": "你已報名此活動。",
    "details": { "registrationId": "原本的報名 ID" },
    "requestId": "追蹤此次請求用的 UUID"
  }
}
```

`details` 僅在有補充資訊時提供。除 OPTIONS 預檢 204 外，所有回應都是 JSON。

## 端點

| 方法 | 路徑 | 登入 | 用途 |
| --- | --- | --- | --- |
| GET | `/api/health` | 不需 | 健康檢查 |
| POST | `/api/auth/register` | 不需 | 註冊，成功後取得 token |
| POST | `/api/auth/login` | 不需 | 登入取得 token |
| POST | `/api/auth/logout` | 需要 | 使目前 token 失效 |
| GET | `/api/me` | 需要 | 取得本人資料 |
| GET | `/api/events` | 不需 | 活動列表與搜尋 |
| GET | `/api/events/:eventId` | 不需 | 活動詳情及剩餘名額 |
| POST | `/api/events/:eventId/registrations` | 需要 | 報名活動 |
| GET | `/api/registrations/me` | 需要 | 我的報名結果列表 |
| GET | `/api/registrations/:registrationId` | 需要 | 單筆結果，限本人 |
| DELETE | `/api/registrations/:registrationId` | 需要 | 取消報名，限本人 |

需要登入時，請加入 `Authorization: Bearer <token>`。傳送 JSON 時加入 `Content-Type: application/json`。JSON 物件上限 16 KiB，不支援的欄位會被拒絕。

## 1. 註冊

`POST /api/auth/register`

```json
{
  "name": "測試同學",
  "studentId": "B12345678",
  "email": "test@example.com",
  "department": "資訊工程學系",
  "identity": "student",
  "password": "Example-password-2026!"
}
```

`name` 1–40 字；`studentId` 4–20 碼英數字／連字號；`department` 1–60 字；`email` 最多 120 字。`identity` 可填 `student`、`faculty`、`staff`，省略時預設 student。密碼需為 10–128 字且最多 512 bytes。Email 與學號不區分英文大小寫，均須唯一。

成功回傳 **201**：

```json
{
  "success": true,
  "data": {
    "token": "此次登入的隨機 token",
    "tokenType": "Bearer",
    "expiresAt": "2026-10-22T04:00:00.000Z",
    "user": {
      "id": "使用者 UUID",
      "name": "測試同學",
      "studentId": "B12345678",
      "email": "test@example.com",
      "department": "資訊工程學系",
      "identity": "student",
      "createdAt": "2026-10-21T20:00:00.000Z"
    }
  }
}
```

以上時間僅為格式範例；實際依伺服器時間產生。

## 2. 登入與登出

`POST /api/auth/login`：

```json
{ "email": "test@example.com", "password": "Example-password-2026!" }
```

成功回傳 **200**，格式與註冊的 data 相同。失敗回傳 401，不區分帳號不存在或密碼錯誤。

`POST /api/auth/logout` 不需 body，成功回傳：

```json
{ "success": true, "data": { "loggedOut": true } }
```

同一帳號的其他登入 session 仍有效。

## 3. 活動查詢

`GET /api/events?q=海洋&category=工作坊&limit=20&offset=0`

`q` 搜尋標題、描述、地點（最多 100 字），`category` 為精確比對（最多 40 字）。`limit` 預設 20，範圍 1–100；`offset` 預設 0。列表按活動開始時間由近到遠排序，只列出 published 活動。

回應 data：`{ "items": [活動物件], "total": 3, "limit": 20, "offset": 0 }`。

`GET /api/events/ocean-workshop` 的 data 為單一活動物件：

```json
{
  "id": "ocean-workshop",
  "title": "海洋永續設計工作坊",
  "description": "透過設計思考與分組實作，探索海洋永續提案。",
  "category": "工作坊",
  "location": "圖書館 2F 多功能展演廳",
  "organizer": "永續發展中心",
  "startsAt": "2026-10-31T04:00:00.000Z",
  "endsAt": "2026-10-31T07:00:00.000Z",
  "registrationOpensAt": "2026-10-20T04:00:00.000Z",
  "registrationClosesAt": "2026-10-30T04:00:00.000Z",
  "capacity": 2,
  "confirmedCount": 0,
  "waitlistedCount": 0,
  "remaining": 2,
  "allowWaitlist": true,
  "status": "published",
  "registrationStatus": "open"
}
```

`registrationStatus` 可能為 `not_open`、`open`、`waitlist`、`full`、`closed`、`started`、`cancelled`。

## 4. 報名

`POST /api/events/ocean-workshop/registrations`

需 Bearer token。**不需 body**；也可傳空物件 `{}`。不接受 `userId`、`status` 或其他欄位。報名者身分取自登入 session。

成功回傳 **201**，data 為報名結果：

```json
{
  "id": "報名 UUID",
  "code": "REG-唯一編號",
  "status": "confirmed",
  "statusLabel": "正取",
  "waitlistPosition": null,
  "createdAt": "2026-10-21T04:00:00.000Z",
  "cancelledAt": null,
  "promotedAt": null,
  "event": { "此處為完整活動物件": "格式同活動詳情" }
}
```

| status | statusLabel | 說明 |
| --- | --- | --- |
| `confirmed` | 正取 | 已取得名額 |
| `waitlisted` | 候補 | 尚未取得名額，waitlistPosition 為目前候補順位（從 1 起） |
| `cancelled` | 已取消 | 保留取消紀錄，原名額已釋出 |

候補自動遞補後，status 改為 confirmed，promotedAt 會記錄遞補時間，waitlistPosition 改為 null。此版本不寄送電子郵件，請透過結果查詢 API 取得最新狀態。

## 5. 我的報名與單筆結果

`GET /api/registrations/me?status=confirmed&limit=20&offset=0`

省略 status 即包含全部紀錄。支援 confirmed、waitlisted、cancelled。回傳 `{ "items": [報名結果], "total": 1, "limit": 20, "offset": 0 }`，按報名建立順序由新到舊。

`GET /api/registrations/:registrationId` 回傳單筆報名結果。只能查看 token 所屬使用者的資料；不存在或非本人的報名均回傳 404。

## 6. 取消報名

`DELETE /api/registrations/:registrationId`

不需 body。成功回傳 **200**，data 為已取消的報名結果，含 cancelledAt。重複取消同一筆回傳 200，保持已取消狀態。正取取消後自動遞補最早的候補；候補取消則更新後面候補的順位。

## 常見錯誤

| HTTP | code | 原因 |
| ---: | --- | --- |
| 400 | `VALIDATION_ERROR` | 欄位格式錯誤 |
| 400 | `UNKNOWN_FIELDS` | 包含不支援的欄位 |
| 400 | `INVALID_JSON` | JSON 格式錯誤 |
| 401 | `AUTH_REQUIRED` | 沒有有效的 Bearer token |
| 401 | `INVALID_CREDENTIALS` | 帳號或密碼錯誤 |
| 401 | `SESSION_EXPIRED` | 登入過期或 token 已登出 |
| 403 | `ORIGIN_NOT_ALLOWED` | 瀏覽器來源未設定於 CORS |
| 404 | `EVENT_NOT_FOUND` | 活動不存在或為草稿 |
| 404 | `REGISTRATION_NOT_FOUND` | 報名不存在或非本人 |
| 409 | `ACCOUNT_EXISTS` | 電子信箱或學號重複 |
| 409 | `ALREADY_REGISTERED` | 同一活動已有有效報名 |
| 409 | `REGISTRATION_NOT_OPEN` | 尚未開放報名 |
| 409 | `REGISTRATION_CLOSED` | 已過報名截止時間 |
| 409 | `EVENT_STARTED` | 活動已開始 |
| 409 | `EVENT_UNAVAILABLE` | 活動已取消等不可報名狀態 |
| 409 | `EVENT_FULL` | 額滿且不開放候補 |
| 409 | `CANCELLATION_CLOSED` | 活動開始後無法取消 |
| 413 | `BODY_TOO_LARGE` | JSON 超過 16 KiB |
| 415 | `JSON_REQUIRED` | Content-Type 不正確 |
| 429 | `RATE_LIMITED` | 同一 IP 的登入及註冊合計超過 30 次／15 分鐘 |
| 503 | `DATABASE_BUSY` | 資料庫忙碌，稍後重試 |
