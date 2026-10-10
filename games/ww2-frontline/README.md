# 西线前线 · WW2 Frontline

**[在游戏厅直接游玩](https://ndshuge.github.io/ndshuge-game/games/ww2-frontline/)** · [原独立仓库](https://github.com/ndshuge/ww2-frontline)

浏览器三维第一人称射击实验，包含第一人称视角、战斗 HUD、敌人模型与战役提示。

## 历史迁移

与独立的 `ndshuge/ww2-frontline` 仓库逐文件比较，游戏厅已有的 11 个同路径文件 SHA256 完全一致。

此次将独立仓库中的 **敌人模型图鉴 HTML** 同步保存到本目录，避免归档时遗漏仍有价值的独立资源。原仓库的 Git 历史不做改写，旧 Pages 入口也不删除。

项目中的 Three.js 文件保留了原版权标注，模型、贴图和战斗语音等素材还需完成来源核实，详见仓库根目录 `docs/ASSET_PROVENANCE.md`。

## 本地运行

在游戏厅仓库根目录执行 `python -m http.server 8000`，然后打开 `http://localhost:8000/games/ww2-frontline/`。
