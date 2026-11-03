# SPIKE 模擬器

給學生練習 LEGO SPIKE 的線上模擬器：用積木或 Python 寫程式，在模擬場地裡看機器人怎麼動。
這是**獨立的小工具**，和根目錄的「機器人闖關（篩選測驗）」、教師後台沒有任何程式或資料上的關聯。

## 怎麼開

直接用 Chrome 開 `spike-sim/index.html` 即可（需要網路，Blockly 與 Python 執行環境從 `cdn.jsdelivr.net` 載入）。

### 給學生使用（線上網址）

`.github/workflows/pages.yml` 會把 `spike-sim/` 部署到 GitHub Pages（只部署這個資料夾，不含篩選測驗與教師後台）。

1. 把程式合併到 `main`（之後只有 `spike-sim/` 更新才會重新部署）。
2. 到倉庫 **Settings → Pages**，把 **Source** 選成 **GitHub Actions**（只需設定一次）。
3. 到 **Actions** 確認「部署 SPIKE 模擬器」成功，網址通常是 `https://<帳號>.github.io/robot-quest/`。

學校網路若擋 `cdn.jsdelivr.net`，積木與 Python 模式都會打不開。

## 功能

- 左側彩色圓形類別列（動作、燈光、聲音、事件、控制、感測、運算、變數、我的積木）、Scratch 風格積木、右下角綠色執行鈕。
- **積木 ↔ Python 切換**：積木會轉成 SPIKE App 3 風格的 Python（`hub`、`motor_pair`、`color_sensor`、`runloop`…），Python 可直接修改並在模擬器執行（Pyodide，第一次載入約 10 MB）。Python 改過後不會變回積木。
- **報錯台**：執行前檢查積木（沒有事件積木、埠不符、缺條件、孤立積木）；執行時的錯誤與警告（含 Python，翻成中文並標出第幾行）列在報錯台，點一下跳到積木或程式行。
- 6 種場地（空白、尺規、循線、顏色區、迷宮、可拖曳障礙物）、主機 5×5 燈光矩陣、A～F 埠裝置（C～F 可選顏色／距離／力感測器）。
- 每個「當…」積木是獨立執行緒，可同時執行；有我的積木、傳送／接收訊息、計時器事件。
- 機器人設定：輪徑、輪距、轉向角度方向可校正，並有「真實模式」（馬達加減速、兩輪 ±1% 誤差）。
- 首頁（新專案、繼續、開啟檔案、積木與 Python 範例）；可儲存／開啟 `.json`，並自動保存在瀏覽器。

## 模擬的規格與限制

- 場地 300 × 200 公分，3 px = 1 公分；預設輪徑 56 mm、輪距 112 mm（請依你們的車型校正）。
- 馬達 A＝左輪、B＝右輪；Python 的 `motor_pair` 目前只支援 A、B。
- 距離感測器用 5 條射線偵測，顏色感測器讀場地底圖像素。
- 原始 yaw（`motion_sensor.tilt_angles()[0]`）為逆時針為正，依據 LEGO 範例推論，**尚未用真機驗證**；積木的「轉向角度」預設順時針為正，可在設定改。
- 執行 Python 前會自動在 `while`／`for` 迴圈開頭補上 `await`，所以 LEGO 範例裡沒寫 `await` 的迴圈也不會讓網頁凍結（但不在 `async def` 裡的迴圈無法處理）。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html`、`style.css`、`app.js` | 介面與執行流程 |
| `sim.js` | 物理、感測器、場景、積木呼叫的 API |
| `blocks.js` | 積木定義、JavaScript 程式產生器、工具箱、配色與圖示 |
| `pygen.js` | 積木 → Python 產生器 |
| `pyrun.js` | Pyodide 執行環境與 SPIKE Python API 子集、Python 錯誤解析 |
