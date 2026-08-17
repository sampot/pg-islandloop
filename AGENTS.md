# Agent instructions（`pg-islandloop` 環島賽）

你正在一個 **Playgrounds `kind: game`** 小品 repo（俯視競速）。

## 必讀（唯一權威，勿複製進本 repo）

開發契約、`window.PG`、`PG.libs`、UX 硬規則、可玩標準、DoD：

- **指南（blob）：** https://github.com/sampot/playgrounds/blob/main/docs/PG-GAME-AGENT-GUIDE.md
- **指南（raw，便於拉取）：** https://raw.githubusercontent.com/sampot/playgrounds/main/docs/PG-GAME-AGENT-GUIDE.md

**禁止**把上述指南全文（或其它宿主 SPEC）拷進本 repo。本檔只做指針。

## 本 repo 的結構

無 build step；`index.html` + `style.css` + `app.js`（`<script type="module">`）＋ `src/` 純模組。

| 檔案 | 職責 |
| --- | --- |
| `src/track.js` | 賽道生成（極座標環＋Catmull-Rom＋等弧長重採樣）、表面判定、道具擺放 |
| `src/physics.js` | 車輛動力學、抓地力、護欄／道具／車車碰撞 |
| `src/ai.js` | 對手前視駕駛（過彎速度、路線偏好、失誤） |
| `src/race.js` | 圈數／計時／名次／勝敗（`PHASE`、`stepRace`） |
| `src/garage.js` | 車輛規格、改裝定價與調校、盃賽積分 |
| `src/leaderboard.js`／`src/persist.js` | 計時榜與 `PG.kv`／`/api/kv` 存取 |
| `src/input.js` | 鍵盤＋觸控（搖桿／踏板）合流成單一控制向量 |
| `src/render.js`／`src/audio.js` | Canvas 2D 繪製、引擎聲與音效 |
| `app.js` | 畫面流程、HUD、rAF 迴圈 |

## 規矩

- 改動可執行邏輯（物理、賽道、AI、計分、持久化）**先寫失敗測試**再實作；`npx vitest run` 必須綠再 commit。
- 素材一律放 `assets/`，並在 `ATTRIBUTION.md` 署名（**CC0 也署名**）；勿 runtime 指向宿主 `game-assets/`。
- 禁止 `alert`／`confirm`／`prompt`；確認一律頁內面板（`askConfirm`）。
- Mobile-first：CSS 預設＝手機，用 `min-width` 增強。

## 交付前

依指南 **§11 Definition of Done** 自檢。
