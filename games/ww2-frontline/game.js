/* ============================================================
   西线前线 · FRONTLINE ASSAULT（沉浸式二战射击）
   手感母版继承自 DUST II AIM TRAINER v2.2（csgo-dust2-v2）
   换皮不换骨：武器数据 / 后坐力 / 散布 / 音效 / 动效参数全部原样继承
   只动了：地图（二战战场化）+ 玩法（新增坚守阵地波次模式）+ 皮肤
   ============================================================ */
'use strict';

window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(String(e.message || e)); });

(function () {

  /* ================= 工具 ================= */
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ================= DOM ================= */
  var canvas = document.getElementById('game');
  var hud = document.getElementById('hud');
  var menu = document.getElementById('menu');
  var crosshairEl = document.getElementById('crosshair');
  var radarCv = document.getElementById('radar');
  var radarCtx = radarCv.getContext('2d');
  var stKills = document.getElementById('st-kills');
  var stHs = document.getElementById('st-hs');
  var stStreak = document.getElementById('st-streak');
  var stAcc = document.getElementById('st-acc');
  var stHsr = document.getElementById('st-hsr');
  var stScore = document.getElementById('st-score');
  var timerEl = document.getElementById('timer');
  var resultEl = document.getElementById('result');
  var hpFill = document.getElementById('hp-fill');
  var hpNum = document.getElementById('hp-num');
  var ammoMain = document.getElementById('ammo-main');
  var feed = document.getElementById('feed');
  var centerMsg = document.getElementById('center-msg');
  var hurtEl = document.getElementById('hurt');
  var deathEl = document.getElementById('death');
  var sensInput = document.getElementById('sens');
  var sensVal = document.getElementById('sens-val');
  var startBtn = document.getElementById('start-btn');
  var menuStats = document.getElementById('menu-stats');
  var mFoot = document.getElementById('m-foot');
  var hint = document.getElementById('hint');

  /* ================= 渲染器 / 场景 / 相机 ================= */
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // v2.1 阴影
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb6b2a4, 55, 170);

  var camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 400);
  camera.rotation.order = 'YXZ';

  var hemi = new THREE.HemisphereLight(0xc9d4da, 0x8a8a78, 0.95);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xe8e2d2, 1.02);
  sun.position.set(60, 90, -50);
  scene.add(sun);
  scene.add(sun.target);
  // v2.1 太阳光阴影（方向恒定，位置跟随玩家保证全场阴影清晰）
  var SUN_DIR = new THREE.Vector3(60, 90, -50).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 300;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;

  /* ================= 地图系统（v2.2 三地图） ================= */
  var sky = null;                    // 天空球（模块级，阴影排除用）
  var MAP_SPAWN = { x: 0, z: 14, yaw: 0 };  // 玩家出生点（随地图）
  var MAP_HALF = 23.5;                     // 地图半宽（敌人游走/击退/雷达范围基准）
  var currentMap = 'dust';                 // 当前构建的地图 id
  var RADAR_LINES = [];              // 雷达附加墙线（随地图）
  var MAP_OBJECTS = [];              // 当前地图创建的物体（切换时清理）
  var WALLS = [];                    // 碰撞体（随地图重建）
  var SPAWNS = [];                   // 敌人刷点（随地图重建）
  function wallDef(x, z, w, d, h, mat) { return { x: x, z: z, w: w, d: d, h: h, mat: mat }; }

  /* ============ 二战环境道具（纯视觉/低碰撞，换皮层） ============ */
  var smokeTex = toSRGB(new THREE.CanvasTexture(makeCanvas(64, 128, function (g, w, h) {
    g.clearRect(0, 0, w, h);
    var grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, 'rgba(58,58,54,0.5)');
    grad.addColorStop(0.5, 'rgba(100,100,94,0.28)');
    grad.addColorStop(1, 'rgba(150,150,140,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  })));
  function smokePlume(x, z, h, s) {
    var p1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.8 }));
    p1.position.set(x, h * 0.5, z); p1.scale.set(s * 1.2, h, 1); scene.add(p1);
    var p2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.55 }));
    p2.position.set(x + 0.8, h * 0.72, z + 0.5); p2.scale.set(s, h * 0.8, 1); scene.add(p2);
    var p3 = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.35 }));
    p3.position.set(x + 1.4, h * 0.9, z + 1); p3.scale.set(s * 0.7, h * 0.6, 1); scene.add(p3);
  }
  function crater(x, z, r, color) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.25, 0.14, 10), new THREE.MeshLambertMaterial({ color: color }));
    m.position.set(x, 0.02, z); m.rotation.x = rand(-0.08, 0.08); scene.add(m);
    var rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.35, r * 1.45, 0.1, 10), new THREE.MeshLambertMaterial({ color: color, transparent: true, opacity: 0.6 }));
    rim.position.set(x, 0.0, z); scene.add(rim);
  }
  function barbwire(x, z, len, yaw) {
    var wireMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3e });
    var g = new THREE.Group();
    for (var i = 0; i < 3; i++) {
      var strand = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, len, 6), wireMat);
      strand.rotation.x = Math.PI / 2;
      strand.position.set(0, 0.42 + i * 0.4, 0);
      g.add(strand);
    }
    [-len / 2, len / 2].forEach(function (ox) {
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.85, 6), wireMat);
      post.position.set(ox, 0.92, 0);
      g.add(post);
    });
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    scene.add(g);
  }
  function tankWreck(x, z, len, w, h, color, dark) {
    // 坦克残骸：车体碰撞（尺寸同原集装箱）+ 炮塔 + 炮管 + 履带
    addProp({ x: x, z: z, w: len, d: w, h: h, y: 0, mat: new THREE.MeshLambertMaterial({ color: color }) });
    var turretMat = new THREE.MeshLambertMaterial({ color: dark });
    var turret = new THREE.Mesh(new THREE.BoxGeometry(len * 0.62, h * 0.42, w * 0.68), turretMat);
    turret.position.set(x, h + 0.12, z + 0.15); scene.add(turret);
    var gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, len * 0.85, 8), new THREE.MeshLambertMaterial({ color: 0x2c2a24 }));
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position.set(x, h + 0.12, z - w * 0.34); scene.add(gunBarrel);
    var muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.24, 8), turretMat);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(x, h + 0.12, z - w * 0.34 - len * 0.43); scene.add(muzzleBrake);
    // 履带（两侧）
    [-len / 2 + 0.55, len / 2 - 0.55].forEach(function (ox) {
      var track = new THREE.Mesh(new THREE.BoxGeometry(0.5, h * 0.7, w + 0.16), new THREE.MeshLambertMaterial({ color: 0x22221e }));
      track.position.set(x + ox, h * 0.35, z); scene.add(track);
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.52, 10), turretMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x + ox, h * 0.42, z); scene.add(wheel);
    });
  }

  function addProp(def) {
    var box = new THREE.Box3();
    box.setFromCenterAndSize(new THREE.Vector3(def.x, def.y + def.h / 2, def.z), new THREE.Vector3(def.w, def.h, def.d));
    WALLS.push({
      box: box, h: def.y + def.h, step: def.h <= 1.15,
      minX: def.x - def.w / 2, maxX: def.x + def.w / 2,
      minZ: def.z - def.d / 2, maxZ: def.z + def.d / 2
    });
    var m = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), def.mat);
    m.position.set(def.x, def.y + def.h / 2, def.z);
    scene.add(m);
    return m;
  }
  function clearMap() {
    MAP_OBJECTS.forEach(function (o) {
      scene.remove(o);
      if (o.traverse) o.traverse(function (c) {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (c.material.map) c.material.map.dispose();
          c.material.dispose();
        }
      });
    });
    MAP_OBJECTS = [];
    if (DECALS) { DECALS.slice().forEach(function (d) { scene.remove(d); }); DECALS.length = 0; }
    if (particles) { particles.slice().forEach(function (p) { scene.remove(p.obj); }); particles.length = 0; }
    WALLS.length = 0;
    if (beacon) { scene.remove(beacon); beacon = null; }
    // 清抛射物
    projectiles.slice().forEach(function (p) {
      if (p.obj) scene.remove(p.obj);
      if (p.flame) scene.remove(p.flame);
    });
    projectiles.length = 0;
    if (enemies) enemies.slice().forEach(enemyDeadRemove);
  }
  function toSRGB(tex) {
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    else tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  function makeCanvas(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  }
  var sunTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 128, function (g, w, h) {
    var grad = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,240,1)');
    grad.addColorStop(0.25, 'rgba(255,240,180,0.95)');
    grad.addColorStop(0.6, 'rgba(255,210,120,0.3)');
    grad.addColorStop(1, 'rgba(255,200,100,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  })));
  var cloudTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 64, function (g, w, h) {
    g.clearRect(0, 0, w, h);
    for (var i = 0; i < 26; i++) {
      g.fillStyle = 'rgba(255,255,255,' + rand(0.08, 0.2) + ')';
      g.beginPath(); g.arc(Math.random() * w, h / 2 + rand(-8, 8), rand(6, 20), 0, 7); g.fill();
    }
  })));
  function buildMap(mapId) {
    clearMap();
    MAP_HALF = 23.5;
    currentMap = mapId;
    // 快照构建前场景（相机 / 光 / 枪不属于地图）
    var before = {};
    scene.children.forEach(function (c) { before[c.id] = true; });

    if (mapId === 'snow') { buildSnowMap(); }
    else if (mapId === 'inferno') { buildInfernoMap(); }
    else if (mapId === 'c1') { buildLevel1(); }
    else if (mapId === 'c2') { buildLevel2(); }
    else if (mapId === 'c3') { buildLevel3(); }
    else if (mapId === 'c4') { buildLevel4(); }
    else if (mapId === 'campaign') { buildCampaignMap(); }
    else {
      /* ================= 程序纹理 ================= */

  // 泥土地（诺曼底乡间）
  var groundTex = toSRGB(new THREE.CanvasTexture(makeCanvas(512, 512, function (g, w, h) {
    g.fillStyle = '#8a7a5c'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 2600; i++) {
      var x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.6 + 0.2;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(105,90,60,' + rand(0.06, 0.28) + ')' : 'rgba(150,135,95,' + rand(0.06, 0.2) + ')';
      g.fillRect(x, y, r, r * rand(0.7, 1.6));
    }
    // 草斑
    for (var gr = 0; gr < 220; gr++) {
      g.fillStyle = 'rgba(110,120,60,' + rand(0.08, 0.3) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, rand(2, 8), rand(1, 5));
    }
    // 车辙 / 裂纹
    g.strokeStyle = 'rgba(70,58,38,0.3)'; g.lineWidth = 1;
    for (var j = 0; j < 40; j++) {
      g.beginPath(); var x0 = Math.random() * w, y0 = Math.random() * h;
      g.moveTo(x0, y0);
      for (var k = 0; k < 5; k++) g.lineTo(x0 + (Math.random() - 0.5) * 60, y0 + (Math.random() - 0.5) * 60);
      g.stroke();
    }
  })));
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(8, 8);

  // 墙体（废墟石墙）
  var wallTex = toSRGB(new THREE.CanvasTexture(makeCanvas(256, 256, function (g, w, h) {
    g.fillStyle = '#9a8f7d'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(70,62,50,0.5)'; g.lineWidth = 2;
    var bs = 64;
    for (var y = 0; y < h; y += bs) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    for (var x = 0; x < w; x += bs) {
      var row = Math.floor(x / bs) % 2;
      g.beginPath(); g.moveTo(x, row ? bs : 0); g.lineTo(x, h); g.stroke();
    }
    // 弹痕 / 污渍
    for (var i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(55,48,38,' + rand(0.05, 0.18) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, rand(4, 30), rand(3, 16));
    }
    // 砖块剥落
    for (var b2 = 0; b2 < 14; b2++) {
      g.fillStyle = 'rgba(190,175,150,' + rand(0.1, 0.3) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, rand(10, 40), rand(6, 18));
    }
  })));
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(1, 1);

  // 军绿补给箱
  var boxTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 128, function (g, w, h) {
    g.fillStyle = '#5d6b3a'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 200; i++) {
      g.fillStyle = 'rgba(60,75,40,' + rand(0.1, 0.35) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, rand(1, 6), rand(1, 10));
    }
    g.strokeStyle = 'rgba(35,45,22,0.9)'; g.lineWidth = 3;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.beginPath(); g.moveTo(w / 2, 3); g.lineTo(w / 2, h - 3); g.stroke();
  })));

  // 军绿麻袋
  var sandTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 128, function (g, w, h) {
    g.fillStyle = '#7a7d56'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 500; i++) {
      g.fillStyle = 'rgba(55,60,35,' + rand(0.1, 0.4) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  })));

  // 天空（阴天晨雾）
  var skyTex = toSRGB(new THREE.CanvasTexture(makeCanvas(16, 512, function (g, w, h) {
    var grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#4a5560');
    grad.addColorStop(0.42, '#7d8a92');
    grad.addColorStop(0.68, '#a8b0ad');
    grad.addColorStop(1, '#c8c4b2');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  })));
  var skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
  sky = new THREE.Mesh(new THREE.SphereGeometry(230, 24, 18), skyMat);
  scene.add(sky);

  // 太阳
  var sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false }));
  sunSprite.position.set(150, 100, -170);
  sunSprite.scale.set(70, 70, 1);
  scene.add(sunSprite);

  // 云
  for (var ci = 0; ci < 4; ci++) {
    var cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, fog: false, depthWrite: false, opacity: 0.8 }));
    cloud.position.set(rand(-120, 120), rand(60, 110), rand(-180, -60));
    cloud.scale.set(rand(50, 90), rand(22, 36), 1);
    scene.add(cloud);
  }

  // 远山（灰褐）
  function mountain(x, z, r, h, c) {
    var m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), new THREE.MeshLambertMaterial({ color: c, fog: true }));
    m.position.set(x, h / 2 - 2, z); scene.add(m);
  }
  mountain(-60, -110, 34, 30, 0x8a8476);
  mountain(0, -120, 40, 36, 0x848074);
  mountain(70, -100, 30, 26, 0x8a8072);
  mountain(-110, -70, 26, 20, 0x8e8474);
  mountain(120, -80, 24, 18, 0x88806e);
  // 诺曼底教堂钟楼（远处地标）
  var church = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 20, 6), new THREE.MeshLambertMaterial({ color: 0x8a7d68 }));
  church.position.set(52, 10, -95); scene.add(church);
  var spire = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 6), new THREE.MeshLambertMaterial({ color: 0x5f554a }));
  spire.position.set(52, 23.5, -95); scene.add(spire);
  var crossX = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: 0x3a352e }));
  crossX.position.set(52, 26.2, -95); scene.add(crossX);
  var crossY = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.4, 0.22), new THREE.MeshLambertMaterial({ color: 0x3a352e }));
  crossY.position.set(52, 26.8, -95); scene.add(crossY);

  /* ================= 地图 ================= */
  var WALL_DEFS = [
    // 外围围墙
    wallDef(0, -23.5, 50, 1, 3.4), wallDef(0, 23.5, 50, 1, 3.4),
    wallDef(-23.5, 0, 1, 50, 3.4), wallDef(23.5, 0, 1, 50, 3.4),
    // 拱门建筑墙
    wallDef(-7, -10.25, 1, 11.5, 3.4), wallDef(-7, 12.75, 1, 6.5, 3.4),
    wallDef(7, -10.25, 1, 11.5, 3.4), wallDef(7, 12.75, 1, 6.5, 3.4),
    // 中央沙袋
    wallDef(0, 2.6, 2.6, 1.1, 0.9),
    // 木箱
    wallDef(-3.4, -3.8, 1.3, 1.3, 1.0), wallDef(3.4, -3.8, 1.3, 1.3, 1.0),
    // 大箱
    wallDef(0, -9.2, 2.2, 2.2, 1.2),
    // 侧翼沙袋
    wallDef(-14, 2.6, 4.2, 1.0, 0.95), wallDef(14, 2.6, 4.2, 1.0, 0.95),
    // 侧翼箱子
    wallDef(-16.5, -6, 1.4, 1.4, 1.1), wallDef(16.5, -6, 1.4, 1.4, 1.1),
    // 拱门内侧掩体
    wallDef(-4.2, 5.6, 1.0, 1.0, 1.0), wallDef(4.2, 5.6, 1.0, 1.0, 1.0),
    // 高台（可跳上）
    wallDef(0, -21.6, 10, 4.6, 1.0),
    wallDef(-14.6, -20.6, 6, 3.6, 1.0),
    wallDef(14.6, -20.6, 6, 3.6, 1.0)
  ];

  WALLS.length = 0;
  WALL_DEFS.forEach(function (wd) {
    var box = new THREE.Box3();
    box.setFromCenterAndSize(new THREE.Vector3(wd.x, wd.h / 2, wd.z), new THREE.Vector3(wd.w, wd.h, wd.d));
    WALLS.push({
      box: box, h: wd.h, step: wd.h <= 1.15,
      minX: wd.x - wd.w / 2, maxX: wd.x + wd.w / 2,
      minZ: wd.z - wd.d / 2, maxZ: wd.z + wd.d / 2
    });
  });

  // 敌人刷点
  SPAWNS = [
    { x: -13.5, z: 7, y: 0 }, { x: 13.5, z: 7, y: 0 },
    { x: -4.5, z: -12, y: 0 }, { x: 4.5, z: -12, y: 0 },
    { x: -8.5, z: -17, y: 0 }, { x: 8.5, z: -17, y: 0 },
    { x: 0, z: -21.6, y: 1.0 },
    { x: -14.6, z: -20.6, y: 1.0 }, { x: 14.6, z: -20.6, y: 1.0 }
  ];
  MAP_SPAWN = { x: 0, z: 14, yaw: 0 };
  RADAR_LINES = [ [-7, -16, -7, -4.5], [-7, 9.5, -7, 16], [7, -16, 7, -4.5], [7, 9.5, 7, 16] ];

  /* ---- 地面与中央大道 ---- */
  var groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // 中央碎石大道
  var roadMat = new THREE.MeshLambertMaterial({ color: 0x8d8578 });
  var road = new THREE.Mesh(new THREE.BoxGeometry(13, 0.06, 22), roadMat);
  road.position.set(0, 0.01, 1);
  scene.add(road);
  // 大道边缘线
  var lineMat = new THREE.MeshBasicMaterial({ color: 0x6b6358 });
  [-6.5, 6.5].forEach(function (lx) {
    var edge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 22), lineMat);
    edge.position.set(lx, 0.01, 1); scene.add(edge);
  });

  /* ---- 墙网格 ---- */
  var wallMeshMat = new THREE.MeshLambertMaterial({ map: wallTex });
  var wallCapMat = new THREE.MeshLambertMaterial({ color: 0xb0a894 });
  var darkCapMat = new THREE.MeshLambertMaterial({ color: 0x5c5a48 });
  var stoneMat = new THREE.MeshLambertMaterial({ color: 0x8f8a78 });
  var boxMeshMat = new THREE.MeshLambertMaterial({ map: boxTex });
  var sandbagMat = new THREE.MeshLambertMaterial({ map: sandTex });

  WALL_DEFS.forEach(function (wd) {
    if (wd.h > 2.0) {
      // 高墙：墙体 + 顶石条
      var m = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.25, wd.d), wallMeshMat);
      m.position.set(wd.x, (wd.h - 0.25) / 2, wd.z); scene.add(m);
      var cap = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.1, 0.25, wd.d + 0.1), wallCapMat);
      cap.position.set(wd.x, wd.h - 0.125, wd.z); scene.add(cap);
    } else if (wd.h > 1.05) {
      var sm = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h, wd.d), sandbagMat);
      sm.position.set(wd.x, wd.h / 2, wd.z); scene.add(sm);
    } else {
      // 箱子/高台：深色基底 + 木纹顶
      var base = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.14, wd.d), darkCapMat);
      base.position.set(wd.x, (wd.h - 0.14) / 2, wd.z); scene.add(base);
      var top = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.02, 0.14, wd.d + 0.02), boxMeshMat);
      top.position.set(wd.x, wd.h - 0.07, wd.z); scene.add(top);
    }
  });

  // 拱门顶梁（视觉，跨门洞）
  var archMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
  [-4.5, 9.5].forEach(function (az) {
    var beam = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.9, 0.7), archMat);
    beam.position.set(0, 2.9, az); scene.add(beam);
    var beamEdge = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.25, 0.85), wallCapMat);
    beamEdge.position.set(0, 3.42, az); scene.add(beamEdge);
  });
  // 门洞侧装饰条
  [-7, 7].forEach(function (ax) {
    var strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.3), wallCapMat);
    strip.position.set(ax, 1.7, 11.5); scene.add(strip);
  });
  // 拱门立柱（纯视觉，不参与碰撞，避免与墙体重叠导致玩家瞬移）
  [-6.7, 6.7].forEach(function (px) {
    var pillar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 3.3, 0.62), archMat);
    pillar.position.set(px, 1.65, 0.3); scene.add(pillar);
    var capP = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.28, 0.78), wallCapMat);
    capP.position.set(px, 3.25, 0.3); scene.add(capP);
    var baseP = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 0.85), darkCapMat);
    baseP.position.set(px, 0.1, 0.3); scene.add(baseP);
  });

  // 电线杆（Dust2 元素）
  function pole(x, z) {
    var p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6.5, 6), new THREE.MeshLambertMaterial({ color: 0x4a4036 }));
    p.position.set(x, 3.25, z); scene.add(p);
    var arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.08), new THREE.MeshLambertMaterial({ color: 0x4a4036 }));
    arm.position.set(x, 5.6, z); scene.add(arm);
  }
  pole(-19, -2); pole(19, -2); pole(-19, 12); pole(19, 12);

  // 瓦砾装饰
  var rockMat = new THREE.MeshLambertMaterial({ color: 0x7a7262 });
  for (var ri = 0; ri < 16; ri++) {
    var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.1, 0.3), 0), rockMat);
    rock.position.set(rand(-22, 22), 0.08, rand(-22, 22));
    rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    scene.add(rock);
  }

  /* ---- v2 沙漠二元素：中门 / 集装箱 / A 平台箱 / 涂鸦 / 吉普 ---- */

  // 中门双门（锈铁门，中央大道北端）
  var doorMat = new THREE.MeshLambertMaterial({ color: 0x4a4a3c });
  var doorTrim = new THREE.MeshLambertMaterial({ color: 0x38382e });
  [-2.3, 2.3].forEach(function (dx) {
    var door = addProp({ x: dx, z: -9, w: 2.2, d: 0.3, h: 2.7, y: 0, mat: doorMat });
    var rail1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.34), doorTrim);
    rail1.position.set(dx, 1.5, -9); scene.add(rail1);
    var rail2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.34), doorTrim);
    rail2.position.set(dx, 2.3, -9); scene.add(rail2);
    var jamb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.9, 0.42), doorTrim);
    jamb.position.set(dx + (dx < 0 ? -1.32 : 1.32), 1.45, -9); scene.add(jamb);
  });

  // 坦克残骸（原集装箱位，碰撞尺寸不变）
  tankWreck(-17.5, -8, 6.2, 2.6, 2.6, 0x5a5848, 0x3c3a30);
  tankWreck(17.5, -8, 6.2, 2.6, 2.6, 0x4a5044, 0x2e3430);

  // A 平台箱子堆（平台顶 y=1.0）
  var crateMat2 = new THREE.MeshLambertMaterial({ map: boxTex });
  function platformCrate(x, z, s) {
    addProp({ x: x, z: z, w: s, d: s, h: s, y: 1.0, mat: crateMat2 });
    var band = new THREE.Mesh(new THREE.BoxGeometry(s + 0.04, 0.16, s + 0.04), darkCapMat);
    band.position.set(x, 1.0 + s - 0.1, z); scene.add(band);
  }
  platformCrate(-2.6, -21.6, 1.3);
  platformCrate(2.6, -21.6, 1.3);
  platformCrate(0, -23.0, 1.3);

  // 盟军涂鸦（OMAHA 海滩标语）
  var grafTex = toSRGB(new THREE.CanvasTexture(makeCanvas(256, 128, function (g, w, h) {
    g.clearRect(0, 0, w, h);
    g.font = '900 58px Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#e8e2d2'; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 8;
    g.strokeText('OMAHA', w / 2, 48); g.fillText('OMAHA', w / 2, 48);
    g.fillStyle = '#c24a3a'; g.strokeText('44', w / 2 + 6, 102); g.fillText('44', w / 2 + 6, 102);
    for (var i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(140,130,110,' + rand(0.1, 0.35) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, rand(6, 40), rand(4, 22));
    }
  })));
  var graf = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: grafTex, transparent: true, depthWrite: false }));
  graf.position.set(-8.8, 1.8, -23.02);
  scene.add(graf);

  // 被炸毁的军用吉普（Dust2 街景换皮）
  var carBodyMat = new THREE.MeshLambertMaterial({ color: 0x6e6a58 });
  var carDarkMat = new THREE.MeshLambertMaterial({ color: 0x4a483c });
  var tireMat = new THREE.MeshLambertMaterial({ color: 0x191919 });
  function addCar(x, z, yaw) {
    var car = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.75, 4.4), carBodyMat);
    body.position.y = 0.85; car.add(body);
    var hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 1.5), carDarkMat);
    hood.position.set(0, 1.32, 1.35); car.add(hood);
    var cab = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.6, 1.6), carDarkMat);
    cab.position.set(0, 1.3, -0.4); car.add(cab);
    var bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 1.5), carBodyMat);
    bed.position.set(0, 1.1, -1.9); car.add(bed);
    [-1.15, 1.15].forEach(function (tx) {
      [1.35, -1.35].forEach(function (tz) {
        var tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 10), tireMat);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(tx, 0.34, tz); car.add(tire);
      });
    });
    car.position.set(x, 0, z);
    car.rotation.y = yaw;
    scene.add(car);
    var box = new THREE.Box3();
    box.setFromCenterAndSize(new THREE.Vector3(x, 0.85, z), new THREE.Vector3(1.9, 1.7, 4.4));
    WALLS.push({ box: box, h: 1.7, step: false, minX: x - 0.95, maxX: x + 0.95, minZ: z - 2.2, maxZ: z + 2.2 });
  }
  addCar(-17.8, 8.2, Math.PI / 2);
  addCar(17.0, 13.5, -Math.PI / 3);

  /* ---- 诺曼底战场氛围：弹坑 / 铁丝网 / 烟柱 ---- */
  crater(-9.5, 9.5, 1.3, 0x4a4134);
  crater(9.5, 9.5, 1.0, 0x4a4134);
  crater(-20.5, -1, 1.2, 0x4a4134);
  crater(20.5, -1, 1.1, 0x4a4134);
  crater(-4, -14.5, 0.9, 0x4a4134);
  crater(4, -14.5, 0.9, 0x4a4134);
  barbwire(-19.6, 3, 3.6, 0.25);
  barbwire(19.6, 3, 3.6, -0.25);
  barbwire(-21.6, -12, 3.6, Math.PI / 2);
  barbwire(21.6, -12, 3.6, Math.PI / 2);
  smokePlume(8, 12, 9, 3.4);
  smokePlume(-8, 12, 7, 2.8);
  smokePlume(52, -93, 11, 4);

    }  // else：Dust 沙漠二（诺曼底废墟）

    // 收集本图新物体（相机 / 光 / 枪不属于地图）
    scene.children.forEach(function (c) {
      if (!before[c.id]) MAP_OBJECTS.push(c);
    });
    // 统一阴影
    scene.traverse(function (o) {
      if (o.isMesh && o !== sky) { o.castShadow = true; o.receiveShadow = true; }
    });
  }

  /* ================= 战役大地图（诺曼底纵深 · 82×82 四战区） ================= */
  function buildCampaignMap() {
    MAP_HALF = 40;

    // 地面：诺曼底纵深泥地
    var gTex = toSRGB(new THREE.CanvasTexture(makeCanvas(512, 512, function (g, w, h) {
      g.fillStyle = '#7d705a'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) {
        var x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.6 + 0.2;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(95,82,58,' + rand(0.06, 0.28) + ')' : 'rgba(140,125,92,' + rand(0.06, 0.2) + ')';
        g.fillRect(x, y, r, r * rand(0.7, 1.6));
      }
      for (var gr = 0; gr < 180; gr++) {
        g.fillStyle = 'rgba(100,110,55,' + rand(0.06, 0.22) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(2, 8), rand(1, 5));
      }
      g.strokeStyle = 'rgba(60,50,35,0.3)'; g.lineWidth = 1;
      for (var j = 0; j < 40; j++) {
        g.beginPath(); var x0 = Math.random() * w, y0 = Math.random() * h;
        g.moveTo(x0, y0);
        for (var k = 0; k < 5; k++) g.lineTo(x0 + (Math.random() - 0.5) * 60, y0 + (Math.random() - 0.5) * 60);
        g.stroke();
      }
    })));
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(10, 10);

    // 石墙（废墟）
    var wTex = toSRGB(new THREE.CanvasTexture(makeCanvas(256, 256, function (g, w, h) {
      g.fillStyle = '#8f8472'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,52,40,0.5)'; g.lineWidth = 2;
      var bs = 64;
      for (var y = 0; y < h; y += bs) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (var x = 0; x < w; x += bs) {
        var row = Math.floor(x / bs) % 2;
        g.beginPath(); g.moveTo(x, row ? bs : 0); g.lineTo(x, h); g.stroke();
      }
      for (var i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(50,44,34,' + rand(0.05, 0.18) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(4, 30), rand(3, 16));
      }
    })));
    wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping; wTex.repeat.set(1, 1);

    // 教堂石（浅灰）
    var cTex = toSRGB(new THREE.CanvasTexture(makeCanvas(256, 256, function (g, w, h) {
      g.fillStyle = '#a89e8c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(70,64,52,0.55)'; g.lineWidth = 2;
      var bs = 64;
      for (var y = 0; y < h; y += bs) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (var x = 0; x < w; x += bs) {
        var row = Math.floor(x / bs) % 2;
        g.beginPath(); g.moveTo(x, row ? bs : 0); g.lineTo(x, h); g.stroke();
      }
      for (var i = 0; i < 20; i++) {
        g.fillStyle = 'rgba(80,72,58,' + rand(0.05, 0.14) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(4, 24), rand(3, 14));
      }
    })));
    cTex.wrapS = cTex.wrapT = THREE.RepeatWrapping; cTex.repeat.set(1, 1);

    // 麻袋（滩头）
    var sTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 128, function (g, w, h) {
      g.fillStyle = '#76795a'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 500; i++) {
        g.fillStyle = 'rgba(52,58,34,' + rand(0.1, 0.4) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    })));

    // 军绿补给箱
    var bTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 128, function (g, w, h) {
      g.fillStyle = '#5a6840'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 200; i++) {
        g.fillStyle = 'rgba(58,72,40,' + rand(0.1, 0.35) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(1, 6), rand(1, 10));
      }
      g.strokeStyle = 'rgba(34,44,22,0.9)'; g.lineWidth = 3;
      g.strokeRect(3, 3, w - 6, h - 6);
    })));

    // 天空（阴天）
    var s2Tex = toSRGB(new THREE.CanvasTexture(makeCanvas(16, 512, function (g, w, h) {
      var grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#454f5a');
      grad.addColorStop(0.42, '#76838c');
      grad.addColorStop(0.68, '#a2aaa8');
      grad.addColorStop(1, '#c4c0ae');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    })));
    sky = new THREE.Mesh(new THREE.SphereGeometry(230, 24, 18), new THREE.MeshBasicMaterial({ map: s2Tex, side: THREE.BackSide, fog: false }));
    scene.add(sky);
    // 云
    for (var ci = 0; ci < 5; ci++) {
      var cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, fog: false, depthWrite: false, opacity: 0.6 }));
      cloud.position.set(rand(-140, 140), rand(55, 105), rand(-200, -40));
      cloud.scale.set(rand(55, 95), rand(24, 38), 1);
      scene.add(cloud);
    }

    // 地面
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshLambertMaterial({ map: gTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    // 中央大道（碎石路，贯通南北）
    var roadMat = new THREE.MeshLambertMaterial({ color: 0x7d7668 });
    var road = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 78), roadMat);
    road.position.set(0, 0.01, -1);
    scene.add(road);

    /* ============ 碰撞布局（视觉与碰撞精确贴合，无重叠） ============ */
    var WALL_DEFS = [
      // 外墙
      wallDef(0, -40.5, 83, 1, 4), wallDef(0, 40.5, 83, 1, 4),
      wallDef(-40.5, 0, 1, 83, 4), wallDef(40.5, 0, 1, 83, 4),
      // 滩头（南）
      wallDef(0, 37.5, 9, 1.3, 1.15),
      wallDef(-13, 36, 5, 1.3, 1.0), wallDef(13, 36, 5, 1.3, 1.0),
      wallDef(-21, 33, 1.3, 7, 0.95), wallDef(21, 33, 1.3, 7, 0.95),
      wallDef(-27, 29, 6, 1.3, 1.0), wallDef(27, 29, 6, 1.3, 1.0),
      wallDef(-34, 35, 6, 1.3, 1.0), wallDef(34, 35, 6, 1.3, 1.0),
      // 战壕
      wallDef(-15, 26, 11, 1.3, 1.9), wallDef(15, 26, 11, 1.3, 1.9),
      wallDef(-8, 21, 1.3, 10, 1.9), wallDef(8, 21, 1.3, 10, 1.9),
      wallDef(-15, 16, 11, 1.3, 1.9), wallDef(15, 16, 11, 1.3, 1.9),
      wallDef(-8, 11, 1.3, 10, 1.9), wallDef(8, 11, 1.3, 10, 1.9),
      wallDef(0, 23, 1.7, 1.7, 1.0), wallDef(0, 14, 1.7, 1.7, 1.0),
      wallDef(-28, 18, 8, 1.3, 1.1), wallDef(28, 18, 8, 1.3, 1.1),
      // 街道：左右楼
      wallDef(-24, -2, 14, 1.3, 3.2), wallDef(-24, -12, 14, 1.3, 3.2),
      wallDef(-31, -7, 1.3, 8.7, 3.2),
      wallDef(24, -2, 14, 1.3, 3.2), wallDef(24, -12, 14, 1.3, 3.2),
      wallDef(31, -7, 1.3, 8.7, 3.2),
      // 街道：东南/西南小屋（开口朝向中央大道：左小屋朝东 / 右小屋朝西）
      wallDef(-14, 8, 7, 1.3, 2.4), wallDef(-14, 2, 7, 1.3, 2.4),
      wallDef(-18.15, 5, 1.3, 7.3, 2.4),
      wallDef(14, 8, 7, 1.3, 2.4), wallDef(14, 2, 7, 1.3, 2.4),
      wallDef(18.15, 5, 1.3, 7.3, 2.4),
      // 广场掩体
      wallDef(-12, -7, 3, 1.3, 1.0), wallDef(12, -7, 3, 1.3, 1.0),
      wallDef(0, -5, 1.7, 1.7, 0.9), wallDef(0, -9, 1.7, 1.7, 0.9),
      // 街道入口（战壕南出口两侧）
      wallDef(-7, -14.5, 3.4, 1.3, 1.0), wallDef(7, -14.5, 3.4, 1.3, 1.0),
      // 教堂（门开南墙中间，门洞 2 米）
      wallDef(-4.5, -24, 7, 1.3, 5.0, cTex), wallDef(4.5, -24, 7, 1.3, 5.0, cTex),
      wallDef(0, -34, 14, 1.3, 5.0, cTex),
      wallDef(-6.5, -29, 1.3, 7, 5.0, cTex), wallDef(6.5, -29, 1.3, 7, 5.0, cTex),
      wallDef(0, -30, 4, 4, 1.0),
      // 教堂前广场
      wallDef(-4.5, -21, 3, 1.3, 1.0), wallDef(4.5, -21, 3, 1.3, 1.0),
      wallDef(-19, -20.5, 3, 1.3, 1.0), wallDef(19, -20.5, 3, 1.3, 1.0),
      wallDef(-8, -16, 3, 1.3, 0.95), wallDef(8, -16, 3, 1.3, 0.95),
      // 墓园（教堂西）
      wallDef(-18, -26, 12, 1.3, 1.4), wallDef(-18, -18, 12, 1.3, 1.4),
      wallDef(-12, -22, 1.3, 6.7, 1.4),
      // 侧翼
      wallDef(-34, 2, 8, 1.3, 1.0), wallDef(34, 2, 8, 1.3, 1.0),
      wallDef(-33.5, -10, 1.3, 8, 1.1), wallDef(33.5, -10, 1.3, 8, 1.1)
    ];

    // 碰撞登记
    WALL_DEFS.forEach(function (wd) {
      var box = new THREE.Box3();
      box.setFromCenterAndSize(new THREE.Vector3(wd.x, wd.h / 2, wd.z), new THREE.Vector3(wd.w, wd.h, wd.d));
      WALLS.push({
        box: box, h: wd.h, step: wd.h <= 1.15,
        minX: wd.x - wd.w / 2, maxX: wd.x + wd.w / 2,
        minZ: wd.z - wd.d / 2, maxZ: wd.z + wd.d / 2
      });
    });

    // 视觉生成
    var wallMeshMat = new THREE.MeshLambertMaterial({ map: wTex });
    var churchMat = new THREE.MeshLambertMaterial({ map: cTex });
    var wallCapMat = new THREE.MeshLambertMaterial({ color: 0x9a9384 });
    var stoneCapMat = new THREE.MeshLambertMaterial({ color: 0x8a8374 });
    var darkCapMat = new THREE.MeshLambertMaterial({ color: 0x565448 });
    var woodMat2 = new THREE.MeshLambertMaterial({ map: bTex });
    var sandbagMat = new THREE.MeshLambertMaterial({ map: sTex });
    WALL_DEFS.forEach(function (wd) {
      if (wd.h > 2.0) {
        var useMat = wd.mat === cTex ? churchMat : wallMeshMat;
        var m = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.25, wd.d), useMat);
        m.position.set(wd.x, (wd.h - 0.25) / 2, wd.z); scene.add(m);
        var cap = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.1, 0.25, wd.d + 0.1), wd.mat === cTex ? stoneCapMat : wallCapMat);
        cap.position.set(wd.x, wd.h - 0.125, wd.z); scene.add(cap);
      } else if (wd.h > 1.05) {
        var sm = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h, wd.d), sandbagMat);
        sm.position.set(wd.x, wd.h / 2, wd.z); scene.add(sm);
      } else {
        var base = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.14, wd.d), darkCapMat);
        base.position.set(wd.x, (wd.h - 0.14) / 2, wd.z); scene.add(base);
        var top = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.02, 0.14, wd.d + 0.02), woodMat2);
        top.position.set(wd.x, wd.h - 0.07, wd.z); scene.add(top);
      }
    });

    /* ============ 区域装饰 ============ */
    // 教堂尖顶 + 十字架（视觉）
    var spire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 4), stoneCapMat);
    spire.position.set(0, 7.5, -29); spire.rotation.y = Math.PI / 4; scene.add(spire);
    var spireBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.6), stoneCapMat);
    spireBase.position.set(0, 5.4, -29); scene.add(spireBase);
    var crossV = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.7, 0.2), darkCapMat);
    crossV.position.set(0, 9.7, -29); scene.add(crossV);
    var crossH = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.2), darkCapMat);
    crossH.position.set(0, 9.3, -29); scene.add(crossH);
    // 教堂彩窗（前墙两侧，发光）
    var stainedMat = new THREE.MeshLambertMaterial({ color: 0x9a7a3a, emissive: 0x6a4a1a });
    [-3.6, 3.6].forEach(function (wx) {
      var win = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.12), stainedMat);
      win.position.set(wx, 3.2, -24.3); scene.add(win);
      var win2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.12), stainedMat);
      win2.position.set(wx, 3.2, -34.3); scene.add(win2);
    });
    // 盟军旗帜（教堂尖顶）
    var flagTex = toSRGB(new THREE.CanvasTexture(makeCanvas(64, 32, function (g, w, h) {
      g.fillStyle = '#3a5a9a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8d8d0'; g.fillRect(w * 0.36, 0, w * 0.28, h);
      g.fillStyle = '#3a5a9a';
      for (var s = 0; s < 4; s++) {
        g.beginPath(); g.arc(w * 0.36 + (s % 2) * 9, 6 + Math.floor(s / 2) * 10, 3.4, 0, 7); g.fill();
      }
    })));
    var flag = new THREE.Sprite(new THREE.SpriteMaterial({ map: flagTex, transparent: true, depthWrite: false }));
    flag.position.set(1.4, 10.6, -29); flag.scale.set(2.4, 1.2, 1); scene.add(flag);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), darkCapMat);
    pole.position.set(1.4, 9.2, -29); scene.add(pole);

    // 滩头鹿砦（无碰撞，靠路边）
    function hedgehog(x, z, yaw) {
      var steelMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3e });
      var g = new THREE.Group();
      for (var k = 0; k < 3; k++) {
        var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), steelMat);
        beam.rotation.y = k * Math.PI / 3;
        beam.rotation.z = Math.PI / 2;
        beam.position.set(0, 0.55, 0);
        g.add(beam);
      }
      g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
    }
    hedgehog(-8, 31.5, 0.4); hedgehog(8, 31.5, -0.3);
    hedgehog(-18, 24, 0.8); hedgehog(18, 24, -0.6);
    hedgehog(-26, 12, 0.2); hedgehog(26, 12, -0.2);

    // 墓园墓碑
    var graveMat = new THREE.MeshLambertMaterial({ color: 0x8a8272 });
    [[-15, -25], [-17, -23], [-14, -21.5], [-20, -24], [-22, -22], [-16.5, -19.5], [-21, -19], [-19, -21]].forEach(function (p) {
      var gv = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.15), graveMat);
      gv.position.set(p[0], 0.43, p[1]); gv.rotation.y = rand(-0.25, 0.25); scene.add(gv);
    });

    // 战场痕迹：弹坑 / 铁丝网 / 烟柱 / 残骸
    crater(-32, 24, 1.4, 0x423b30);
    crater(32, 24, 1.2, 0x423b30);
    crater(-22, 8, 1.1, 0x423b30);
    crater(22, 8, 1.3, 0x423b30);
    crater(-27, -14, 1.2, 0x423b30);
    crater(27, -14, 1.0, 0x423b30);
    crater(-16, -10, 0.9, 0x423b30);
    crater(16, -10, 1.1, 0x423b30);
    crater(-5, -22, 1.0, 0x423b30);
    crater(5, -22, 1.0, 0x423b30);
    barbwire(-38, 28, 4, 0.2);
    barbwire(38, 28, 4, -0.2);
    barbwire(-38, -22, 4, Math.PI / 2);
    barbwire(38, -22, 4, Math.PI / 2);
    smokePlume(34, 35, 8, 3);
    smokePlume(-34, 35, 10, 3.4);
    smokePlume(24, -2, 9, 3.2);
    smokePlume(-24, -12, 7, 2.6);
    smokePlume(0, -33, 12, 4);

    // 敌方刷点（分区，供战役刷怪）
    CAMPAIGN_ZONES.beach = [{ x: -12, z: 34 }, { x: 12, z: 34 }, { x: -24, z: 27 }, { x: 24, z: 27 }, { x: 0, z: 31 }, { x: -30, z: 31 }, { x: 30, z: 31 }];
    CAMPAIGN_ZONES.trench = [{ x: -12, z: 24 }, { x: 12, z: 24 }, { x: -18, z: 19 }, { x: 18, z: 19 }, { x: 0, z: 20 }, { x: -25, z: 14 }, { x: 25, z: 14 }];
    CAMPAIGN_ZONES.street = [{ x: -20, z: -8 }, { x: 20, z: -8 }, { x: -8, z: -0.5 }, { x: 8, z: -0.5 }, { x: -12, z: -6 }, { x: 12, z: -6 }, { x: 0, z: -2 }];
    CAMPAIGN_ZONES.church = [{ x: -10, z: -18 }, { x: 10, z: -18 }, { x: -16, z: -24 }, { x: 16, z: -24 }, { x: -10, z: -28 }, { x: 10, z: -28 }, { x: 0, z: -22 }];
    SPAWNS = [].concat(CAMPAIGN_ZONES.beach, CAMPAIGN_ZONES.trench, CAMPAIGN_ZONES.street, CAMPAIGN_ZONES.church);
    MAP_SPAWN = { x: 0, z: 34, yaw: 0 };
    RADAR_LINES = [
      [-20.5, 25.35, -20.5, 26.65], [20.5, 25.35, 20.5, 26.65],
      [-20.5, 15.35, -20.5, 16.65], [20.5, 15.35, 20.5, 16.65],
      [-7.5, -24.65, -0.65, -24.65], [0.65, -24.65, 7.5, -24.65]
    ];
  }

  /* ================= 战役关卡 1：奥马哈滩头（56×56） ================= */
  function buildLevel1() {
    MAP_HALF = 28;
    // 沙滩 + 湿沙
    var gTex = toSRGB(new THREE.CanvasTexture(makeCanvas(512, 512, function (g, w, h) {
      g.fillStyle = '#b8a06a'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) {
        var x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.6 + 0.2;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(150,125,70,' + rand(0.06, 0.28) + ')' : 'rgba(210,185,130,' + rand(0.06, 0.2) + ')';
        g.fillRect(x, y, r, r * rand(0.7, 1.6));
      }
      g.strokeStyle = 'rgba(130,105,55,0.25)'; g.lineWidth = 1;
      for (var j = 0; j < 40; j++) {
        g.beginPath(); var x0 = Math.random() * w, y0 = Math.random() * h;
        g.moveTo(x0, y0);
        for (var k = 0; k < 5; k++) g.lineTo(x0 + (Math.random() - 0.5) * 60, y0 + (Math.random() - 0.5) * 60);
        g.stroke();
      }
    })));
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(8, 8);
    // 麻袋
    var sTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 128, function (g, w, h) {
      g.fillStyle = '#76795a'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 500; i++) {
        g.fillStyle = 'rgba(52,58,34,' + rand(0.1, 0.4) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    })));
    // 军绿箱
    var bTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 128, function (g, w, h) {
      g.fillStyle = '#5a6840'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 200; i++) {
        g.fillStyle = 'rgba(58,72,40,' + rand(0.1, 0.35) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(1, 6), rand(1, 10));
      }
      g.strokeStyle = 'rgba(34,44,22,0.9)'; g.lineWidth = 3;
      g.strokeRect(3, 3, w - 6, h - 6);
    })));
    // 海雾天空
    var s2Tex = toSRGB(new THREE.CanvasTexture(makeCanvas(16, 512, function (g, w, h) {
      var grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#4a5560');
      grad.addColorStop(0.42, '#7d8a92');
      grad.addColorStop(0.68, '#a8b0ad');
      grad.addColorStop(1, '#c4c0ae');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    })));
    sky = new THREE.Mesh(new THREE.SphereGeometry(230, 24, 18), new THREE.MeshBasicMaterial({ map: s2Tex, side: THREE.BackSide, fog: false }));
    scene.add(sky);
    hemi.color.set(0xc9d4da); hemi.groundColor.set(0x8a8a78); hemi.intensity = 0.95;
    sun.color.set(0xe8e2d2); sun.intensity = 1.0;
    SUN_DIR.set(60, 90, -50).normalize();
    scene.fog = new THREE.Fog(0xb6b2a4, 55, 170);
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshLambertMaterial({ map: gTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    var WALL_DEFS = [
      wallDef(0, -28.5, 59, 1, 4), wallDef(0, 28.5, 59, 1, 4),
      wallDef(-28.5, 0, 1, 59, 4), wallDef(28.5, 0, 1, 59, 4),
      wallDef(0, 21, 9, 1.3, 1.15),
      wallDef(-12, 19, 5, 1.3, 1.0), wallDef(12, 19, 5, 1.3, 1.0),
      wallDef(-19, 15, 1.3, 7, 0.95), wallDef(19, 15, 1.3, 7, 0.95),
      wallDef(-24, 10, 5, 1.3, 1.0), wallDef(24, 10, 5, 1.3, 1.0),
      wallDef(-8, 12, 1.3, 6, 1.0), wallDef(8, 12, 1.3, 6, 1.0),
      wallDef(0, 7, 2, 2, 0.9),
      wallDef(-15, 3, 3, 1.3, 1.0), wallDef(15, 3, 3, 1.3, 1.0),
      wallDef(0, -2, 8, 1.3, 1.15),
      wallDef(-18, -6, 5, 1.3, 1.0), wallDef(18, -6, 5, 1.3, 1.0),
      wallDef(-6, -10, 1.3, 6, 1.0), wallDef(6, -10, 1.3, 6, 1.0),
      wallDef(-23, -14, 6, 1.3, 0.95), wallDef(23, -14, 6, 1.3, 0.95)
    ];
    WALL_DEFS.forEach(function (wd) {
      var box = new THREE.Box3();
      box.setFromCenterAndSize(new THREE.Vector3(wd.x, wd.h / 2, wd.z), new THREE.Vector3(wd.w, wd.h, wd.d));
      WALLS.push({ box: box, h: wd.h, step: wd.h <= 1.15, minX: wd.x - wd.w / 2, maxX: wd.x + wd.w / 2, minZ: wd.z - wd.d / 2, maxZ: wd.z + wd.d / 2 });
    });
    var wallCapMat = new THREE.MeshLambertMaterial({ color: 0xb0a894 });
    var darkCapMat = new THREE.MeshLambertMaterial({ color: 0x5c5a48 });
    var woodMat2 = new THREE.MeshLambertMaterial({ map: bTex });
    var sandbagMat = new THREE.MeshLambertMaterial({ map: sTex });
    WALL_DEFS.forEach(function (wd) {
      if (wd.h > 2.0) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.25, wd.d), new THREE.MeshLambertMaterial({ color: 0x8f8472 }));
        m.position.set(wd.x, (wd.h - 0.25) / 2, wd.z); scene.add(m);
        var cap = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.1, 0.25, wd.d + 0.1), wallCapMat);
        cap.position.set(wd.x, wd.h - 0.125, wd.z); scene.add(cap);
      } else if (wd.h > 1.05) {
        var sm = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h, wd.d), sandbagMat);
        sm.position.set(wd.x, wd.h / 2, wd.z); scene.add(sm);
      } else {
        var base = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.14, wd.d), darkCapMat);
        base.position.set(wd.x, (wd.h - 0.14) / 2, wd.z); scene.add(base);
        var top = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.02, 0.14, wd.d + 0.02), woodMat2);
        top.position.set(wd.x, wd.h - 0.07, wd.z); scene.add(top);
      }
    });
    // 鹿砦
    function hedgehog(x, z, yaw) {
      var steelMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3e });
      var g = new THREE.Group();
      for (var k = 0; k < 3; k++) {
        var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), steelMat);
        beam.rotation.y = k * Math.PI / 3;
        beam.rotation.z = Math.PI / 2;
        beam.position.set(0, 0.5, 0);
        g.add(beam);
      }
      g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
    }
    hedgehog(-6, 17, 0.4); hedgehog(6, 17, -0.3);
    hedgehog(-16, 9, 0.8); hedgehog(16, 9, -0.6);
    hedgehog(-10, -1, 0.2); hedgehog(10, -1, -0.2);
    hedgehog(-21, -8, 0.5); hedgehog(21, -8, -0.5);
    crater(-4, -12, 1.1, 0x4a4134); crater(4, -12, 1.0, 0x4a4134);
    crater(-25, 5, 1.2, 0x4a4134); crater(25, 5, 1.2, 0x4a4134);
    smokePlume(21, -14, 8, 3); smokePlume(-21, -14, 6, 2.6);
    SPAWNS = [
      { x: -12, z: 13 }, { x: 12, z: 13 }, { x: -18, z: 8 }, { x: 18, z: 8 },
      { x: 0, z: 11 }, { x: -24, z: 4 }, { x: 24, z: 4 },
      { x: -6, z: -5 }, { x: 6, z: -5 }, { x: -16, z: -11 }, { x: 16, z: -11 }
    ];
    MAP_SPAWN = { x: 0, z: 24, yaw: 0 };
    RADAR_LINES = [[-8, 9, -8, 15], [8, 9, 8, 15], [0, 6, 0, 8]];
  }

  /* ================= 战役关卡 2：诺曼底战壕（56×56） ================= */
  function buildLevel2() {
    MAP_HALF = 28;
    var gTex = toSRGB(new THREE.CanvasTexture(makeCanvas(512, 512, function (g, w, h) {
      g.fillStyle = '#6f6248'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) {
        var x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.6 + 0.2;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(88,74,48,' + rand(0.06, 0.28) + ')' : 'rgba(140,120,80,' + rand(0.06, 0.2) + ')';
        g.fillRect(x, y, r, r * rand(0.7, 1.6));
      }
      g.strokeStyle = 'rgba(55,45,28,0.35)'; g.lineWidth = 1;
      for (var j = 0; j < 40; j++) {
        g.beginPath(); var x0 = Math.random() * w, y0 = Math.random() * h;
        g.moveTo(x0, y0);
        for (var k = 0; k < 5; k++) g.lineTo(x0 + (Math.random() - 0.5) * 60, y0 + (Math.random() - 0.5) * 60);
        g.stroke();
      }
    })));
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(8, 8);
    // 泥土墙
    var wTex = toSRGB(new THREE.CanvasTexture(makeCanvas(256, 256, function (g, w, h) {
      g.fillStyle = '#6e5c42'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(45,36,24,0.5)'; g.lineWidth = 2;
      var bs = 64;
      for (var y = 0; y < h; y += bs) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (var x = 0; x < w; x += bs) {
        var row = Math.floor(x / bs) % 2;
        g.beginPath(); g.moveTo(x, row ? bs : 0); g.lineTo(x, h); g.stroke();
      }
      for (var i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(38,30,20,' + rand(0.05, 0.18) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(4, 30), rand(3, 16));
      }
    })));
    wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping; wTex.repeat.set(1, 1);
    var s2Tex = toSRGB(new THREE.CanvasTexture(makeCanvas(16, 512, function (g, w, h) {
      var grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#3f4954');
      grad.addColorStop(0.42, '#6e7a84');
      grad.addColorStop(0.68, '#9aa29f');
      grad.addColorStop(1, '#bfbbaa');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    })));
    sky = new THREE.Mesh(new THREE.SphereGeometry(230, 24, 18), new THREE.MeshBasicMaterial({ map: s2Tex, side: THREE.BackSide, fog: false }));
    scene.add(sky);
    hemi.color.set(0xbfcbd2); hemi.groundColor.set(0x807866); hemi.intensity = 0.9;
    sun.color.set(0xddd6c4); sun.intensity = 0.92;
    SUN_DIR.set(50, 100, -40).normalize();
    scene.fog = new THREE.Fog(0xadaa9c, 50, 160);
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshLambertMaterial({ map: gTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    // 战壕木板路
    var plankMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
    for (var pl = 0; pl < 12; pl++) {
      var plank = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 0.5), plankMat);
      plank.position.set(0, 0.01, -18 + pl * 3.4);
      scene.add(plank);
    }

    var WALL_DEFS = [
      wallDef(0, -28.5, 59, 1, 4), wallDef(0, 28.5, 59, 1, 4),
      wallDef(-28.5, 0, 1, 59, 4), wallDef(28.5, 0, 1, 59, 4),
      // 锯齿战壕墙（1.2 米半人高：能看见墙后敌人，能对射）
      wallDef(-10, 20, 14, 1.3, 1.2), wallDef(10, 20, 14, 1.3, 1.2),
      wallDef(-4, 14, 1.3, 10.7, 1.2), wallDef(4, 14, 1.3, 10.7, 1.2),
      wallDef(-10, 8, 14, 1.3, 1.2), wallDef(10, 8, 14, 1.3, 1.2),
      wallDef(-4, 2, 1.3, 10.7, 1.2), wallDef(4, 2, 1.3, 10.7, 1.2),
      wallDef(-10, -4, 14, 1.3, 1.2), wallDef(10, -4, 14, 1.3, 1.2),
      wallDef(-4, -10.325, 1.3, 11.35, 1.2), wallDef(4, -10.325, 1.3, 11.35, 1.2),
      // 战壕内中央掩体
      wallDef(0, 17, 1.7, 1.7, 1.0), wallDef(0, 11, 1.7, 1.7, 1.0),
      wallDef(0, 5, 1.7, 1.7, 1.0), wallDef(0, -1, 1.7, 1.7, 1.0),
      // 通道两侧交错沙袋
      wallDef(-2.4, 18, 1.4, 1.4, 0.95), wallDef(2.4, 15, 1.4, 1.4, 0.95),
      wallDef(-2.4, 9.5, 1.4, 1.4, 0.95), wallDef(2.4, 6.5, 1.4, 1.4, 0.95),
      wallDef(-2.4, 1.5, 1.4, 1.4, 0.95), wallDef(2.4, -1.5, 1.4, 1.4, 0.95),
      wallDef(-2.4, -7, 1.4, 1.4, 0.95), wallDef(2.4, -10, 1.4, 1.4, 0.95),
      // 出口区沙袋阵
      wallDef(-2.4, -14.5, 1.4, 1.4, 0.95), wallDef(2.4, -16.5, 1.4, 1.4, 0.95),
      wallDef(0, -18.5, 1.6, 1.6, 1.0),
      // 侧翼通道掩体
      wallDef(-20, 2, 3, 1.3, 1.0), wallDef(20, 2, 3, 1.3, 1.0),
      wallDef(-13, -15, 1.3, 1.3, 1.0), wallDef(13, -15, 1.3, 1.3, 1.0),
      wallDef(-15, -12, 1.3, 8, 1.1), wallDef(15, -12, 1.3, 8, 1.1),
      wallDef(-18, 14, 1.3, 9, 1.1), wallDef(18, 14, 1.3, 9, 1.1),
      wallDef(-15, -18, 6, 1.3, 1.0), wallDef(15, -18, 6, 1.3, 1.0)
    ];
    WALL_DEFS.forEach(function (wd) {
      var box = new THREE.Box3();
      box.setFromCenterAndSize(new THREE.Vector3(wd.x, wd.h / 2, wd.z), new THREE.Vector3(wd.w, wd.h, wd.d));
      WALLS.push({ box: box, h: wd.h, step: wd.h <= 1.15, minX: wd.x - wd.w / 2, maxX: wd.x + wd.w / 2, minZ: wd.z - wd.d / 2, maxZ: wd.z + wd.d / 2 });
    });
    var dirtMat = new THREE.MeshLambertMaterial({ map: wTex });
    var capMat = new THREE.MeshLambertMaterial({ color: 0x8a8374 });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x4a4436 });
    var woodMat = new THREE.MeshLambertMaterial({ color: 0x6e5a42 });
    WALL_DEFS.forEach(function (wd) {
      if (wd.h > 2.0) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.25, wd.d), dirtMat);
        m.position.set(wd.x, (wd.h - 0.25) / 2, wd.z); scene.add(m);
        var cap = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.1, 0.25, wd.d + 0.1), capMat);
        cap.position.set(wd.x, wd.h - 0.125, wd.z); scene.add(cap);
      } else if (wd.h > 1.05) {
        var sm = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h, wd.d), dirtMat);
        sm.position.set(wd.x, wd.h / 2, wd.z); scene.add(sm);
      } else {
        var base = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.14, wd.d), darkMat);
        base.position.set(wd.x, (wd.h - 0.14) / 2, wd.z); scene.add(base);
        var top = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.02, 0.14, wd.d + 0.02), woodMat);
        top.position.set(wd.x, wd.h - 0.07, wd.z); scene.add(top);
      }
    });
    crater(-22, 10, 1.2, 0x3c3830); crater(22, 10, 1.1, 0x3c3830);
    crater(-20, -8, 1.0, 0x3c3830); crater(20, -8, 1.2, 0x3c3830);
    smokePlume(-24, -16, 7, 2.8); smokePlume(24, -16, 8, 3);
    SPAWNS = [
      { x: -12, z: 18 }, { x: 12, z: 18 }, { x: -7, z: 13 }, { x: 7, z: 13 },
      { x: -12, z: 7 }, { x: 12, z: 7 }, { x: 0, z: 15 }, { x: -18, z: 10 },
      { x: 18, z: 10 }, { x: -12, z: -2 }, { x: 12, z: -2 }
    ];
    MAP_SPAWN = { x: 0, z: 24, yaw: 0 };
    RADAR_LINES = [[-3, 8, -3, 20], [3, 8, 3, 20], [-3, -16, -3, -4], [3, -16, 3, -4]];
  }

  /* ================= 战役关卡 3：废墟街道（56×56） ================= */
  function buildLevel3() {
    MAP_HALF = 28;
    var gTex = toSRGB(new THREE.CanvasTexture(makeCanvas(512, 512, function (g, w, h) {
      g.fillStyle = '#8d8574'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) {
        var x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.6 + 0.2;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(112,102,82,' + rand(0.06, 0.28) + ')' : 'rgba(160,148,120,' + rand(0.06, 0.2) + ')';
        g.fillRect(x, y, r, r * rand(0.7, 1.6));
      }
      g.strokeStyle = 'rgba(70,62,48,0.3)'; g.lineWidth = 1;
      for (var j = 0; j < 40; j++) {
        g.beginPath(); var x0 = Math.random() * w, y0 = Math.random() * h;
        g.moveTo(x0, y0);
        for (var k = 0; k < 5; k++) g.lineTo(x0 + (Math.random() - 0.5) * 60, y0 + (Math.random() - 0.5) * 60);
        g.stroke();
      }
    })));
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(8, 8);
    var wTex = toSRGB(new THREE.CanvasTexture(makeCanvas(256, 256, function (g, w, h) {
      g.fillStyle = '#8a6a50'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,38,26,0.5)'; g.lineWidth = 2;
      var bs = 64;
      for (var y = 0; y < h; y += bs) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (var x = 0; x < w; x += bs) {
        var row = Math.floor(x / bs) % 2;
        g.beginPath(); g.moveTo(x, row ? bs : 0); g.lineTo(x, h); g.stroke();
      }
      for (var i = 0; i < 30; i++) {
        g.fillStyle = 'rgba(45,30,20,' + rand(0.05, 0.16) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(4, 28), rand(3, 14));
      }
    })));
    wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping; wTex.repeat.set(1, 1);
    var s2Tex = toSRGB(new THREE.CanvasTexture(makeCanvas(16, 512, function (g, w, h) {
      var grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#3a424d');
      grad.addColorStop(0.42, '#67737c');
      grad.addColorStop(0.68, '#949c99');
      grad.addColorStop(1, '#b8b4a2');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    })));
    sky = new THREE.Mesh(new THREE.SphereGeometry(230, 24, 18), new THREE.MeshBasicMaterial({ map: s2Tex, side: THREE.BackSide, fog: false }));
    scene.add(sky);
    hemi.color.set(0xb9c4ca); hemi.groundColor.set(0x7d7668); hemi.intensity = 0.88;
    sun.color.set(0xdad3c0); sun.intensity = 0.9;
    SUN_DIR.set(40, 80, -50).normalize();
    scene.fog = new THREE.Fog(0xa5a292, 50, 160);
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshLambertMaterial({ map: gTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    var WALL_DEFS = [
      wallDef(0, -28.5, 59, 1, 4), wallDef(0, 28.5, 59, 1, 4),
      wallDef(-28.5, 0, 1, 59, 4), wallDef(28.5, 0, 1, 59, 4),
      wallDef(0, 21, 9, 1.3, 1.15),
      wallDef(-15, 18, 1.3, 6, 1.0), wallDef(15, 18, 1.3, 6, 1.0),
      wallDef(-20, 8, 12, 1.3, 3.2), wallDef(-20, -4, 12, 1.3, 3.2),
      wallDef(-26, 2, 1.3, 9.6, 3.2),
      wallDef(20, 8, 12, 1.3, 3.2), wallDef(20, -4, 12, 1.3, 3.2),
      wallDef(26, 2, 1.3, 9.6, 3.2),
      wallDef(-10, -6, 3, 1.3, 1.0), wallDef(10, -6, 3, 1.3, 1.0),
      wallDef(0, -4, 1.7, 1.7, 0.9), wallDef(0, -8, 1.7, 1.7, 0.9),
      wallDef(-8, -14, 4, 1.3, 1.0), wallDef(8, -14, 4, 1.3, 1.0),
      wallDef(0, -18, 6, 1.3, 1.15),
      wallDef(-20, -18, 1.3, 8, 1.1), wallDef(20, -18, 1.3, 8, 1.1),
      wallDef(-26, -22, 5, 1.3, 1.0), wallDef(26, -22, 5, 1.3, 1.0)
    ];
    WALL_DEFS.forEach(function (wd) {
      var box = new THREE.Box3();
      box.setFromCenterAndSize(new THREE.Vector3(wd.x, wd.h / 2, wd.z), new THREE.Vector3(wd.w, wd.h, wd.d));
      WALLS.push({ box: box, h: wd.h, step: wd.h <= 1.15, minX: wd.x - wd.w / 2, maxX: wd.x + wd.w / 2, minZ: wd.z - wd.d / 2, maxZ: wd.z + wd.d / 2 });
    });
    var brickMat = new THREE.MeshLambertMaterial({ map: wTex });
    var stoneMat = new THREE.MeshLambertMaterial({ color: 0xb0a894 });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x56544a });
    var boxMat = new THREE.MeshLambertMaterial({ color: 0x5a6840 });
    WALL_DEFS.forEach(function (wd) {
      if (wd.h > 2.0) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.25, wd.d), brickMat);
        m.position.set(wd.x, (wd.h - 0.25) / 2, wd.z); scene.add(m);
        var cap = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.1, 0.25, wd.d + 0.1), stoneMat);
        cap.position.set(wd.x, wd.h - 0.125, wd.z); scene.add(cap);
      } else if (wd.h > 1.05) {
        var sm = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h, wd.d), new THREE.MeshLambertMaterial({ color: 0x7a7d56 }));
        sm.position.set(wd.x, wd.h / 2, wd.z); scene.add(sm);
      } else {
        var base = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.14, wd.d), darkMat);
        base.position.set(wd.x, (wd.h - 0.14) / 2, wd.z); scene.add(base);
        var top = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.02, 0.14, wd.d + 0.02), boxMat);
        top.position.set(wd.x, wd.h - 0.07, wd.z); scene.add(top);
      }
    });
    // 残楼窗户（发光）
    var winMat = new THREE.MeshLambertMaterial({ color: 0x9a7a3a, emissive: 0x6a4a1a });
    [-20, 20].forEach(function (wx) {
      [-2, 6].forEach(function (wz) {
        var win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.12), winMat);
        win.position.set(wx, 2.4, wz); scene.add(win);
      });
    });
    crater(-5, -12, 1.0, 0x3a342c); crater(5, -12, 1.1, 0x3a342c);
    crater(-22, 4, 1.2, 0x3a342c); crater(22, 4, 1.0, 0x3a342c);
    smokePlume(-20, 8, 9, 3); smokePlume(20, -4, 7, 2.6);
    smokePlume(0, -20, 6, 2.4);
    SPAWNS = [
      { x: -12, z: 16 }, { x: 12, z: 16 }, { x: -6, z: 13 }, { x: 6, z: 13 },
      { x: -20, z: 10 }, { x: 20, z: 10 }, { x: -10, z: 2 }, { x: 10, z: 2 },
      { x: -14, z: -4 }, { x: 14, z: -4 }, { x: 0, z: -2 }, { x: -8, z: -10 }
    ];
    MAP_SPAWN = { x: 0, z: 24, yaw: 0 };
    RADAR_LINES = [[-14, 7.35, -14, 8.65], [14, 7.35, 14, 8.65], [-14, -4.65, -14, -3.35], [14, -4.65, 14, -3.35]];
  }

  /* ================= 战役关卡 4：教堂高地（56×56） ================= */
  function buildLevel4() {
    MAP_HALF = 28;
    var gTex = toSRGB(new THREE.CanvasTexture(makeCanvas(512, 512, function (g, w, h) {
      g.fillStyle = '#8f8a7a'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) {
        var x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.6 + 0.2;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(114,108,90,' + rand(0.06, 0.28) + ')' : 'rgba(166,160,138,' + rand(0.06, 0.2) + ')';
        g.fillRect(x, y, r, r * rand(0.7, 1.6));
      }
      g.strokeStyle = 'rgba(72,66,52,0.3)'; g.lineWidth = 1;
      for (var j = 0; j < 40; j++) {
        g.beginPath(); var x0 = Math.random() * w, y0 = Math.random() * h;
        g.moveTo(x0, y0);
        for (var k = 0; k < 5; k++) g.lineTo(x0 + (Math.random() - 0.5) * 60, y0 + (Math.random() - 0.5) * 60);
        g.stroke();
      }
    })));
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(8, 8);
    var cTex = toSRGB(new THREE.CanvasTexture(makeCanvas(256, 256, function (g, w, h) {
      g.fillStyle = '#a89e8c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(70,64,52,0.55)'; g.lineWidth = 2;
      var bs = 64;
      for (var y = 0; y < h; y += bs) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (var x = 0; x < w; x += bs) {
        var row = Math.floor(x / bs) % 2;
        g.beginPath(); g.moveTo(x, row ? bs : 0); g.lineTo(x, h); g.stroke();
      }
      for (var i = 0; i < 20; i++) {
        g.fillStyle = 'rgba(80,72,58,' + rand(0.05, 0.14) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(4, 24), rand(3, 14));
      }
    })));
    cTex.wrapS = cTex.wrapT = THREE.RepeatWrapping; cTex.repeat.set(1, 1);
    var s2Tex = toSRGB(new THREE.CanvasTexture(makeCanvas(16, 512, function (g, w, h) {
      var grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#3a4a5a');
      grad.addColorStop(0.42, '#7a8a94');
      grad.addColorStop(0.68, '#b0b4a8');
      grad.addColorStop(1, '#d4ccb4');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    })));
    sky = new THREE.Mesh(new THREE.SphereGeometry(230, 24, 18), new THREE.MeshBasicMaterial({ map: s2Tex, side: THREE.BackSide, fog: false }));
    scene.add(sky);
    hemi.color.set(0xc4d2da); hemi.groundColor.set(0x8a8478); hemi.intensity = 1.0;
    sun.color.set(0xf0e8d4); sun.intensity = 1.05;
    SUN_DIR.set(30, 70, -60).normalize();
    scene.fog = new THREE.Fog(0xbdb6a4, 55, 175);
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshLambertMaterial({ map: gTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    var WALL_DEFS = [
      wallDef(0, -28.5, 59, 1, 4), wallDef(0, 28.5, 59, 1, 4),
      wallDef(-28.5, 0, 1, 59, 4), wallDef(28.5, 0, 1, 59, 4),
      wallDef(0, 21, 9, 1.3, 1.15),
      wallDef(-4.5, -10, 7, 1.3, 5.0, cTex), wallDef(4.5, -10, 7, 1.3, 5.0, cTex),
      wallDef(0, -20, 14, 1.3, 5.0, cTex),
      wallDef(-6.5, -15, 1.3, 7, 5.0, cTex), wallDef(6.5, -15, 1.3, 7, 5.0, cTex),
      wallDef(0, -16, 4, 4, 1.0),
      wallDef(-14, -8, 5, 1.3, 1.0), wallDef(14, -8, 5, 1.3, 1.0),
      wallDef(-19, -4, 1.3, 9, 1.1), wallDef(19, -4, 1.3, 9, 1.1),
      wallDef(-8, -4, 3, 1.3, 0.95), wallDef(8, -4, 3, 1.3, 0.95),
      wallDef(-18, -13, 12, 1.3, 1.4), wallDef(-18, -25, 12, 1.3, 1.4),
      wallDef(-12, -19, 1.3, 10.7, 1.4),
      wallDef(-23, 4, 5, 1.3, 1.0), wallDef(23, 4, 5, 1.3, 1.0),
      wallDef(-22, 12, 1.3, 8, 1.1), wallDef(22, 12, 1.3, 8, 1.1),
      wallDef(-5, 16, 3, 1.3, 0.95), wallDef(5, 16, 3, 1.3, 0.95)
    ];
    WALL_DEFS.forEach(function (wd) {
      var box = new THREE.Box3();
      box.setFromCenterAndSize(new THREE.Vector3(wd.x, wd.h / 2, wd.z), new THREE.Vector3(wd.w, wd.h, wd.d));
      WALLS.push({ box: box, h: wd.h, step: wd.h <= 1.15, minX: wd.x - wd.w / 2, maxX: wd.x + wd.w / 2, minZ: wd.z - wd.d / 2, maxZ: wd.z + wd.d / 2 });
    });
    var churchMat = new THREE.MeshLambertMaterial({ map: cTex });
    var stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a8374 });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x56544a });
    var boxMat = new THREE.MeshLambertMaterial({ color: 0x5a6840 });
    WALL_DEFS.forEach(function (wd) {
      if (wd.h > 2.0) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.25, wd.d), wd.mat === cTex ? churchMat : stoneMat);
        m.position.set(wd.x, (wd.h - 0.25) / 2, wd.z); scene.add(m);
        var cap = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.1, 0.25, wd.d + 0.1), stoneMat);
        cap.position.set(wd.x, wd.h - 0.125, wd.z); scene.add(cap);
      } else if (wd.h > 1.05) {
        var sm = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h, wd.d), new THREE.MeshLambertMaterial({ color: 0x76795a }));
        sm.position.set(wd.x, wd.h / 2, wd.z); scene.add(sm);
      } else {
        var base = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.14, wd.d), darkMat);
        base.position.set(wd.x, (wd.h - 0.14) / 2, wd.z); scene.add(base);
        var top = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.02, 0.14, wd.d + 0.02), boxMat);
        top.position.set(wd.x, wd.h - 0.07, wd.z); scene.add(top);
      }
    });
    // 教堂尖顶 + 十字架 + 旗帜
    var spire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 4), stoneMat);
    spire.position.set(0, 7.5, -15); spire.rotation.y = Math.PI / 4; scene.add(spire);
    var spireBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.6), stoneMat);
    spireBase.position.set(0, 5.4, -15); scene.add(spireBase);
    var crossV = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.7, 0.2), darkMat);
    crossV.position.set(0, 9.7, -15); scene.add(crossV);
    var crossH = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.2), darkMat);
    crossH.position.set(0, 9.3, -15); scene.add(crossH);
    var flagTex = toSRGB(new THREE.CanvasTexture(makeCanvas(64, 32, function (g, w, h) {
      g.fillStyle = '#3a5a9a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8d8d0'; g.fillRect(w * 0.36, 0, w * 0.28, h);
      g.fillStyle = '#3a5a9a';
      for (var s = 0; s < 4; s++) {
        g.beginPath(); g.arc(w * 0.36 + (s % 2) * 9, 6 + Math.floor(s / 2) * 10, 3.4, 0, 7); g.fill();
      }
    })));
    var flag = new THREE.Sprite(new THREE.SpriteMaterial({ map: flagTex, transparent: true, depthWrite: false }));
    flag.position.set(1.4, 10.6, -15); flag.scale.set(2.4, 1.2, 1); scene.add(flag);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), darkMat);
    pole.position.set(1.4, 9.2, -15); scene.add(pole);
    var stainedMat = new THREE.MeshLambertMaterial({ color: 0x9a7a3a, emissive: 0x6a4a1a });
    [-3.6, 3.6].forEach(function (wx) {
      var win = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.12), stainedMat);
      win.position.set(wx, 3.2, -10.3); scene.add(win);
    });
    // 墓园墓碑
    var graveMat = new THREE.MeshLambertMaterial({ color: 0x8a8272 });
    [[-15, -24], [-17, -22], [-14, -20], [-20, -23], [-22, -21], [-16, -18.5], [-21, -19.5], [-19, -15]].forEach(function (p) {
      var gv = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.15), graveMat);
      gv.position.set(p[0], 0.43, p[1]); gv.rotation.y = rand(-0.25, 0.25); scene.add(gv);
    });
    crater(-26, 10, 1.2, 0x3a342c); crater(26, 10, 1.1, 0x3a342c);
    crater(-10, 14, 1.0, 0x3a342c); crater(10, 14, 1.0, 0x3a342c);
    smokePlume(24, -12, 8, 3); smokePlume(-24, -12, 7, 2.8);
    SPAWNS = [
      { x: -12, z: 13 }, { x: 12, z: 13 }, { x: -6, z: 10 }, { x: 6, z: 10 },
      { x: -20, z: 6 }, { x: 20, z: 6 }, { x: -10, z: -2 }, { x: 10, z: -2 },
      { x: -14, z: -6 }, { x: 14, z: -6 }, { x: 0, z: -3 }, { x: -6, z: -12 }
    ];
    MAP_SPAWN = { x: 0, z: 24, yaw: 0 };
    RADAR_LINES = [[-7.5, -10.65, -1, -10.65], [1, -10.65, 7.5, -10.65], [-7, -20.65, 7, -20.65]];
  }

  /* ================= 雪山小镇（Nuke 风） ================= */
  function buildSnowMap() {
    var gTex = toSRGB(new THREE.CanvasTexture(makeCanvas(512, 512, function (g, w, h) {
      g.fillStyle = '#dfe6e8'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) {
        var x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.6 + 0.2;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(178,196,210,' + rand(0.05, 0.22) + ')' : 'rgba(255,255,255,' + rand(0.06, 0.2) + ')';
        g.fillRect(x, y, r, r * rand(0.7, 1.6));
      }
      g.strokeStyle = 'rgba(150,168,184,0.25)'; g.lineWidth = 1;
      for (var j = 0; j < 40; j++) {
        g.beginPath(); var x0 = Math.random() * w, y0 = Math.random() * h;
        g.moveTo(x0, y0);
        for (var k = 0; k < 5; k++) g.lineTo(x0 + (Math.random() - 0.5) * 60, y0 + (Math.random() - 0.5) * 60);
        g.stroke();
      }
    })));
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(8, 8);
    var wTex = toSRGB(new THREE.CanvasTexture(makeCanvas(256, 256, function (g, w, h) {
      g.fillStyle = '#9aa2ab'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(66,76,92,0.4)'; g.lineWidth = 2;
      var bs = 64;
      for (var y = 0; y < h; y += bs) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (var x = 0; x < w; x += bs) {
        var row = Math.floor(x / bs) % 2;
        g.beginPath(); g.moveTo(x, row ? bs : 0); g.lineTo(x, h); g.stroke();
      }
      for (var i = 0; i < 30; i++) {
        g.fillStyle = 'rgba(80,90,105,' + rand(0.04, 0.12) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(4, 30), rand(3, 16));
      }
    })));
    wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping; wTex.repeat.set(1, 1);
    var woodTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 128, function (g, w, h) {
      g.fillStyle = '#5a4530'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 200; i++) {
        g.fillStyle = 'rgba(70,48,30,' + rand(0.1, 0.35) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(1, 6), rand(1, 10));
      }
      g.strokeStyle = 'rgba(30,20,12,0.7)'; g.lineWidth = 3;
      g.strokeRect(3, 3, w - 6, h - 6);
    })));
    var sTex = toSRGB(new THREE.CanvasTexture(makeCanvas(16, 512, function (g, w, h) {
      var grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#24323f');
      grad.addColorStop(0.42, '#4a5f74');
      grad.addColorStop(0.68, '#8fa3b3');
      grad.addColorStop(1, '#c9d4da');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    })));
    sky = new THREE.Mesh(new THREE.SphereGeometry(230, 24, 18), new THREE.MeshBasicMaterial({ map: sTex, side: THREE.BackSide, fog: false }));
    scene.add(sky);
    // 光照 / 雾（冷）
    hemi.color.set(0xdbe8f2); hemi.groundColor.set(0x93a3b3); hemi.intensity = 1.0;
    sun.color.set(0xfff6ea); sun.intensity = 0.95;
    SUN_DIR.set(50, 110, -40).normalize();
    scene.fog = new THREE.Fog(0xc9d4da, 55, 170);
    var sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false }));
    sunSprite.position.set(140, 110, -170); sunSprite.scale.set(44, 44, 1);
    scene.add(sunSprite);
    for (var ci = 0; ci < 4; ci++) {
      var cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, fog: false, depthWrite: false, opacity: 0.65 }));
      cloud.position.set(rand(-120, 120), rand(60, 100), rand(-180, -60));
      cloud.scale.set(rand(50, 90), rand(22, 36), 1);
      scene.add(cloud);
    }
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshLambertMaterial({ map: gTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    // 布局：中央木屋（L 形开口朝南）+ 雪堆 + 高台
    var WALL_DEFS = [
      wallDef(0, -23.5, 50, 1, 3.4), wallDef(0, 23.5, 50, 1, 3.4),
      wallDef(-23.5, 0, 1, 50, 3.4), wallDef(23.5, 0, 1, 50, 3.4),
      wallDef(-9, -11.5, 1.2, 7, 2.8),
      wallDef(-3.6, -15, 10.8, 1.2, 2.8),
      wallDef(1.8, -11.5, 1.2, 7, 2.8),
      wallDef(-3.2, -8, 1.2, 0.6, 2.8),
      wallDef(-6, -11, 2.4, 2.4, 1.1),
      wallDef(-15, -12, 3.6, 1.6, 1.0),
      wallDef(14, -14, 3.6, 1.6, 1.0),
      wallDef(-16, 0, 1.6, 3.6, 0.95),
      wallDef(16, 0, 1.6, 3.6, 0.95),
      wallDef(-4, 6, 1.6, 1.6, 0.9),
      wallDef(4, 6, 1.6, 1.6, 0.9),
      wallDef(-12, -4, 1.3, 1.3, 1.0),
      wallDef(12, -4, 1.3, 1.3, 1.0),
      wallDef(0, -21.6, 10, 4.6, 1.0),
      wallDef(-14.6, -20.6, 6, 3.6, 1.0),
      wallDef(14.6, -20.6, 6, 3.6, 1.0)
    ];
    WALL_DEFS.forEach(function (wd) {
      var box = new THREE.Box3();
      box.setFromCenterAndSize(new THREE.Vector3(wd.x, wd.h / 2, wd.z), new THREE.Vector3(wd.w, wd.h, wd.d));
      WALLS.push({ box: box, h: wd.h, step: wd.h <= 1.15, minX: wd.x - wd.w / 2, maxX: wd.x + wd.w / 2, minZ: wd.z - wd.d / 2, maxZ: wd.z + wd.d / 2 });
    });
    var wallMat = new THREE.MeshLambertMaterial({ map: wTex });
    var snowCap = new THREE.MeshLambertMaterial({ color: 0xf2f6f8 });
    var snowMat = new THREE.MeshLambertMaterial({ color: 0xe8eef0 });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x8b949c });
    var woodMat = new THREE.MeshLambertMaterial({ map: woodTex });
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x4a3320 });
    WALL_DEFS.forEach(function (wd) {
      if (wd.h > 2.0) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.25, wd.d), wallMat);
        m.position.set(wd.x, (wd.h - 0.25) / 2, wd.z); scene.add(m);
        var cap = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.1, 0.25, wd.d + 0.1), snowCap);
        cap.position.set(wd.x, wd.h - 0.125, wd.z); scene.add(cap);
      } else if (wd.h > 1.05) {
        var sm = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h, wd.d), snowMat);
        sm.position.set(wd.x, wd.h / 2, wd.z); scene.add(sm);
      } else {
        var base = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.14, wd.d), darkMat);
        base.position.set(wd.x, (wd.h - 0.14) / 2, wd.z); scene.add(base);
        var top = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.02, 0.14, wd.d + 0.02), woodMat);
        top.position.set(wd.x, wd.h - 0.07, wd.z); scene.add(top);
      }
    });
    function roofStrip(x, z, len, wd2, y, angle) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, wd2), roofMat);
      m.position.set(x, y, z); m.rotation.y = angle; scene.add(m);
    }
    roofStrip(-9, -11.5, 7.6, 2.2, 2.95, 0);
    roofStrip(1.8, -11.5, 7.6, 2.2, 2.95, 0);
    roofStrip(-3.6, -15, 11.4, 2.2, 2.95, Math.PI / 2);
    roofStrip(-9, -11.5, 7.8, 0.3, 3.06, 0);
    roofStrip(1.8, -11.5, 7.8, 0.3, 3.06, 0);
    var brickMat = new THREE.MeshLambertMaterial({ color: 0x8a5a42 });
    var chim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 2.4, 8), brickMat);
    chim.position.set(-7.2, 2.2, -13.6); scene.add(chim);
    var chimTop = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.4, 8), snowCap);
    chimTop.position.set(-7.2, 3.5, -13.6); scene.add(chimTop);
    function pine(x, z, s) {
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.2 * s, 1.4 * s, 6), new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
      trunk.position.set(x, 0.7 * s, z); scene.add(trunk);
      var c1 = new THREE.Mesh(new THREE.ConeGeometry(1.05 * s, 1.8 * s, 8), new THREE.MeshLambertMaterial({ color: 0x2e4a3a }));
      c1.position.set(x, 2.3 * s, z); scene.add(c1);
      var c2 = new THREE.Mesh(new THREE.ConeGeometry(0.8 * s, 1.5 * s, 8), new THREE.MeshLambertMaterial({ color: 0x33503f }));
      c2.position.set(x, 3.5 * s, z); scene.add(c2);
      var c3 = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 1.2 * s, 8), new THREE.MeshLambertMaterial({ color: 0x3a5a46 }));
      c3.position.set(x, 4.5 * s, z); scene.add(c3);
    }
    pine(-20, -20, 1.2); pine(20, -20, 1.0); pine(-20, 20, 1.1); pine(20, 20, 1.3);
    pine(-19, -4, 0.9); pine(19, -4, 0.9); pine(-19, 14, 1.0); pine(19, 14, 0.95);
    function snowdrift(x, z, r, s) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), snowMat);
      m.position.set(x, 0, z); m.scale.y = s; scene.add(m);
    }
    snowdrift(-20.5, -10, 1.6, 0.8); snowdrift(20.5, -10, 1.6, 0.8);
    snowdrift(-12, 12, 1.4, 0.7); snowdrift(12, 12, 1.4, 0.7);

    /* ---- 东线战场氛围：弹坑 / 铁丝网 / 燃烧村庄的烟 ---- */
    crater(-13, -3, 1.2, 0x3c3830);
    crater(13, -3, 1.0, 0x3c3830);
    crater(-20, -16, 1.3, 0x3c3830);
    crater(20, -16, 1.1, 0x3c3830);
    barbwire(-20.6, 3, 3.6, 0.2);
    barbwire(20.6, 3, 3.6, -0.2);
    smokePlume(-3.6, -15, 8, 3);
    smokePlume(0, -18, 6, 2.4);
    SPAWNS = [
      { x: -6, z: -6, y: 0 }, { x: 6, z: -6, y: 0 },
      { x: -12, z: -14, y: 0 }, { x: 12, z: -14, y: 0 },
      { x: -5, z: -19, y: 0 }, { x: 5, z: -19, y: 0 },
      { x: 0, z: -21.6, y: 1.0 },
      { x: -14.6, z: -20.6, y: 1.0 }, { x: 14.6, z: -20.6, y: 1.0 },
      { x: -18, z: 8, y: 0 }, { x: 18, z: 8, y: 0 }
    ];
    MAP_SPAWN = { x: 0, z: 14, yaw: 0 };
    RADAR_LINES = [ [-9, -15, -9, -8], [-9, -15, 1.8, -15], [1.8, -15, 1.8, -8] ];
  }

  /* ================= 黄昏意镇（Inferno 风） ================= */
  function buildInfernoMap() {
    var gTex = toSRGB(new THREE.CanvasTexture(makeCanvas(512, 512, function (g, w, h) {
      g.fillStyle = '#a39785'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) {
        var x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.6 + 0.2;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(120,105,85,' + rand(0.06, 0.25) + ')' : 'rgba(200,185,160,' + rand(0.06, 0.18) + ')';
        g.fillRect(x, y, r, r * rand(0.7, 1.6));
      }
      g.strokeStyle = 'rgba(90,75,60,0.3)'; g.lineWidth = 1;
      for (var j = 0; j < 40; j++) {
        g.beginPath(); var x0 = Math.random() * w, y0 = Math.random() * h;
        g.moveTo(x0, y0);
        for (var k = 0; k < 5; k++) g.lineTo(x0 + (Math.random() - 0.5) * 60, y0 + (Math.random() - 0.5) * 60);
        g.stroke();
      }
    })));
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(8, 8);
    var wTex = toSRGB(new THREE.CanvasTexture(makeCanvas(256, 256, function (g, w, h) {
      g.fillStyle = '#b0654a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(80,40,30,0.5)'; g.lineWidth = 2;
      var bs = 64;
      for (var y = 0; y < h; y += bs) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (var x = 0; x < w; x += bs) {
        var row = Math.floor(x / bs) % 2;
        g.beginPath(); g.moveTo(x, row ? bs : 0); g.lineTo(x, h); g.stroke();
      }
      for (var i = 0; i < 30; i++) {
        g.fillStyle = 'rgba(60,30,20,' + rand(0.04, 0.12) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(4, 30), rand(3, 16));
      }
    })));
    wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping; wTex.repeat.set(1, 1);
    var woodTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 128, function (g, w, h) {
      g.fillStyle = '#a07c42'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 200; i++) {
        g.fillStyle = 'rgba(120,85,40,' + rand(0.1, 0.35) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(1, 6), rand(1, 10));
      }
      g.strokeStyle = 'rgba(60,40,15,0.8)'; g.lineWidth = 3;
      g.strokeRect(3, 3, w - 6, h - 6);
    })));
    var sTex = toSRGB(new THREE.CanvasTexture(makeCanvas(16, 512, function (g, w, h) {
      var grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#1e2c44');
      grad.addColorStop(0.4, '#7a4a35');
      grad.addColorStop(0.62, '#cf7a3a');
      grad.addColorStop(0.82, '#e8a35a');
      grad.addColorStop(1, '#f0c888');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    })));
    sky = new THREE.Mesh(new THREE.SphereGeometry(230, 24, 18), new THREE.MeshBasicMaterial({ map: sTex, side: THREE.BackSide, fog: false }));
    scene.add(sky);
    // 光照 / 雾（黄昏暖）
    hemi.color.set(0xd8a87a); hemi.groundColor.set(0x7a5a48); hemi.intensity = 0.85;
    sun.color.set(0xff9a50); sun.intensity = 1.05;
    SUN_DIR.set(-50, 22, -40).normalize();
    scene.fog = new THREE.Fog(0xd8b98a, 50, 160);
    var sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false }));
    sunSprite.position.set(-120, 45, -140); sunSprite.scale.set(90, 90, 1);
    scene.add(sunSprite);
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshLambertMaterial({ map: gTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    // 布局：中央广场 + 喷泉 + 四角屋 + 窄巷
    var WALL_DEFS = [
      wallDef(0, -23.5, 50, 1, 3.4), wallDef(0, 23.5, 50, 1, 3.4),
      wallDef(-23.5, 0, 1, 50, 3.4), wallDef(23.5, 0, 1, 50, 3.4),
      wallDef(0, -6.5, 14, 1.4, 1.15),
      wallDef(0, -15.5, 14, 1.4, 1.15),
      wallDef(-7, -11, 1.4, 9, 1.15),
      wallDef(7, -11, 1.4, 9, 1.15),
      wallDef(0, -11, 3.6, 3.6, 0.9),
      wallDef(-16, -18, 5, 5, 2.6),
      wallDef(16, -18, 5, 5, 2.6),
      wallDef(-16, -2, 5, 5, 2.6),
      wallDef(16, -2, 5, 5, 2.6),
      wallDef(-11, -12, 1.2, 13, 2.2),
      wallDef(11, -12, 1.2, 13, 2.2),
      wallDef(-3.5, -3, 1.3, 1.3, 1.0),
      wallDef(3.5, -3, 1.3, 1.3, 1.0),
      wallDef(0, 5, 1.6, 1.6, 0.9),
      wallDef(0, -21.6, 10, 4.6, 1.0)
    ];
    WALL_DEFS.forEach(function (wd) {
      var box = new THREE.Box3();
      box.setFromCenterAndSize(new THREE.Vector3(wd.x, wd.h / 2, wd.z), new THREE.Vector3(wd.w, wd.h, wd.d));
      WALLS.push({ box: box, h: wd.h, step: wd.h <= 1.15, minX: wd.x - wd.w / 2, maxX: wd.x + wd.w / 2, minZ: wd.z - wd.d / 2, maxZ: wd.z + wd.d / 2 });
    });
    var wallMat = new THREE.MeshLambertMaterial({ map: wTex });
    var stoneMat = new THREE.MeshLambertMaterial({ color: 0xc9b98f });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x8a7660 });
    var woodMat = new THREE.MeshLambertMaterial({ map: woodTex });
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x8a3a28 });
    WALL_DEFS.forEach(function (wd) {
      if (wd.h > 2.0) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.25, wd.d), wallMat);
        m.position.set(wd.x, (wd.h - 0.25) / 2, wd.z); scene.add(m);
        var cap = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.1, 0.25, wd.d + 0.1), stoneMat);
        cap.position.set(wd.x, wd.h - 0.125, wd.z); scene.add(cap);
      } else if (wd.h > 1.05) {
        var sm = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h, wd.d), stoneMat);
        sm.position.set(wd.x, wd.h / 2, wd.z); scene.add(sm);
      } else {
        var base = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wd.h - 0.14, wd.d), darkMat);
        base.position.set(wd.x, (wd.h - 0.14) / 2, wd.z); scene.add(base);
        var top = new THREE.Mesh(new THREE.BoxGeometry(wd.w + 0.02, 0.14, wd.d + 0.02), woodMat);
        top.position.set(wd.x, wd.h - 0.07, wd.z); scene.add(top);
      }
    });
    function tileRoof(x, z, size, y) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(size + 0.8, 0.24, size + 0.8), roofMat);
      m.position.set(x, y, z); scene.add(m);
      var ridge = new THREE.Mesh(new THREE.BoxGeometry(size + 1.0, 0.5, 0.5), roofMat);
      ridge.position.set(x, y + 0.32, z); scene.add(ridge);
    }
    tileRoof(-16, -18, 5, 2.75); tileRoof(16, -18, 5, 2.75);
    tileRoof(-16, -2, 5, 2.75); tileRoof(16, -2, 5, 2.75);
    // 广场中央：被炸毁的纪念碑基座（原喷泉位）
    var stoneBase = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0x6a6258 }));
    stoneBase.position.set(0, 0.25, -11); scene.add(stoneBase);
    var stoneCol = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 2.6, 10), new THREE.MeshLambertMaterial({ color: 0x7d7468 }));
    stoneCol.position.set(0, 1.8, -11); scene.add(stoneCol);
    var stoneTop = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.3, 10), new THREE.MeshLambertMaterial({ color: 0x5e574e }));
    stoneTop.position.set(0, 3.25, -11); scene.add(stoneTop);
    var colCrack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), new THREE.MeshLambertMaterial({ color: 0x4a443c }));
    colCrack.position.set(0.35, 1.8, -11); scene.add(colCrack);
    var barrelMat = new THREE.MeshLambertMaterial({ color: 0x6e4a28 });
    var bandMat = new THREE.MeshLambertMaterial({ color: 0x2c2c30 });
    function barrel(x, z) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12), barrelMat);
      m.rotation.z = Math.PI / 2; m.position.set(x, 0.55, z); scene.add(m);
      var band = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 12), bandMat);
      band.rotation.z = Math.PI / 2; band.position.set(x, 0.55, z); scene.add(band);
    }
    barrel(-13.5, -3); barrel(13.5, -3); barrel(-13.5, 12); barrel(13.5, 12);
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
    var glowTex = toSRGB(new THREE.CanvasTexture(makeCanvas(64, 64, function (g, w, h) {
      var grad = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,220,150,0.95)');
      grad.addColorStop(0.5, 'rgba(255,190,100,0.4)');
      grad.addColorStop(1, 'rgba(255,180,90,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    })));
    function lamp(x, z) {
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), poleMat);
      pole.position.set(x, 1.7, z); scene.add(pole);
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0.85 }));
      glow.position.set(x, 3.3, z); glow.scale.set(1.3, 1.3, 1); scene.add(glow);
    }
    lamp(-4.5, 2); lamp(4.5, 2); lamp(-4.5, -19); lamp(4.5, -19);

    /* ---- 柏林巷战氛围：弹坑 / 路障 / 城市硝烟 ---- */
    crater(-10, 10, 1.1, 0x3a342c);
    crater(10, 10, 1.2, 0x3a342c);
    crater(-13, -1, 1.0, 0x3a342c);
    crater(13, -1, 1.0, 0x3a342c);
    barbwire(-20.8, -8, 3.6, Math.PI / 2);
    barbwire(20.8, -8, 3.6, Math.PI / 2);
    smokePlume(-16, -18, 10, 3.2);
    smokePlume(16, -18, 8, 2.8);
    smokePlume(0, -21.5, 7, 2.6);
    SPAWNS = [
      { x: -5, z: -9, y: 0 }, { x: 5, z: -9, y: 0 },
      { x: -10, z: -8, y: 0 }, { x: 10, z: -8, y: 0 },
      { x: -20, z: -16, y: 0 }, { x: 20, z: -16, y: 0 },
      { x: -20, z: -4, y: 0 }, { x: 20, z: -4, y: 0 },
      { x: 0, z: -21.6, y: 1.0 },
      { x: -14, z: 10, y: 0 }, { x: 14, z: 10, y: 0 }
    ];
    MAP_SPAWN = { x: 0, z: 14, yaw: 0 };
    RADAR_LINES = [ [-7, -15.5, -7, -6.5], [7, -15.5, 7, -6.5], [-7, -15.5, 7, -15.5], [-7, -6.5, 7, -6.5] ];
  }

  /* ================= 玩家 ================= */
  var PLAYER_R = 0.45;
  var player = {
    pos: new THREE.Vector3(0, 1.7, 14),
    vel: new THREE.Vector3(),
    yaw: 0, pitch: 0,
    hp: 100, vy: 0, grounded: true,
    bobT: 0, bobAmt: 0,
    recoilPitch: 0, recoilYaw: 0, spread: 0.0015,
    respawnT: 0,
    flashT: 0,
    killShake: 0
  };
  camera.position.copy(player.pos);

  /* ================= 武器 ================= */
  var gunMatBlack = new THREE.MeshLambertMaterial({ color: 0x232326 });
  var gunMatWood = new THREE.MeshLambertMaterial({ color: 0x6b3d23 });
  var gunMatDarkWood = new THREE.MeshLambertMaterial({ color: 0x4f2c18 });
  var gunMatSteel = new THREE.MeshLambertMaterial({ color: 0x4a4a50 });
  var awpMatWhite = new THREE.MeshLambertMaterial({ color: 0xe8e6e0 });
  var awpMatOrange = new THREE.MeshLambertMaterial({ color: 0xd97a1f });

  function gbox(g, w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); g.add(m); return m;
  }
  function gcyl(g, r, len, mat, x, y, z) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
    m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m;
  }

  var flashTex = toSRGB(new THREE.CanvasTexture(makeCanvas(64, 64, function (g, w, h) {
    var grad = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,220,1)');
    grad.addColorStop(0.3, 'rgba(255,200,80,0.9)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  })));
  function makeMuzzle(g, z) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    s.position.set(0, 0.05, z); s.scale.set(0.3, 0.3, 1); g.add(s); return s;
  }

  /* ---------- M1A1 汤普森冲锋枪（继承 AK 组参数） ---------- */
  var akGun = new THREE.Group();
  gbox(akGun, 0.08, 0.11, 0.3, gunMatBlack, 0, 0.03, 0.08);          // 机匣
  var barrel = gcyl(akGun, 0.017, 0.3, gunMatSteel, 0, 0.05, 0.4);    // 枪管（散热孔）
  // 散热孔环
  for (var hv = 0; hv < 5; hv++) {
    gcyl(akGun, 0.022, 0.03, gunMatBlack, 0, 0.05, 0.3 + hv * 0.06);
  }
  gcyl(akGun, 0.028, 0.07, gunMatSteel, 0, 0.05, 0.62);               // 枪口
  gbox(akGun, 0.06, 0.055, 0.2, gunMatWood, 0, 0.0, 0.22);            // 前护木
  var magAK = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.16, 0.1), gunMatBlack);
  magAK.position.set(0, -0.09, 0.02); magAK.rotation.x = 0.3; akGun.add(magAK); // 弹匣
  gbox(akGun, 0.03, 0.09, 0.05, gunMatWood, 0, 0.02, 0.28).rotation.x = -0.5;   // 垂直前握把
  gbox(akGun, 0.045, 0.1, 0.06, gunMatBlack, 0, -0.08, -0.05).rotation.x = 0.35; // 握把
  gbox(akGun, 0.055, 0.1, 0.24, gunMatWood, 0, -0.02, -0.28).rotation.x = 0.06;  // 木枪托
  gbox(akGun, 0.02, 0.03, 0.04, gunMatBlack, 0, 0.115, 0.22);         // 准星
  gbox(akGun, 0.025, 0.045, 0.03, gunMatBlack, 0, 0.11, -0.05);       // 照门
  var muzzleFlashAK = makeMuzzle(akGun, 0.75);
  akGun.position.set(0.24, -0.24, -0.42);

  /* ---------- M1903A4 春田狙击步枪（继承 AWP 组参数：手动 + 开镜） ---------- */
  var awpGun = new THREE.Group();
  gcyl(awpGun, 0.015, 0.6, gunMatSteel, 0, 0.03, 0.5);                // 长枪管
  gcyl(awpGun, 0.022, 0.06, gunMatBlack, 0, 0.03, 0.83);              // 准星座
  gbox(awpGun, 0.06, 0.09, 0.3, gunMatBlack, 0, 0.03, -0.02);         // 机匣
  gbox(awpGun, 0.05, 0.06, 0.28, gunMatWood, 0, 0.0, 0.22);           // 木护木
  var scope = gcyl(awpGun, 0.028, 0.34, gunMatBlack, 0, 0.13, 0.08);  // 镜筒
  gcyl(awpGun, 0.032, 0.03, gunMatSteel, 0, 0.13, 0.3);               // 镜环
  gcyl(awpGun, 0.02, 0.03, gunMatBlack, 0, 0.13, -0.1);               // 目镜
  gbox(awpGun, 0.05, 0.1, 0.26, gunMatWood, 0, -0.01, -0.28).rotation.x = 0.05;  // 枪托
  gbox(awpGun, 0.055, 0.11, 0.06, gunMatDarkWood, 0, -0.01, -0.42);   // 托垫
  gbox(awpGun, 0.04, 0.1, 0.05, gunMatBlack, 0, -0.09, -0.09).rotation.x = 0.3;  // 握把
  var magAWP = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.09), gunMatWood);
  magAWP.position.set(0, -0.08, 0.1); magAWP.rotation.x = 0.15; awpGun.add(magAWP); // 内置弹仓
  gcyl(awpGun, 0.012, 0.09, gunMatSteel, 0.052, 0.1, 0.02);           // 右侧拉机柄
  var muzzleFlashAWP = makeMuzzle(awpGun, 0.95);
  awpGun.position.set(0.18, -0.26, -0.5);

  /* ---------- M3 格斗刀（继承匕首组参数） ---------- */
  var knifeGun = new THREE.Group();
  gbox(knifeGun, 0.04, 0.05, 0.15, gunMatDarkWood, 0, 0.01, -0.05).rotation.x = 0.08;  // 木刀柄
  gbox(knifeGun, 0.1, 0.02, 0.04, gunMatBlack, 0, 0.02, 0.05);                         // 护手
  var bladeKn = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.014, 0.28, 6), gunMatSteel);
  bladeKn.rotation.x = Math.PI / 2; bladeKn.position.set(0, 0.02, 0.28); knifeGun.add(bladeKn);
  var bladeKn2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.28), gunMatSteel);
  bladeKn2.position.set(0, 0.02, 0.26); knifeGun.add(bladeKn2);
  gbox(knifeGun, 0.004, 0.009, 0.24, gunMatBlack, 0, 0.03, 0.26);                        // 刀背
  knifeGun.position.set(0.22, -0.22, -0.46);

  /* ---------- M1897 泵动霰弹枪 ---------- */
  var sgGun = new THREE.Group();
  gcyl(sgGun, 0.018, 0.45, gunMatSteel, 0, 0.05, 0.42);        // 枪管
  gcyl(sgGun, 0.03, 0.16, gunMatSteel, 0, 0.05, 0.65);          // 枪口
  gbox(sgGun, 0.06, 0.07, 0.3, gunMatWood, 0, 0.0, 0.2);        // 泵动护木
  gbox(sgGun, 0.06, 0.09, 0.28, gunMatBlack, 0, 0.03, -0.05);   // 机匣
  gbox(sgGun, 0.055, 0.1, 0.24, gunMatWood, 0, -0.02, -0.28).rotation.x = 0.05;  // 枪托
  gbox(sgGun, 0.04, 0.1, 0.06, gunMatBlack, 0, -0.08, -0.08).rotation.x = 0.3;   // 握把
  gcyl(sgGun, 0.014, 0.4, gunMatSteel, 0, 0.0, 0.38);           // 管式弹仓
  var muzzleFlashSG = makeMuzzle(sgGun, 0.78);
  sgGun.position.set(0.22, -0.25, -0.44);

  /* ---------- M1 火箭筒 ---------- */
  var rkGun = new THREE.Group();
  gcyl(rkGun, 0.075, 1.0, gunMatSteel, 0, 0.04, 0.2);           // 发射管
  gcyl(rkGun, 0.11, 0.12, gunMatBlack, 0, 0.04, -0.32);         // 后部喇叭口
  gcyl(rkGun, 0.06, 0.12, gunMatBlack, 0, 0.04, 0.74);          // 前部箍
  gbox(rkGun, 0.04, 0.06, 0.2, gunMatBlack, 0, 0.02, 0.1);      // 瞄准具
  gbox(rkGun, 0.045, 0.1, 0.14, gunMatWood, 0, 0.0, -0.42).rotation.x = 0.1;  // 握把
  var muzzleFlashRK = makeMuzzle(rkGun, 0.95);
  rkGun.position.set(0.2, -0.26, -0.5);

  camera.add(akGun);
  camera.add(awpGun);
  camera.add(knifeGun);
  camera.add(sgGun);
  camera.add(rkGun);
  awpGun.visible = false;
  knifeGun.visible = false;
  sgGun.visible = false;
  rkGun.visible = false;
  scene.add(camera);

  /* ---------- 武器数据 ---------- */
  var WEAPONS = [
    { id: 'ak', name: 'M1A1 汤普森', model: akGun, muzzle: muzzleFlashAK,
      rpm: 600, dmgBody: 35, dmgHead: 100,
      spreadPerShot: 0.0105, spreadMax: 0.021, spreadRecover: 5.2,
      kick: 0.0102, kickRecover: 4.2,
      auto: true, moveMul: 1.0, zoom: false, melee: false,
      baseX: 0.24, baseY: -0.24, baseZ: -0.42, shellX: 0.09, shellY: 0.06, shellZ: 0 },
    { id: 'awp', name: 'M1903A4 春田', model: awpGun, muzzle: muzzleFlashAWP,
      rpm: 38, dmgBody: 115, dmgHead: 400,
      spreadPerShot: 0.0045, spreadMax: 0.008, spreadRecover: 2.6,
      kick: 0.028, kickRecover: 2.0,
      auto: false, moveMul: 0.82, zoom: true, melee: false,
      baseX: 0.18, baseY: -0.26, baseZ: -0.5, shellX: 0.1, shellY: 0.08, shellZ: -0.12 },
    { id: 'knife', name: 'M3 格斗刀', model: knifeGun, muzzle: null,
      rpm: 140, dmgBody: 65, dmgHead: 150, range: 2.6,
      spreadPerShot: 0, spreadMax: 0, spreadRecover: 0,
      kick: 0, kickRecover: 0,
      auto: true, moveMul: 1.06, zoom: false, melee: true,
      baseX: 0.22, baseY: -0.22, baseZ: -0.46 },
    { id: 'shotgun', name: 'M1897 霰弹枪', model: sgGun, muzzle: muzzleFlashSG,
      rpm: 90, dmgBody: 16, dmgHead: 24, pellets: 16,
      spreadPerShot: 0.006, spreadMax: 0.012, spreadRecover: 4.0,
      kick: 0.018, kickRecover: 3.4,
      auto: false, moveMul: 0.95, zoom: false, melee: false,
      baseX: 0.22, baseY: -0.25, baseZ: -0.44, shellX: 0.09, shellY: 0.05, shellZ: -0.05 },
    { id: 'rocket', name: 'M1 火箭筒', model: rkGun, muzzle: muzzleFlashRK,
      rpm: 90, dmgBody: 0, dmgHead: 0, rocket: true,
      spreadPerShot: 0.002, spreadMax: 0.006, spreadRecover: 2.0,
      kick: 0.032, kickRecover: 2.6,
      auto: false, moveMul: 0.9, zoom: false, melee: false,
      baseX: 0.2, baseY: -0.26, baseZ: -0.5, shellX: 0.1, shellY: 0.06, shellZ: -0.1 }
  ];
  var weaponIdx = 0;
  var gun = akGun;         // 当前模型引用
  var gunKick = 0;         // 枪身位移回弹
  var gunRaise = 0;        // 枪口上抬
  var muzzleT = 0;
  var cooldown = 0;        // 攻击间隔
  var zoomed = false;

  /* ---------- 弹药 / 换弹系统 ---------- */
  var MAG_SIZE = [30, 5, Infinity, 6, 1];
  var RELOAD_TIME = [1.0, 1.5, 0, 1.1, 1.4];
  var mag = 30;            // 当前弹匣余量
  var reloadT = 0;         // 换弹剩余时间
  var reloading = false;

  function startReload() {
    if (reloading) return;
    var rt = RELOAD_TIME[weaponIdx];
    if (!rt) return;                    // 格斗刀无需换弹
    if (mag >= MAG_SIZE[weaponIdx]) return;  // 满匣不换
    reloading = true;
    reloadT = rt;
    sndReload();
    gunKick = 0.9;
    gunRaise = 0.6;
  }
  function cancelReload() {
    reloading = false;
    reloadT = 0;
  }

  var weaponNameEl = document.getElementById('weapon-name');
  var zoomOverlay = document.getElementById('zoom-overlay');

  function switchWeapon(idx) {
    if (idx === weaponIdx || state !== 'play') return;
    weaponIdx = idx;
    cooldown = 0;
    cancelReload();
    mag = MAG_SIZE[idx];
    zoomed = false;
    zoomOverlay.style.display = 'none';
    crosshairEl.style.opacity = 1;
    WEAPONS.forEach(function (w, i) { w.model.visible = (i === idx); });
    gun = WEAPONS[idx].model;
    gunKick = 0.9; gunRaise = 0.6;
    updateWeaponSlot();
    sndReload();
  }

  function updateWeaponSlot() {
    document.querySelectorAll('#weapon-slot .ws-item').forEach(function (el) {
      el.classList.toggle('active', parseInt(el.dataset.w, 10) === weaponIdx);
    });
  }

  /* ================= 音频 ================= */
  var AC = window.AudioContext || window.webkitAudioContext;
  var ac = null, noiseBuf = null;
  var listener = null;        // 3D 音频监听器（挂在相机上）
  var enemyShotBuf = null;    // 敌人枪声 buffer（3D 定位用）
  function initAudio() {
    if (ac) return;
    try {
      ac = new AC();
      if (ac.state === 'suspended' && ac.resume) ac.resume();
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // 敌人枪声 buffer（短促噪声，供 PositionalAudio 使用）
      enemyShotBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.3), ac.sampleRate);
      var d2 = enemyShotBuf.getChannelData(0);
      for (var j = 0; j < d2.length; j++) {
        d2[j] = (Math.random() * 2 - 1) * Math.exp(-(j / ac.sampleRate) * 26) * 0.9;
      }
      // 3D 监听器挂到相机，统一使用 ac 的 context
      listener = new THREE.AudioListener();
      listener.context = ac;
      camera.add(listener);
    } catch (e) { ac = null; }
  }
  function noiseBurst(t, dur, vol, lp0, lp1, rate) {
    if (!ac) return;
    var src = ac.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = rate || 0.9;
    var g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    var f = ac.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(lp0, t);
    f.frequency.exponentialRampToValueAtTime(lp1, t + dur);
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }
  function tone(t, type, f0, f1, dur, vol, delay) {
    if (!ac) return;
    t = t + (delay || 0);
    var o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    var g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function sndShot() {
    if (!ac) return;
    var t = ac.currentTime;
    noiseBurst(t, 0.13, 0.85, 1700, 250);
    tone(t, 'sine', 160, 45, 0.11, 0.65);
    tone(t, 'square', 2100, 900, 0.03, 0.1);
  }
  function sndEnemyShot() {
    if (!ac) return;
    var t = ac.currentTime;
    noiseBurst(t, 0.12, 0.3, 2300, 400, rand(0.8, 1.0));
    tone(t, 'sine', 140, 50, 0.1, 0.22);
  }
  function sndHit() {
    if (!ac) return;
    var t = ac.currentTime;
    noiseBurst(t, 0.05, 0.4, 700, 200, 1.2);
    tone(t, 'sine', 240, 90, 0.07, 0.3);
  }
  function sndHeadshot() {
    if (!ac) return;
    var t = ac.currentTime;
    tone(t, 'triangle', 2600, 1600, 0.09, 0.5);
    tone(t, 'sine', 5200, 3000, 0.03, 0.18);
    noiseBurst(t, 0.06, 0.35, 1200, 300, 1.3);
  }
  function sndReload() {
    if (!ac) return;
    var t = ac.currentTime;
    tone(t, 'square', 900, 500, 0.03, 0.25);
    tone(t, 'square', 1300, 700, 0.03, 0.25, 0, 0.95);
  }
  function sndReloadDone() {
    if (!ac) return;
    var t = ac.currentTime;
    tone(t, 'square', 700, 1000, 0.05, 0.2);
    tone(t, 'square', 1000, 1400, 0.06, 0.18, 0, 0.08);
  }
  function sndHurt() {
    if (!ac) return;
    var t = ac.currentTime;
    noiseBurst(t, 0.09, 0.5, 600, 120);
    tone(t, 'sawtooth', 180, 60, 0.12, 0.3);
  }
  function sndEmpty() {
    if (!ac) return;
    tone(ac.currentTime, 'square', 1800, 1400, 0.02, 0.12);
  }
  function sndSwing() {
    if (!ac) return;
    var t = ac.currentTime;
    var src = ac.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 2.2;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.42, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    var f = ac.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.16);
    f.Q.value = 1.2;
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start(t); src.stop(t + 0.18);
  }
  function sndScope() {
    if (!ac) return;
    var t = ac.currentTime;
    tone(t, 'square', 1200, 700, 0.04, 0.2);
    tone(t, 'square', 1900, 1100, 0.03, 0.12, 0, 0.06);
  }
  function sndSpawn() {
    if (!ac) return;
    tone(ac.currentTime, 'sine', 500, 900, 0.09, 0.14);
  }
  function sndStep() {
    if (!ac) return;
    var t = ac.currentTime;
    noiseBurst(t, 0.05, 0.13, 900, 260, rand(0.85, 1.1));
  }
  function sndLand() {
    if (!ac) return;
    var t = ac.currentTime;
    noiseBurst(t, 0.08, 0.2, 700, 150, rand(0.7, 0.9));
    tone(t, 'sine', 90, 40, 0.08, 0.2);
  }

  /* 德军冲锋语音（CC0 German Orders 包：Schnell/Los/Raus/Hande Hoch 喊话） */
  var voiceBufs = [];
  var voiceLoaded = false;
  var voiceBusy = false;
  var lastVoiceT = -10;
  var VOICE_FILES = ['schnell_schnell', 'raus_raus', 'los', 'los_los_los', 'hande_hoch'];
  function loadVoices() {
    if (!ac || voiceLoaded) return;
    voiceLoaded = true;
    VOICE_FILES.forEach(function (name) {
      fetch('models/voices/' + name + '.mp3')
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (ab) {
          try { ac.decodeAudioData(ab, function (buf) { voiceBufs.push(buf); }); } catch (e) {}
        })
        .catch(function () {});
    });
  }
  function playVoice() {
    if (!ac || !voiceBufs.length) return;
    if (voiceBusy) return;                    // 同时只喊一句，不堆叠
    var now = ac.currentTime;
    if (now - lastVoiceT < 0.5) return;       // 最小间隔，避免连喊太杂
    lastVoiceT = now;
    var buf = voiceBufs[Math.floor(Math.random() * voiceBufs.length)];
    try {
      var src = ac.createBufferSource(); src.buffer = buf;
      // 大吼：语速快、音调高（高昂）；压缩器防爆音、高通去低频杂声（干净）
      src.playbackRate.value = rand(1.12, 1.26);
      var comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 8;
      comp.attack.value = 0.002; comp.release.value = 0.12;
      var filt = ac.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 110;
      var g = ac.createGain(); g.gain.value = 0.85;
      src.connect(filt); filt.connect(comp); comp.connect(g); g.connect(ac.destination);
      voiceBusy = true;
      var resetBusy = function () { voiceBusy = false; };
      src.onended = resetBusy;
      // 定时兜底：即使 onended 未触发，按时长自动复位（防语音锁死）
      setTimeout(resetBusy, Math.min(4000, buf.duration * 1000 / 1.2 + 500));
      src.start();
    } catch (e) { voiceBusy = false; }
  }

  /* 远处炮火轰鸣（战场氛围，随机间隔，非手感音） */
  var artilleryT = 3.2;
  function sndFarArtillery() {
    if (!ac || state !== 'play') return;
    var t = ac.currentTime;
    noiseBurst(t, 0.45, 0.16, 260, 55, 0.45);
    tone(t, 'sine', 52, 26, 0.6, 0.28);
    tone(t, 'sine', 68, 32, 0.75, 0.18, 0, 0.14);
  }

  /* 爆炸 / 火箭发射（霰弹枪与火箭筒专用） */
  function sndExplosion() {
    if (!ac) return;
    var t = ac.currentTime;
    noiseBurst(t, 0.55, 0.75, 750, 55, 0.38);
    tone(t, 'sine', 95, 26, 0.55, 0.65);
    tone(t, 'sine', 130, 42, 0.42, 0.38, 0, 0.08);
  }
  function sndRocketFire() {
    if (!ac) return;
    var t = ac.currentTime;
    noiseBurst(t, 0.38, 0.55, 1500, 140, 0.55);
    tone(t, 'sine', 210, 42, 0.32, 0.4);
  }
  function sndShotgun() {
    if (!ac) return;
    var t = ac.currentTime;
    noiseBurst(t, 0.18, 0.95, 1300, 180, 0.75);
    tone(t, 'sine', 130, 38, 0.16, 0.72);
    tone(t, 'square', 1900, 700, 0.04, 0.14);
  }

  /* ============ 背景音乐（Web Audio 合成：低音 drone + 小调和弦 + 军鼓，二战压抑氛围） ============ */
  var bgmOn = false, bgmT = 0, bgmChord = 0;
  var BGM_CHORDS = [
    [110, 130.81, 164.81],   // Am
    [87.31, 110, 130.81],    // F
    [130.81, 164.81, 196],   // C
    [98, 123.47, 146.83]     // G
  ];
  function bgmStart() {
    if (!ac || bgmOn) return;
    bgmOn = true;
    bgmT = 0; bgmChord = 0;
    // 低音 drone：A1 与 E2 双正弦，持续低鸣（战场压抑感）
    var o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    var g1 = ac.createGain(); g1.gain.value = 0.09;
    o1.connect(g1); g1.connect(ac.destination); o1.start();
    var o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.41;
    var g2 = ac.createGain(); g2.gain.value = 0.045;
    o2.connect(g2); g2.connect(ac.destination); o2.start();
  }
  function bgmChordPlay() {
    if (!ac || !bgmOn) return;
    var t = ac.currentTime;
    var notes = BGM_CHORDS[bgmChord];
    notes.forEach(function (f) {
      var o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = f;
      var g = ac.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.6);
      g.gain.linearRampToValueAtTime(0.001, t + 2.0);
      var f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 720;
      o.connect(f2); f2.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + 2.1);
    });
    // 军鼓：低频噪声脉冲（远处行军）
    var src = ac.createBufferSource(); src.buffer = noiseBuf;
    var g3 = ac.createGain();
    g3.gain.setValueAtTime(0.14, t);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    var f3 = ac.createBiquadFilter(); f3.type = 'lowpass'; f3.frequency.value = 210;
    src.connect(f3); f3.connect(g3); g3.connect(ac.destination);
    src.start(t); src.stop(t + 0.3);
    bgmChord = (bgmChord + 1) % BGM_CHORDS.length;
  }
  function bgmUpdate(dt) {
    if (!ac || !bgmOn) return;
    bgmT += dt;
    if (bgmT >= 2.0) { bgmT -= 2.0; bgmChordPlay(); }
  }

  /* ================= 敌人 ================= */
  var enemies = [];
  var enemyPartsCache = {};

  /* 体素士兵模型（CC0 Shock Trooper，MagicaVoxel OBJ + 调色板贴图） */
  var trooperLoader = null;
  var enemyModelProto = null;
  var enemyModelReady = false;
  function initTrooperModel() {
    if (!window.THREE || !THREE.OBJLoader || trooperLoader) return;
    trooperLoader = new THREE.OBJLoader();
    trooperLoader.load('models/ShockTrooper.obj', function (obj) {
      try {
        var palTex = new THREE.TextureLoader().load('models/ShockTrooperColors.png');
        if ('colorSpace' in palTex) palTex.colorSpace = THREE.SRGBColorSpace;
        else palTex.encoding = THREE.sRGBEncoding;
        obj.traverse(function (c) {
          if (c.isMesh) {
            c.castShadow = true;
            c.frustumCulled = false;
            c.material = new THREE.MeshLambertMaterial({ map: palTex, color: 0xffffff });
          }
        });
        // 自动归一化到 1.7 米，脚底落地
        var box = new THREE.Box3().setFromObject(obj);
        var h = (box.max.y - box.min.y) || 1;
        obj.scale.setScalar(1.7 / h);
        obj.updateMatrixWorld(true);
        var box2 = new THREE.Box3().setFromObject(obj);
        obj.position.y = -box2.min.y;
        // 朝向：voxel 模型默认面向 +Z，游戏敌人面向 -Z
        obj.rotation.y = Math.PI;
        enemyModelProto = obj;
        enemyModelReady = true;
        try { sessionStorage.setItem('trooper', 'OK'); } catch (e) {}
        enemies.slice().forEach(function (e) { if (e.alive) mountEnemyModel(e); });
      } catch (err) {
        enemyModelReady = false;
        window.__modelErr = String(err && err.message);
        try { sessionStorage.setItem('trooper', String(err && err.message)); } catch (e) {}
      }
    }, undefined, function (err) {
      enemyModelReady = false;
      window.__modelErr = String(err && (err.message || err));
      try { sessionStorage.setItem('trooper', String(err && (err.message || err))); } catch (e) {}
    });
  }
  function mountEnemyModel(e) {
    if (!enemyModelReady || e.modelMesh) return;
    var m = enemyModelProto.clone();
    m.traverse(function (c) { if (c.isMesh) { c.castShadow = true; c.frustumCulled = false; } });
    // 给体素士兵补脸：像素风眼睛 + 嘴（模型头部前侧，朝向玩家）
    try {
      var mbox = new THREE.Box3().setFromObject(m);
      var mh = mbox.max.y - mbox.min.y;
      var faceCanvas = makeCanvas(64, 44, function (g2, w2, h2) {
        g2.clearRect(0, 0, w2, h2);
        g2.fillStyle = '#ffffff';
        g2.fillRect(10, 9, 21, 17); g2.fillRect(33, 9, 21, 17);
        g2.fillStyle = '#2c3e5a';
        g2.fillRect(16, 12, 9, 10); g2.fillRect(39, 12, 9, 10);
        g2.fillStyle = '#8a5a3a';
        g2.fillRect(21, 33, 22, 5);
      });
      var face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28),
        new THREE.MeshBasicMaterial({ map: toSRGB(new THREE.CanvasTexture(faceCanvas)), transparent: true, depthWrite: false }));
      face.rotation.y = Math.PI;   // 正面朝 -z（模型前侧）
      face.position.set(0, mbox.min.y + mh * 0.82, mbox.min.z + 0.03);
      m.add(face);
    } catch (err) {}
    e.inner.add(m);
    e.modelMesh = m;
    (e.procParts || []).forEach(function (p) { p.visible = false; });
    try { sessionStorage.setItem('face', 'ok'); } catch (e) {}
  }

  /* Minecraft 风格方块人部件（武器由变体决定） */
  function makeBlockyParts(e, pal, inner, reg) {
    // 头（方头 + 前脸）
    var headMesh = reg(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshLambertMaterial({ color: 0xd8a06b })));
    headMesh.position.y = 1.6; inner.add(headMesh);
    // 前脸：眼白 + 瞳孔 + 眉毛 + 鼻子 + 嘴（亮色自发光材质，凸出明显，远看清晰）
    var whiteMat = new THREE.MeshBasicMaterial({ color: 0xf0f0e8 });
    var pupilMat = new THREE.MeshBasicMaterial({ color: 0x1c2e4e });
    var browMat = new THREE.MeshBasicMaterial({ color: 0x3a2a18 });
    var noseMat = new THREE.MeshBasicMaterial({ color: 0xc89a6c });
    var mouthMat = new THREE.MeshBasicMaterial({ color: 0x6a3c24 });
    [-0.12, 0.12].forEach(function (ex) {
      var white = reg(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.19, 0.06), whiteMat));
      white.position.set(ex, 1.63, -0.27); inner.add(white);
      var pupil = reg(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.07), pupilMat));
      pupil.position.set(ex, 1.63, -0.30); inner.add(pupil);
      var brow = reg(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), browMat));
      brow.position.set(ex, 1.74, -0.27); inner.add(brow);
    });
    var nose = reg(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.13), noseMat));
    nose.position.set(0, 1.53, -0.30); inner.add(nose);
    var mouth = reg(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.05), mouthMat));
    mouth.position.set(0, 1.41, -0.27); inner.add(mouth);
    // 钢盔（M35 风：加大半球 + 宽檐，德军辨识度）
    var helm = reg(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, 6.3, 0, 1.5), new THREE.MeshLambertMaterial({ color: pal.helm })));
    helm.position.y = 1.78; inner.add(helm);
    var brim = reg(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.18), new THREE.MeshLambertMaterial({ color: pal.helm })));
    brim.position.set(0, 1.71, -0.08); inner.add(brim);
    // 身体
    var bodyMesh = reg(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.58, 0.3), new THREE.MeshLambertMaterial({ color: pal.body })));
    bodyMesh.position.y = 1.1; inner.add(bodyMesh);
    // 手臂（肩部枢轴，可摆动）
    var armPivots = [];
    [-1, 1].forEach(function (s) {
      var pivot = new THREE.Group();
      pivot.position.set(0.4 * s, 1.4, 0);
      var arm = reg(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.56, 0.18), new THREE.MeshLambertMaterial({ color: pal.body })));
      arm.position.y = -0.28;
      pivot.add(arm);
      inner.add(pivot);
      armPivots.push(pivot);
    });
    // 腿（髋部枢轴）
    var legPivots = [];
    [-1, 1].forEach(function (s) {
      var pivot = new THREE.Group();
      pivot.position.set(0.16 * s, 0.66, 0);
      var leg = reg(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), new THREE.MeshLambertMaterial({ color: pal.pants })));
      leg.position.y = -0.31;
      pivot.add(leg);
      inner.add(pivot);
      legPivots.push(pivot);
    });
    return { armPivots: armPivots, legPivots: legPivots };
  }

  function makeEnemyMaterial(color) {
    return new THREE.MeshLambertMaterial({ color: color });
  }

  /* 敌人武器库：按变体配枪（右手持枪，几何美观） */
  var ENEMY_WEAPONS = {
    t:     { name: 'MP40',   burst: 3, burstCd: 0.11, label: '冲锋枪' },
    ct:    { name: 'Kar98k', burst: 1, burstCd: 0.85, label: '步枪' },
    elite: { name: 'StG44',  burst: 3, burstCd: 0.13, label: '突击步枪' }
  };
  function makeGunMP40() {
    var grp = new THREE.Group();
    gbox(grp, 0.045, 0.07, 0.3, gunMatBlack, 0, 0, 0.08);
    gcyl(grp, 0.012, 0.22, gunMatBlack, 0, 0.02, 0.26);
    gbox(grp, 0.035, 0.11, 0.07, gunMatBlack, 0, -0.05, 0.02).rotation.x = 0.3;
    gbox(grp, 0.04, 0.06, 0.16, gunMatBlack, 0, -0.02, -0.14).rotation.x = 0.1;
    return grp;
  }
  function makeGunKar98k() {
    var grp = new THREE.Group();
    gcyl(grp, 0.013, 0.5, gunMatSteel, 0, 0.02, 0.3);
    gbox(grp, 0.045, 0.07, 0.24, gunMatBlack, 0, 0, 0.02);
    gbox(grp, 0.04, 0.05, 0.3, gunMatWood, 0, -0.01, -0.2);
    gcyl(grp, 0.01, 0.08, gunMatSteel, 0.03, 0.03, -0.05);
    return grp;
  }
  function makeGunStG44() {
    var grp = new THREE.Group();
    gbox(grp, 0.05, 0.07, 0.3, gunMatBlack, 0, 0, 0.06);
    gcyl(grp, 0.013, 0.3, gunMatSteel, 0, 0.02, 0.26);
    gbox(grp, 0.04, 0.12, 0.08, gunMatBlack, 0, -0.06, 0.02).rotation.x = 0.25;
    gbox(grp, 0.045, 0.06, 0.22, gunMatWood, 0, -0.02, -0.16).rotation.x = 0.08;
    return grp;
  }

  /* 敌人语音（头顶气泡，德语士兵台词——气泡内容与动作匹配） */
  var ENEMY_LINES = {
    fire: ['Feuer!', 'Feuer frei!', 'Schieß!', 'Da drüben!', 'Achtung!', 'Deckung!', 'Halt!', 'Wo sind sie?!'],
    hit: ['Verdammt!', 'Aua!', 'Nein!', 'Sie haben mich!', 'Ich bin getroffen!'],
    rush: ['Angriff!', 'Vorwärts!', 'Los! Los!', 'Für den Führer!', 'Für das Reich!'],
    die: ['Ahh!', 'Mein Gott!', 'Hilfe!', 'Nein… nein…']
  };
  function roundRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function enemySay(e, cat) {
    if (!e.alive && cat !== 'die') return;   // 死亡惨叫放行（die 类）
    playVoice();                             // 德军冲锋语音（配气泡文字）
    var lines = ENEMY_LINES[cat];
    var txt = lines[Math.floor(Math.random() * lines.length)];
    var bx = e.pos.x, by = e.pos.y + 2.2, bz = e.pos.z;
    // 生成时墙遮挡检测：相机到气泡位置被墙挡住则不显示（不穿墙）
    _ray.origin.set(player.pos.x, player.pos.y, player.pos.z);
    _ray.direction.set(bx - _ray.origin.x, by - _ray.origin.y, bz - _ray.origin.z).normalize();
    var dTot = Math.hypot(bx - _ray.origin.x, by - _ray.origin.y, bz - _ray.origin.z);
    var blocked = false;
    for (var wi = 0; wi < WALLS.length; wi++) {
      var hp2 = _ray.intersectBox(WALLS[wi].box, _hitP);
      if (hp2) {
        var t2 = hp2.distanceTo(_ray.origin);
        if (t2 > 0.3 && t2 < dTot - 0.25) { blocked = true; break; }
      }
    }
    if (blocked) return;
    var w = 130, h = 36;
    var cv = makeCanvas(w, h, function (g2, ww, hh) {
      g2.clearRect(0, 0, ww, hh);
      g2.fillStyle = 'rgba(8,8,10,0.82)';
      roundRectPath(g2, 2, 2, ww - 4, hh - 12, 9);
      g2.fill();
      g2.beginPath();
      g2.moveTo(ww / 2 - 9, hh - 10); g2.lineTo(ww / 2, hh); g2.lineTo(ww / 2 + 9, hh - 10);
      g2.closePath(); g2.fill();
      g2.strokeStyle = 'rgba(255,215,94,0.65)'; g2.lineWidth = 1.5;
      roundRectPath(g2, 2, 2, ww - 4, hh - 12, 9);
      g2.stroke();
      g2.font = 'bold 16px Arial';
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillStyle = '#ffe9b0';
      g2.fillText(txt, ww / 2, hh / 2 - 5);
    });
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: toSRGB(new THREE.CanvasTexture(cv)), transparent: true, depthTest: true, depthWrite: false }));
    spr.scale.set(1.35, 0.4, 1);
    // 气泡挂进敌人模型组：成为士兵身体的一部分（本地头顶坐标，随敌人移动转向）
    spr.position.set(0, 2.2, 0);
    e.group.add(spr);
    e.bubble = { obj: spr, life: 0, max: 1.0 };
  }

  function makeEnemy(spawn) {
    // 变体：野战灰 / 迷彩 / 精英（军官黑，血厚）
    var roll = Math.random();
    var variant = roll < 0.28 ? 'elite' : (roll < 0.62 ? 'ct' : 't');
    var pal = variant === 'ct'
      ? { body: 0x3e4438, pants: 0x2e3329, helm: 0x22261f, goggle: 0x0c0c12 }      // 迷彩褐绿
      : variant === 'elite'
        ? { body: 0x33383a, pants: 0x26292b, helm: 0x1b1e20, goggle: 0x8a1414 }      // 军官黑（红镜）
        : { body: 0x6d7268, pants: 0x4a4e46, helm: 0x4a4e42, goggle: 0x1c1c20 };     // 野战灰
    var maxHp = variant === 'elite' ? 180 : 100;
    var e = {
      pos: new THREE.Vector3(spawn.x, spawn.y, spawn.z),
      hp: maxHp, maxHp: maxHp, variant: variant,
      weapon: ENEMY_WEAPONS[variant],
      alive: true,
      state: 'spawn', stateT: 0,
      target: new THREE.Vector3(),
      speed: variant === 'elite' ? rand(3.4, 4.6) : rand(3.8, 5.4),
      lastY: spawn.y,
      vy: 0,
      jumpCd: rand(0.5, 2.0),
      fireCd: rand(0.6, 1.2),
      burstLeft: 0, burstCd: 0,
      flashT: 0, flashColor: 0xffffff,
      hurtFlash: 0,
      deathT: 0,
      dodgeDir: 1, dodgeT: 0.7,
      talkCd: rand(2.5, 6),
      bubble: null,
      group: new THREE.Group(),
      inner: new THREE.Group(),
      parts: [],          // [{name, sphere}]
      mats: [],
      walkPhase: rand(0, 6)
    };
    e.group.position.copy(e.pos);
    scene.add(e.group);
    var g = e.group, inner = e.inner;

    // 材质登记：{mat, base} 用于受击闪红恢复；procParts 记录程序化部件（模型就绪后隐藏）
    e.matList = [];
    e.procParts = [];
    function reg(m) { e.matList.push({ mat: m.material, base: m.material.color.getHex() }); e.procParts.push(m); return m; }
    // Minecraft 风格方块人身体（模型加载成功前的兜底，含摆臂摆腿枢轴）
    var bp = makeBlockyParts(e, pal, inner, reg);
    e.armPivots = bp.armPivots;
    e.legPivots = bp.legPivots;
    // 右手持枪（按变体分武器，枪口朝前 -z；尺寸放大 1.55 倍更醒目）
    var gunGrp = variant === 'ct' ? makeGunKar98k() : variant === 'elite' ? makeGunStG44() : makeGunMP40();
    gunGrp.scale.setScalar(1.55);
    gunGrp.position.set(0.32, 1.0, 0.32);
    gunGrp.rotation.z = -0.08;
    inner.add(gunGrp);
    // 枪口闪光（对准放大后的枪口）
    var ef = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false }));
    ef.position.set(0.36, 1.0, 1.28); ef.scale.set(0.55, 0.55, 1);
    inner.add(ef);
    e.eflash = ef;
    // 弹壳抛出口（右手侧，放大后）
    e.shellPoint = new THREE.Vector3(0.55, 1.08, 0.28);
    // 3D 枪声（可听声辨位，随敌人位置移动）
    if (listener && ac && enemyShotBuf) {
      try {
        var eShot = new THREE.PositionalAudio(listener);
        eShot.setBuffer(enemyShotBuf);
        eShot.setRefDistance(7);
        eShot.setMaxDistance(130);
        eShot.setRolloffFactor(1.3);
        eShot.setVolume(0.85);
        g.add(eShot);
        e.eShot = eShot;
      } catch (err) { e.eShot = null; }
    }
    // 血条（受伤后显示）
    var hpCanvas = makeCanvas(64, 10, function (g2) {
      g2.fillStyle = 'rgba(0,0,0,0.55)'; g2.fillRect(0, 0, 64, 10);
      g2.fillStyle = '#7fd314'; g2.fillRect(2, 2, 60, 6);
    });
    var hpTex = toSRGB(new THREE.CanvasTexture(hpCanvas));
    var hpSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, transparent: true, opacity: 0, depthWrite: false }));
    hpSprite.position.y = 1.98; hpSprite.scale.set(0.8, 0.12, 1);
    inner.add(hpSprite);
    e.hpSprite = hpSprite;

    inner.position.y = 0; // 倒地动画枢轴在脚底附近
    g.add(inner);

    // 命中判定球（世界坐标）
    e.parts = [
      { name: 'head', sphere: new THREE.Sphere(new THREE.Vector3(), 0.25) },
      { name: 'chest', sphere: new THREE.Sphere(new THREE.Vector3(), 0.42) },
      { name: 'belly', sphere: new THREE.Sphere(new THREE.Vector3(), 0.4) }
    ];
    updateEnemyPartPositions(e);
    if (enemyModelReady) mountEnemyModel(e);
    enemies.push(e);
    sndSpawn();
  }

  function updateEnemyPartPositions(e) {
    e.parts[0].sphere.center.set(e.pos.x, e.pos.y + 1.66, e.pos.z);
    e.parts[1].sphere.center.set(e.pos.x, e.pos.y + 1.1, e.pos.z);
    e.parts[2].sphere.center.set(e.pos.x, e.pos.y + 0.55, e.pos.z);
  }

  function enemyDeadRemove(e) {
    if (e.bubble) { e.group.remove(e.bubble.obj); e.bubble = null; }
    scene.remove(e.group);
    var idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
  }

  function killEnemy(e, headshot) {
    e.alive = false;
    e.state = 'dead';
    e.deathT = 0;
    enemySay(e, 'die');
    player.killShake = 1;
    stats.kills++;
    if (headshot) stats.headshots++;
    if (challenge.active) challenge.score += headshot ? 3 : 1;
    if (campaign.active) campaign.killed++;
    var now = clock.getElapsedTime();
    if (now - stats.lastKill < 3.2) { stats.streak++; } else { stats.streak = 1; }
    stats.lastKill = now;
    if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;

    // feed
    var item = document.createElement('div');
    item.className = 'feed-item' + (headshot ? ' hs' : '');
    item.innerHTML = '你 <span class="gun">' + WEAPONS[weaponIdx].name + '</span> → 德军';
    feed.prepend(item);
    while (feed.children.length > 4) feed.removeChild(feed.lastChild);
    setTimeout(function () { if (item.parentNode) item.parentNode.removeChild(item); }, 2600);

    // 中心文字
    showCenterMsg(headshot ? 'HEADSHOT!' : '击杀', headshot ? 700 : 450, !headshot);
    if (headshot) sndHeadshot();
    if (stats.streak >= 2) {
      var streakNames = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'UNSTOPPABLE', 5: 'GODLIKE' };
      if (streakNames[stats.streak]) showCenterMsg(streakNames[stats.streak], 900, true);
    }
  }

  function showCenterMsg(text, ms, plain) {
    centerMsg.textContent = text;
    centerMsg.className = plain ? 'msg-kill' : '';
    centerMsg.style.transition = 'none';
    centerMsg.style.opacity = 1;
    setTimeout(function () {
      centerMsg.style.transition = 'opacity 0.5s';
      centerMsg.style.opacity = 0;
    }, ms);
  }

  function updateEnemy(e, dt) {
    e.stateT += dt;
    if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) e.eflash.material.opacity = 0; }
    // 语音气泡生命周期（挂在敌人身上，随敌人移动；受墙遮挡）
    if (e.bubble) {
      e.bubble.life += dt;
      if (e.bubble.life > e.bubble.max) {
        e.group.remove(e.bubble.obj);
        e.bubble = null;
      }
    }

    if (!e.alive) {
      // 死亡动画
      e.deathT += dt;
      var k = clamp(e.deathT / 0.35, 0, 1);
      e.inner.rotation.x = -Math.PI / 2 * k;
      e.inner.position.y = -0.12 * k;
      if (e.deathT > 0.7) {
        e.matList.forEach(function (m) { m.mat.color.setHex(0x6a655c); });
      }
      if (e.deathT > 2.2) enemyDeadRemove(e);
      return;
    }

    // 受击闪红 / 恢复
    if (e.hurtFlash > 0) {
      e.hurtFlash -= dt;
      e.matList.forEach(function (m) { m.mat.color.setHex(0xff5545); });
    } else {
      e.matList.forEach(function (m) { m.mat.color.setHex(m.base); });
    }

    // 血条
    if (e.hp < e.maxHp) {
      e.hpSprite.material.opacity = 1;
      e.hpSprite.material.map.image.getContext('2d').clearRect(0, 0, 64, 10);
      var g2 = e.hpSprite.material.map.image.getContext('2d');
      g2.fillStyle = 'rgba(0,0,0,0.6)'; g2.fillRect(0, 0, 64, 10);
      g2.fillStyle = e.hp > e.maxHp * 0.5 ? '#7fd314' : '#ff5a3c';
      g2.fillRect(2, 2, 60 * clamp(e.hp / e.maxHp, 0, 1), 6);
      e.hpSprite.material.map.needsUpdate = true;
    }

    var dist = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    var toPlayer = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
    // 朝向插值
    var dRot = toPlayer - e.group.rotation.y;
    while (dRot > Math.PI) dRot -= Math.PI * 2;
    while (dRot < -Math.PI) dRot += Math.PI * 2;
    e.group.rotation.y += dRot * clamp(dt * 6, 0, 1);

    if (e.state === 'spawn') {
      if (settings.train === 'static' && settings.mode !== 'campaign') {
        e.state = 'hold';
        e.holdT = 999;
      } else {
        e.state = 'move';
        pickEnemyTarget(e);
      }
    }

    if (e.state === 'move') {
      var dx = e.target.x - e.pos.x, dz = e.target.z - e.pos.z;
      var dd = Math.hypot(dx, dz);
      if (dd < 0.4 || e.stateT > 7) {
        e.state = 'hold';
        e.stateT = 0;
        e.holdT = rand(0.5, 1.4);
      } else {
        moveEntity(e, dx / dd * e.speed * dt, dz / dd * e.speed * dt);
        e.walkPhase += dt * 6;
      }
    } else if (e.state === 'hold') {
      if (e.stateT > e.holdT) { e.state = 'move'; e.stateT = 0; pickEnemyTarget(e); }
    } else if (e.state === 'dodge') {
      // 受击侧向闪避（垂直于玩家视线）
      var vdx = player.pos.x - e.pos.x, vdz = player.pos.z - e.pos.z;
      var vlen = Math.hypot(vdx, vdz) || 1;
      moveEntity(e, -vdz / vlen * e.dodgeDir * e.speed * 1.6 * dt, vdx / vlen * e.dodgeDir * e.speed * 1.6 * dt);
      e.walkPhase += dt * 8;
      if (e.stateT > e.dodgeT) { e.state = 'move'; e.stateT = 0; pickEnemyTarget(e); }
    } else if (e.state === 'rush') {
      // 主动冲锋 / 受击冲刺：扑向玩家但保持吉普车距离（约 5 米）
      var rx = player.pos.x - e.pos.x, rz = player.pos.z - e.pos.z;
      var rd = Math.hypot(rx, rz) || 1;
      if (rd > 5.5) moveEntity(e, rx / rd * 5.6 * dt, rz / rd * 5.6 * dt);
      if (e.stateT > 2.0 || rd <= 5.5) { e.state = 'hold'; e.stateT = 0; e.holdT = rand(0.8, 1.6); }
    }

    // 主动出击：距离近且视线通畅时冲锋（不蹲掩体）
    if (e.state === 'move' && dist < 14 && e.stateT > 0.8) {
      var losC = losClear(e.pos.x, e.pos.y + 1.5, e.pos.z, player.pos.x, player.pos.y - 0.4, player.pos.z);
      if (losC && Math.random() < 0.3) {
        e.state = 'rush'; e.stateT = 0;
        if (Math.random() < 0.35) enemySay(e, 'rush');
      }
    }

    // 随机间断说话：士兵自语（间隔随机，台词与当前动作匹配——是什么说什么）
    e.talkCd -= dt;
    if (e.talkCd <= 0 && e.state !== 'spawn') {
      e.talkCd = rand(3.5, 8);
      var tcat;
      if (e.state === 'rush') { tcat = 'rush'; }                     // 冲锋喊冲锋话
      else if (e.hurtFlash > 0 || e.state === 'dodge') { tcat = 'hit'; }  // 受击喊受击话
      else { tcat = 'fire'; }                                        // 巡逻/站桩喊警戒话
      enemySay(e, tcat);
    }

    // 开火：按武器类型连发（MP40/StG44 三连，Kar98k 单发；静止靶不开火）
    var canFire = settings.train !== 'static';
    e.fireCd -= dt;
    if (e.burstLeft > 0) {
      e.burstCd -= dt;
      if (e.burstCd <= 0) {
        e.burstLeft--;
        e.burstCd = e.weapon.burstCd;
        var losF = losClear(e.pos.x, e.pos.y + 1.5, e.pos.z, player.pos.x, player.pos.y - 0.4, player.pos.z);
        if (canFire && losF && dist < 55) enemyFire(e, dist);
      }
    } else if (canFire && e.fireCd <= 0 && dist < 55) {
      e.fireCd = rand(0.55, 1.15);
      e.burstLeft = e.weapon.burst;
      e.burstCd = 0;
    }

    // 动画：方块人摆臂摆腿；体素模型整体运动（起伏 + 晃动 + 冲锋前倾）
    var movingNow = (e.state === 'move' || e.state === 'rush' || e.state === 'dodge');
    e.inner.rotation.z = Math.sin(e.walkPhase) * 0.045 * (movingNow ? 1 : 0.15);
    if (e.armPivots && e.legPivots) {
      var swing = movingNow ? Math.sin(e.walkPhase) * 0.65 : 0;
      e.armPivots[0].rotation.x = swing;
      e.armPivots[1].rotation.x = -swing;
      e.legPivots[0].rotation.x = -swing * 0.8;
      e.legPivots[1].rotation.x = swing * 0.8;
      e.inner.position.y = 0;
    } else if (e.modelMesh) {
      e.inner.position.y = movingNow ? Math.abs(Math.sin(e.walkPhase)) * 0.05 : 0;
      e.inner.rotation.x = e.state === 'rush' ? 0.18 : 0;
    }

    // 跳跃：移动 / 冲脸时随机起跳（跳动的移动靶）
    if (e.vy <= 0 && e.state !== 'hold' && e.alive) {
      e.jumpCd -= dt;
      if (e.jumpCd <= 0) {
        e.jumpCd = rand(1.0, 2.4) * (e.state === 'rush' ? 0.5 : 1);
        if (Math.random() < 0.5) e.vy = rand(3.6, 5.0);
      }
    }

    // 重力 / 台阶落地
    e.lastY = e.pos.y;
    e.vy -= 14 * dt;
    e.pos.y += e.vy * dt;
    if (e.pos.y <= 0) { e.pos.y = 0; e.vy = 0; }
    for (var wi = 0; wi < WALLS.length; wi++) {
      var w = WALLS[wi];
      if (!w.step) continue;
      if (e.pos.x > w.minX - 0.3 && e.pos.x < w.maxX + 0.3 && e.pos.z > w.minZ - 0.3 && e.pos.z < w.maxZ + 0.3) {
        if (e.pos.y <= w.h && e.pos.y >= w.h - 0.4 && e.vy <= 0) { e.pos.y = w.h; e.vy = 0; }
      }
    }

    e.group.position.copy(e.pos);
    updateEnemyPartPositions(e);
  }

  function pickEnemyTarget(e) {
    // 游走目标偏向玩家方向（主动出击），但保持吉普车距离（约 5 米）
    var toP = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
    var a = toP + rand(-1.3, 1.3);
    var r = rand(3, 12);
    var tx = e.pos.x + Math.cos(a) * r;
    var tz = e.pos.z + Math.sin(a) * r;
    // 目标点距玩家不足 5 米时推远
    if (Math.hypot(tx - player.pos.x, tz - player.pos.z) < 5) {
      var away = Math.atan2(tz - player.pos.z, tx - player.pos.x);
      tx = player.pos.x + Math.cos(away) * 6.5;
      tz = player.pos.z + Math.sin(away) * 6.5;
    }
    e.target.set(
      clamp(tx, -MAP_HALF + 2, MAP_HALF - 2),
      0,
      clamp(tz, -MAP_HALF + 2, MAP_HALF - 2)
    );
  }

  // 实体（敌人）移动 + 简单碰撞（迭代修正，防高速穿模）
  function moveEntity(e, dx, dz) {
    var R = 0.38;
    if (dx !== 0) {
      var nx = e.pos.x + dx;
      for (var it = 0; it < 3; it++) {
        var bx = false;
        for (var i = 0; i < WALLS.length; i++) {
          var w = WALLS[i];
          if (nx > w.minX - R && nx < w.maxX + R && e.pos.z > w.minZ - R && e.pos.z < w.maxZ + R) {
            if (!w.step || e.pos.y < w.h - 0.05) {
              nx = dx > 0 ? w.minX - R : w.maxX + R;
              bx = true;
              break;
            }
          }
        }
        if (!bx) break;
      }
      e.pos.x = nx;
    }
    if (dz !== 0) {
      var nz = e.pos.z + dz;
      for (var it2 = 0; it2 < 3; it2++) {
        var bz = false;
        for (var j = 0; j < WALLS.length; j++) {
          var w2 = WALLS[j];
          if (e.pos.x > w2.minX - R && e.pos.x < w2.maxX + R && nz > w2.minZ - R && nz < w2.maxZ + R) {
            if (!w2.step || e.pos.y < w2.h - 0.05) {
              nz = dz > 0 ? w2.minZ - R : w2.maxZ + R;
              bz = true;
              break;
            }
          }
        }
        if (!bz) break;
      }
      e.pos.z = nz;
    }
  }

  // 视线是否通畅（子弹遮挡检测）
  var _ray = new THREE.Ray();
  var _hitP = new THREE.Vector3();
  function losClear(x0, y0, z0, x1, y1, z1) {
    _ray.origin.set(x0, y0, z0);
    _ray.direction.set(x1 - x0, y1 - y0, z1 - z0).normalize();
    var dist = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    for (var i = 0; i < WALLS.length; i++) {
      var p = _ray.intersectBox(WALLS[i].box, _hitP);
      if (p) {
        var t = p.distanceTo(_ray.origin);
        if (t > 0.25 && t < dist) return false;
      }
    }
    return true;
  }

  function enemyFire(e, dist) {
    stats.enemyShots++;
    e.eflash.material.opacity = 1;
    e.flashT = 0.06;
    // 开火抛弹壳（右手抛壳口）
    var sc = new THREE.Mesh(shellGeo, shellMat);
    sc.position.set(e.pos.x + e.shellPoint.x, e.pos.y + e.shellPoint.y, e.pos.z + e.shellPoint.z);
    sc.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    scene.add(sc);
    particles.push({ obj: sc, life: 0, max: 0.5, vel: new THREE.Vector3(rand(0.3, 0.9), rand(2.0, 3.0), rand(-0.3, 0.1)), spin: rand(8, 18) });
    // 30% 概率开火喊话
    if (Math.random() < 0.3) enemySay(e, 'fire');
    if (e.eShot && ac) {
      try { e.eShot.play(); } catch (err) {}
    } else {
      sndEnemyShot();
    }
    // 可视化曳光弹：飞行可躲，带散布（部分自动打偏，保持压迫而非致命）
    var from = new THREE.Vector3(e.pos.x, e.pos.y + 1.5, e.pos.z);
    var to = new THREE.Vector3(player.pos.x, player.pos.y - 1.0, player.pos.z);
    var dir = to.sub(from).normalize();
    var spreadA = rand(0, Math.PI * 2), spreadR = rand(0, 0.05);
    var right = new THREE.Vector3().crossVectors(dir, _UP).normalize();
    var up2 = new THREE.Vector3().crossVectors(right, dir).normalize();
    dir.addScaledVector(right, Math.cos(spreadA) * spreadR).addScaledVector(up2, Math.sin(spreadA) * spreadR).normalize();
    spawnProjectile(from, dir, rand(15, 22), 'enemy');
  }

  // 受击反应：概率侧向闪避 + 喊话（静止靶训练不闪避，保持站桩语义）
  function enemyDodgeReact(e) {
    if (!e.alive) return;
    if (settings.train !== 'static' && Math.random() < 0.5 && e.state !== 'rush' && e.state !== 'dodge') {
      e.state = 'dodge';
      e.stateT = 0;
      e.dodgeDir = Math.random() < 0.5 ? 1 : -1;
      e.dodgeT = rand(0.55, 0.9);
    }
    if (Math.random() < 0.4) enemySay(e, 'hit');
  }

  function hurtPlayer(dmg) {
    if (player.respawnT > 0) return;
    player.hp -= dmg;
    stats.hpLost = (stats.hpLost || 0) + dmg;
    player.flashT = 0.3;
    player.healCd = 2.5;
    sndHurt();
    hurtEl.style.transition = 'none';
    hurtEl.style.opacity = 1;
    setTimeout(function () {
      hurtEl.style.transition = 'opacity 0.5s';
      hurtEl.style.opacity = 0;
    }, 60);
    if (player.hp <= 0) {
      player.hp = 0;
      playerDeath();
    }
  }

  function playerDeath() {
    stats.deaths++;
    if (settings.mode === 'hold') { endHold(); return; }
    if (settings.mode === 'campaign') { campaignDeath(); return; }
    player.respawnT = 2.0;
    deathEl.style.opacity = 1;
    document.getElementById('death-info').textContent = '本局击杀 ' + stats.kills + ' 名德军，2 秒后重生…';
    setTimeout(function () {
      deathEl.style.opacity = 0;
    }, 1700);
  }

  /* ================= 粒子 ================= */
  var particles = [];
  var bloodTex = toSRGB(new THREE.CanvasTexture(makeCanvas(32, 32, function (g, w, h) {
    var grad = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(190,20,20,1)');
    grad.addColorStop(0.5, 'rgba(140,10,10,0.8)');
    grad.addColorStop(1, 'rgba(120,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  })));

  function spawnBlood(pos, n) {
    for (var i = 0; i < n; i++) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bloodTex, transparent: true, opacity: 1, depthWrite: false }));
      s.position.copy(pos);
      var sc = rand(0.05, 0.16);
      s.scale.set(sc, sc, 1);
      scene.add(s);
      particles.push({
        obj: s, life: 0, max: rand(0.3, 0.6),
        vel: new THREE.Vector3(rand(-1.6, 1.6), rand(0.5, 2.6), rand(-1.6, 1.6))
      });
    }
  }

  var shellGeo = new THREE.BoxGeometry(0.016, 0.016, 0.045);
  var shellMat = new THREE.MeshLambertMaterial({ color: 0xc9a13a });
  function ejectShell(wp) {
    var s = new THREE.Mesh(shellGeo, shellMat);
    s.position.copy(gun.localToWorld(new THREE.Vector3(wp.shellX, wp.shellY, wp.shellZ)));
    s.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    scene.add(s);
    particles.push({ obj: s, life: 0, max: 0.55, vel: new THREE.Vector3(rand(0.6, 1.4), rand(2.2, 3.2), rand(-0.4, 0.4)), spin: rand(8, 18) });
  }

  /* ============ 抛射物系统（敌人曳光弹 / 火箭弹共用） ============ */
  var projectiles = [];
  var tracerTex = toSRGB(new THREE.CanvasTexture(makeCanvas(32, 32, function (g, w, h) {
    var grad = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,232,150,1)');
    grad.addColorStop(0.4, 'rgba(255,170,70,0.9)');
    grad.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  })));
  var rocketGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.55, 6);
  var rocketMat = new THREE.MeshBasicMaterial({ color: 0x6a6a70 });

  function spawnProjectile(from, dir, speed, type) {
    var p = { pos: from.clone(), vel: dir.clone().multiplyScalar(speed), type: type, life: 0, maxLife: type === 'rocket' ? 4 : 3.2 };
    if (type === 'rocket') {
      var m = new THREE.Mesh(rocketGeo, rocketMat);
      m.position.copy(from);
      m.lookAt(from.clone().add(dir));
      scene.add(m);
      p.obj = m;
      var fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, opacity: 0.95 }));
      fl.position.copy(from);
      fl.scale.set(0.5, 0.5, 1);
      scene.add(fl);
      p.flame = fl;
    } else {
      // 敌人子弹：干净的细长长方体弹体（无附加特效）
      var bm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.28),
        new THREE.MeshBasicMaterial({ color: 0xffc060 }));
      bm.position.copy(from);
      bm.lookAt(from.x + dir.x, from.y + dir.y, from.z + dir.z);
      scene.add(bm);
      p.obj = bm;
    }
    projectiles.push(p);
    return p;
  }

  function pointSegDist(p, a, b) {
    var abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    var len2 = abx * abx + aby * aby + abz * abz;
    var t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2 : 0;
    t = clamp(t, 0, 1);
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t), p.z - (a.z + abz * t));
  }

  function updateProjectiles(dt) {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i];
      p.life += dt;
      var prev = p.pos.clone();
      p.pos.addScaledVector(p.vel, dt);
      if (p.obj) {
        p.obj.position.copy(p.pos);
        if (p.type !== 'rocket') p.obj.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
      }
      if (p.flame) { p.flame.position.copy(p.pos); p.flame.material.opacity = 0.95; }
      var dead = false;
      if (p.life > p.maxLife) { dead = true; }
      else {
        // 玩家碰撞（火箭弹跳过：自己的炮不会炸到自己，低头/贴脸发射也正常）
        if (p.type !== 'rocket') {
          var pc = new THREE.Vector3(player.pos.x, player.pos.y - 1.0, player.pos.z);
          if (p.pos.distanceTo(pc) < 0.85) {
            hurtPlayer(Math.round(rand(1, 2)));
            dead = true;
          }
        }
        // 墙体碰撞（线段检测，防高速穿墙）
        if (!dead) {
          _ray.origin.copy(prev);
          _ray.direction.copy(p.vel).normalize();
          var seg = p.vel.length() * dt;
          var wallHit = null, hp = new THREE.Vector3();
          for (var w = 0; w < WALLS.length; w++) {
            var hpp = _ray.intersectBox(WALLS[w].box, hp);
            if (hpp) {
              var tt = hpp.distanceTo(_ray.origin);
              if (tt > 0.01 && tt < seg) { wallHit = { box: WALLS[w].box, p: hpp.clone() }; break; }
            }
          }
          if (wallHit) {
            if (p.type === 'rocket') { explode(wallHit.p, 400); }
            else { spawnDecal(wallHit.p, boxNormal(wallHit.box, wallHit.p)); }
            dead = true;
          }
        }
        // 地面碰撞：火箭弹打地板也要炸，子弹落地留弹孔
        if (!dead && p.pos.y <= 0.12) {
          if (p.type === 'rocket') { explode(new THREE.Vector3(p.pos.x, 0.1, p.pos.z), 400); }
          else { spawnDecal(new THREE.Vector3(p.pos.x, 0.05, p.pos.z), _UP); }
          dead = true;
        }
        // 火箭弹命中敌人（线段检测，防高速穿模擦过不爆）
        if (!dead && p.type === 'rocket') {
          for (var e2 = 0; e2 < enemies.length; e2++) {
            var en = enemies[e2];
            if (!en.alive) continue;
            if (pointSegDist(new THREE.Vector3(en.pos.x, en.pos.y + 1.1, en.pos.z), prev, p.pos) < 1.0) {
              explode(p.pos, 400);
              dead = true;
              break;
            }
          }
        }
      }
      if (dead) {
        if (p.obj) scene.remove(p.obj);
        if (p.flame) scene.remove(p.flame);
        projectiles.splice(i, 1);
      }
    }
  }

  function explode(pos, dmg) {
    // 范围伤害（半径 6 米递减）；爆头训练模式下范围伤害无效；火箭中心必杀
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.alive) continue;
      if (settings.train === 'head') continue;
      var d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < 6) {
        e.hp -= Math.max(1, Math.round(dmg * (1 - d / 6)));
        e.hurtFlash = 0.18;
        spawnBlood(e.pos, 6);
        if (e.hp <= 0) killEnemy(e, false);
      }
    }
    // 火光粒子
    for (var k = 0; k < 16; k++) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, opacity: 1 }));
      s.position.copy(pos);
      s.scale.set(rand(0.7, 1.8), rand(0.7, 1.8), 1);
      scene.add(s);
      particles.push({ obj: s, life: 0, max: rand(0.2, 0.5), vel: new THREE.Vector3(rand(-5, 5), rand(1, 6), rand(-5, 5)) });
    }
    sndExplosion();
  }

  // 伤害数字
  function spawnDamage(pos, dmg, headshot) {
    var c = makeCanvas(48, 36, function (g, w, h) {
      g.font = '900 30px Arial';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = headshot ? '#ff4a3c' : '#ffffff';
      g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 4;
      g.strokeText(String(dmg), w / 2, h / 2);
      g.fillText(String(dmg), w / 2, h / 2);
    });
    var mat = new THREE.SpriteMaterial({ map: toSRGB(new THREE.CanvasTexture(c)), transparent: true, depthWrite: false });
    var s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.set(0.55, 0.4, 1);
    scene.add(s);
    particles.push({ obj: s, life: 0, max: 0.8, vel: new THREE.Vector3(0, 1.4, 0), dmg: true });
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        scene.remove(p.obj);
        if (p.obj.material && p.obj.material.map) p.obj.material.map.dispose();
        particles.splice(i, 1);
        continue;
      }
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.obj.isMesh) {
        p.vel.y -= 9.8 * dt;
        p.obj.rotation.x += (p.spin || 0) * dt;
        p.obj.rotation.z += (p.spin || 0) * dt * 0.7;
      }
      if (p.obj.material) {
        p.obj.material.opacity = 1 - p.life / p.max;
      }
    }
  }

  /* ================= 弹孔 ================= */
  var DECALS = [];
  var decalGeo = new THREE.BoxGeometry(0.09, 0.09, 0.012);
  var decalMat = new THREE.MeshBasicMaterial({ color: 0x151210, transparent: true, opacity: 0.92 });
  var decalRingMat = new THREE.MeshBasicMaterial({ color: 0x9c8f78, transparent: true, opacity: 0.35 });
  function spawnDecal(point, normal) {
    var d = new THREE.Mesh(decalGeo, decalMat);
    d.position.copy(point).addScaledVector(normal, 0.006);
    d.lookAt(point.clone().add(normal));
    scene.add(d);
    DECALS.push(d);
    var ring = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.008), decalRingMat);
    ring.position.copy(point).addScaledVector(normal, 0.005);
    ring.lookAt(point.clone().add(normal));
    scene.add(ring);
    DECALS.push(ring);
    if (DECALS.length > 120) {
      var old = DECALS.shift(); scene.remove(old);
      var old2 = DECALS.shift(); scene.remove(old2);
    }
  }
  function boxNormal(box, p) {
    var cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2;
    var dx = Math.abs(p.x - cx), dy = Math.abs(p.y - cy), dz = Math.abs(p.z - cz);
    if (dx >= dy && dx >= dz) return new THREE.Vector3(p.x >= cx ? 1 : -1, 0, 0);
    if (dy >= dx && dy >= dz) return new THREE.Vector3(0, p.y >= cy ? 1 : -1, 0);
    return new THREE.Vector3(0, 0, p.z >= cz ? 1 : -1);
  }

  /* ================= 射击 ================= */

  var firing = false;

  function shoot() {
    if (state !== 'play') return;
    var wp = WEAPONS[weaponIdx];
    if (cooldown > 0) return;
    if (reloading) return;
    cooldown = 60 / wp.rpm;

    // 近战：匕首挥砍（不消耗弹匣）
    if (wp.melee) {
      meleeAttack(wp);
      return;
    }

    // 弹药：空匣自动换弹
    if (mag <= 0) {
      startReload();
      return;
    }
    mag--;

    stats.shots++;
    gunKick = 1;
    gunRaise = 1;
    muzzleT = 0.045;
    if (wp.muzzle) wp.muzzle.material.opacity = 1;
    ejectShell(wp);

    // 弹道：用射击前的视角（本发不含本次后坐，第一发沿准星）
    var yaw = player.yaw + player.recoilYaw;
    var pitch = player.pitch + player.recoilPitch;

    // 霰弹枪：多弹丸独立判定
    if (wp.pellets) {
      sndShotgun();
      shotgunShoot(wp, yaw, pitch);
      return;
    }
    // 火箭筒：发射抛射物
    if (wp.rocket) {
      sndRocketFire();
      rocketShoot(wp, yaw, pitch);
      return;
    }

    sndShot();
    var dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    // 散布圆盘（用射击前的累计散布）
    var a = Math.random() * Math.PI * 2;
    var r2 = player.spread * Math.sqrt(Math.random());
    var right = new THREE.Vector3().crossVectors(dir, _UP).normalize();
    var up2 = new THREE.Vector3().crossVectors(right, dir).normalize();
    dir.addScaledVector(right, Math.cos(a) * r2).addScaledVector(up2, Math.sin(a) * r2).normalize();

    _ray.origin.set(player.pos.x, player.pos.y, player.pos.z);
    _ray.direction.copy(dir);

    // 命中敌人
    var best = null, bestT = Infinity;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.alive) continue;
      for (var j = 0; j < e.parts.length; j++) {
        var pt = e.parts[j];
        var hit = _ray.intersectSphere(pt.sphere, _hitP);
        if (hit) {
          var t = hit.distanceTo(_ray.origin);
          if (t > 0.1 && t < bestT) { bestT = t; best = { e: e, part: pt.name, point: hit.clone() }; }
        }
      }
    }
    // 墙体遮挡 + 弹孔
    var tWall = Infinity, wallIdx = -1;
    for (var k = 0; k < WALLS.length; k++) {
      var p = _ray.intersectBox(WALLS[k].box, _hitP);
      if (p) {
        var tw = p.distanceTo(_ray.origin);
        if (tw > 0.2 && tw < tWall) { tWall = tw; wallIdx = k; }
      }
    }
    if (tWall < bestT) best = null;

    if (best) {
      applyHit(best);
    } else if (wallIdx >= 0) {
      spawnDecal(_hitP.clone(), boxNormal(WALLS[wallIdx].box, _hitP));
    }

    // 射击后：累积后坐与散布（影响准星与下一发）
    player.spread = Math.min(player.spread + wp.spreadPerShot, wp.spreadMax);
    player.recoilPitch = Math.min(player.recoilPitch + wp.kick, 0.12);
    player.recoilYaw += rand(-0.004, 0.004);
  }

  // 霰弹枪：一次发射多颗弹丸，独立命中判定
  function shotgunShoot(wp, yaw, pitch) {
    var dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    var total = 0, headHits = 0, lastHitPoint = null;
    for (var pi = 0; pi < wp.pellets; pi++) {
      // 弹丸均匀散布：角度均分 + 半径阶梯（16 颗，散射两倍：0.07~0.20）
      var a = (pi / wp.pellets) * Math.PI * 2 + rand(-0.12, 0.12);
      var r2 = 0.07 + (pi / (wp.pellets - 1)) * 0.13 + rand(-0.02, 0.02);
      var right = new THREE.Vector3().crossVectors(dir, _UP).normalize();
      var up2 = new THREE.Vector3().crossVectors(right, dir).normalize();
      var pdir = dir.clone().addScaledVector(right, Math.cos(a) * r2).addScaledVector(up2, Math.sin(a) * r2).normalize();
      _ray.origin.set(player.pos.x, player.pos.y, player.pos.z);
      _ray.direction.copy(pdir);
      var best = null, bestT = Infinity;
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (!e.alive) continue;
        for (var j = 0; j < e.parts.length; j++) {
          var pt = e.parts[j];
          var hit = _ray.intersectSphere(pt.sphere, _hitP);
          if (hit) {
            var t = hit.distanceTo(_ray.origin);
            if (t > 0.1 && t < bestT) { bestT = t; best = { e: e, part: pt.name, point: hit.clone() }; }
          }
        }
      }
      var tWall = Infinity, wallIdx = -1;
      for (var k = 0; k < WALLS.length; k++) {
        var p = _ray.intersectBox(WALLS[k].box, _hitP);
        if (p) {
          var tw = p.distanceTo(_ray.origin);
          if (tw > 0.2 && tw < tWall) { tWall = tw; wallIdx = k; }
        }
      }
      if (tWall < bestT) best = null;
      if (best) {
        stats.hits++;
        var headshot = best.part === 'head';
        var dmg = headshot ? wp.dmgHead : wp.dmgBody;
        // 霰弹距离衰减：3 米内满伤，12 米后衰减到 20%（远距离伤害低）
        dmg = Math.round(dmg * clamp(1 - Math.max(0, bestT - 3) / 9, 0.2, 1));
        if (settings.train === 'head') {
          if (headshot) dmg = Math.max(dmg, best.e.maxHp);
          else dmg = 0;
        }
        if (dmg > 0) {
          best.e.hp -= dmg;
          best.e.hurtFlash = 0.09;
          enemyDodgeReact(best.e);
          spawnBlood(best.point, headshot ? 3 : 2);
          total += dmg;
          if (headshot) headHits++;
          lastHitPoint = best.point;
          var kb = pdir.clone().multiplyScalar(0.08);
          best.e.pos.x = clamp(best.e.pos.x + kb.x, -MAP_HALF + 1, MAP_HALF - 1);
          best.e.pos.z = clamp(best.e.pos.z + kb.z, -MAP_HALF + 1, MAP_HALF - 1);
          if (best.e.hp <= 0) { killEnemy(best.e, headshot); }
          else if (settings.train !== 'static' && Math.random() < 0.3 && best.e.state !== 'rush') { best.e.state = 'rush'; best.e.stateT = 0; }
        }
      } else if (wallIdx >= 0) {
        spawnDecal(_hitP.clone(), boxNormal(WALLS[wallIdx].box, _hitP));
      }
    }
    if (lastHitPoint) {
      document.body.classList.remove('hitmark');
      void document.body.offsetWidth;
      document.body.classList.add('hitmark');
      setTimeout(function () { document.body.classList.remove('hitmark'); }, 130);
      if (headHits > 0) sndHeadshot(); else sndHit();
      spawnDamage(lastHitPoint, total, headHits > 0);
    }
    player.spread = Math.min(player.spread + wp.spreadPerShot, wp.spreadMax);
    player.recoilPitch = Math.min(player.recoilPitch + wp.kick, 0.12);
    player.recoilYaw += rand(-0.004, 0.004);
  }

  // 火箭筒：发射抛射物，命中爆炸范围伤害
  function rocketShoot(wp, yaw, pitch) {
    var dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    var a = Math.random() * Math.PI * 2;
    var r2 = player.spread * 0.8;
    var right = new THREE.Vector3().crossVectors(dir, _UP).normalize();
    var up2 = new THREE.Vector3().crossVectors(right, dir).normalize();
    dir.addScaledVector(right, Math.cos(a) * r2).addScaledVector(up2, Math.sin(a) * r2).normalize();
    var from = new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z).addScaledVector(dir, 1.0);
    spawnProjectile(from, dir, 28, 'rocket');
    player.spread = Math.min(player.spread + wp.spreadPerShot, wp.spreadMax);
    player.recoilPitch = Math.min(player.recoilPitch + wp.kick, 0.12);
    player.recoilYaw += rand(-0.004, 0.004);
  }

  // 近战攻击：短距离射线判定，砍头一刀死
  function meleeAttack(wp) {
    stats.shots++;
    sndSwing();
    gunKick = 1.3;
    gunRaise = 1.0;
    var yaw = player.yaw + player.recoilYaw;
    var pitch = player.pitch + player.recoilPitch;
    var fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    _ray.origin.set(player.pos.x, player.pos.y, player.pos.z);
    _ray.direction.copy(fwd);
    var best = null, bestT = wp.range;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.alive) continue;
      for (var j = 0; j < e.parts.length; j++) {
        var pt = e.parts[j];
        var hit = _ray.intersectSphere(pt.sphere, _hitP);
        if (hit) {
          var t = hit.distanceTo(_ray.origin);
          if (t > 0.05 && t < bestT) { bestT = t; best = { e: e, part: pt.name, point: hit.clone() }; }
        }
      }
    }
    // 墙体遮挡
    var tWall = Infinity;
    for (var k = 0; k < WALLS.length; k++) {
      var p = _ray.intersectBox(WALLS[k].box, _hitP);
      if (p) {
        var tw = p.distanceTo(_ray.origin);
        if (tw > 0.2 && tw < tWall) tWall = tw;
      }
    }
    if (tWall < bestT) best = null;

    if (best) {
      stats.hits++;
      var e2 = best.e;
      var headshot = best.part === 'head';
      var dmg = headshot ? wp.dmgHead : wp.dmgBody;
      // 爆头模式：只有爆头有效，身体命中不掉血（保留命中反馈）
      if (settings.train === 'head') {
        if (headshot) dmg = Math.max(dmg, e2.maxHp);
        else dmg = 0;
      }
      e2.hp -= dmg;
      e2.hurtFlash = 0.09;
      enemyDodgeReact(e2);
      spawnBlood(best.point, headshot ? 10 : 6);
      spawnDamage(best.point, dmg, headshot);
      if (headshot) sndHeadshot(); else sndHit();
      var kb = fwd.clone().multiplyScalar(0.5);
      e2.pos.x = clamp(e2.pos.x + kb.x, -MAP_HALF + 1, MAP_HALF - 1);
      e2.pos.z = clamp(e2.pos.z + kb.z, -MAP_HALF + 1, MAP_HALF - 1);
      if (e2.hp <= 0) killEnemy(e2, headshot);
      else if (settings.train !== 'static' && Math.random() < 0.5 && e2.state !== 'rush') { e2.state = 'rush'; e2.stateT = 0; }
    }
  }

  function applyHit(best) {
    var e = best.e;
    stats.hits++;
    var headshot = best.part === 'head';
    var wp = WEAPONS[weaponIdx];
    var dmg = headshot ? wp.dmgHead : Math.round(wp.dmgBody * rand(0.95, 1.05));
    // 爆头模式：只有爆头有效，身体命中不掉血（保留命中反馈）
    if (settings.train === 'head') {
      if (headshot) dmg = Math.max(dmg, e.maxHp);
      else dmg = 0;
    }
    e.hp -= dmg;
    e.hurtFlash = 0.09;
    enemyDodgeReact(e);
    spawnBlood(best.point, headshot ? 12 : 6);
    spawnDamage(best.point, dmg, headshot);

    document.body.classList.remove('hitmark');
    void document.body.offsetWidth;
    document.body.classList.add('hitmark');
    setTimeout(function () { document.body.classList.remove('hitmark'); }, 130);
    if (headshot) { sndHeadshot(); } else { sndHit(); }

    if (e.hp <= 0) {
      killEnemy(e, headshot);
    } else {
      // 中弹后小概率冲向玩家（静止靶不会）
      if (settings.train !== 'static' && Math.random() < 0.4 && e.state !== 'rush') { e.state = 'rush'; e.stateT = 0; }
      // 击退
      var kb = _ray.direction.clone().multiplyScalar(0.28);
      e.pos.x += kb.x; e.pos.z += kb.z;
      e.pos.x = clamp(e.pos.x, -MAP_HALF + 1, MAP_HALF - 1);
      e.pos.z = clamp(e.pos.z, -MAP_HALF + 1, MAP_HALF - 1);
    }
  }

  /* ================= 玩家更新 ================= */
  var _UP = new THREE.Vector3(0, 1, 0);
  var keys = {};
  var prevFootY = 0;
  var footstepT = 0.5;

  function updatePlayer(dt) {
    // 重生计时
    if (player.respawnT > 0) {
      player.respawnT -= dt;
      if (player.respawnT <= 0) {
        player.pos.set(MAP_SPAWN.x, 1.7, MAP_SPAWN.z);
        player.yaw = MAP_SPAWN.yaw; player.pitch = 0;
        player.hp = 100;
        player.vy = 0;
        zoomed = false;
        zoomOverlay.style.display = 'none';
        crosshairEl.style.opacity = 1;
      }
      return;
    }

    // 移动
    var fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    var rgt = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    var move = new THREE.Vector3();
    if (keys['KeyW']) move.add(fwd);
    if (keys['KeyS']) move.sub(fwd);
    if (keys['KeyD']) move.add(rgt);
    if (keys['KeyA']) move.sub(rgt);
    if (move.lengthSq() > 0) move.normalize();
    var wp = WEAPONS[weaponIdx];
    var speed = (keys['ShiftLeft'] || keys['ShiftRight'] ? 2.1 : 5.2) * wp.moveMul * (zoomed ? 0.62 : 1);
    var dx = move.x * speed * dt, dz = move.z * speed * dt;
    movePlayerAxis('x', dx);
    movePlayerAxis('z', dz);

    // 脚步声
    var walking = move.lengthSq() > 0 && player.grounded;
    footstepT -= dt * (walking ? speed * 1.8 : 0);
    if (footstepT <= 0) {
      footstepT = walking ? 0.62 : 0.4;
      if (walking) sndStep();
    }

    // 跳跃与重力
    prevFootY = player.pos.y - 1.7;
    var wasGrounded = player.grounded;
    player.vy -= 14 * dt;
    player.pos.y += player.vy * dt;
    var footY = player.pos.y - 1.7;
    player.grounded = false;
    if (footY <= 0) {
      if (!wasGrounded && player.vy < -7) sndLand();
      player.pos.y = 1.7; player.vy = 0; player.grounded = true;
    }
    // 台阶吸附（收紧条件，防止下坠瞬间被吸回台面）
    var footY = player.pos.y - 1.7;
    WALLS.forEach(function (w) {
      if (!w.step) return;
      if (player.pos.x > w.minX - PLAYER_R && player.pos.x < w.maxX + PLAYER_R &&
          player.pos.z > w.minZ - PLAYER_R && player.pos.z < w.maxZ + PLAYER_R) {
        if (footY <= w.h && footY >= w.h - 0.4 && player.vy <= 0 && prevFootY >= w.h - 0.3) {
          player.pos.y = w.h + 1.7; player.vy = 0; player.grounded = true;
        }
      }
    });
    if (keys['Space'] && player.grounded) player.vy = 5.6;

    // 脱战回血（练习模式友好）
    if (player.healCd > 0) player.healCd -= dt;
    else if (player.hp > 0 && player.hp < 100) player.hp = Math.min(100, player.hp + 6 * dt);

    // 后坐力恢复
    player.spread *= Math.exp(-wp.spreadRecover * dt);
    player.recoilPitch *= Math.exp(-wp.kickRecover * dt);
    player.recoilYaw *= Math.exp(-wp.kickRecover * dt * 0.8);

    // 攻击间隔
    cooldown -= dt;

    // 弹匣打空立即自动装填（无需任何操作）
    if (!reloading && mag <= 0 && RELOAD_TIME[weaponIdx] > 0) {
      startReload();
    }
    // 换弹计时
    if (reloading) {
      reloadT -= dt;
      if (reloadT <= 0) {
        reloading = false;
        mag = MAG_SIZE[weaponIdx];
        sndReloadDone();
      }
    }

    // 相机
    camera.position.copy(player.pos);
    var bob = 0;
    var moving = move.lengthSq() > 0 && player.grounded;
    if (moving) { player.bobT += dt * speed * 1.6; bob = Math.sin(player.bobT * 2) * 0.035; }
    else { player.bobT = 0; }
    camera.position.y += bob;
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch + player.recoilPitch;

    // 准星
    var gap = 5 + player.spread * 620;
    crosshairEl.style.setProperty('--gap', gap.toFixed(1) + 'px');

    // 开镜（AWP）
    var targetFov = (zoomed && WEAPONS[weaponIdx].zoom) ? 36 : 78;
    if (Math.abs(camera.fov - targetFov) > 0.2) {
      camera.fov += (targetFov - camera.fov) * Math.min(dt * 10, 1);
      camera.updateProjectionMatrix();
    }
    if (WEAPONS[weaponIdx].zoom && zoomed) {
      zoomOverlay.style.display = 'block';
      crosshairEl.style.opacity = 0;
    } else {
      zoomOverlay.style.display = 'none';
      crosshairEl.style.opacity = 1;
    }

    // 枪动画
    gunKick *= Math.exp(-dt * 14);
    gunRaise *= Math.exp(-dt * 9);
    gun.position.x = wp.baseX + bob * 0.6;
    gun.position.y = wp.baseY - bob * 0.5 + Math.sin(player.bobT * 2) * 0.008;
    gun.position.z = wp.baseZ + gunKick * 0.07;
    gun.rotation.x = gunRaise * 0.09 + gunKick * 0.04;
    if (wp.melee) {
      // 匕首挥砍：刀横向甩动
      gun.rotation.y = -gunKick * 0.6;
      gun.position.z = wp.baseZ + gunKick * 0.14;
    } else {
      gun.rotation.y = 0;
    }
    muzzleT -= dt;
    if (wp.muzzle && muzzleT <= 0) wp.muzzle.material.opacity = 0;

    // 玩家受击镜头晃动 + 击杀微震
    player.flashT -= dt;
    if (player.killShake > 0) {
      player.killShake -= dt * 4;
      camera.rotation.z += Math.sin(player.killShake * 30) * 0.012 * player.killShake;
    }
    if (player.flashT > 0) {
      camera.rotation.z = Math.sin(player.flashT * 60) * 0.02;
    } else if (player.killShake <= 0) {
      camera.rotation.z *= Math.exp(-dt * 8);
    }
  }

  function movePlayerAxis(axis, delta) {
    if (delta === 0) return;
    var R = PLAYER_R;
    var other = axis === 'x' ? 'z' : 'x';
    var minA = axis === 'x' ? 'minX' : 'minZ';
    var maxA = axis === 'x' ? 'maxX' : 'maxZ';
    var minO = axis === 'x' ? 'minZ' : 'minX';
    var maxO = axis === 'x' ? 'maxZ' : 'maxX';
    var np = player.pos[axis] + delta;
    // 迭代修正：一次碰撞修正后若仍与其它墙重叠（墙体重叠区），继续修正，最多 3 轮
    for (var iter = 0; iter < 3; iter++) {
      var blocked = false;
      for (var i = 0; i < WALLS.length; i++) {
        var w = WALLS[i];
        if (np > w[minA] - R && np < w[maxA] + R && player.pos[other] > w[minO] - R && player.pos[other] < w[maxO] + R) {
          if (!w.step || player.pos.y - 1.7 < w.h - 0.05) {
            np = delta > 0 ? w[minA] - R : w[maxA] + R;
            blocked = true;
            break;
          }
        }
      }
      if (!blocked) break;
    }
    player.pos[axis] = np;
  }

  /* ================= 刷怪 ================= */
  var spawnTimer = 2.5;

  function spawnManager(dt) {
    spawnTimer -= dt;
    if (spawnTimer > 0) return;
    var aliveCount = enemies.filter(function (e) { return e.alive; }).length;
    if (aliveCount < settings.bots) {
      // 选一个没有敌人占据的刷点
      var candidates = SPAWNS.filter(function (s) {
        return !enemies.some(function (e) {
          return e.alive && Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < 2.2;
        });
      });
      if (candidates.length === 0) candidates = SPAWNS;
      var sp = candidates[Math.floor(Math.random() * candidates.length)];
      makeEnemy(sp);
    }
    spawnTimer = challenge.active ? rand(0.5, 0.9) : rand(1.0, 2.0);
  }

  /* ================= 坚守阵地（波次模式，玩法层新增） ================= */
  var hold = { wave: 0, phase: 'intermission', timer: 2.0, pending: 0 };
  var holdBest = null;
  try { holdBest = JSON.parse(localStorage.getItem('ww2_hold_best') || 'null'); } catch (e) { holdBest = null; }

  function spawnEnemyAtFreeSpawn() {
    var candidates = SPAWNS.filter(function (s) {
      return !enemies.some(function (e) {
        return e.alive && Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < 2.2;
      });
    });
    if (candidates.length === 0) candidates = SPAWNS;
    makeEnemy(candidates[Math.floor(Math.random() * candidates.length)]);
  }

  function updateHold(dt) {
    hold.timer -= dt;
    if (hold.phase === 'intermission') {
      if (hold.timer <= 0) {
        hold.wave++;
        hold.phase = 'combat';
        hold.pending = Math.min(3 + hold.wave, 12);
        hold.timer = rand(1.0, 1.8);
        showCenterMsg('第 ' + hold.wave + ' 波进攻', 1100, true);
        sndWaveStart();
      }
    } else {
      if (hold.timer <= 0 && hold.pending > 0) {
        hold.pending--;
        spawnEnemyAtFreeSpawn();
        hold.timer = rand(0.7, 1.5);
      }
      var alive = enemies.filter(function (e) { return e.alive; }).length;
      if (hold.pending <= 0 && alive === 0) {
        hold.phase = 'intermission';
        hold.timer = 3.5;
        sndWaveClear();
      }
    }
  }

  function sndWaveStart() {
    if (!ac) return;
    var t = ac.currentTime;
    tone(t, 'sawtooth', 220, 110, 0.25, 0.2);
    tone(t, 'sawtooth', 330, 165, 0.25, 0.16, 0, 0.12);
  }
  function sndWaveClear() {
    if (!ac) return;
    var t = ac.currentTime;
    tone(t, 'sine', 440, 660, 0.14, 0.2);
    tone(t, 'sine', 660, 880, 0.16, 0.16, 0, 0.12);
  }

  function holdRating(w) {
    return w >= 8 ? 'S' : w >= 6 ? 'A' : w >= 4 ? 'B' : w >= 3 ? 'C' : 'D';
  }

  function endHold() {
    state = 'result';
    var rating = holdRating(hold.wave);
    var isNew = false;
    if (!holdBest || hold.wave > holdBest.wave) {
      holdBest = { wave: hold.wave, rating: rating, kills: stats.kills, hs: stats.headshots, streak: stats.bestStreak };
      isNew = true;
      try { localStorage.setItem('ww2_hold_best', JSON.stringify(holdBest)); } catch (e) {}
    }
    var acc = stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0;
    document.getElementById('r-rating').textContent = rating;
    document.getElementById('r-rating').className = 'r-rating rating-' + rating;
    document.getElementById('r-title').textContent = '阵地失守';
    document.getElementById('r-score').textContent = '第 ' + hold.wave + ' 波';
    document.getElementById('r-stats').innerHTML =
      '坚守到第 <b>' + hold.wave + '</b> 波 · 击杀 ' + stats.kills + ' · 爆头 ' + stats.headshots + ' · 命中率 ' + acc + '% · 最高连杀 ' + stats.bestStreak;
    document.getElementById('r-new').style.display = (isNew && hold.wave > 0) ? 'block' : 'none';
    resultEl.style.display = 'flex';
    hud.style.display = 'none';
    sndChallengeEnd();
    document.exitPointerLock && document.exitPointerLock();
  }

  /* ================= 指挥官无线电（COD 风格，屏幕下方） ================= */
  var radioEl = document.getElementById('radio-bar');
  var radioQueue = [];
  var radioShown = null;
  function radio(msg, dur) { radioQueue.push({ msg: msg, left: (dur || 4000) }); }
  function updateRadio(dt) {
    if (radioShown) {
      radioShown.left -= dt;
      if (radioShown.left <= 0) {
        radioShown = null;
        radioEl.style.transition = 'opacity 0.5s';
        radioEl.style.opacity = 0;
        setTimeout(function () { radioEl.style.transition = 'none'; }, 500);
      }
    } else if (radioQueue.length) {
      radioShown = radioQueue.shift();
      radioEl.innerHTML = '<span class="r-ico">◉</span> 指挥部：' + radioShown.msg;
      radioEl.style.opacity = 1;
    }
  }

  /* ================= 战役模式（独立关卡制，每关一张地图） ================= */
  var campaign = {
    active: false, stage: 0, phase: 'intro',
    killed: 0, targetKills: 0,
    holdT: 0, holdNeed: 0,
    dieCount: 0, startT: 0, done: false,
    halfTalked: false, nearTalked: false, exitOpen: false
  };
  var campaignBest = null;
  try { campaignBest = JSON.parse(localStorage.getItem('ww2_campaign_best') || 'null'); } catch (e) { campaignBest = null; }

  var CAMPAIGN_LEVELS = [
    {
      map: 'c1', name: '奥马哈滩头',
      brief: '肃清滩头阵地残余德军，为连队打开通路',
      story: ['1944年6月6日，诺曼底。', '奥马哈海滩，D日。', '德军派出了精锐机器人部队——钢铁铸就的突击兵，不知疲倦，不惧死亡。', '你所在的连队在滩头损失过半。', '命令只有一个：向前。'],
      kills: 6, spawnN: 6, halfMsg: '滩头推进顺利！已解决 %n 个，继续清剿。'
    },
    {
      map: 'c2', name: '死亡战壕',
      brief: '穿过德军战壕，抵达北端出口',
      story: ['德军战壕犬牙交错，沿着高地挖了三百米。', '侧翼随时可能响起枪声。', '穿过壕沟，向小镇推进。'],
      reach: { x: 0, z: -20 }, spawnN: 5, halfMsg: '战壕通畅！出口就在北端，跟紧信标。'
    },
    {
      map: 'c3', name: '废墟街道',
      brief: '清剿废墟街道的守军，守住广场',
      story: ['圣梅尔埃格利斯已在炮火中变成废墟。', '德军依托残垣断壁顽抗。', '清剿街道，守住广场，大部队马上到。'],
      kills: 8, hold: 20, spawnN: 6, halfMsg: '街道过半肃清！清完立刻转入防守。'
    },
    {
      map: 'c4', name: '教堂高地',
      brief: '肃清教堂守军，占领教堂高地',
      story: ['前方是镇子最高点——教堂。', '拿下它，整个诺曼底乡间都在你的视野里。', '这是最后一道防线。'],
      kills: 10, spawnN: 7, halfMsg: '教堂守军撑不住了！把他们清干净。'
    }
  ];

  var CAMPAIGN_RADIO = {
    stage: [
      '滩头那些机器人交给你了，侦察兵。清剿干净再走。',
      '穿过战壕，到北端出口与我汇合。出口处有信标。',
      '看到小镇了吗？废墟里有守军。清掉他们，守住广场，大部队马上到。',
      '最后一步——教堂。那是整个乡间的制高点。拿下它，战争就快结束了。'
    ],
    done: [
      '滩头肃清，干得漂亮，侦察兵。',
      '战壕通了！向小镇推进！',
      '广场守住了！大部队上来了！',
      '教堂升起了我们的旗。诺曼底，自由了。'
    ]
  };

  function campaignStageStart(idx) {
    campaign.stage = idx;
    campaign.phase = 'intro';      // 剧情确认后才进入战斗
    campaign.killed = 0;
    campaign.holdT = 0;
    campaign.halfTalked = false;
    campaign.nearTalked = false;
    campaign.exitOpen = false;
    var st = CAMPAIGN_LEVELS[idx];
    campaign.targetKills = st.kills || 0;
    campaign.holdNeed = st.hold || 0;
    // 清残留敌人，等剧情确认后再刷怪
    enemies.slice().forEach(enemyDeadRemove);
    clearBeacon();
    // 到达型关卡：出口清剿完全部敌人后才开启（信标届时出现）
    showObj((idx + 1) + ' / ' + CAMPAIGN_LEVELS.length + ' · ' + st.name + '——' + st.brief + (st.reach ? '（清剿守军后出口开启）' : ''));
    // 剧情过场：确认后才开始（确认时清掉过场期间排队的旧广播）
    showStory(st.story, function () {
      radioQueue.length = 0;
      campaign.phase = 'combat';
      campaign.timer = rand(1.5, 3);
      for (var i = 0; i < st.spawnN; i++) campaignSpawn();
      radio(CAMPAIGN_RADIO.stage[idx]);
    });
  }

  function campaignSpawn() {
    var pts = SPAWNS;
    var cands = pts.filter(function (s) {
      return !enemies.some(function (e) {
        return e.alive && Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < 2.2;
      });
    });
    if (cands.length === 0) cands = pts;
    if (cands.length) makeEnemy(cands[Math.floor(Math.random() * cands.length)]);
  }

  function updateCampaign(dt) {
    var st = CAMPAIGN_LEVELS[campaign.stage];
    if (campaign.phase === 'combat') {
      // 击杀推进
      if (st.kills && campaign.killed >= st.kills) {
        if (st.hold) {
          campaign.phase = 'hold';
          campaign.holdT = st.hold;
          showObj(campaign.stage + 1 + ' / ' + CAMPAIGN_LEVELS.length + ' · ' + st.name + '——守住广场 ' + Math.ceil(campaign.holdT) + ' 秒');
          showCenterMsg('守住阵地 ' + st.hold + ' 秒！', 900, true);
          radio('守住广场 ' + st.hold + ' 秒，大部队正在穿越街道！');
        } else {
          campaignStageDone();
        }
        return;
      }
      // 实时无线电：击杀过半
      if (st.kills && !campaign.halfTalked && campaign.killed >= Math.ceil(st.kills / 2)) {
        campaign.halfTalked = true;
        radio(st.halfMsg.replace('%n', campaign.killed));
      }
      // 到达推进（突进型关卡：清剿完全部守军后出口才开启）
      if (st.reach) {
        var aliveN = enemies.filter(function (e) { return e.alive; }).length;
        if (!campaign.exitOpen) {
          if (aliveN === 0) {
            campaign.exitOpen = true;
            setBeacon(st.reach.x, st.reach.z);
            showObj(campaign.stage + 1 + ' / ' + CAMPAIGN_LEVELS.length + ' · ' + st.name + '——出口已开启，前往北端信标');
            radio('战壕肃清！出口开启，向北端信标推进。');
          }
        } else {
          var d = Math.hypot(player.pos.x - st.reach.x, player.pos.z - st.reach.z);
          if (d < 3) { campaignStageDone(); return; }
          // 实时无线电：接近目标
          if (!campaign.nearTalked && d < 16) {
            campaign.nearTalked = true;
            radio('出口就在前方！看到信标了吗？');
          }
        }
      }
      // 补怪（场上不足则续；到达型关卡不补——要清剿完才能开出口）
      var alive = enemies.filter(function (e) { return e.alive; }).length;
      if (alive < 2 && !st.reach) {
        campaign.timer -= dt;
        if (campaign.timer <= 0) { campaign.timer = rand(1.5, 3); campaignSpawn(); }
      }
    } else if (campaign.phase === 'hold') {
      campaign.holdT -= dt;
      // 坚守期间持续补怪
      campaign.timer -= dt;
      if (campaign.timer <= 0) { campaign.timer = rand(2.0, 3.2); campaignSpawn(); }
      showObj(campaign.stage + 1 + ' / ' + CAMPAIGN_LEVELS.length + ' · ' + st.name + '——坚守 ' + Math.ceil(campaign.holdT) + ' 秒');
      if (campaign.holdT <= 0) campaignStageDone();
    }
  }

  function campaignStageDone() {
    var st = CAMPAIGN_LEVELS[campaign.stage];
    campaign.killed = 0;
    clearBeacon();
    if (campaign.stage >= CAMPAIGN_LEVELS.length - 1) {
      // 通关
      campaign.done = true;
      radio(CAMPAIGN_RADIO.done[campaign.stage]);
      setTimeout(function () { endCampaign(); }, 900);
      return;
    }
    radio(CAMPAIGN_RADIO.done[campaign.stage]);
    showCenterMsg(st.name + ' 完成', 700, false);
    // 加载下一关地图
    var next = campaign.stage + 1;
    buildMap(CAMPAIGN_LEVELS[next].map);
    resetStats();
    campaignStageStart(next);
  }

  function campaignDeath() {
    campaign.dieCount++;
    // 关掉剧情过场（防遮挡）
    var sel = document.getElementById('story');
    if (sel._finish) { sel._finish(); }
    sel.style.display = 'none'; sel.style.pointerEvents = 'none';
    // 关卡内重试：回出生点，清怪重刷
    player.pos.set(MAP_SPAWN.x, 1.7, MAP_SPAWN.z);
    player.yaw = 0; player.pitch = 0;
    player.hp = 100; player.vy = 0;
    enemies.slice().forEach(enemyDeadRemove);
    var st = CAMPAIGN_LEVELS[campaign.stage];
    campaign.phase = 'combat';
    for (var i = 0; i < st.spawnN; i++) campaignSpawn();
    campaign.killed = 0;
    campaign.halfTalked = false;
    campaign.nearTalked = false;
    campaign.exitOpen = false;
    clearBeacon();
    showObj((campaign.stage + 1) + ' / ' + CAMPAIGN_LEVELS.length + ' · ' + st.name + '——' + st.brief + (st.reach ? '（清剿守军后出口开启）' : ''));
    radio('重新集结！本关目标不变，坚持住。');
    deathEl.style.opacity = 1;
    document.getElementById('death-info').textContent = '阵地受挫，从本关起点重新集结…';
    setTimeout(function () { deathEl.style.opacity = 0; }, 1500);
  }

  function campaignRating(die, secs) {
    if (die === 0) return 'S';
    if (die <= 1) return 'A';
    if (die <= 3) return 'B';
    return 'C';
  }

  function endCampaign() {
    state = 'result';
    var secs = Math.round((clock.getElapsedTime() - campaign.startT));
    var rating = campaign.done ? campaignRating(campaign.dieCount, secs) : 'C';
    var isNew = false;
    if (!campaignBest || campaign.dieCount < campaignBest.die || (campaign.dieCount === campaignBest.die && secs < campaignBest.secs)) {
      campaignBest = { die: campaign.dieCount, secs: secs, rating: rating, kills: stats.kills, hs: stats.headshots };
      isNew = true;
      try { localStorage.setItem('ww2_campaign_best', JSON.stringify(campaignBest)); } catch (e) {}
    }
    document.getElementById('r-rating').textContent = rating;
    document.getElementById('r-rating').className = 'r-rating rating-' + rating;
    document.getElementById('r-title').textContent = campaign.done ? '战役完成' : '战役中断';
    document.getElementById('r-score').textContent = campaign.done ? '诺曼底已光复' : '任务未完成';
    document.getElementById('r-stats').innerHTML =
      '用时 ' + (secs < 60 ? secs + ' 秒' : Math.floor(secs / 60) + ' 分 ' + (secs % 60) + ' 秒') +
      ' · 阵亡 ' + campaign.dieCount + ' 次 · 击杀 ' + stats.kills + ' · 爆头 ' + stats.headshots;
    document.getElementById('r-new').style.display = isNew ? 'block' : 'none';
    resultEl.style.display = 'flex';
    hud.style.display = 'none';
    sndChallengeEnd();
    document.exitPointerLock && document.exitPointerLock();
  }

  function showStory(lines, onConfirm) {
    var el = document.getElementById('story');
    el.innerHTML = lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') +
      '<div class="s-continue">点击任意处 · 按 空格 / Enter 继续</div>';
    el.style.display = 'flex';
    el.style.opacity = 1;
    el.style.pointerEvents = 'auto';
    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      el.style.transition = 'opacity 0.8s';
      el.style.opacity = 0;
      setTimeout(function () {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
        el.style.transition = 'none';
      }, 800);
      if (onConfirm) onConfirm();
    };
    el._finish = finish;
    el.onclick = finish;
  }

  function showObj(text) {
    var el = document.getElementById('obj-bar');
    el.textContent = text;
    el.style.display = 'block';
  }

  /* ================= 战役目标标记（光柱 + 雷达点 + 屏幕边缘箭头） ================= */
  var beacon = null;
  var beaconTex = toSRGB(new THREE.CanvasTexture(makeCanvas(64, 256, function (g, w, h) {
    var grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, 'rgba(255,215,94,0.9)');
    grad.addColorStop(1, 'rgba(255,215,94,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  })));
  function setBeacon(x, z) {
    clearBeacon();
    beacon = new THREE.Group();
    var beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconTex, transparent: true, depthWrite: false, opacity: 0.95 }));
    beam.position.set(x, 5, z); beam.scale.set(4.5, 16, 1);
    beacon.add(beam);
    // 顶部信标光球（金黄）
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, opacity: 0.9 }));
    glow.position.set(x, 10.5, z); glow.scale.set(3.2, 3.2, 1);
    beacon.add(glow);
    scene.add(beacon);
  }
  function clearBeacon() {
    if (beacon) { scene.remove(beacon); beacon = null; }
  }

  // 屏幕边缘方向箭头（COD 式目标指引）
  var aimArrow = document.getElementById('aim-arrow');
  var _projV = new THREE.Vector3();
  function updateAimArrow() {
    var st = settings.mode === 'campaign' ? CAMPAIGN_LEVELS[campaign.stage] : null;
    if (!st || !st.reach || campaign.phase !== 'combat') { aimArrow.style.display = 'none'; return; }
    var dist = Math.hypot(st.reach.x - player.pos.x, st.reach.z - player.pos.z);
    if (dist < 6) { aimArrow.style.display = 'none'; return; }
    _projV.set(st.reach.x, 2, st.reach.z);
    camera.updateMatrixWorld();
    _projV.project(camera);
    // 在视野内：光柱可见，无需箭头
    if (_projV.z < 1 && Math.abs(_projV.x) < 0.88 && Math.abs(_projV.y) < 0.82) {
      aimArrow.style.display = 'none';
      return;
    }
    var x = clamp(50 + _projV.x * 50, 7, 93);
    var y = clamp(50 - _projV.y * 50, 9, 91);
    var ang = Math.atan2(_projV.x, -_projV.y) * 180 / Math.PI;
    aimArrow.style.display = 'block';
    aimArrow.style.left = x + '%';
    aimArrow.style.top = y + '%';
    aimArrow.style.transform = 'translate(-50%, -50%) rotate(' + ang + 'deg)';
    aimArrow.innerHTML = '<i></i><b>' + Math.round(dist) + 'm</b>';
  }

  /* ================= 雷达 ================= */
  function drawRadar() {
    var c = radarCv.width / 2;
    var radarScale = 3.6 * (23.5 / MAP_HALF);
    radarCtx.clearRect(0, 0, 150, 150);
    radarCtx.save();
    radarCtx.translate(c, c);
    radarCtx.rotate(player.yaw);
    radarCtx.strokeStyle = 'rgba(180,220,160,0.7)';
    radarCtx.lineWidth = 1.5;
    // 外墙
    radarCtx.strokeRect(-MAP_HALF * radarScale, -MAP_HALF * radarScale, MAP_HALF * 2 * radarScale, MAP_HALF * 2 * radarScale);
    radarCtx.strokeStyle = 'rgba(180,220,160,0.35)';
    // 地图附加墙线（随地图切换）
    RADAR_LINES.forEach(function (ln) {
      radarCtx.beginPath();
      radarCtx.moveTo(ln[0] * radarScale, ln[1] * radarScale);
      radarCtx.lineTo(ln[2] * radarScale, ln[3] * radarScale);
      radarCtx.stroke();
    });
    // 敌人
    radarCtx.fillStyle = '#ff5a4a';
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.alive) continue;
      var ex = (e.pos.x - player.pos.x) * radarScale;
      var ez = (e.pos.z - player.pos.z) * radarScale;
      if (ex * ex + ez * ez < 60 * 60) {
        radarCtx.beginPath(); radarCtx.arc(ex, ez, 2.6, 0, 7); radarCtx.fill();
      }
    }
    // 战役目标点（到达型阶段）
    if (campaign.active && CAMPAIGN_LEVELS[campaign.stage] && CAMPAIGN_LEVELS[campaign.stage].reach) {
      var rp = CAMPAIGN_LEVELS[campaign.stage].reach;
      var rx = (rp.x - player.pos.x) * radarScale;
      var rz = (rp.z - player.pos.z) * radarScale;
      if (rx * rx + rz * rz < 60 * 60) {
        radarCtx.fillStyle = '#ffd75e';
        radarCtx.beginPath(); radarCtx.arc(rx, rz, 3.8, 0, 7); radarCtx.fill();
        radarCtx.strokeStyle = 'rgba(255,215,94,0.6)';
        radarCtx.lineWidth = 1;
        radarCtx.beginPath(); radarCtx.arc(rx, rz, 7, 0, 7); radarCtx.stroke();
      }
    }
    // 玩家三角
    radarCtx.fillStyle = '#fff';
    radarCtx.beginPath();
    radarCtx.moveTo(0, -5.5); radarCtx.lineTo(3.4, 3.4); radarCtx.lineTo(-3.4, 3.4);
    radarCtx.closePath(); radarCtx.fill();
    radarCtx.restore();
  }

  /* ================= HUD ================= */
  var hudTimer = 0;
  function updateHUD(dt) {
    hudTimer -= dt;
    if (hudTimer > 0) return;
    hudTimer = 0.15;
    stKills.textContent = stats.kills;
    stHs.textContent = stats.headshots;
    stStreak.textContent = stats.streak;
    stAcc.textContent = stats.shots ? Math.round(stats.hits / stats.shots * 100) + '%' : '-';
    stHsr.textContent = stats.kills ? Math.round(stats.headshots / stats.kills * 100) + '%' : '-';
    stScore.textContent = (settings.mode === 'hold' || settings.mode === 'campaign') ? stats.kills : challenge.score;
    if (challenge.active) {
      timerEl.textContent = Math.ceil(challenge.time);
      timerEl.classList.toggle('low', challenge.time <= 10);
    } else if (settings.mode === 'hold') {
      timerEl.textContent = hold.phase === 'intermission' ? '第 ' + (hold.wave + 1) + ' 波 · 准备' : '第 ' + hold.wave + ' 波';
    } else if (settings.mode === 'campaign' && (campaign.phase === 'combat' || campaign.phase === 'hold')) {
      var cst = CAMPAIGN_LEVELS[campaign.stage];
      if (cst) {
        if (campaign.phase === 'hold') {
          showObj((campaign.stage + 1) + ' / ' + CAMPAIGN_LEVELS.length + ' · ' + cst.name + '——坚守 ' + Math.ceil(campaign.holdT) + ' 秒');
        } else if (cst.reach) {
          // 到达型：清剿完开出口，显示剩余或距离
          if (!campaign.exitOpen) {
            var ra = enemies.filter(function (e) { return e.alive; }).length;
            showObj((campaign.stage + 1) + ' / ' + CAMPAIGN_LEVELS.length + ' · ' + cst.name + '——剩余敌军 ' + ra + '，清剿后出口开启');
          } else {
            var cd = Math.round(Math.hypot(player.pos.x - cst.reach.x, player.pos.z - cst.reach.z));
            showObj((campaign.stage + 1) + ' / ' + CAMPAIGN_LEVELS.length + ' · ' + cst.name + '——出口已开启 · 目标距离 ' + cd + ' 米');
          }
        } else {
          // 击杀型：剩余 = 目标数 - 已杀
          var remain = Math.max(0, cst.kills - campaign.killed);
          showObj((campaign.stage + 1) + ' / ' + CAMPAIGN_LEVELS.length + ' · ' + cst.name + '——剩余敌军 ' + remain + ' · 击杀 ' + campaign.killed + '/' + cst.kills);
        }
      }
    }
    ammoMain.innerHTML = '∞';
    // 开镜中央装填环（狙击镜内显示装弹进度）
    var zRing = document.getElementById('zoom-reload-ring');
    if (zRing) {
      if (zoomed && WEAPONS[weaponIdx].zoom && reloading) {
        zRing.style.display = 'block';
        var zpct = Math.max(3, (1 - reloadT / RELOAD_TIME[weaponIdx]) * 100);
        document.getElementById('zoom-reload-fill').style.background =
          'conic-gradient(#ffd75e ' + zpct + '%, rgba(255,215,94,0.12) ' + zpct + '%)';
      } else {
        zRing.style.display = 'none';
      }
    }
    var ringEl = document.getElementById('reload-ring');
    var ringFill = document.getElementById('reload-ring-fill');
    if (ringEl) {
      if (reloading) {
        ammoMain.innerHTML = mag;
        ammoMain.className = 'reloading';
        document.getElementById('ammo-sub').textContent = '装填中…';
        ringEl.style.display = 'block';
        var pct = Math.max(3, (1 - reloadT / RELOAD_TIME[weaponIdx]) * 100);
        ringFill.style.background = 'conic-gradient(#ffd75e ' + pct + '%, rgba(255,215,94,0.15) ' + pct + '%)';
      } else {
        ammoMain.innerHTML = mag === Infinity ? '∞' : mag;
        ammoMain.className = '';
        document.getElementById('ammo-sub').textContent = '∞';
        ringEl.style.display = 'none';
      }
    }
    weaponNameEl.textContent = WEAPONS[weaponIdx].name;
    hpFill.style.width = clamp(player.hp, 0, 100) + '%';
    hpFill.classList.toggle('low', player.hp <= 35);
    hpNum.textContent = Math.ceil(player.hp);
    updateAimArrow();
  }

  /* ================= 状态 / 设置 ================= */
  var state = 'menu';   // menu | play | paused | result
  var settings = { sens: 1.2, bots: 2, mode: 'free', train: 'move', map: 'dust' };
  var challenge = { score: 0, time: 60, active: false };
  var best = null;
  try { best = JSON.parse(localStorage.getItem('ww2_best') || 'null'); } catch (e) { best = null; }
  var stats = {
    kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0,
    streak: 0, bestStreak: 0, lastKill: -99, hpLost: 0, enemyShots: 0
  };
  var clock = new THREE.Clock();
  var sessionStart = 0;

  function resetStats() {
    stats.kills = 0; stats.deaths = 0; stats.headshots = 0;
    stats.shots = 0; stats.hits = 0; stats.streak = 0;
    stats.bestStreak = 0; stats.lastKill = -99; stats.hpLost = 0;
    weaponIdx = 0;
    WEAPONS.forEach(function (w, i) { w.model.visible = (i === 0); });
    gun = WEAPONS[0].model;
    cooldown = 0;
    zoomed = false;
    zoomOverlay.style.display = 'none';
    crosshairEl.style.opacity = 1;
    updateWeaponSlot();
    player.hp = 100; player.spread = 0.0015;
    player.recoilPitch = 0; player.recoilYaw = 0;
    player.respawnT = 0; player.killShake = 0;
    mag = 30; reloading = false; reloadT = 0;
    player.pos.set(MAP_SPAWN.x, 1.7, MAP_SPAWN.z);
    player.yaw = MAP_SPAWN.yaw; player.pitch = 0; player.vy = 0;
    feed.innerHTML = '';
    // 清敌人
    enemies.slice().forEach(enemyDeadRemove);
    spawnTimer = 2.0;
    // 坚守阵地重置
    hold.wave = 0; hold.phase = 'intermission'; hold.timer = 2.0; hold.pending = 0;
  }

  function refreshMenuStats() {
    var acc = stats.shots ? (stats.hits / stats.shots * 100) : 0;
    var hsp = stats.kills ? (stats.headshots / stats.kills * 100) : 0;
    var mins = (clock.getElapsedTime() - sessionStart) / 60;
    document.getElementById('ms-kills').textContent = stats.kills;
    document.getElementById('ms-deaths').textContent = stats.deaths;
    document.getElementById('ms-hs').textContent = stats.headshots;
    document.getElementById('ms-hsp').textContent = Math.round(hsp) + '%';
    document.getElementById('ms-acc').textContent = Math.round(acc) + '%';
    document.getElementById('ms-streak').textContent = stats.bestStreak;
    document.getElementById('ms-time').textContent = mins < 1 ? Math.round(mins * 60) + 's' : mins.toFixed(1) + 'm';
    document.getElementById('ms-shots').textContent = stats.shots;
  }

  // 挑战模式评级
  function modeRating(score) {
    return score >= 90 ? 'S' : score >= 60 ? 'A' : score >= 35 ? 'B' : score >= 15 ? 'C' : 'D';
  }

  function endChallenge() {
    state = 'result';
    challenge.active = false;
    var rating = modeRating(challenge.score);
    var isNew = false;
    if (!best || challenge.score > best.score) {
      best = { score: challenge.score, rating: rating, kills: stats.kills, hs: stats.headshots, streak: stats.bestStreak };
      isNew = true;
      try { localStorage.setItem('ww2_best', JSON.stringify(best)); } catch (e) {}
    }
    var acc = stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0;
    document.getElementById('r-rating').textContent = rating;
    document.getElementById('r-rating').className = 'r-rating rating-' + rating;
    document.getElementById('r-title').textContent = '挑战结束';
    document.getElementById('r-score').textContent = challenge.score + ' 分';
    document.getElementById('r-stats').innerHTML =
      '击杀 ' + stats.kills + ' · 爆头 ' + stats.headshots + ' · 爆头率 ' + (stats.kills ? Math.round(stats.headshots / stats.kills * 100) : 0) + '% · 命中率 ' + acc + '% · 最高连杀 ' + stats.bestStreak;
    document.getElementById('r-new').style.display = (isNew && challenge.score > 0) ? 'block' : 'none';
    resultEl.style.display = 'flex';
    hud.style.display = 'none';
    sndChallengeEnd();
    document.exitPointerLock && document.exitPointerLock();
  }

  function refreshBest() {
    var el = document.getElementById('m-best');
    if (settings.mode === 'campaign') {
      if (campaignBest && campaignBest.secs > 0) {
        el.textContent = '战役纪录：' + campaignBest.rating + ' 级 · ' + campaignBest.secs + 's · 阵亡 ' + campaignBest.die + ' 次 · ' + campaignBest.kills + ' 击杀';
        el.classList.remove('best-none');
      } else {
        el.textContent = '暂无战役纪录，从奥马哈海滩出发';
        el.classList.add('best-none');
      }
      return;
    }
    if (settings.mode === 'hold') {
      if (holdBest && holdBest.wave > 0) {
        el.textContent = '坚守纪录：第 ' + holdBest.wave + ' 波 · ' + holdBest.rating + ' 级 · ' + holdBest.kills + ' 击杀 · 连杀 ' + holdBest.streak;
        el.classList.remove('best-none');
      } else {
        el.textContent = '暂无坚守纪录，守住阵地到最后一刻';
        el.classList.add('best-none');
      }
      return;
    }
    if (best && best.score > 0) {
      el.textContent = '最佳成绩：' + best.rating + ' 级 · ' + best.score + ' 分 · ' + best.kills + ' 击杀 · 连杀 ' + best.streak;
      el.classList.remove('best-none');
    } else {
      el.textContent = '暂无最佳成绩，来一场 60 秒突击吧';
      el.classList.add('best-none');
    }
  }

  function sndChallengeEnd() {
    if (!ac) return;
    var t = ac.currentTime;
    tone(t, 'sine', 520, 900, 0.18, 0.3);
    tone(t, 'sine', 700, 1250, 0.2, 0.25, 0, 0.17);
    tone(t, 'sine', 950, 1550, 0.28, 0.22, 0, 0.34);
  }

  var pausedFromPlay = false;
  // 战役剧情过场元素
  var storyEl = document.getElementById('story');

  function showMenu(paused) {
    // 关掉剧情过场，避免遮住暂停菜单（触发确认，防止卡在 intro）
    if (storyEl.style.display === 'flex' && storyEl._finish) storyEl._finish();
    storyEl.style.display = 'none';
    storyEl.style.pointerEvents = 'none';
    state = 'paused';
    pausedFromPlay = !!paused;
    startBtn.textContent = paused ? '继续作战' : (settings.mode === 'hold' ? '开始坚守' : settings.mode === 'campaign' ? '开始战役' : '开始作战');
    menuStats.style.display = paused ? 'grid' : 'none';
    mFoot.style.display = paused ? 'none' : '';
    var trainDesc = settings.train === 'static' ? '德军站桩不动、不开火 · 纯粹练准度与拉枪' :
      settings.train === 'head' ? '德军会移动、反击 · 只有爆头能击杀' :
      '德军会移动、跳跃、反击 · 伤害极低，放心作战';
    var modeDesc = settings.mode === 'hold' ? '德军一波波进攻 · 坚守阵地，击退波次越多越好' :
      settings.mode === 'campaign' ? '四阶段战役 · 从滩头打到教堂，剧情推进，死亡从本关重来' :
      '弹匣有限 · 备弹无限，专注压枪与爆头节奏';
    document.getElementById('m-foot').textContent = trainDesc + '\n' + modeDesc;
    if (paused) refreshMenuStats();
    refreshBest();
    menu.classList.remove('hidden');
    hud.style.display = 'none';
    document.exitPointerLock && document.exitPointerLock();
  }

  function startGame() {
    initAudio();
    loadVoices();
    bgmStart();
    sessionStart = clock.getElapsedTime();
    resetStats();
    challenge.score = 0;
    challenge.time = 60;
    challenge.active = (settings.mode === 'challenge');
    campaign.active = (settings.mode === 'campaign');
    if (campaign.active) {
      // 战役模式：从第 1 关开始，每关独立地图
      buildMap(CAMPAIGN_LEVELS[0].map);
      resetStats();
      campaign.stage = 0;
      campaign.dieCount = 0;
      campaign.done = false;
      campaign.startT = clock.getElapsedTime();
      campaignStageStart(0);
    } else {
      // 非战役：确保场景是当前选中的训练图（战役结束后场景可能停在关卡图）
      if (currentMap !== settings.map) {
        buildMap(settings.map);
        resetStats();
      }
    }
    timerEl.style.display = (challenge.active || settings.mode === 'hold') ? 'block' : 'none';
    timerEl.classList.remove('low');
    resultEl.style.display = 'none';
    menu.classList.add('hidden');
    hud.style.display = 'block';
    hint.style.opacity = 1;
    setTimeout(function () { hint.style.transition = 'opacity 1.2s'; hint.style.opacity = 0; }, 4000);
    state = 'play';
    canvas.requestPointerLock();
  }

  // 暂停中改配置 → 点开始变为开新局
  function syncStartBtn() {
    startBtn.textContent = pausedFromPlay ? '继续作战' : (settings.mode === 'hold' ? '开始坚守' : settings.mode === 'campaign' ? '开始战役' : '开始作战');
  }

  // 灵敏度
  sensInput.addEventListener('input', function () {
    settings.sens = parseFloat(sensInput.value);
    sensVal.textContent = settings.sens.toFixed(1);
    try { localStorage.setItem('ww2_sens', String(settings.sens)); } catch (e) {}
  });
  document.querySelectorAll('#menu .m-btn[data-bots]').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.bots = parseInt(b.dataset.bots, 10);
      document.querySelectorAll('#menu .m-btn[data-bots]').forEach(function (x) {
        x.style.borderColor = x === b ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = x === b ? '#ffd75e' : '#ddd';
      });
      try { localStorage.setItem('ww2_bots', String(settings.bots)); } catch (e) {}
      pausedFromPlay = false; syncStartBtn();
    });
  });
  document.querySelectorAll('#menu .m-btn[data-train]').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.train = b.dataset.train;
      document.querySelectorAll('#menu .m-btn[data-train]').forEach(function (x) {
        x.style.borderColor = x === b ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = x === b ? '#ffd75e' : '#ddd';
      });
      try { localStorage.setItem('ww2_train', settings.train); } catch (e) {}
      pausedFromPlay = false; syncStartBtn();
    });
  });
  // 地图切换（立即重建 + 重置本局）
  function switchMap(id) {
    if (campaign.active) return;   // 战役进行中禁止切图
    if (id === settings.map) return;
    settings.map = id;
    buildMap(id);
    resetStats();
    document.querySelectorAll('#menu .m-btn[data-map]').forEach(function (x) {
      var on = x.dataset.map === id;
      x.style.borderColor = on ? '#ffd75e' : 'rgba(255,255,255,0.25)';
      x.style.color = on ? '#ffd75e' : '#ddd';
    });
    try { localStorage.setItem('ww2_map', id); } catch (e) {}
  }
  document.querySelectorAll('#menu .m-btn[data-map]').forEach(function (b) {
    b.addEventListener('click', function () { switchMap(b.dataset.map); pausedFromPlay = false; syncStartBtn(); });
  });
  document.querySelectorAll('#menu .m-btn[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.mode = b.dataset.mode;
      document.querySelectorAll('#menu .m-btn[data-mode]').forEach(function (x) {
        x.style.borderColor = x === b ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = x === b ? '#ffd75e' : '#ddd';
      });
      try { localStorage.setItem('ww2_mode', settings.mode); } catch (e) {}
      pausedFromPlay = false; syncStartBtn(); refreshBest();
    });
  });
  // 结算按钮
  document.getElementById('r-again').addEventListener('click', startGame);
  document.getElementById('r-menu').addEventListener('click', function () {
    resultEl.style.display = 'none';
    showMenu(false);
  });
  // 恢复设置
  try {
    var s = localStorage.getItem('ww2_sens');
    if (s) { settings.sens = parseFloat(s); sensInput.value = s; sensVal.textContent = settings.sens.toFixed(1); }
    var b = localStorage.getItem('ww2_bots');
    if (b) {
      settings.bots = clamp(parseInt(b, 10), 1, 5);
      document.querySelectorAll('#menu .m-btn[data-bots]').forEach(function (x) {
        var on = parseInt(x.dataset.bots, 10) === settings.bots;
        x.style.borderColor = on ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = on ? '#ffd75e' : '#ddd';
      });
    }
    var m = localStorage.getItem('ww2_mode');
    if (m && (m === 'free' || m === 'challenge' || m === 'hold' || m === 'campaign')) {
      settings.mode = m;
      document.querySelectorAll('#menu .m-btn[data-mode]').forEach(function (x) {
        var on = x.dataset.mode === settings.mode;
        x.style.borderColor = on ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = on ? '#ffd75e' : '#ddd';
      });
    }
    var tr = localStorage.getItem('ww2_train');
    if (tr && (tr === 'move' || tr === 'static' || tr === 'head')) {
      settings.train = tr;
      document.querySelectorAll('#menu .m-btn[data-train]').forEach(function (x) {
        var on = x.dataset.train === settings.train;
        x.style.borderColor = on ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = on ? '#ffd75e' : '#ddd';
      });
    }
    var mp = localStorage.getItem('ww2_map');
    if (mp && (mp === 'dust' || mp === 'snow' || mp === 'inferno')) settings.map = mp;
  } catch (e) {}
  // 兜底高亮：确保当前设置对应的按钮有金色边框
  document.querySelectorAll('#menu .m-btn').forEach(function (x) {
    var is = (x.hasAttribute('data-mode') && x.dataset.mode === settings.mode) ||
             (x.hasAttribute('data-bots') && parseInt(x.dataset.bots, 10) === settings.bots) ||
             (x.hasAttribute('data-train') && x.dataset.train === settings.train) ||
             (x.hasAttribute('data-map') && x.dataset.map === settings.map);
    x.style.borderColor = is ? '#ffd75e' : 'rgba(255,255,255,0.25)';
    x.style.color = is ? '#ffd75e' : '#ddd';
  });
  refreshBest();
  function startBtnClick() {
    if (pausedFromPlay) {
      // 暂停后继续：不重置本局
      pausedFromPlay = false;
      menu.classList.add('hidden');
      hud.style.display = 'block';
      state = 'play';
      canvas.requestPointerLock();
    } else {
      startGame();
    }
  }
  startBtn.addEventListener('click', startBtnClick);

  /* ================= 输入 ================= */
  document.addEventListener('keydown', function (ev) {
    keys[ev.code] = true;
    // 剧情过场：空格 / Enter 确认继续
    if (storyEl.style.display === 'flex' && storyEl._finish && (ev.code === 'Space' || ev.code === 'Enter')) {
      storyEl._finish();
      return;
    }
    if (state !== 'play') return;
    if (ev.code === 'Digit1') switchWeapon(0);
    if (ev.code === 'Digit2') switchWeapon(1);
    if (ev.code === 'Digit3') switchWeapon(2);
    if (ev.code === 'Digit4') switchWeapon(3);
    if (ev.code === 'Digit5') switchWeapon(4);
    if (ev.code === 'KeyQ') switchWeapon((weaponIdx + 1) % WEAPONS.length);
  });
  document.addEventListener('keyup', function (ev) { keys[ev.code] = false; });

  // 鼠标输入用 pointer events（比 mouse events 更底层，preventDefault 更早生效，
  // 减少浏览器右键手势/菜单对操作的干扰）
  canvas.addEventListener('pointerdown', function (ev) {
    if (state !== 'play') return;
    if (ev.button === 2) {
      ev.preventDefault();
      ev.stopPropagation();
      lastRmb = Date.now();
      // 点击切换开镜（右键松开不关镜；浏览器手势已在捕获层拦截）
      if (WEAPONS[weaponIdx].zoom) {
        zoomed = !zoomed;
        if (zoomed) sndScope();
      }
    } else if (ev.button === 0) {
      ev.preventDefault();
      firing = true;
      shoot();
    }
  });
  window.addEventListener('pointerup', function (ev) {
    if (ev.button === 0) firing = false;
  });
  // 右键/中键的 click 类事件也拦掉
  document.addEventListener('auxclick', function (ev) {
    if (ev.button === 2) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);
  // 捕获阶段拦截所有右键 mousedown：防止浏览器鼠标手势（前进/后退/菜单）
  window.addEventListener('mousedown', function (ev) {
    if (ev.button === 2) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);
  window.addEventListener('mouseup', function (ev) {
    if (ev.button === 2) { ev.preventDefault(); }
  }, true);
  // 窗口失焦：自动关镜、停火，防止状态卡住
  window.addEventListener('blur', function () {
    zoomed = false;
    firing = false;
    keys = {};
  });
  canvas.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    if (state !== 'play') return;
    // 滚轮向前（上滚）→ 武器向右切换；向后（下滚）→ 向左切换
    var dir = ev.deltaY < 0 ? 1 : -1;
    switchWeapon((weaponIdx + dir + WEAPONS.length) % WEAPONS.length);
  }, { passive: false });
  document.addEventListener('mousemove', function (ev) {
    if (state !== 'play') return;
    if (document.pointerLockElement !== canvas) return;
    var s = settings.sens * 0.0022;
    player.yaw -= ev.movementX * s;
    player.pitch -= ev.movementY * s;
    player.pitch = clamp(player.pitch, -1.5, 1.5);
  });

  document.addEventListener('pointerlockchange', function () {
    if (document.pointerLockElement === canvas) { escPressed = false; return; }
    if (state !== 'play') return;
    // Esc 或非右键原因丢锁才暂停；右键菜单导致的丢锁自动重锁，不打断游戏
    if (escPressed || Date.now() - lastRmb > 500) {
      showMenu(true);
    } else {
      try { canvas.requestPointerLock(); } catch (e) {}
    }
    escPressed = false;
  });

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 阻止右键菜单：document 捕获阶段拦截（pointer lock 下事件可能绕过 canvas 层）
  document.addEventListener('contextmenu', function (ev) { ev.preventDefault(); }, true);
  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  var lastRmb = -9999;
  var escPressed = false;
  document.addEventListener('keydown', function (ev) {
    if (ev.code === 'Escape') escPressed = true;
  });
  // 兜底：若锁意外丢失（如浏览器拒绝自动重锁），点击画面恢复
  canvas.addEventListener('click', function () {
    if (state === 'play' && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch (e) {}
    }
  });

  /* ================= 主循环 ================= */
  var menuCamT = 0;
  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);

    if (state === 'play') {
      updatePlayer(dt);
      if (firing && WEAPONS[weaponIdx].auto) shoot();
      enemies.forEach(function (e) { updateEnemy(e, dt); });
      // 模式刷怪逻辑
      if (settings.mode === 'campaign') updateCampaign(dt);
      else if (settings.mode === 'hold') updateHold(dt);
      else spawnManager(dt);
      drawRadar();
      updateHUD(dt);
      // 战场氛围：远处炮火
      artilleryT -= dt;
      if (artilleryT <= 0) { artilleryT = rand(2.5, 6.5); sndFarArtillery(); }
      // 挑战倒计时
      if (challenge.active) {
        challenge.time -= dt;
        if (challenge.time <= 0) {
          challenge.time = 0;
          endChallenge();
        }
      }
    } else if (state === 'paused') {
      // 菜单态相机缓缓环绕，展示地图
      menuCamT += dt * 0.1;
      camera.position.set(Math.sin(menuCamT) * 10, 6, Math.cos(menuCamT) * 10 + 6);
      camera.lookAt(0, 1.2, -4);
    } else {
      menuCamT += dt * 0.1;
      camera.position.set(Math.sin(menuCamT) * 10, 6, Math.cos(menuCamT) * 10 + 6);
      camera.lookAt(0, 1.2, -4);
    }
    updateParticles(dt);
    updateProjectiles(dt);
    bgmUpdate(dt);
    updateRadio(dt);

    // 阴影跟随玩家（太阳方向恒定，位置随玩家移动保证阴影清晰）
    sun.position.copy(player.pos).addScaledVector(SUN_DIR, 130);
    sun.target.position.copy(player.pos);

    renderer.render(scene, camera);
  }

  /* ================= 启动 ================= */
  // v2.2 构建当前地图（内含统一阴影设置）
  buildMap(settings.map);
  initTrooperModel();
  clock.start();
  animate();
  window.__ready = true;
  window.__start = startGame;

  /* ================= 入口标题画面 ================= */
  var titleScreen = document.getElementById('title-screen');
  var tsEnter = document.getElementById('ts-enter');
  // 燃烧余烬粒子
  for (var te = 0; te < 18; te++) {
    var em = document.createElement('div');
    em.className = 'ts-ember';
    em.style.left = (Math.random() * 100) + '%';
    em.style.setProperty('--dur', (4 + Math.random() * 5) + 's');
    em.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    em.style.animationDelay = (Math.random() * 8) + 's';
    titleScreen.appendChild(em);
  }
  tsEnter.addEventListener('click', function () {
    initAudio();
    loadVoices();
    bgmStart();
    if (ac) { tone(ac.currentTime, 'sine', 220, 480, 0.22, 0.18); }
    titleScreen.style.transition = 'opacity 0.8s';
    titleScreen.style.opacity = 0;
    setTimeout(function () {
      titleScreen.style.display = 'none';
      showMenu(false);
    }, 800);
  });
  window.__test = {
    setPlay: function () { state = 'play'; hud.style.display = 'block'; menu.classList.add('hidden'); },
    reset: function () { resetStats(); challenge.score = 0; challenge.time = 60; state = 'play'; hud.style.display = 'block'; menu.classList.add('hidden'); resultEl.style.display = 'none'; },
    spawn: function () { makeEnemy(SPAWNS[Math.floor(Math.random() * SPAWNS.length)]); },
    spawnAt: function (x, z, y) { makeEnemy({ x: x, z: z, y: y || 0 }); },
    shootOnce: function () { shoot(); },
    hurt: function (d) { hurtPlayer(d); },
    reload: function () { /* 无限子弹，无换弹 */ },
    setMode: function (m) { settings.mode = m; challenge.active = (m === 'challenge'); campaign.active = (m === 'campaign'); },
    campaignStart: function () {
      campaign.active = true;
      campaign.stage = 0;
      campaign.dieCount = 0;
      campaign.done = false;
      campaign.startT = clock.getElapsedTime();
      campaignStageStart(0);
    },
    campaignKill: function (n) { campaign.killed += (n || 1); },
    campaignReach: function () { campaignStageDone(); },
    killAllEnemies: function () {
      enemies.slice().forEach(function (e) { if (e.alive) killEnemy(e, false); });
    },
    getStage: function () { return campaign.stage; },
    getPhase: function () { return campaign.phase; },
    holdLeft: function () { return campaign.holdT; },
    campaignDie: function () { campaignDeath(); },
    campaignObj: function () { return document.getElementById('obj-bar').textContent; },
    setYaw: function (y) { player.yaw = y; },
    storyConfirm: function () {
      var sel = document.getElementById('story');
      if (sel._finish) sel._finish();
    },
    radioQueueLen: function () { return radioQueue.length + (radioShown ? 1 : 0); },
    radioText: function () { return radioEl.textContent; },
    challengeTime: function () { return challenge.time; },
    getScore: function () { return challenge.score; },
    forceEnd: function () { endChallenge(); },
    getEnemies: function () { return enemies.filter(function (e) { return e.alive; }).length; },
    getHp: function () { return player.hp; },
    getMag: function () { return Infinity; },
    getKills: function () { return stats.kills; },
    getDeaths: function () { return stats.deaths; },
    getHs: function () { return stats.headshots; },
    getEnemyShots: function () { return stats.enemyShots; },
    getRespawn: function () { return player.respawnT; },
    getFov: function () { return camera.fov; },
    zoomShown: function () { return zoomOverlay.style.display; },
    sw: function (i) { switchWeapon(i); },
    getWeapon: function () { return weaponIdx; },
    zoom: function (on) { zoomed = !!on; },
    getPos: function () { return player.pos.toArray(); },
    getCam: function () { return camera.position.toArray(); },
    diagEnemy: function () {
      return enemies.map(function (e) {
        return { s: e.state, st: e.stateT.toFixed(1), fc: e.fireCd.toFixed(2), x: e.pos.x.toFixed(1), z: e.pos.z.toFixed(1), y: e.pos.y.toFixed(2), hp: e.hp, alive: e.alive };
      });
    },
    step: function (n) {
      for (var i = 0; i < (n || 1); i++) {
        var dt = 1 / 60;
        if (state === 'play') {
          updatePlayer(dt);
          enemies.forEach(function (e) { updateEnemy(e, dt); });
          if (settings.mode === 'campaign') updateCampaign(dt);
          else if (settings.mode === 'hold') updateHold(dt);
          else spawnManager(dt);
          drawRadar();
          updateHUD(dt);
        }
        updateParticles(dt);
        updateProjectiles(dt);
      }
      return true;
    },
    getFeed: function () { return feed.children.length; },
    diagParts: function () {
      return enemies.map(function (e) { return e.parts.map(function (p) { return p.name + ':' + p.sphere.center.x.toFixed(1) + ',' + p.sphere.center.y.toFixed(1) + ',' + p.sphere.center.z.toFixed(1); }).join(' '); });
    },
    diagRay: function () {
      var yaw = player.yaw + player.recoilYaw;
      var pitch = player.pitch + player.recoilPitch;
      var dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      var r = new THREE.Ray(camera.position.clone(), dir);
      var res = [];
      enemies.forEach(function (e) {
        if (!e.alive) return;
        e.parts.forEach(function (p) {
          var v = new THREE.Vector3();
          if (r.intersectSphere(p.sphere, v)) res.push(p.name + '@' + v.distanceTo(r.origin).toFixed(2));
        });
      });
      return { cam: camera.position.toArray(), dir: dir.toArray().map(function (n) { return n.toFixed(2); }), hits: res.length ? res : ['none'] };
    },
    state: function () { return state; },
    decalCount: function () { return DECALS.length; },
    wallCount: function () { return WALLS.length; },
    countMat: function (hex) {
      var n = 0;
      scene.traverse(function (o) {
        var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        ms.forEach(function (m) {
          if (m.color && m.color.getHex) { try { if (m.color.getHex() === hex) n++; } catch (e) {} }
        });
      });
      return n;
    },
    setTrain: function (t) { settings.train = t; },
    setMap: function (id) { switchMap(id); },
    getMap: function () { return settings.map; },
    spawnCount: function () { return SPAWNS.length; },
    walkTo: function (tx, tz, steps) {
      var n = steps || 600;
      for (var i = 0; i < n; i++) {
        var dx = tx - player.pos.x, dz = tz - player.pos.z;
        var d = Math.hypot(dx, dz) || 1;
        if (d < 0.25) break;
        var mv = Math.min(d, 5.2 / 60);
        movePlayerAxis('x', dx / d * mv);
        movePlayerAxis('z', dz / d * mv);
      }
      return player.pos.x.toFixed(1) + ',' + player.pos.z.toFixed(1);
    },
    setPos: function (x, z) { player.pos.x = x; player.pos.z = z; },
    modelReady: function () { return enemyModelReady; },
    bgmOn: function () { return bgmOn; }
  };

})();
