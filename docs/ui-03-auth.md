# UI-03 註冊、登入與 Email 驗證介面

> 2026-11-16 整合更新：下方保留原分支實作／歷史驗收紀錄。現行 API 設定、安裝、migration、main 合併結果與未完成需求，請以 [loginAndRegist 整合說明](login-and-regist-integration.md) 的本次實測為準；需求不因歷史狀態描述而刪除。

共同基底 `5b1b0ab264817eeb23b0f9e44960f55595ba9ebc`，由 backup/auth-split-base-20261116 建立，沒有從 US-02 分支建立。後端契約依 US-02 的 docs/us-02-auth.md；需合併 US-02 才可執行完整帳號流程。本次使用者已明確要求 push 兩個功能分支，取代附件僅本機提交的流程。

## 原變更分拆

branch_Zhang 本機 tip 與基底完全相同；原遠端 tip 20fc94e 已在 main。原 HTML／CSS／app.js 的公開活動、搜尋與詳情保留。UI-03 只補帳號入口、報名提示及頁面；原型後端替換、密碼、JWT、migration 與 SMTP 屬於 US-02，不包含在本分支。

## 檔案與頁面

- login.html：Email／密碼，註冊及重寄入口，登入成功保存 token 再導回首頁／安全站內 return path。
- register.html：姓名、校園 Email、密碼／確認、校園身分；未提供性別選項。8–128 字元密碼不 trim；201 sent/failed 都呈現帳號已建立、清除密碼並引導驗證／重寄。
- verify-email.html：從 #token 讀取到記憶體後清網址，按確認才 POST；缺碼、400 無效、410 過期、409 已用、服務失敗各自提示，不自動登入。no-referrer，無第三方追蹤。
- resend-verification.html：Email、泛化 202、429 Retry-After 秒數／日期倒數、無效值可重試、503／斷線提示，優先開最新信。
- account.js／account.css：表單錯誤摘要、欄位 aria-invalid／describedby、焦點、live region、loading、頁面狀態。CSS 限帳號範圍。
- auth-session.js：直接沿用 origin/UI-06（2a73922）原模組；key ntou.auth.token，NtouSession.getToken/setToken/clear，ntou:session-change。未另建第二套 token。
- auth-client.js：集中 API request，保留 HTTP status／Retry-After；GET /users/me 裸 User，session generation 與 request id 防止晚到資料恢復登入。401 清 token，403／5xx 保留；焦點返回查 /me，可按「我已驗證，重新確認」。不保存姓名／角色快取。
- api-config.js：API base 集中設定，同源 8000／標準埠用 /api；其他開發埠預設本機 8000。正式部署可修改這一處；不透過 URL 指定任意 API 主機。
- index.html／app.js：訪客登入／註冊、登入者姓名／登出、待驗證提示；報名入口查目前 User，未驗證提供重寄，後端結果仍決定資格。原首頁沒有分類資料欄位，保留既有說明，未移除組員篩選功能。我的報名清單尚無實體頁，清楚提示其他任務待接，不假造清單。
- tests/：獨立 jsdom dev dependency、DOM／mock HTTP 測試與隔離 preview；正式 US-02 靜態白名單不公開 tests。

## API 契約

POST /api/auth/register → 201 {message,data:User,verification_email:{status:sent/failed}}；login → 200 {message,token,user}；GET /api/users/me → 裸 User；verify-email {token} → 200 message / 400 / 410 / 409；resend-verification {email} → 202 / 429 Retry-After / 503。錯誤為 {error:文字}，5xx／斷線不當帳密錯誤。報名 POST /api/events/:id/register 使用 Bearer，不傳 user_id；401 登出、403 引導驗證並保留 session。校園身分不授管理權。

## Windows 驗證

根目錄 `npm ci`、`npm --prefix tests ci`、`npm --prefix tests test`。目前 13 項 jsdom DOM／mock HTTP 測試通過，包含 F01–13、F14 搜尋／詳情、F16、F17 的主要狀態與 session race。不是完整真實 DB／SMTP 驗收。

`node tests/preview-ui03.js` 僅監聽 127.0.0.1:8123，不讀 .env、不連 DB。/register.html 檢視表單，/mobile 為 375px iframe；瀏覽器確認 scrollWidth=clientWidth=375，無水平溢出，桌面／窄版欄位正常；空白送出後焦點回姓名，驗證頁點確認後才呈現 mock 成功。其他裝置與讀屏器完整朗讀尚未實測。後端合併 US-02 後，設定 DB／SMTP 並執行 migration，根目錄 npm start；入口 /login.html、/register.html、/resend-verification.html、/verify-email.html。

## 尚需真實整合驗收

F18：小組須提供正式校園網域、專用 PostgreSQL、SMTP 與真實收件信箱後，執行註冊→收信→明確驗證→登入→合法報名，以及未驗證直接 API 報名無新增列。現有環境沒有提供，不能宣稱已完成。跨分頁以返回焦點／重新確認更新，sessionStorage 不跨分頁共享。登出僅此分頁，複製 JWT 可有效至到期。

兩分支本機驗證分支另行合併測試，不推送驗證分支，不合併 main、不刪除 branch_Zhang。若其他組員 UI-06 已新增同檔案，應保留既有模組與管理功能；此分支的 session 檔案與其來源相同。

## 2026-11-16 最終本機整合紀錄

- 本機驗證分支：verify/us02-ui03-20261116-final，功能整合 commit `8f6b76f2593485fa4f9133d733ab69ae25e4fef2`。
- 來源：US-02 `14e37c1`、UI-03 `11e4123`；從同一基底各自提交，合併無衝突。此段之後僅補交付文件。
- 整合後：10 項帳號服務／HTTP 測試、13 項 DOM/mock HTTP、24 項既有活動檢查全通過；語法檢查及 diff whitespace 檢查通過。
- 真實 loopback HTTP 靜態查核：首頁、四個帳號頁及所需資源共 13 個入口回 200；.git/config、server/.env、database/schema.sql、tests/preview-ui03.js 均回 404，未公開。
- 已測 HTTP + SQL adapter 的註冊→登入→未驗證直接報名 403 無寫入→驗證→同 JWT /me 更新→報名 201→重複 409。這是受控資料與郵件 adapter，不代表實際 PostgreSQL 或校園郵件已驗收。
- node server/registrations-check.js 因缺本機 DB 連線未完成；真實 migration、鎖競爭、重啟持久化、SMTP／校園收件及 F18 仍未驗收。正式校園網域與 SMTP 需小組提供，範例不是學校核准資料。
- 原 main、branch_Zhang 及本機備份保留；只推送 US-02 與 UI-03，驗證分支保留本機。建議團隊先審 US-02，再審 UI-03；完整介面流程需要兩者合併。
