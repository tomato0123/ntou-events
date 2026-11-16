# 活動負責人規格（2026-11-15）

本次範圍：US-07 建立活動保存負責人，以及 US-08 名單歸屬檢查。
後續 US-08 後端修正已包含目前角色重新查核、名單回應格式／status 篩選及嚴格路徑編號驗證。
正式帳密登入留給 US-02；UI-06 的本分支實作與登入串接契約見 [UI-06 文件](ui-06.md)，正式登入及真實資料庫端到端驗收仍待完成。

## 資料庫

- `events.manager_id INTEGER NULL`，外鍵參照 `users.id`，限制名稱 `events_manager_id_fkey`。
- 外鍵使用預設 NO ACTION，不因使用者刪除而連帶刪除活動。
- 一場活動最多一位負責人；一位使用者可以負責多場活動。
- 新活動由後端固定保存登入建立者 ID。前端的 `manager_id` 不採用；沒有指定其他負責人、移交或共同管理 API。
- 舊活動保留 NULL，由團隊日後逐筆確認，不自動推定。NULL 期間僅 admin 可以查名單。
- 新資料庫使用 `database/schema.sql`。既有資料庫先備份，再執行 `database/add_events_manager_id.sql`；不要重跑完整 schema。
- 本次提供程式與遷移檔，不代表各組員的資料庫已執行遷移。NULL 是過渡資料狀態，不代表所有管理者都能存取。

## API

- `POST /api/events`：從驗證後的 `req.user.id` 設定負責人；成功回應的 `data.manager_id` 為該 ID。
- `GET /api/events/{id}/registrations`：未登入 401、非管理角色 403、活動不存在 404。
- admin 可查看所有活動；event_manager 僅在 `events.manager_id === req.user.id` 時可查看，其餘 403。
- 先驗證歸屬，再查報名資料；模擬資料與 SQL 路徑採相同規則。
- 名單 API 每次依已驗證 Token 的 ID 查詢 `users.id, role`，不採用 Token 中的舊角色；目前角色為 user 回傳 403，帳號不存在回傳 401，查核失敗不降級使用 Token 角色。
- 本項目前角色查核僅適用 US-08 名單 API，其他管理操作（例如 US-07）仍待各功能整合。登入仍為原型，不能視為正式端到端安全驗收。
- 現有原型登入使用固定 ID（1、50、99），未必存在於本機 users。真實資料庫建立活動必須使用對應到既有使用者的登入身分，外鍵不接受不存在的 ID；不要為了測試任意更改既有使用者編號。

## 驗收

在 `server/` 執行 `npm.cmd run test:us08`，測試採模擬資料，不寫入本機資料庫。
涵蓋登入建立者綁定、忽略前端偽造負責人、本人／他人管理者／admin／一般使用者／訪客、未指定負責人、不存在活動、撤權／刪除帳號、SQL 查核失敗、回應欄位白名單、status 篩選及非法 ID。
既有 US-07 回歸測試為 `npm.cmd run test:us07`。

## US-08 名單 API 契約

- 回應統一為 `{event_id, total_count, data}`；`total_count` 是篩選後 `data` 的筆數，無資料回傳 0 與空陣列。
- 每筆只包含 `registration_id, status, registered_at, user`；user 只包含 `id, name, email, campus_identity, gender`。不回傳密碼或其他欄位，缺少的選填資料使用 null。
- `status` 未提供時包含所有狀態；提供時只接受 `registered` 或 `cancelled`。空值、其他值及重複 status 參數回傳 400。
- 名單依 `registered_at ASC, id ASC` 排序。SQL 與 mock 採相同格式。
- 名單路徑 ID 必須全為數字，且介於 1 與 PostgreSQL INTEGER 上限 2147483647；`101xyz`、負數、小數、指數表示法等回傳 400。
- 未預期資料庫錯誤回傳一般中文 500 錯誤，不把資料庫內部訊息傳給客戶端。
- mock 名單授權使用測試配置的 `mockUsers` 目前角色，不能僅靠簽發含管理者角色的 Token 通過；mock 不是正式資料來源。

## 真實資料庫驗證與合併條件

本次未對真實資料庫執行遷移或寫入測試資料。mock／pool stub 通過不代表外鍵、遷移及 PostgreSQL 查詢已驗證。

1. 由團隊確認目標主機與資料庫，先備份；優先在獨立測試資料庫還原副本演練，不在使用中的活動植入測試報名。
2. 執行 `database/verify_events_manager_id.sql` 唯讀核對現況。若已有同名欄位或外鍵但定義不同，先停止處理；遷移的 IF NOT EXISTS 不會修復錯誤定義。
3. 在已確認的目標執行 `psql -X --set ON_ERROR_STOP=1 --file database/add_events_manager_id.sql`（連線由操作者安全設定），不要重跑 schema.sql。遷移取得資料表鎖，應避開使用高峰。
4. 再執行唯讀核對，確認 nullable INTEGER、外鍵指向 public.users(id)、NO ACTION 且已驗證。首次遷移後舊活動仍全為 NULL；重跑不得改動已指定的負責人。
5. 在獨立測試庫建立專用的兩位 manager、admin、user 與報名資料，驗證建立者保存、偽造 manager_id 被忽略、本人／他人／NULL 歸屬、狀態篩選、空清單、撤權後沿用舊 Token、帳號不存在及無效外鍵被拒絕。使用真正存在的使用者 ID，不更動既有帳號來配合固定 ID。
6. US-02 正式登入、UI-06 登入串接及上述資料庫驗證完成前，不將整體功能標記為完整驗收或可正式上線。若團隊允許先合併有明確依賴的開發成果，可另行審查；Git 無衝突不代表需求完成。

注意：既有 `server/registrations-check.js`／`test:us05` 會選用現有活動並寫入測試使用者／報名，且使用固定管理員 ID；不是安全的正式資料庫驗收程序，本次未執行。請勿用它代替以上獨立環境驗證。

## 線上規格來源

- [SRD](https://hackmd.io/CnRBfQYtSiGrFRVCkqUV4g)
- [資料庫結構](https://hackmd.io/@willie941104/Hk85_-aszg)
- [API 說明書](https://hackmd.io/@MvN6OQCHTqSE0n5gr-LC6Q/HynRAW6iGe)
