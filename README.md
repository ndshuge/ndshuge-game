# 鼠哥游戏厅 · SHUGE GAMES

> 15 款浏览器小游戏：物理沙盒、像素动作、弹幕、生存挑战与音乐节奏，打开即玩。

**[进入游戏大厅 →](https://ndshuge.github.io/ndshuge-game/)** · [其他作品](https://ndshuge.github.io/ndshuge-galaxy/)

![LUMEN SIEGE 光核围城真实网页截图](docs/screenshots/lumen.png)

*截图展示游戏厅中的《光核围城》，并非游戏厅大厅首页。*

## 第一次来玩什么？

| 想体验的风格 | 先试试 |
| --- | --- |
| **3D 战场** | [西线前线](https://ndshuge.github.io/ndshuge-game/games/ww2-frontline/)：浏览器中的二战 FPS 原型 |
| **物理实验** | [重力花园](https://ndshuge.github.io/ndshuge-game/games/gravity-garden/)：点击生成刚体、改变重力 |
| **像素动作** | [LUMEN SIEGE](https://ndshuge.github.io/ndshuge-game/games/lumen-siege/)：怪物、升级与生存挑战 |
| **音游节奏** | [VOCALON!](https://ndshuge.github.io/ndshuge-game/games/vocalon-chaos/)：节拍与即时反馈 |

**[打开全部游戏 →](https://ndshuge.github.io/ndshuge-game/)**

<sub>部分 3D 和音频实验对设备、浏览器、硬件加速及首次互动有要求。入口可访问不等于已经完成所有设备的性能与操作验收。</sub>

## 15 款游戏

| 游戏 | 风格 | 在线试玩 |
| --- | --- | --- |
| 西线前线 | 3D FPS · 二战 | [Play](https://ndshuge.github.io/ndshuge-game/games/ww2-frontline/) |
| 凝时 STILL | 弹幕 · 时停 | [Play](https://ndshuge.github.io/ndshuge-game/games/still/) |
| 重力花园 | 物理沙盒 | [Play](https://ndshuge.github.io/ndshuge-game/games/gravity-garden/) |
| 墨途 | 水墨平台 | [Play](https://ndshuge.github.io/ndshuge-game/games/motu/) |
| 回声小径 | 像素 · 回声 | [Play](https://ndshuge.github.io/ndshuge-game/games/echo-trail/) |
| 鼓点乒乓 | 节奏街机 | [Play](https://ndshuge.github.io/ndshuge-game/games/beat-paddle/) |
| 慢光 LIGHTLAG | 太空防御 | [Play](https://ndshuge.github.io/ndshuge-game/games/lightlag/) |
| VOCALON! 节拍革命 | 音游 | [Play](https://ndshuge.github.io/ndshuge-game/games/vocalon-chaos/) |
| 像素乒乓 CAT vs RAT | 街机对战 | [Play](https://ndshuge.github.io/ndshuge-game/games/pixel-pong/) |
| 回带 REWINDER | 时间机制 | [Play](https://ndshuge.github.io/ndshuge-game/games/rewinder/) |
| 拾色 HUEBOUND | 涂色射击 | [Play](https://ndshuge.github.io/ndshuge-game/games/shise/) |
| 一闪 | 像素居合斩 | [Play](https://ndshuge.github.io/ndshuge-game/games/issen/) |
| 残光斩 GHOSTSLASH | 高速动作 | [Play](https://ndshuge.github.io/ndshuge-game/games/ghostslash/) |
| 光核围城 LUMEN SIEGE | 像素生存 | [Play](https://ndshuge.github.io/ndshuge-game/games/lumen-siege/) |
| 钟楼契约 BELL & BOND | 像素 · 昼夜循环 | [Play](https://ndshuge.github.io/ndshuge-game/games/belfry/) |

以上链接使用当前仓库的 Pages 目录结构；如遇无法运行，请在 Issue 中反馈浏览器与复现步骤。

## 旧版独立游戏整合

- [重力花园](games/gravity-garden/README.md) 原独立仓库与游戏厅现有 5 个对应游戏文件 SHA256 完全一致，之后主要维护游戏厅内版本。
- [西线前线](games/ww2-frontline/README.md) 已迁入独立仓库独有的敌人模型图鉴；相同路径的 11 个文件 SHA256 完全一致。
- 旧仓库会保留历史和原有 Pages 页面，避免旧链接中断。

## 本地运行

```bash
git clone https://github.com/ndshuge/ndshuge-game.git
cd ndshuge-game
python -m http.server 8000
```

浏览器访问 `http://localhost:8000/`。少数游戏可直接双击打开，建议使用 HTTP 服务避免浏览器限制本地资源。

## 自动化验收

`games/lumen-siege/` 已有结构与无头测试，运行：

```bash
node games/lumen-siege/tests/run-all.mjs
```

相应的 GitHub Actions 工作流在游戏源码变化时执行该命令。无头测试不替代浏览器实机验收，其他游戏仍需逐个补充测试。

## 贡献与维护

1. 新游戏放在 `games/<slug>/`，入口为 `index.html`，静态资源使用相对路径。
2. 同步更新大厅项目列表与此 README。
3. 不提交个人 Token、私有资料或硬编码凭据；建议通过 GitHub CLI 或系统凭据管理器推送。
4. 引入第三方音乐、图片、字体、模型时核对授权。整体开源许可证尚待确认，公开源码不等于自动准许商业再利用。

[报告问题](https://github.com/ndshuge/ndshuge-game/issues) · [作者主页](https://github.com/ndshuge)

## 安全与素材审查

[游戏素材来源与版权清单](docs/ASSET_PROVENANCE.md)
