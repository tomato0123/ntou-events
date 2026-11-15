# 活動負責人規格（2026-11-15）

本次範圍：US-07 建立活動保存負責人，以及 US-08 名單歸屬檢查。
尚未包含目前角色重新查核、名單回應格式／status 篩選、嚴格路徑編號驗證或 UI-06。

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
- 尚未重新查核資料庫中的目前角色，現有 JWT／登入仍是原型，不能宣稱已完成撤權驗收。
- 現有原型登入使用固定 ID（1、50、99），未必存在於本機 users。真實資料庫建立活動必須使用對應到既有使用者的登入身分，外鍵不接受不存在的 ID；不要為了測試任意更改既有使用者編號。

## 驗收

在 `server/` 執行 `npm.cmd run test:us08`，測試採模擬資料，不寫入本機資料庫。
涵蓋登入建立者綁定、忽略前端偽造負責人、本人／他人管理者／admin／一般使用者／訪客、未指定負責人及不存在活動。
既有 US-07 回歸測試為 `npm.cmd run test:us07`。

## 線上規格來源

- [SRD](https://hackmd.io/CnRBfQYtSiGrFRVCkqUV4g)
- [資料庫結構](https://hackmd.io/@willie941104/Hk85_-aszg)
- [API 說明書](https://hackmd.io/@MvN6OQCHTqSE0n5gr-LC6Q/HynRAW6iGe)
