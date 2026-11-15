---
title: 海大活動報名系統 - 資料庫與 API 規格文件
tags: [軟體工程, API規格, NTOU]
---

# 海大活動報名系統 - 資料庫與 API 規格文件

[TOC]

:::info
- **文件版本**：v2.2
- **更新日期**：2026-11-15
- **狀態**：同步 SRD 報名期間及公開狀態的設計規格；新增欄位與相關檢查待遷移及實作，文件更新不代表功能完成。
:::

---

## API 通用規範

:::info
- **Base URL**：`http://localhost:8000/api` （依實際部署環境調整）
- **資料格式**：Request 與 Response 皆為 `application/json`，編碼統一為 `UTF-8`
- **時間格式**：統一採用 ISO 8601 字串（帶時區，例如：`2026-11-20T09:00:00Z`），後端儲存為 `TIMESTAMPTZ`
- **身分驗證**：需要身分驗證之 API，請於 Request Header 帶入 JWT Bearer Token：
  `Authorization: Bearer <your_jwt_token>`
:::

### 統一錯誤回應格式 (Error Response)

當 HTTP 狀態碼為 `4xx` 或 `5xx` 時，一律回傳以下 JSON 結構：

```json
{
  "error": "錯誤原因描述"
}
```

---

## 一、 API 端點總覽

| 模組 | 方法 | 路徑 | 功能說明 | 權限需求 |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/api/auth/register` | 使用者註冊 | 公開 (Public) |
| **Auth** | `POST` | `/api/auth/login` | 使用者登入 | 公開 (Public) |
| **Users** | `GET` | `/api/users/me` | 取得當前登入者個人資料 | 登入者 (所有角色) |
| **Users** | `PATCH` | `/api/users/me` | 更新當前登入者個人資料 | 登入者 (所有角色) |
| **Events** | `GET` | `/api/events` | 取得所有活動列表 | 公開 (Public) |
| **Events** | `GET` | `/api/events/{id}` | 取得單一活動詳細資訊 | 公開 (Public) |
| **Events** | `POST` | `/api/events` | 新增活動 | `admin` / `event_manager` |
| **Events** | `PUT` | `/api/events/{id}` | 修改活動資訊 | `admin` / `event_manager` |
| **Events** | `DELETE` | `/api/events/{id}` | 刪除活動 | `admin` / `event_manager` |
| **Registrations** | `POST` | `/api/events/{id}/register` | 報名指定活動 | 登入者 (所有角色) |
| **Registrations** | `GET` | `/api/users/me/registrations` | 查看自己的報名紀錄 (US-05) | 登入者 (所有角色) |
| **Registrations** | `PATCH` | `/api/registrations/{id}/cancel` | 取消報名 | 報名者本人 / `admin` |
| **Registrations** | `GET` | `/api/events/{id}/registrations` | 查看活動報名名單 | `admin` / `event_manager` |

---

## 二、 API 詳細規格

### 1. 身分驗證與使用者模組 (Auth & Users)

#### 1.1 使用者註冊
- **Endpoint**：`POST /api/auth/register`
- **權限需求**：公開 (Public)
- **後端規則**：
  - `role` 強制設定為 `user`，前端不可傳入或自行提升角色。
  - 密碼明文必須經過雜湊（Hash）後再寫入資料庫 `password_hash`。
  - `email` 應於後端進行去除前後空白與大小寫正規化（統一轉小寫）。
  - `campus_identity` 必須符合資料庫 CHECK 限制：`student`、`teacher`、`staff`。

**Request Body**

| 欄位 | 型別 | 必填 | 說明與限制 |
| :--- | :--- | :---: | :--- |
| name | String | 是 | 使用者姓名（上限 100 字元，不可為空字串） |
| email | String | 是 | 電子信箱（上限 100 字元，不可重複） |
| password | String | 是 | 密碼明文（由後端雜湊處理） |
| campus_identity | String | 是 | 校園身分，僅限值：`student`、`teacher`、`staff` |
| gender | String | 否 | 性別（上限 20 字元，選填） |

```json
{
  "name": "王小明",
  "email": "ming@campus.edu.tw",
  "password": "mySecretPassword123",
  "campus_identity": "student",
  "gender": "男"
}
```

**Response `201 Created`**
```json
{
  "message": "註冊成功",
  "data": {
    "id": 1,
    "name": "王小明",
    "email": "ming@campus.edu.tw",
    "role": "user",
    "campus_identity": "student",
    "gender": "男"
  }
}
```

:::warning
**常見錯誤：**
- `400 Bad Request`：`{"error": "校園身分不合法，僅限 student, teacher, staff"}` 或缺少必填欄位
- `409 Conflict`：`{"error": "該 Email 已經被註冊"}`
:::

---

#### 1.2 使用者登入
- **Endpoint**：`POST /api/auth/login`
- **權限需求**：公開 (Public)

**Request Body**
```json
{
  "email": "ming@campus.edu.tw",
  "password": "mySecretPassword123"
}
```

**Response `200 OK`**
```json
{
  "message": "登入成功",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "王小明",
    "email": "ming@campus.edu.tw",
    "role": "user"
  }
}
```

:::warning
**常見錯誤：**
- `401 Unauthorized`：`{"error": "帳號或密碼錯誤"}`
:::

---

#### 1.3 取得當前登入者個人資料
- **Endpoint**：`GET /api/users/me`
- **權限需求**：需帶 Bearer Token
- **後端規則**：`password_hash` 嚴禁回傳給前端。

**Response `200 OK`**
```json
{
  "id": 1,
  "name": "王小明",
  "email": "ming@campus.edu.tw",
  "role": "user",
  "campus_identity": "student",
  "gender": "男"
}
```

---

#### 1.4 更新當前登入者個人資料
- **Endpoint**：`PATCH /api/users/me`
- **權限需求**：需帶 Bearer Token
- **後端規則**：禁止透過此端點變更 `id`、`role`、`email`。

**Request Body**

| 欄位 | 型別 | 必填 | 說明 |
| :--- | :--- | :---: | :--- |
| name | String | 否 | 姓名（上限 100 字元） |
| campus_identity | String | 否 | 校園身分，僅限值：`student`、`teacher`、`staff` |
| gender | String | 否 | 性別（上限 20 字元） |

```json
{
  "name": "王大明",
  "campus_identity": "teacher",
  "gender": "男"
}
```

**Response `200 OK`**
```json
{
  "message": "個人資料更新成功",
  "data": {
    "id": 1,
    "name": "王大明",
    "email": "ming@campus.edu.tw",
    "role": "user",
    "campus_identity": "teacher",
    "gender": "男"
  }
}
```

---

### 2. 活動模組 (Events)

本節新增欄位為 `registration_opens_at`、`registration_closes_at`（TIMESTAMPTZ，目標 NOT NULL）及 `is_published`（BOOLEAN NOT NULL DEFAULT false），待資料庫遷移。建立與修改必須滿足 `registration_opens_at < registration_closes_at <= starts_at < ends_at`。時間輸入須帶時區，介面以 Asia/Taipei 顯示。既有資料由活動負責人確認，不得自動公開或捏造期間。


#### 2.1 取得所有活動列表
- **Endpoint**：`GET /api/events`
- **權限需求**：公開 (Public)
- **後端規則**：只回傳 `is_published = true`，依 `starts_at ASC, id ASC` 排序。

**Response `200 OK`**
```json
{
  "data": [
    {
      "id": 101,
      "title": "海大黑客松 2026",
      "description": "全校軟體競賽",
      "location": "電資大樓 302",
      "starts_at": "2026-11-20T09:00:00Z",
      "ends_at": "2026-11-20T18:00:00Z",
      "registration_opens_at": "2026-10-20T00:00:00Z",
      "registration_closes_at": "2026-11-19T09:00:00Z",
      "is_published": true,
      "created_at": "2026-10-19T08:00:00Z"
    }
  ]
}
```

---

#### 2.2 取得單一活動詳細資訊
- **公開性檢查**：不存在或未公開均回傳 404 與 `{"error":"找不到該活動"}`。此公開端點不提供草稿預覽。
- **Endpoint**：`GET /api/events/{id}`
- **權限需求**：公開 (Public)
- **Path Parameter**：`id` (INTEGER) - 活動編號

**Response `200 OK`**
```json
{
  "id": 101,
  "title": "海大黑客松 2026",
  "description": "全校軟體競賽",
  "location": "電資大樓 302",
  "starts_at": "2026-11-20T09:00:00Z",
  "ends_at": "2026-11-20T18:00:00Z",
  "registration_opens_at": "2026-10-20T00:00:00Z",
  "registration_closes_at": "2026-11-19T09:00:00Z",
  "is_published": true,
  "created_at": "2026-10-19T08:00:00Z"
}
```

:::warning
**常見錯誤：**
- `404 Not Found`：`{"error": "找不到該活動"}`
:::

---

#### 2.3 新增活動
- **活動負責人**：後端將已驗證登入者的 ID 寫入 `events.manager_id`（INTEGER，外鍵參照 `users.id`），建立者即唯一負責人。Request Body 不接受指定負責人；若傳入 `manager_id`，後端忽略並使用登入者 ID。MVP 不提供轉移或指派其他負責人的 API。
- **Endpoint**：`POST /api/events`
- **權限需求**：`admin` 或 `event_manager`
- **後端規則**：驗證完整時間順序 `registration_opens_at < registration_closes_at <= starts_at < ends_at`；必填缺漏、無時區、不合法時間或非布林公開狀態回傳 400。

**Request Body**

| 欄位 | 型別 | 必填 | 說明與限制 |
| :--- | :--- | :---: | :--- |
| title | String | 是 | 活動名稱（上限 100 字元） |
| description | String | 是 | 活動內容說明 (TEXT) |
| location | String | 是 | 地點（上限 200 字元） |
| starts_at | ISO8601 String | 是 | 開始時間（須帶時區） |
| ends_at | ISO8601 String | 是 | 結束時間（須晚於開始時間） |
| registration_opens_at | ISO8601 String | 是 | 報名開始，須帶時區 |
| registration_closes_at | ISO8601 String | 是 | 報名截止，晚於開放且不晚於活動開始 |
| is_published | Boolean | 否 | 預設 false；發布時設 true |

```json
{
  "title": "海大黑客松 2026",
  "description": "全校軟體競賽",
  "location": "電資大樓 302",
  "starts_at": "2026-11-20T09:00:00Z",
  "ends_at": "2026-11-20T18:00:00Z",
  "registration_opens_at": "2026-10-20T00:00:00Z",
  "registration_closes_at": "2026-11-19T09:00:00Z",
  "is_published": true
}
```

**Response `201 Created`**
```json
{
  "message": "活動建立成功",
  "data": {
    "id": 101,
    "title": "海大黑客松 2026",
    "description": "全校軟體競賽",
    "location": "電資大樓 302",
    "starts_at": "2026-11-20T09:00:00Z",
    "ends_at": "2026-11-20T18:00:00Z",
    "registration_opens_at": "2026-10-20T00:00:00Z",
    "registration_closes_at": "2026-11-19T09:00:00Z",
    "is_published": true,
    "manager_id": 50,
    "created_at": "2026-10-21T12:00:00Z"
  }
}
```

:::warning
**常見錯誤：**
- `400 Bad Request`：`{"error": "活動結束時間必須晚於開始時間"}`
- `403 Forbidden`：`{"error": "權限不足，僅管理員或活動管理者可新增活動"}`
:::

---

#### 2.4 修改活動資訊
- **Endpoint**：`PUT /api/events/{id}`
- **權限需求**：`admin` 或 `event_manager`
- **Path Parameter**：`id` (INTEGER) - 活動編號
- **後端規則**：更新後須滿足 `registration_opens_at < registration_closes_at <= starts_at < ends_at`，否則回傳 400；活動管理者只能修改自己負責的活動。

**Request Body**（欄位同新增活動）

**Response `200 OK`**
```json
{
  "message": "活動更新成功",
  "data": {
    "id": 101,
    "title": "海大黑客松 2026（決賽）",
    "description": "全校軟體競賽決賽議程",
    "location": "電資大樓 302",
    "starts_at": "2026-11-20T09:00:00Z",
    "ends_at": "2026-11-20T19:00:00Z",
    "registration_opens_at": "2026-10-20T00:00:00Z",
    "registration_closes_at": "2026-11-19T09:00:00Z",
    "is_published": true,
    "created_at": "2026-10-21T12:00:00Z"
  }
}
```

---

#### 2.5 刪除活動
- **Endpoint**：`DELETE /api/events/{id}`
- **權限需求**：`admin` 或 `event_manager`
- **Path Parameter**：`id` (INTEGER) - 活動編號
- **後端規則**：資料庫外鍵關聯為 `NO ACTION`，若已有報名紀錄（含 `registered` 或 `cancelled`），直接刪除將引發外鍵衝突。後端需阻擋刪除並給予錯誤提示。

**Response `200 OK`**
```json
{
  "message": "活動已成功刪除"
}
```

:::warning
**常見錯誤：**
- `400 Bad Request`：`{"error": "該活動已有報名紀錄，無法刪除"}`
- `404 Not Found`：`{"error": "找不到該活動"}`
:::

---

### 3. 報名模組 (Registrations)

#### 3.1 報名指定活動
- **資格與時間檢查（待實作）**：驗證登入後，於同一交易內檢查 `is_published = true`、`registration_opens_at <= t < registration_closes_at` 且 `t < starts_at`，再寫入。t 由後端／資料庫取得，須與活動設定更新協調鎖定，避免檢查與寫入間設定被修改。
- 未登入／無效憑證回傳 401；不存在／未公開回傳 404；尚未開放、已截止或已開始回傳 409 與對應中文原因，不得新增紀錄。取消後重報也須符合相同條件。
- 只有 COMMIT 成功才回傳 201；儲存失敗須回滾並回傳錯誤，不得顯示成功。MVP 狀態仍為 registered／cancelled，名額與候補屬進階需求。
- **Endpoint**：`POST /api/events/{id}/register`
- **權限需求**：需帶 Bearer Token
- **Path Parameter**：`id` (INTEGER) - 活動編號 (`event_id`)
- **後端規則**：
  - `user_id` 嚴格由後端自 Token 提取，不可由前端傳送。
  - **防重複報名**：檢查同一使用者在該活動是否已有 `status = 'registered'` 的有效報名紀錄；若有則退回 `409 Conflict`。
  - **取消後重報**：若先前歷史紀錄均為 `cancelled`，則允許報名，後端將**新增一筆獨立紀錄**（狀態為 `registered`），完整保留過往取消歷程。

**Request Body**：無需傳送

**Response `201 Created`**
```json
{
  "message": "報名成功",
  "data": {
    "id": 5001,
    "user_id": 1,
    "event_id": 101,
    "status": "registered",
    "registered_at": "2026-10-21T12:30:00Z"
  }
}
```

:::warning
**常見錯誤：**
- `404 Not Found`：`{"error": "找不到該活動"}`
- `409 Conflict`：`{"error": "您已報名過此活動，請勿重複報名"}`
:::

---

#### 3.2 查看自己的報名紀錄 (US-05)
- **Endpoint**：`GET /api/users/me/registrations`
- **權限需求**：需帶 Bearer Token
- **後端規則**：
  - 嚴格根據 Token 取得當前使用者編號，未登入者拒絕存取。
  - 必須**同時包含 `registered` 與 `cancelled`** 兩種狀態。
  - **排序規則**：預設依 `registered_at DESC`，若報名時間相同則依 `id DESC` 排序。
  - 無報名紀錄時回傳空陣列 `[]`（不可回傳 null 或 404）。
  - 因資料庫目前尚無 `cancelled_at` 欄位，取消紀錄仍依照 `registered_at` 排序。

**Response `200 OK`**
```json
{
  "data": [
    {
      "id": 5002,
      "user_id": 1,
      "event_id": 101,
      "status": "registered",
      "registered_at": "2026-10-21T14:00:00Z",
      "event": {
        "title": "海大黑客松 2026",
        "location": "電資大樓 302",
        "starts_at": "2026-11-20T09:00:00Z",
        "ends_at": "2026-11-20T18:00:00Z"
      }
    },
    {
      "id": 5001,
      "user_id": 1,
      "event_id": 101,
      "status": "cancelled",
      "registered_at": "2026-10-21T12:30:00Z",
      "event": {
        "title": "海大黑客松 2026",
        "location": "電資大樓 302",
        "starts_at": "2026-11-20T09:00:00Z",
        "ends_at": "2026-11-20T18:00:00Z"
      }
    }
  ]
}
```

---

#### 3.3 取消報名
- **Endpoint**：`PATCH /api/registrations/{id}/cancel`
- **權限需求**：需帶 Bearer Token（僅限紀錄本人或 `admin` 操作）
- **Path Parameter**：`id` (INTEGER) - 報名紀錄編號 (`registrations.id`)
- **後端規則**：
  - 將目標紀錄的 `status` 更新為 `'cancelled'`，**不可刪除資料列**。
  - 若目標紀錄原本狀態即為 `'cancelled'`，回傳 `400 Bad Request`。

**Request Body**：無需傳送

**Response `200 OK`**
```json
{
  "message": "已取消報名",
  "data": {
    "id": 5002,
    "user_id": 1,
    "event_id": 101,
    "status": "cancelled",
    "registered_at": "2026-10-21T14:00:00Z"
  }
}
```

:::warning
**常見錯誤：**
- `400 Bad Request`：`{"error": "該報名紀錄已處於取消狀態"}`
- `403 Forbidden`：`{"error": "無權限取消他人的報名紀錄"}`
- `404 Not Found`：`{"error": "找不到該筆報名紀錄"}`
:::

---

#### 3.4 查看活動報名名單
- **活動歸屬檢查**：`event_manager` 僅可查看 `events.manager_id` 等於登入者 ID 的活動名單；其他活動回傳 403。`admin` 可查看所有活動。既有活動 `manager_id` 先保留 NULL，由團隊日後逐筆指定；未指定期間僅 `admin` 可查看名單。必須先通過角色及歸屬檢查，才可查詢或回傳名單。
- **Endpoint**：`GET /api/events/{id}/registrations`
- **權限需求**：`admin` 或 `event_manager`
- **Path Parameter**：`id` (INTEGER) - 活動編號 (`event_id`)
- **Query Parameter**：
  - `status` (String, 選填)：可過濾 `registered` 或 `cancelled`，未提供則回傳全部。
- **後端規則**：關聯 `users` 表取得成員資料，嚴禁回傳使用者的 `password_hash`。

**Response `200 OK`**
```json
{
  "event_id": 101,
  "total_count": 1,
  "data": [
    {
      "registration_id": 5002,
      "status": "registered",
      "registered_at": "2026-10-21T14:00:00Z",
      "user": {
        "id": 1,
        "name": "王小明",
        "email": "ming@campus.edu.tw",
        "campus_identity": "student",
        "gender": "男"
      }
    }
  ]
}
```

:::warning
**常見錯誤：**
- `403 Forbidden`：`{"error": "權限不足"}`
- `404 Not Found`：`{"error": "找不到該活動"}`
:::
## 2026-11-06 同步紀錄與驗收

US-07／UI-05 負責保存與驗證期間及公開設定；US-01 負責公開查詢過濾；US-03／UI-02 負責報名交易的資格檢查與成功／失敗提示。需測試未公開直連、開放前、開放當下、截止當下、已開始／結束、重複及併發報名、取消後重報與儲存失敗。欄位、遷移、前後端及驗收完成前不得標記需求完成。

相關文件：[SRD](https://hackmd.io/@6YiSxyaWSTqD_qKspqnyVg/BJzYtIqozg/edit)、[資料庫結構](https://hackmd.io/@willie941104/Hk85_-aszg)。


## 2026-11-15 活動負責人同步

新增 `events.manager_id INTEGER NULL REFERENCES users(id)`；新活動由後端綁定建立者，舊活動不推定負責人。既有資料庫須執行 `database/add_events_manager_id.sql`；全新資料庫使用更新後的 `database/schema.sql`。本次 US-08 本機修正涵蓋建立者綁定與名單歸屬檢查；各環境遷移尚待執行確認。查詢資料庫確認最新角色、名單回應格式、status 篩選與 UI-06 仍須另行完成，不代表 US-08 全部驗收通過。
