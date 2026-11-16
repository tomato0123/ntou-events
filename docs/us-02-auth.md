# US-02 校園帳號服務

共同基底：`5b1b0ab264817eeb23b0f9e44960f55595ba9ebc`（origin/main）。原本機 branch_Zhang 備份 `backup/branch_Zhang-20261116` 同 SHA；原遠端備份 `backup/branch_Zhang-remote-20261116` 為 `20fc94eeaa7a4c24fb532d678e9518c3461847a1`。本次使用者直接授權完成兩項並 push，取代附件中僅本機提交的流程。未刪除舊分支、未改 main。

## 原變更拆分

| 原區塊 | 已在基底 | 分工 | 處理 |
|---|---|---|---|
| branch_Zhang / origin 舊 tip 的 index.html、styles.css、app.js | 是（Git ancestry 與 diff 已查核） | UI | 保留新版搜尋及詳情；UI-03 補帳號 |
| server/index.js 原型 login、auth-middleware.js | 是 | US | 移除關鍵字提權／固定 ID，改真實 users 與 scrypt |
| registration-service.js getMyRegistrations | 是 | US-05 | 保留原查詢與回應 |
| events、schema、啟動入口等原提交 | 是 | 其他／共用 | 保留，不重複搬移 |
| origin/US-03 registerForEvent 與有效報名唯一索引 | 否 | US-03 相容接線 | 參照 e7c4793 的最小報名交易，補資格檢查與既有欄位可表達的期間檢查；未搬取消等其他功能 |

本機 branch_Zhang 與基底沒有 diff；origin/branch_Zhang 為 main 祖先。HackMD 五個來源嘗試讀取失敗；本次依兩份任務文件契約，未聲稱已核對線上最新版。

## 檔案與契約

- auth-service.js：輸入驗證、非同步 scrypt、公開 User 白名單、DB 交易、token 摘要與重寄節流。mail-adapter.js：nodemailer SMTP，逾時可恢復；不記錄信件／token／SMTP 例外。
- auth-middleware.js：保留 7d JWT 與匯出介面，移除預設密鑰；管理角色每次查 DB，不信 JWT 舊 role。
- registration-eligibility.js：在報名同一 transaction 內 FOR SHARE 查 users。未驗證 403，無 INSERT；公開瀏覽不受限制。
- index.js：正式 API、createApp 注入測試介面、安全靜態白名單；健康檢查與 app export 保留。
- migrations：保留舊 users/events/registrations；舊帳號未驗證；Email 正規化碰撞會中止，不自動合併。
- tests/auth.test.js：SQL adapter／HTTP 受控測試；events-check.js 改用受控最新身分 fixture，以配合正式 DB 授權，沒有正式假登入開關。

| API | 成功 | 錯誤 |
|---|---|---|
| POST /api/auth/register | 201 message,data:User,verification_email:{status:sent/failed} | 400/409/503 |
| POST /api/auth/login | 200 message,token,user | 400/401/503 |
| GET /api/users/me（/api/auth/me 相容） | 200 裸 User | 401/503 |
| POST /api/auth/verify-email {token} | 200 message | 400 無效、410 到期、409 已用、503 |
| POST /api/auth/resend-verification {email} | 202 泛化訊息 | 400/429 Retry-After/503 |
| POST /api/events/:id/register | 201 message,data（沿用 US-03） | 未驗證 403、失效身分 401、重複／期間 409 |

User：id,name,email,role,campus_identity,gender,email_verified,email_verified_at。公開註冊固定 user；教師身分不授權。token 32 bytes 亂數，DB 僅存 SHA-256，24h；明確操作 POST 消耗一次。使用者鎖 → token 鎖，重寄同鎖序；驗證帳號更新與 token 消耗同交易，COMMIT 後回應。舊未使用信被重寄作廢。SMTP 失敗仍保存 pending 帳號且回 201 failed；重寄失敗 503，60 秒後再試。每帳號每小時最多 5 次（含首次註冊），來源 IP 每小時 20 次，持久化 row lock 跨程序。來源 IP 不信任任意 X-Forwarded-For；若部署在代理後須由小組配置可信 proxy，否則同代理共用限制。錯誤可能透露寄送結果，不宣稱完全防帳號探測。

## Windows 啟動與 migration

在專案根目錄執行 `npm ci`，複製 server/.env.example 為 server/.env 並填值。新 DB 只執行 database/schema.sql；既有 DB 先備份，依序執行 database/add_auth_email_verification.sql、database/add_registrations_one_active.sql。碰撞／重複報名先人工處理，不刪資料。

必要：PG*（pg 既有設定）、JWT_SECRET 隨機密鑰、ALLOWED_CAMPUS_EMAIL_DOMAINS 小組正式清單、SMTP_HOST/PORT/SECURE、SMTP_USER/PASS（需要認證時）、MAIL_FROM、PUBLIC_APP_URL 可信 HTTPS origin（本機 localhost HTTP 可用）。EMAIL_VERIFICATION_TTL_MINUTES 預設 1440。範例 campus.example 只是測試，不是核准校園網域。缺少關鍵設定啟動會拒絕。根目錄 `npm start`，網址 http://127.0.0.1:8000；頁面須整合 UI-03。驗證信路徑 `/verify-email.html#token=...`。

## 驗證與限制

`npm run test:us02`：10 項通過（SQL adapter 與真實 loopback HTTP；非 PostgreSQL／SMTP 驗收）。涵蓋 U01–10、U15 的輸入、雜湊、角色、生命週期、回滾、併發模型、HTTP；U11/12 另有完整 HTTP + SQL adapter 整合：未驗證直接報名無寫入，驗證後沿用同一 JWT 報名成功且重複 409。此項仍非真實 PostgreSQL。`node server/events-check.js`：使用 mock events 與受控身分，須 24 項通過。`node server/registrations-check.js` 已嘗試，缺少本機 DB 連線無法驗收。

真實 PostgreSQL 鎖競爭、migration、重啟持久化（U03/07/08/11/12/15/16）、SMTP 實際接收與校園收信（U04/16）、完整 F18、其他尚未合併 US-06/08 的整合 U14 均未執行。須用專用測試 DB，並提供正式網域與 SMTP 後跑完整流程；不可把 mock 當真實驗收。schema 尚無活動公開狀態／報名期間欄位，檢查只在欄位存在時套用；合併其他故事時應保留其完整規則。

JWT 只清除分頁憑證不等於伺服器撤銷，已複製 JWT 可有效至 7d。多程序正式部署的 SMTP outbox、寄送重試排程與歷史節流表清理並未擴充；目前寄送失敗由使用者重寄恢復。不可直接宣稱可正式上線。
