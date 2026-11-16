# loginAndRegist 與 main 整合驗收（2026-11-16）

## 基準與範圍

- 開始時 loginAndRegist：`79af86b96fb6f3f2363507611f71483121d8ced1`。
- 本次 origin/main：`b6dc766c89e90c7dfd10e9068ed6ee18da4d4850`。完成前再次 fetch；若有變更必須重新整合及測受影響功能。
- 直接在 loginAndRegist merge origin/main；沒有改動／推送 main、沒有 force push，原 US-02、UI-03 與備份保留。
- 已檢查專案及祖先目錄，沒有找到適用 AGENTS.md。已讀 README、server/README、us-02-auth、ui-03-auth、ui-06、event-ownership、api-spec-manager-id-proposed。線上 HackMD 在前次任務無法取得，本次使用版本控制內的文件，不聲稱線上最新版已核對。

## 六項衝突的處理與修改位置

| 項目 | 實作／保留 |
|---|---|
| api-config.js | 以 NtouConfig.apiBase 為共同介面，同值提供 NTOU_API_BASE 相容別名。內建後端在 /api-config.js 注入 /api，任何 PORT／反向代理同源均適用；獨立本機靜態前端預設 8000，可由可信部署設定覆寫，不讀 query string 主機。 |
| app.js、index.html | 保留搜尋、載入更多、活動詳情；同時保留登入／註冊、session 狀態、待驗證提示、報名控制與 manager.html 入口。 |
| database/schema.sql | main 的 events.manager_id/FK 與帳號 email_verified_at、三張驗證／節流表、Email 正規化唯一索引及 registrations_one_active 同時存在。 |
| server/index.js | 單一 createApp，帳號路由＋管理活動／名單 API 共存；靜態白名單包含帳號與 manager 資源；不提供 repo-wide static。健康檢查與 app export 保留。管理、活動與報名使用一致的 database 注入。 |
| server/registration-service.js | main 的最新角色查核、歸屬、status 篩選、個資白名單不變；加入原分支 registerForEvent transaction 與未驗證 403。先查資格再寫入、COMMIT 後才成功，重複由 DB 唯一索引拒絕。 |
| 安裝／測試 | server/package.json 與 lockfile 補 nodemailer；移除鎖檔導致的 server→根專案連結；body-parser 更新至 2.4.0 修補版本，npm audit 0 漏洞。根目錄保留可用啟動入口。 |

auth-service、mail-adapter、auth-middleware、auth-session、account 等原有帳號功能保留；沒有恢復關鍵字提權或固定 ID 登入。manager.html 新增導向正式登入的 return path。HTTP fixture 為配合正式角色重新查詢而注入 mockUsers；沒有更改授權預期，也沒有在正式程式增加 mock 帳密登入。

## 文件／程式差異與未完成需求（未刪除需求）

1. UI-06 使用 NtouConfig，舊 UI-03 使用 NTOU_API_BASE：本次已修正並保留別名。舊 UI-03 的以 port 猜測同源方式被內建後端明確注入取代。
2. README 原先稱只有示範資料、尚無帳號 API、未有有效報名索引：已依現有程式修正事實；US-02／UI-03／UI-06 舊驗收內容視為歷史紀錄，以本報告為本次整合結果。
3. UI-06／event-ownership 的「登入仍為原型」是 main 合併前狀態。現已真實 users/scrypt/JWT；管理角色仍每次查 DB，撤權不能用舊 JWT 取得名單。真實 DB／SMTP 驗收沒有因此完成。
4. api-spec-manager-id-proposed 明列尚待 migration 的 registration_opens_at、registration_closes_at、is_published；main/schema 與 event-service 尚未完整實作此活動發布故事。本次未自行發明既有活動的公開狀態／報名期間，也未擅自搬入別的 feature 分支。報名 service 增加正式命名的相容檢查（有欄位時檢查），並保留舊 registration_starts_at/ends_at，但缺欄位的既有 schema 仍不能宣稱完整發布／時間規格已完成。團隊仍須完成 US-07／US-01／US-03 的相應 migration、公開查詢過濾、建立／更新保存與邊界驗收。此差距保留在文件，不以條件相容檢查冒稱整項完成。
5. PATCH 個人資料、取消報名、完整我的報名頁及其他尚未合併的故事不由本次帳號／管理整合替代；既有已合併功能均保留。

## 安裝與啟動（Windows，Node.js 20.19 以上）

最小服務安裝只需要 server；不用先在根目錄 npm install：

```powershell
Set-Location -LiteralPath 'C:\Users\User\Desktop\軟功\海大活動報名系統\ntou-events\server'
npm.cmd ci
Copy-Item .env.example .env # 僅第一次，已有 .env 不覆寫
# 編輯 .env 後：
npm.cmd start
```

根目錄方式也可：`npm.cmd ci` 後 `npm.cmd start`，同樣讀 server/.env。測試另在根目錄執行 `npm.cmd --prefix tests ci` 安裝 jsdom。不要把 .env 加到 Git。

必要設定：PGHOST、PGPORT、PGDATABASE、PGUSER、PGPASSWORD（專用測試 DB）；JWT_SECRET（自行產生隨機值）；ALLOWED_CAMPUS_EMAIL_DOMAINS（團隊確認的精確清單）；PUBLIC_APP_URL（可信 HTTPS origin，本機 localhost HTTP 可用）；SMTP_HOST/PORT/SECURE、MAIL_FROM、需要認證時成對的 SMTP_USER/PASS。EMAIL_VERIFICATION_TTL_MINUTES 預設 1440。PORT 可自訂，HOST 預設 127.0.0.1；PUBLIC_APP_URL 必須對應實際前端 origin，例如自訂 9000 時設 http://127.0.0.1:9000。campus.example 只是測試值，不是核准網域。沒有提供真實 SMTP 服務資訊或密碼。

內建後端頁面：`http://127.0.0.1:<PORT>/index.html`、login.html、register.html、verify-email.html、resend-verification.html、manager.html。file:// 不能作為正式 API/session 驗收。若前後端分離且後端非 8000，在受信任前端部署中於 api-config.js 前設定 `window.NtouConfig = {apiBase:'http://127.0.0.1:9000/api'}`；HTTPS 正式環境應使用 HTTPS API。

## 新資料庫與既有資料庫

所有步驟使用獨立本機／專用測試 DB；先確認連線身分與資料庫，再備份。不得拿共用正式 DB 做本次自動驗收。

新 DB：建立空白 PostgreSQL database 後，只執行一次 `database/schema.sql`，不再重跑三個 migration。它包含 users/events/registrations、manager_id/FK、email_verified_at、email_verification_tokens/deliveries/sources 及兩個唯一索引。

既有 DB：不要重跑 schema；在根目錄執行以下，連線由安全的 PG*／pgpass 提供，不把密碼寫入命令或 Git：

```powershell
psql -X --set ON_ERROR_STOP=1 --file database/verify_events_manager_id.sql
psql -X --set ON_ERROR_STOP=1 --file database/add_events_manager_id.sql
psql -X --set ON_ERROR_STOP=1 --file database/add_auth_email_verification.sql
psql -X --set ON_ERROR_STOP=1 --file database/add_registrations_one_active.sql
psql -X --set ON_ERROR_STOP=1 --file database/verify_events_manager_id.sql
psql -X --set ON_ERROR_STOP=1 --file database/verify_auth_integration.sql
```

首次 migration 前 manager_id 不存在是預期；若已存在但型別、FK 目標／NO ACTION 不符先停止。舊活動 manager_id 保持 NULL，只允許 admin 查名單，待團隊逐筆確認；舊帳號 email_verified_at 保持 NULL，不自動驗證。Email 正規化重複或重複有效報名會中止 migration；交由團隊人工處理，沒有自動刪除、合併帳號或報名。重跑已正確完成的 migration 不應重設資料；同名但錯誤定義須先由團隊處理。

## 本次實際驗證

| 命令／情境 | 結果與限制 |
|---|---|
| server/ npm ci | 成功，全部直接依賴解析於 server/node_modules；無須根目錄套件。 |
| server/ npm run test:us02 | 10 項通過，SQL adapter + loopback HTTP。 |
| 根目錄 npm --prefix tests test | 13 項 UI-03 DOM/mock HTTP 通過。 |
| server/ npm run test:us07 | 24 項既有活動檢查通過。 |
| server/ npm run test:ui06 | 21 項通過，包含 US-08 的 17 項與管理活動 4 項；角色、歸屬、NULL、撤權、查核失敗、個資白名單。 |
| 根目錄 npm --prefix tests run test:ui06 | 1 個 Node test 內執行原 UI-06 runner 的 24 個 DOM/mock HTTP 情境，全通過。不是新的一組 24 個後端測試。 |
| server/ npm run test:integration | 5 項通過：同一 app 帳號／報名／管理權限、靜態隔離、同源／分離 API 設定、獨立安裝、真實 CLI 啟動。 |
| 完整 HTTP 路徑 | 註冊→真實 scrypt 帳密登入→未驗證報名 403 無寫入→驗證→原 JWT 查 /me→報名 201→重複 409；同 app 以 fixture 設定 manager/admin，帳密登入後檢驗本人／他人／NULL／撤權／訪客名單。DB 與寄信為受控 adapter。 |
| 靜態與私密路徑 | 首頁、4 個帳號頁、管理頁及所引用 JS/CSS 回 200；.env、.git/config、server 原始碼、package、DB SQL、測試頁／端點回 404。 |
| 實際服務啟動 | 測試 env-file＋臨時 PORT 啟動 index.js，health 200，同源設定正確；不連 DB、不寄信。 |
| npm audit --omit=dev | server 安裝 0 漏洞；root 鎖檔亦使用已修補 body-parser。 |

可在根目錄用 `npm run test:all` 重跑上述受控測試。曾發現並修正 server 隱含根依賴，以及 jsdom 不支援舊 ResourceLoader 的 runner 適配問題；最終結果不保留失敗項目。原 server/registrations-check.js 會寫 DB 且使用固定測試 ID，本次未在未確認 DB 上執行。

## 明確未驗證／待團隊提供

- **未驗證**：真實 PostgreSQL 新庫 schema 建置、既有資料 migration／重跑、資料庫鎖競爭／rollback／FK／唯一索引、重啟後持久化。本環境未提供可確認為專用的 DB 連線，且沒有可用 psql／PostgreSQL CLI；不把 adapter 模擬當 DB 驗收。
- **未驗證**：真實 SMTP 交付、實際校園信箱收件、完整真實 F18。需團隊提供允許網域、SMTP 與收件測試帳號；程式沒有正式假成功模式。
- 讀屏器及各實機完整視覺驗收未重跑；既有前端 DOM 測試通過不等同跨裝置驗收。
- 活動發布／期間故事差距見上文第 4 點，仍需團隊完成，不能宣稱整個專案所有 API 規格已實作。
- Git 相容性是完成當下對已記錄 main SHA 的結果，不保證未來其他 PR 推進後永久無衝突。
