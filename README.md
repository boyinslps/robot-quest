# 機器人闖關（篩選測驗）— mockup

臺南市勝利國小機器人校隊的選手篩選工具。學生用積木寫程式指揮機器人，系統記錄作答過程。

目前是 **mockup**：前端闖關（程式關）可以完整玩一輪；成績會上傳 Firebase。教師後台涵蓋選拔的三關（組裝、程式、面試）：程式自動評分，組裝與面試由老師輸入分數，並算出綜合成績（設定見 [FIREBASE_SETUP.md](FIREBASE_SETUP.md)）。

## 怎麼開

**最簡單**：直接用 Chrome 開 `mockup/index.html`（點兩下即可）。需要網路，因為 Blockly 暫時從 CDN 載入。

**開發用本機伺服器**（沒有 Node / Python 時，用 PowerShell）：

```bash
powershell -ExecutionPolicy Bypass -File mockup/serve.ps1 -Port 5173
```

然後開 <http://localhost:5173/>。

| 網址 | 用途 |
|---|---|
| `index.html` | 學生端：登入 → 背景調查（有沒有玩過積木程式、自評熟悉度）→ 說明 → 闖關 → 完成 |
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
  css/style.css
  js/icons.js       向量圖示（不使用 emoji）
  js/engine.js      模擬器引擎（純邏輯）：地圖、執行、感測、鏡像、積木數、編輯距離
  js/levels.js      所有關卡的地圖、開放積木、提示（不含參考解）
  js/blocks.js      Blockly 積木定義、主題、程式 ↔ 積木轉換
  js/mapview.js     SVG 地圖與機器人動畫
  js/cards.js       新積木說明卡（含如果…不然 的動畫示範）
  js/app.js         流程、計時、事件紀錄
  serve.ps1         本機預覽伺服器（-Root 可指定資料夾，例如整個專案根目錄）
shared/
  firebase-config.js  Firebase 設定（沒填就不連線）
  cloud.js            學生端上傳（匿名登入、失敗自動重試）
  scoring.js          評分標準：100 分、5 個面向、6 項能力、等級
teacher/
  index.html          教師後台（Google 登入）：三關總覽、單一關卡的全部學生與詳細表現、評分標準與設定
  dashboard.js        畫面；store.js 資料層（Firebase／本機）；teacher.css
firestore.rules      Firestore 安全規則（學生只能寫自己的、老師才能讀）
FIREBASE_SETUP.md    Firebase 一次性設定步驟
DECISIONS.md        設計決定與和原準則不同的地方（公開，不含答案）
private/            老師專用、不公開（.gitignore）：參考解、關卡與評分的自動驗證、含答案的設計筆記
```

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
