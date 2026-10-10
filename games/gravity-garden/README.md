# 重力花园 · Gravity Garden

> 交互式浏览器物理沙盒。现作为[鼠哥游戏厅](https://ndshuge.github.io/ndshuge-game/)的一部分维护。

**[在游戏厅直接玩](https://ndshuge.github.io/ndshuge-game/games/gravity-garden/)** · [原项目历史](https://github.com/ndshuge/gravity-garden)

## 项目整合说明

原独立仓库 `ndshuge/gravity-garden` 与这里的游戏文件经过 SHA256 逐文件对比，5 个对应文件内容完全相同。原项目还附带用于独立启动的 `start.bat`、`server.py` 等辅助文件；这些部署脚本不属于浏览器游戏本体，因此未强行合并。

可直接访问上述 GitHub Pages 地址，或在游戏厅仓库根目录运行：

```bash
python -m http.server 8000
```

再访问 `http://localhost:8000/games/gravity-garden/`。

原独立仓库将保留可查阅的历史记录与旧网站入口，新功能统一在游戏厅维护。第三方 Three.js / Cannon.js 依赖及其他素材需另行检查授权。
