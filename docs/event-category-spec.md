# 活動分類（category）規格

> 本文件為活動分類的唯一規則說明。資料庫、後端、前端必須與此一致。
> 可直接將各節貼入 SRD（需求）與 API 規格文件對應位置。

## 1. 分類允許值

| 值（API／資料庫） | 顯示名稱 | 說明 |
|---|---|---|
| `lecture` | 講座 | 演講、講座、工作坊 |
| `club` | 社團 | 社團迎新、社課、社團活動 |
| `sports` | 體育 | 球賽、運動會、體育競賽 |
| `other` | 其他 | 不屬於以上分類者 |

規則：

- 每場活動**必須有且只有一個**分類。
- 值一律使用上表的英文小寫代碼；中文名稱只用於畫面顯示。
- 舊資料升級時，所有既有活動預設為 `other`，再由主辦人修正。

## 2. 需求（SRD 補充）

**UI-01 活動探索頁 — 分類篩選**

1. 活動列表上方顯示分類按鈕：「全部」＋ 第 1 節的所有分類，順序同上表。
2. 預設選「全部」。一次只能選一個分類。
3. 分類可與關鍵字搜尋同時使用，結果須**同時符合**兩個條件（AND）。
4. 篩選條件同步到網址：`?q=關鍵字&category=分類值`，可分享、可用瀏覽器上一頁返回。網址中的分類值不合法時視為「全部」。
5. 「清除篩選」同時清除關鍵字與分類。
6. 活動卡片與詳情視窗顯示該活動的分類名稱。

**活動建立／編輯頁**（由負責建立活動的組員實作）

1. 表單提供「活動分類」下拉選單，選項來自 `GET /api/categories`，必選。
2. 送出前於前端檢查必填欄位與時間先後；後端會再驗證一次，以後端結果為準。
3. 送出時呼叫 `POST /api/events`（建立）或 `PUT /api/events/{id}`（編輯），請求內容須包含 `category`，格式見第 4.4、4.5 節。
4. 後端回 400 時，依回應的 `fields` 在對應欄位旁顯示錯誤訊息。

## 3. 資料庫

```sql
category VARCHAR(20) NOT NULL
CONSTRAINT events_category_check CHECK (category IN ('lecture', 'club', 'sports', 'other'))
INDEX idx_events_category_starts_at (category, starts_at, id)
```

- 不設預設值：新增活動未指定分類時，資料庫直接拒絕。
- 既有資料庫升級：執行 `後端/db/migrations/001_add_event_category.sql`（可重複執行）。

## 4. API

共通：錯誤回應格式為

```json
{ "error": "錯誤說明", "fields": { "欄位名稱": "該欄位的錯誤原因" } }
```

`fields` 僅在欄位驗證失敗（400）時出現。

### 4.1 GET /api/categories

取得分類清單。前端按鈕與下拉選單一律以此為準，不得寫死。

回應 200：

```json
{ "data": [ { "value": "lecture", "label": "講座" }, { "value": "club", "label": "社團" },
            { "value": "sports", "label": "體育" }, { "value": "other", "label": "其他" } ] }
```

### 4.2 GET /api/events

| 參數 | 必填 | 說明 |
|---|---|---|
| `search` | 否 | 關鍵字，比對 `title`、`description`，不分大小寫；`%`、`_` 視為一般字元 |
| `category` | 否 | 分類值；空白或 `all` 表示不篩選 |

- 兩個參數同時提供時為 AND。
- 排序：`starts_at ASC, id ASC`（同時間的活動順序固定）。
- `category` 不在允許值內 → **400**。

回應 200：`{ "data": [ Event, ... ] }`

### 4.3 GET /api/events/{id}

回應 200：`Event`；不存在 → 404。

### 4.4 POST /api/events（建立）

請求 `Content-Type: application/json`：

| 欄位 | 型別 | 必填 | 規則 |
|---|---|---|---|
| `title` | string | 是 | 去除前後空白後 1–100 字 |
| `description` | string | 否 | 最多 2000 字 |
| `location` | string | 是 | 去除前後空白後 1–100 字 |
| `category` | string | 是 | 必須是第 1 節的允許值 |
| `starts_at` | string | 是 | ISO 8601，需含時區，例：`2026-12-01T14:00:00+08:00` |
| `ends_at` | string | 是 | 同上，且必須晚於 `starts_at` |

回應：

- **201**：回傳建立後的 `Event`，`Location` 標頭為 `/api/events/{id}`
- **400**：欄位驗證失敗或 JSON 格式錯誤

### 4.5 PUT /api/events/{id}（編輯）

整筆取代，請求欄位與規則同 4.4（所有欄位都要送）。

回應：**200** 更新後的 `Event`；**400** 驗證失敗；**404** 活動不存在。

> 權限：登入功能完成後，POST／PUT 僅限主辦單位帳號；目前本機測試版未驗證身分。

### Event 物件

```json
{
  "id": 1,
  "title": "程式設計講座",
  "description": "Python 入門",
  "location": "資工系館",
  "category": "lecture",
  "starts_at": "2026-12-01T06:00:00.000Z",
  "ends_at": "2026-12-01T08:00:00.000Z",
  "created_at": "2026-11-11T15:08:41.638Z"
}
```

時間一律以 UTC 回傳，前端以 Asia/Taipei 顯示。

## 5. 修改分類允許值的流程

新增或刪除分類時，以下四處要在同一次變更中一起修改：

1. 新增一支 migration（例：`002_...sql`），更新 `events_category_check`；刪除分類前先把該分類的活動改到其他分類。
2. `後端/server.js` 的 `CATEGORIES`。
3. 本文件第 1 節與第 3 節。
4. 前端不需修改（分類由 `GET /api/categories` 提供）。
