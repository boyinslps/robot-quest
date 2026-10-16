# Firebase 設定步驟（只要做一次，約 10 分鐘）

學生作答完成（和每進一關）時，成績會自動上傳到 Firebase；老師用 `teacher/` 後台登入後即時看到、並自動評分。免費的 Spark 方案就夠用（一場 30 人，寫入量大約 400 次，遠低於每日 2 萬次的額度）。

> 程式端已經全部接好，**只差你在 Firebase 主控台建立專案，並把設定貼進 `shared/firebase-config.js`**。沒設定時，學生端照常能玩（只存本機），後台用「匯入結果檔」。

## 1. 建立專案

1. 開 <https://console.firebase.google.com/>，用你的 Google 帳號登入 → **新增專案**。
2. 名稱隨意（例如 `robot-quest`），Google Analytics 可以**關掉**。

## 2. 開啟登入方式

左邊 **建構 → Authentication → 開始使用 → 登入方式**：

| 提供者 | 用途 | 動作 |
|---|---|---|
| **匿名** | 學生端（不用帳號，自動登入，只能寫自己的成績） | 啟用 |
| **Google** | 老師後台登入 | 啟用，專案支援電子郵件選你的 Gmail |

再到 **Authentication → 設定 → 已授權的網域**，加入網站網域：`boyinslps.github.io`（本機測試用的 `localhost` 預設就有）。

## 3. 建立 Firestore 資料庫

**建構 → Firestore Database → 建立資料庫** → 位置選 `asia-east1`（台灣）→ **正式版模式**。

## 4. 貼上安全規則（最重要）

1. 打開本專案的 [`firestore.rules`](firestore.rules)，把 `TEACHER_EMAIL@gmail.com` 換成老師的 Gmail（多位老師用逗號隔開：`['a@gmail.com', 'b@gmail.com']`）。
2. Firestore Database → **規則** → 整份貼上 → **發布**。

規則的效果：

- 學生（匿名）：只能**新增**成績，之後只能更新**自己**的那一筆；**讀不到任何人的成績**。
- 老師（規則裡的 Gmail）：可以讀取程式關成績、輸入組裝與面試分數（`scores`）、改設定（`config`）、刪除。
- 其他人：什麼都不行。


> **規則更新過就要重新貼**：加入組裝／面試分數之後，規則多了 `scores`、`config` 兩段。已經發布過舊版規則的話，請再整份貼上一次（Gmail 記得換成自己的）並按「發布」，否則後台會顯示「沒有讀取 scores 的權限」，組裝與面試分數也存不進去；學生端的背景調查（`survey` 欄位）也會被擋，成績整筆上傳失敗。
> `firestore.rules` 在公開的 GitHub 專案裡，Gmail 會被看見。如果不想公開，貼到主控台發布後，專案裡的檔案可以保留 `TEACHER_EMAIL@gmail.com` 不要 commit 真實信箱（主控台的規則才是實際生效的）。

## 5. 把設定貼進網站

**專案設定（齒輪）→ 一般 → 你的應用程式 → 新增應用程式 → 網頁 `</>`** → 註冊（不用設定 Hosting）→ 複製 `firebaseConfig`，貼進 [`shared/firebase-config.js`](shared/firebase-config.js) 的 `window.RQ_FIREBASE`。

這組設定不是密碼，本來就公開；真正的保護是第 4 步的規則。

## 6. 上線與使用

commit、push 到 GitHub（GitHub Pages 會自動更新），然後：

- **教師後台**：`https://boyinslps.github.io/robot-quest/teacher/` → 右上角「用 Google 登入」。
- **學生連結**：在後台「學生連結」欄輸入場次代碼（例如測驗日期 `1015`），複製連結給學生：`https://boyinslps.github.io/robot-quest/mockup/index.html?s=1015`。
  同一場次的成績會歸在一起，後台可以用「場次」篩選。

## 驗證有沒有接成功

1. 用學生連結玩一下（登入、進第 1 關），後台應該在幾秒內出現一列「進行中」。
2. 玩到時間結束或過完關，後台狀態變「完成」，學生端完成畫面顯示「成績已送出給老師」。
3. 後台登入後出現「沒有讀取權限」→ 檢查規則裡的 Gmail 是否一致、規則是否已按「發布」。
4. 登入彈窗出現 `auth/unauthorized-domain` → 第 2 步的「已授權的網域」沒加。
5. 學生端顯示「成績還沒傳成功」→ 檢查匿名登入有沒有啟用；學生端會每 20 秒自動重試，也有「再傳一次」按鈕；成績另外存在學生的瀏覽器，不會遺失。

## 隱私與資料保存

- 只收集年級、班級、座號與作答過程，**不收姓名**。
- 測驗結束後建議在後台按「匯出 CSV」存檔，需要時再用個人報告的「刪除這筆成績」清掉雲端資料。
- 學生用 `file://` 直接開 `index.html` 時 Firebase 不能運作，請一律用 GitHub Pages 的網址。

---

made by 資訊老師黃博胤
