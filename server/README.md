# 海大活動報名系統後端

UI-04 我的活動、查詢與取消 API 的本機測試模式及驗收方式，請參考 [UI-04 說明](UI-04.md)。

使用 Node.js、Express 與 PostgreSQL。

## 第一次使用

在終端機進入 server 資料夾，安裝套件：

```powershell
npm.cmd install
```

將 `.env.example` 複製一份，命名為 `.env`，填入自己電腦的資料庫連線設定。

注意：
- `.env` 包含資料庫密碼，不要上傳 GitHub。
- 需要先準備 PostgreSQL 資料庫及資料表。
- 下載專案不會自動建立資料庫，也不會取得其他人的資料庫資料。

## 檢查資料庫連線

```powershell
node --env-file=.env db-check.js
```

## 啟動後端

```powershell
node --env-file=.env index.js
```

開啟 http://127.0.0.1:8000/api/health 檢查是否正常運作。

## US-05：查看自己的報名與取消紀錄

目前已完成：
- 依使用者編號查詢報名紀錄。
- 回傳相關活動資訊。
- 包含 registered 與 cancelled 狀態。
- 沒有紀錄時回傳 {"data":[]}。

相關檔案：
- registration-service.js：查詢資料庫的功能。
- registrations-check.js：本機測試程式。

執行本機測試：

```powershell
node --env-file=.env registrations-check.js
```

測試程式目前使用固定的使用者編號，請依自己的測試資料調整。

尚未完成：
- 串接登入驗證，取得目前登入者的使用者編號。

UI-04 分支已加入 GET /api/users/me/registrations、取消 API 與前端畫面；目前僅提供明確啟用的本機測試身分，資料庫整合仍需依 UI-04.md 驗收。

正式 API 的使用者編號必須從後端驗證過的登入資訊取得，不能直接相信前端傳入的編號。

原 registration-check 測試是「查看紀錄」；UI-04 的取消流程及測試方式請見 UI-04.md。
