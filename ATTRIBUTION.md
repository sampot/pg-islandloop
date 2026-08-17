# Attribution（pg-islandloop 環島賽）

本遊戲所有素材皆為授權可用；**即使授權（CC0）不要求署名，仍在此列出作者與來源**。
各 pack 原始授權全文放在 [`assets/licenses/`](./assets/licenses/)。

## 美術

| 遊戲內檔案 | 原始檔 | Pack | 作者 | 授權 | 來源 |
| --- | --- | --- | --- | --- | --- |
| `assets/art/terrain-grass.png` | `tileGrass1.png` | Top-down Tanks Redux | Kenney | CC0 | https://opengameart.org/content/top-down-tanks-redux |
| `assets/art/terrain-sand.png` | `tileSand1.png` | Top-down Tanks Redux | Kenney | CC0 | 同上 |
| `assets/art/tree-green.png` | `treeGreen_large.png` | Top-down Tanks Redux | Kenney | CC0 | 同上 |
| `assets/art/tree-brown.png` | `treeBrown_large.png` | Top-down Tanks Redux | Kenney | CC0 | 同上 |
| `assets/art/barrel.png` | `barrelRed_top.png` | Top-down Tanks Redux | Kenney | CC0 | 同上 |
| `assets/art/barricade.png` | `barricadeWood.png` | Top-down Tanks Redux | Kenney | CC0 | 同上 |
| `assets/art/fence-red.png` | `fenceRed.png` | Top-down Tanks Redux | Kenney | CC0 | 同上 |
| `assets/art/fence-yellow.png` | `fenceYellow.png` | Top-down Tanks Redux | Kenney | CC0 | 同上 |
| `assets/art/oil.png` | `oilSpill_large.png` | Top-down Tanks Redux | Kenney | CC0 | 同上 |
| `assets/art/smoke.png` | `White puff/whitePuff00.png` | Smoke Particles | Kenney | CC0 | https://kenney.nl/assets/smoke-particles |
| `assets/art/car-hatch.png` | `Previews/hatchback-sports.png` | Car Kit 3.1 | Kenney | CC0 | https://kenney.nl/assets/car-kit |
| `assets/art/car-race.png` | `Previews/race.png` | Car Kit 3.1 | Kenney | CC0 | 同上 |
| `assets/art/car-kart.png` | `Previews/kart-oodi.png` | Car Kit 3.1 | Kenney | CC0 | 同上 |
| `assets/art/car-future.png` | `Previews/race-future.png` | Car Kit 3.1 | Kenney | CC0 | 同上 |
| `assets/art/medal-gold.png` | `flat_medal1.png` | Medals | Kenney | CC0 | https://kenney.nl/assets/medals |
| `assets/art/medal-silver.png` | `flat_medal2.png` | Medals | Kenney | CC0 | 同上 |
| `assets/art/medal-bronze.png` | `flat_medal3.png` | Medals | Kenney | CC0 | 同上 |

賽道、車體、路緣、起跑線、煞車痕與 HUD 皆為本專案以 Canvas 2D 程序繪製，非外部素材。
車庫選車畫面使用 Car Kit 的 3/4 視角 preview 圖。

## 音效

| 遊戲內檔案 | 原始檔 | Pack | 作者 | 授權 | 來源 |
| --- | --- | --- | --- | --- | --- |
| `assets/audio/click.ogg` | `click1.ogg` | UI Audio | Kenney | CC0 | https://kenney.nl/assets/ui-audio |
| `assets/audio/count.ogg` | `bong_001.ogg` | Interface Sounds | Kenney | CC0 | https://kenney.nl/assets/interface-sounds |
| `assets/audio/go.ogg` | `confirmation_001.ogg` | Interface Sounds | Kenney | CC0 | 同上 |
| `assets/audio/lap.ogg` | `confirmation_002.ogg` | Interface Sounds | Kenney | CC0 | 同上 |
| `assets/audio/fail.ogg` | `error_004.ogg` | Interface Sounds | Kenney | CC0 | 同上 |
| `assets/audio/skid.ogg` | `scratch_002.ogg` | Interface Sounds | Kenney | CC0 | 同上 |
| `assets/audio/crash.ogg` | `impactMetal_heavy_001.ogg` | Impact Sounds | Kenney | CC0 | https://kenney.nl/assets/impact-sounds |
| `assets/audio/scrape.ogg` | `impactPlate_light_000.ogg` | Impact Sounds | Kenney | CC0 | 同上 |
| `assets/audio/buy.ogg` | `chip-lay-1.ogg` | Casino Audio | Kenney | CC0 | https://kenney.nl/assets/casino-audio |
| `assets/audio/engine.ogg` | `engineCircular_000.ogg`（裁成 3 秒無縫循環、轉單聲道） | Sci-fi Sounds | Kenney | CC0 | https://kenney.nl/assets/sci-fi-sounds |
| `assets/audio/nitro.ogg` | `thrusterFire_000.ogg`（裁短並加淡出） | Sci-fi Sounds | Kenney | CC0 | 同上 |
| `assets/audio/finish.ogg` | `Steel jingles/jingles_STEEL00.ogg` | Music Jingles | Kenney | CC0 | https://kenney.nl/assets/music-jingles |

引擎聲以 `playbackRate`／音量隨轉速即時調變，氮氣加速時疊上推進器音層。

## 音樂

Not Jam Music Pack — 作者 **Not Jam**（CC0）— https://not-jam.itch.io/not-jam-music-pack
（均取自 `Loopable_ogg/`，為節省行動網路流量重新編碼為較低位元率）

| 遊戲內檔案 | 原曲 | 用途 |
| --- | --- | --- |
| `assets/audio/bgm-menu.ogg` | `ChillMenu_Loopable.ogg` | 主畫面／車庫／計時榜 |
| `assets/audio/bgm-race.ogg` | `BreakbeatChips_Loopable.ogg` | 比賽中 |
| `assets/audio/bgm-victory.ogg` | `VictoryLap_Loopable.ogg` | 盃賽奪冠 |

## 素材庫

以上素材皆自 [`sampot/playgrounds` 的 `game-assets/`](https://github.com/sampot/playgrounds/tree/main/game-assets)
複製進本 repo（不在 runtime 依賴該路徑）；授權對照見
[`game-assets/ATTRIBUTION.md`](https://github.com/sampot/playgrounds/blob/main/game-assets/ATTRIBUTION.md)。

## 程式

遊戲程式（賽道生成、車輛物理、AI、UI）為本專案原創，授權見 [`LICENSE`](./LICENSE)。
