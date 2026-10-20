# 機器人闖關（篩選測驗）— mockup

臺南市勝利國小機器人校隊的選手篩選工具。學生用積木寫程式指揮機器人，系統記錄作答過程。

目前是 **mockup**：前端可以完整玩一輪（考試說明 → 登入 → Lego Quest 拼積木 → Robot Quest 積木程式）；成績會上傳 Firebase。教師後台涵蓋選拔的三關（組裝、程式、面試）：程式自動評分，組裝與面試由老師輸入分數，並算出綜合成績（設定見 [FIREBASE_SETUP.md](FIREBASE_SETUP.md)）。

## 怎麼開

**最簡單**：直接用 Chrome 開 `mockup/index.html`（點兩下即可）。需要網路，因為 Blockly 暫時從 CDN 載入。

**開發用本機伺服器**（沒有 Node / Python 時，用 PowerShell）：

```bash
powershell -ExecutionPolicy Bypass -File mockup/serve.ps1 -Port 5173
```

然後開 <http://localhost:5173/>。

| 網址 | 用途 |
|---|---|
| `index.html` | 學生端：考試說明（勾選確認）→ 登入（班級、座號）→ **Lego Quest**（實體積木組裝）→ 按「開始 Robot Quest」→ 背景調查 → 說明 → 闖關 → 完成 |
| `index.html?dev` | 開發模式：跳過登入，左下角可以跳關、切換 A/B 版、加 5 分鐘；老師電腦上有 `private/answers.js` 時還能「填入解答」 |

## 關卡

暖身（不計時）＋ 8 關 ＋ 隱藏關卡。每關只加一種新東西（第 7 關是綜合關），只有一張地圖，並混用前面學過的觀念。

| 關 | 名稱 | 新東西 |
|---|---|---|
| 0 | 暖身 | 拖曳、執行 |
| 1 | 轉個彎 | 向左轉、向右轉 |
| 2 | 爬樓梯 | 重複 N 次 |
| 3 | 旋轉 X 度 | 旋轉 90／-90／180／-180 |
| 4 | 寶特瓶轉彎 | 如果…就…不然就…（偵測前方的寶特瓶） |
| 5 | 搬運任務 | 夾取、放下 |
| 6 | 一直走到終點 | 一直做，直到到達終點 |
| 7 | 倉庫配送（綜合） | 夾取＋一直做＋同時偵測牆壁和寶特瓶（牆 → 轉彎，放置區前的寶特瓶 → 放下貨物）；「往前走 N 格」用字卡說明 |
| 8 | 修好它（魔王關） | 除錯（一個空間錯、一個邏輯錯） |
| 隱藏 | 循線挑戰 | 魔王關過關後才出現 |

詳細設計與取捨見 [DECISIONS.md](DECISIONS.md)。

## 檔案

```
mockup/
  index.html        學生端頁面
  css/style.css、css/lego.css
  js/icons.js       向量圖示（不使用 emoji）
  js/engine.js      模擬器引擎（純邏輯）：地圖、執行、感測、鏡像、積木數、編輯距離
  js/levels.js      所有關卡的地圖、開放積木、提示（不含參考解）
  js/blocks.js      Blockly 積木定義、主題、程式 ↔ 積木轉換
  js/mapview.js     SVG 地圖與機器人動畫
  js/cards.js       新積木說明卡（含如果…不然 的動畫示範）
  js/app.js         流程、計時、事件紀錄
  js/lego-model.js  Lego Quest 狀態機與計時（純邏輯）
  js/lego.js        Lego Quest 畫面、事件紀錄、老師密碼面板
  js/lego-config.js Lego Quest 設定（放行、時間、老師密碼）
  assets/guitar/    吉他說明書圖片與零件資料（不進 git，見下方 Lego Quest）
  serve.ps1         本機預覽伺服器（-Root 可指定資料夾，例如整個專案根目錄）
shared/
  firebase-config.js  Firebase 設定（沒填就不連線）
  cloud.js            學生端上傳（匿名登入、失敗自動重試）
  scoring.js          程式關評分標準：100 分、5 個面向、6 項能力、等級
  assembly-scoring.js 組裝評分：老師勾選四個等級（100／95／90／80）
teacher/
  index.html          教師後台（Google 登入）：三關總覽、單一關卡的全部學生與詳細表現、評分標準與設定
  dashboard.js        畫面；store.js 資料層（Firebase／本機）；teacher.css
  labels.html         Lego Quest 袋子標籤列印頁
firestore.rules      Firestore 安全規則（學生只能寫自己的、老師才能讀）
FIREBASE_SETUP.md    Firebase 一次性設定步驟
DECISIONS.md        設計決定與和原準則不同的地方（公開，不含答案）
private/            老師專用、不公開（.gitignore）：參考解、關卡／評分／Lego Quest 的自動驗證、含答案的設計筆記
lego quest/         Lego Quest 的規格書、原始 PDF 與壓縮檔（不進 git）
```

## Lego Quest（實體積木組裝）

選拔共三關：**組裝（Lego Quest）→ 程式（Robot Quest）→ 面試**。學生拿到一袋真的樂高積木，照網站上的官方說明書把**吉他**拼出來；網站負責清點、計時、翻說明書、記錄，**作品對不對由老師現場檢查**，在後台勾選等級。

**學生怎麼走**：考試說明（勾選「我已經理解並確認能遵守」）→ 輸入班級座號 → 清點 8 袋積木（A–H）→ 老師放行 → 倒數 3、2、1 → 看說明書組裝（12 步）→ 按「完成」→ 把作品交給老師 → 按「**開始 Robot Quest**」才進程式關。面試會在這兩關之間的空檔，由老師叫號到隔壁教室。

**老師要做的事**

1. **圖片資料夾**：`mockup/assets/guitar/`（圖片 1.2 MB）放在這台電腦上。**不要推到公開的 GitHub**（說明書來自 WRO 官方，已在 `.gitignore`）。沒有這個資料夾時，學生端會顯示「Lego Quest 無法開始」，老師用密碼面板可以跳過。
2. **列印袋子標籤**：開 `teacher/labels.html`，輸入座號範圍（例 1-8）→ 列印。每位學生 8 張（A–H），黑白列印也看得清楚。
3. **放行**：預設要老師放行，學生才能按「開始組裝」。在學生電腦按 **Ctrl+Shift+L**（或連續點畫面右下角的署名 5 下）→ 輸入老師密碼（預設 `1234`，請換掉，見 `mockup/js/lego-config.js`）→ 選「放行」。不想用放行：網址加 `?gate=0`。
4. **缺件**：學生按「我的積木有缺」→ 畫面鎖住，後台「組裝」分頁最上面會出現「缺件待處理」→ 到學生旁邊補積木，用同一個密碼面板選「已補件」或「沒有缺件（誤報）」。
5. **檢查作品**：後台「組裝」分頁，每位學生一列，在「檢查結果」勾選等級（完全正確 100、部分錯誤 95、較多錯誤 90、未完成 80），離開欄位就存好。用時、翻頁、放大次數、缺件回報只給老師參考。

**網址參數**：`?gate=0` 不用放行、`?cap=秒` 組裝時間（預設 720 秒 = 12 分鐘）、`?sec=1` 顯示剩餘秒數、`?lego=0` 不做 Lego Quest（直接 Robot Quest，也不顯示考試說明）。

**要求**：
- Firestore 規則多了 `assembly`、`rulesAck` 兩個欄位，**要重新貼規則並發布**，否則整筆上傳會被擋（見 [FIREBASE_SETUP.md](FIREBASE_SETUP.md)）。
- 組裝中重新整理頁面會回到原本的步驟，**計時不會重置也不會多給**。
- 用公開的 GitHub Pages 開會看不到說明書（圖片不在 repo 裡）；正式施測請用老師電腦或校內網路。

驗證：`private/lego-test.html`（狀態機、計時、還原、計分，55 項）。

## 新增或修改關卡

1. 在 `js/levels.js` 修改地圖（字元說明在 `js/engine.js` 開頭）。
2. 在 `private/answers.js` 補上這關的 `reference`（參考解）和 `wrong`（已知錯誤解；有積木上限的關卡，要加一個 `overLimit: true` 的寫死解法）。**參考解不要寫進 `levels.js`**，那個檔案會送到學生的瀏覽器。
3. 開 `private/selftest.html` 和 `private/scoring-test.html`，全部通過才算完成。B 版會自動鏡像，不用手寫。重排關卡時，`shared/scoring.js` 的 `TITLES`／`LEVELS` 也要跟著改（scoring-test 會檢查）。

## 教師後台與評分

- 後台：`teacher/index.html`（GitHub Pages：`/robot-quest/teacher/`）。Google 登入，帳號要在 `firestore.rules` 的教師名單裡。沒設定 Firebase、或網址加 `?local` 時是「本機模式」（資料只存這台電腦），程式關可匯入學生下載的 JSON。
- **總覽**：每位學生的組裝、程式、面試與綜合成績；切到「組裝／程式／面試」分頁，看該關全部學生的成績與詳細表現。
- **組裝、面試**：老師手動輸入（直接輸 0–100，或在「評分標準」設定評分項目分項評分；支援整班新增與從 Excel 批次貼上）。**程式**：學生作答後自動評分。
- **綜合** = 三關加權平均（預設 1:1:1，可調），三關都有分數才排名。
- 學生連結加場次代碼：`mockup/index.html?s=1015`，成績依場次分組。
- 評分標準寫在 `shared/scoring.js`，改了之後所有人立刻用新標準重算；`private/scoring-test.html` 要全部通過。
- 評分只是**篩選參考**：個人報告可替程式關加減分（±20）、寫備註，並標記最後決定（入選／候補／不錄取）。
- **組裝**不是輸入分數，是老師勾選四個等級（見上方 Lego Quest）；等級分數在 `shared/assembly-scoring.js` 的 `GRADES`。

## 還沒做／需要老師決定

- [ ] 安裝 Node.js 後，改成 Vite + TypeScript，Blockly 打包進本機（斷網可用）
- [ ] 重新整理頁面恢復進度
- [x] 計分模型：100 分／五個面向（見教師後台「評分標準」分頁、`shared/scoring.js`）
- [x] 成績上傳 Firebase、教師後台：三關總覽（組裝／程式／面試）、綜合成績與名次、組裝與面試手動輸入（可分項評分、批次貼上）、個人報告、CSV 匯出
- [ ] 評分權重與等級門檻是否合適（用第一批真實資料校正）
- [ ] 重播（用事件紀錄重現學生作答過程）
- [ ] 總時間 10 分鐘是否合適（`js/app.js` 的 `CONFIG.totalSec`）
- [ ] 是否由教師統一按「開始」

---

made by 資訊老師黃博胤
