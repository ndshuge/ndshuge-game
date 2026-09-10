# ndshuge-game

鼠哥的游戏合集。所有游戏通过 GitHub Pages 托管，打开即玩。

**在线地址：https://ndshuge.github.io/ndshuge-game/**

## 收录游戏

| 游戏 | 目录 | 类型 |
| --- | --- | --- |
| 西线前线 | `games/ww2-frontline/` | FPS · 二战战役 |
| 凝时 STILL | `games/still/` | 弹幕 · 时停 |
| 重力花园 | `games/gravity-garden/` | 物理解压 |
| 墨途 | `games/motu/` | 水墨平台 |
| 回声小径 | `games/echo-trail/` | 像素 · 回声 |
| 鼓点乒乓 | `games/beat-paddle/` | 音游 · 街机 |
| 慢光 LIGHTLAG | `games/lightlag/` | 太空 · 防御 |
| VOCALON! 节拍革命 | `games/vocalon-chaos/` | 音游 · 原曲 |
| 像素乒乓 CAT vs RAT | `games/pixel-pong/` | 街机 · 对决 |

## 怎么添加新游戏

1. 把游戏做成静态可玩形态（浏览器直接能跑的 HTML/JS，资源走相对路径），放进 `games/<游戏名>/`，入口必须是 `index.html`
2. 顺手把新游戏加进根目录 `index.html` 的卡片列表里
3. 维护者本机运行仓库根目录的 `推送更新.bat`（本地维护脚本，含令牌读取逻辑，不入库）
4. 等 1~2 分钟 Pages 部署完成，打开 https://ndshuge.github.io/ndshuge-game/games/<游戏名>/ 验证

## 约定

- 游戏必须是纯前端静态文件，不能依赖服务器
- 资源路径用相对路径（`./xxx.js`），不要用绝对路径（`/xxx.js`），否则子目录下打不开
- 单个游戏目录别超过 100MB（Pages 仓库软限制 1GB）
- 大厅卡片带点赞（Abacus 免费计数 API，namespace `ndshuge-game`，key=游戏 slug；同一浏览器 localStorage 防重复）
