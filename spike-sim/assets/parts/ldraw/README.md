# LDraw 零件資料（SPIKE Prime 3D 模型）

這個資料夾是 SPIKE Prime 零件 3D 模型的來源檔，供 Three.js 的 `LDrawLoader` 載入。

## 來源與授權

- 來源：LDraw.org 官方零件庫 https://library.ldraw.org/library/official/
- 授權：LDraw 零件檔標示 **CC BY 4.0**（見各檔 `!LICENSE`，詳見 LDraw 的 CAreadme）。使用時需標示來源「LDraw.org」與作者（Philippe Hurbain 等）。
- 抓取日期：2026-11-17
- 全部來自官方庫（official），沒有用到未官方（unofficial）零件。
- 檔案內容未修改，保持原樣（檔名一律小寫）。

## 零件對照

| 零件 | LEGO 編號 | LDraw 檔名 | 說明 |
|---|---|---|---|
| 大型主機 | 45601 | `parts/45601c01.dat`（引用 `45601.dat`＋`45610.dat` 電池） | Electric Powered Up 6 Port Hub with Yellow Bottom |
| 大型角度馬達 | 45602 | `parts/54675.dat` | Large Angular Motor with Medium Azure Back（LDraw 以零件號 54675 命名） |
| 中型角度馬達 | 45603 | `parts/54696.dat`（指向 `54696p01.dat`） | Medium Angular Motor with Medium Azure Back and Hub Pattern |
| 距離感測器 | 45604 | `parts/37316.dat` | Powered Up Distance Sensor |
| 顏色感測器 | 45605 | `parts/37308.dat` | Powered Up Colour Sensor |
| 力感測器 | 45606 | `parts/37312.dat` | Powered Up Force Sensor |

LDraw 不用 LEGO Education 套件號（4560x），而是用零件號。不含傳輸線版本是 `xxxx.dat`，含捲線版是 `xxxxc01.dat`。

## 資料夾

- `parts/`：零件本體與 `u*.dat` 子零件
- `parts/s/`：子零件
- `p/`、`p/48/`、`p/8/`：基本圖元（標準、高解析、低解析）
- `LDConfig.ldr`：顏色定義
- `manifest.json`：抓到的檔案清單（共 229 個零件檔＋LDConfig，約 0.66 MB）

## 載入方式

見上一層的 `ldraw-test.html`：`loader.setPath('./ldraw/')`、`loader.setPartsLibraryPath('./ldraw/')`、`await loader.preloadMaterials('LDConfig.ldr')`。
LDraw 單位 1 LDU = 0.4 mm；LDraw 的 Y 軸朝下，載入後要把 Y 方向翻轉（scale y 為負）。
主色（顏色碼 16）預設是黃色；若要白色上蓋，載入時用 `1 15 0 0 0 1 0 0 0 1 0 0 0 1 <檔名>` 這樣的包裝行（見測試頁）。
