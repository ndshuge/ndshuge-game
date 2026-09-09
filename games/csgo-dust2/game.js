/* ============================================================
   CS:GO 沙漠练枪场 · DUST II AIM TRAINER
   纯 Three.js 第一人称射击练习场
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
  scene.fog = new THREE.Fog(0xd9cba4, 55, 170);

  var camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 400);
  camera.rotation.order = 'YXZ';

  var hemi = new THREE.HemisphereLight(0xbfd9f0, 0xc2a064, 0.9);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff0d0, 1.05);
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
  var RADAR_LINES = [];              // 雷达附加墙线（随地图）
  var MAP_OBJECTS = [];              // 当前地图创建的物体（切换时清理）
  var WALLS = [];                    // 碰撞体（随地图重建）
  var SPAWNS = [];                   // 敌人刷点（随地图重建）
  function wallDef(x, z, w, d, h) { return { x: x, z: z, w: w, d: d, h: h }; }
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
    // 快照构建前场景（相机 / 光 / 枪不属于地图）
    var before = {};
    scene.children.forEach(function (c) { before[c.id] = true; });

    if (mapId === 'snow') { buildSnowMap(); }
    else if (mapId === 'inferno') { buildInfernoMap(); }
    else {
      /* ================= 程序纹理 ================= */

  // 沙地
  var groundTex = toSRGB(new THREE.CanvasTexture(makeCanvas(512, 512, function (g, w, h) {
    g.fillStyle = '#cba867'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 2600; i++) {
      var x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.6 + 0.2;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(160,125,70,' + rand(0.05, 0.25) + ')' : 'rgba(220,190,130,' + rand(0.05, 0.2) + ')';
      g.fillRect(x, y, r, r * rand(0.7, 1.6));
    }
    // 细裂纹
    g.strokeStyle = 'rgba(140,105,55,0.25)'; g.lineWidth = 1;
    for (var j = 0; j < 40; j++) {
      g.beginPath(); var x0 = Math.random() * w, y0 = Math.random() * h;
      g.moveTo(x0, y0);
      for (var k = 0; k < 5; k++) g.lineTo(x0 + (Math.random() - 0.5) * 60, y0 + (Math.random() - 0.5) * 60);
      g.stroke();
    }
  })));
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(8, 8);

  // 墙体（米色砖）
  var wallTex = toSRGB(new THREE.CanvasTexture(makeCanvas(256, 256, function (g, w, h) {
    g.fillStyle = '#d9cba4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(150,120,75,0.4)'; g.lineWidth = 2;
    var bs = 64;
    for (var y = 0; y < h; y += bs) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    for (var x = 0; x < w; x += bs) {
      var row = Math.floor(x / bs) % 2;
      g.beginPath(); g.moveTo(x, row ? bs : 0); g.lineTo(x, h); g.stroke();
    }
    // 污渍
    for (var i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(120,95,55,' + rand(0.04, 0.12) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, rand(4, 30), rand(3, 16));
    }
  })));
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(1, 1);

  // 弹药箱木纹
  var boxTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 128, function (g, w, h) {
    g.fillStyle = '#a07c42'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 200; i++) {
      g.fillStyle = 'rgba(120,85,40,' + rand(0.1, 0.35) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, rand(1, 6), rand(1, 10));
    }
    g.strokeStyle = 'rgba(60,40,15,0.8)'; g.lineWidth = 3;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.beginPath(); g.moveTo(w / 2, 3); g.lineTo(w / 2, h - 3); g.stroke();
  })));

  // 沙袋
  var sandTex = toSRGB(new THREE.CanvasTexture(makeCanvas(128, 128, function (g, w, h) {
    g.fillStyle = '#b39552'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 500; i++) {
      g.fillStyle = 'rgba(90,70,30,' + rand(0.1, 0.4) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  })));

  // 天空渐变
  var skyTex = toSRGB(new THREE.CanvasTexture(makeCanvas(16, 512, function (g, w, h) {
    var grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2c5a8e');
    grad.addColorStop(0.42, '#5d9ccb');
    grad.addColorStop(0.68, '#a5c7d8');
    grad.addColorStop(1, '#e6d7a8');
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

  // 远山
  function mountain(x, z, r, h, c) {
    var m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), new THREE.MeshLambertMaterial({ color: c, fog: true }));
    m.position.set(x, h / 2 - 2, z); scene.add(m);
  }
  mountain(-60, -110, 34, 30, 0xa08a62);
  mountain(0, -120, 40, 36, 0x9c8a60);
  mountain(70, -100, 30, 26, 0xa8906a);
  mountain(-110, -70, 26, 20, 0xa68c64);
  mountain(120, -80, 24, 18, 0xa8906a);
  // 远处烟囱（Dust2 元素）
  var chimney = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 16, 8), new THREE.MeshLambertMaterial({ color: 0x8a5a42 }));
  chimney.position.set(52, 8, -95); scene.add(chimney);
  var chimneyTop = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 2, 8), new THREE.MeshLambertMaterial({ color: 0x5a4030 }));
  chimneyTop.position.set(52, 17, -95); scene.add(chimneyTop);

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

  // 中央水泥大道
  var roadMat = new THREE.MeshLambertMaterial({ color: 0xcfc9b4 });
  var road = new THREE.Mesh(new THREE.BoxGeometry(13, 0.06, 22), roadMat);
  road.position.set(0, 0.01, 1);
  scene.add(road);
  // 大道边缘线
  var lineMat = new THREE.MeshBasicMaterial({ color: 0xb9b298 });
  [-6.5, 6.5].forEach(function (lx) {
    var edge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 22), lineMat);
    edge.position.set(lx, 0.01, 1); scene.add(edge);
  });

  /* ---- 墙网格 ---- */
  var wallMeshMat = new THREE.MeshLambertMaterial({ map: wallTex });
  var wallCapMat = new THREE.MeshLambertMaterial({ color: 0xf0e6c8 });
  var darkCapMat = new THREE.MeshLambertMaterial({ color: 0xb9a878 });
  var stoneMat = new THREE.MeshLambertMaterial({ color: 0xd8c9a0 });
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

  // 碎石装饰
  var rockMat = new THREE.MeshLambertMaterial({ color: 0x9c8a68 });
  for (var ri = 0; ri < 16; ri++) {
    var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.1, 0.3), 0), rockMat);
    rock.position.set(rand(-22, 22), 0.08, rand(-22, 22));
    rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    scene.add(rock);
  }

  /* ---- v2 沙漠二元素：中门 / 集装箱 / A 平台箱 / 涂鸦 / 吉普 ---- */

  // 中门双门（深绿铁门，中央大道北端）
  var doorMat = new THREE.MeshLambertMaterial({ color: 0x2e4a32 });
  var doorTrim = new THREE.MeshLambertMaterial({ color: 0x22382a });
  [-2.3, 2.3].forEach(function (dx) {
    var door = addProp({ x: dx, z: -9, w: 2.2, d: 0.3, h: 2.7, y: 0, mat: doorMat });
    var rail1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.34), doorTrim);
    rail1.position.set(dx, 1.5, -9); scene.add(rail1);
    var rail2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.34), doorTrim);
    rail2.position.set(dx, 2.3, -9); scene.add(rail2);
    var jamb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.9, 0.42), doorTrim);
    jamb.position.set(dx + (dx < 0 ? -1.32 : 1.32), 1.45, -9); scene.add(jamb);
  });

  // 集装箱（蓝 / 绿，Dust II 标志）
  function makeContainer(x, z, len, w, h, color, stripe) {
    var mat = new THREE.MeshLambertMaterial({ color: color });
    addProp({ x: x, z: z, w: len, d: w, h: h, y: 0, mat: mat });
    var ribMat = new THREE.MeshLambertMaterial({ color: stripe });
    [-len / 2 + 0.6, len / 2 - 0.6].forEach(function (ox) {
      var rib = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, w + 0.04), ribMat);
      rib.position.set(x + ox, h + 0.06, z); scene.add(rib);
    });
    var line = new THREE.Mesh(new THREE.BoxGeometry(0.06, h + 0.08, 0.06), ribMat);
    line.position.set(x + len / 2 - 0.02, h / 2, z); scene.add(line);
    var band = new THREE.Mesh(new THREE.BoxGeometry(len - 0.2, 0.5, w + 0.02), ribMat);
    band.position.set(x, 0.42, z); scene.add(band);
  }
  makeContainer(-17.5, -8, 6.2, 2.6, 2.6, 0x2f5f92, 0x1c3a5c);
  makeContainer(17.5, -8, 6.2, 2.6, 2.6, 0x4a7a3a, 0x2c4a24);

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

  // A 平台北墙涂鸦（Dust2 风格）
  var grafTex = toSRGB(new THREE.CanvasTexture(makeCanvas(256, 128, function (g, w, h) {
    g.clearRect(0, 0, w, h);
    g.font = '900 64px Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#e8e2d2'; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 8;
    g.strokeText('DUST', w / 2, 50); g.fillText('DUST', w / 2, 50);
    g.fillStyle = '#c24a3a'; g.strokeText('2', w / 2 + 8, 104); g.fillText('2', w / 2 + 8, 104);
    for (var i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(180,160,130,' + rand(0.1, 0.35) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, rand(6, 40), rand(4, 22));
    }
  })));
  var graf = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: grafTex, transparent: true, depthWrite: false }));
  graf.position.set(-8.8, 1.8, -23.02);
  scene.add(graf);

  // 废弃吉普（Dust2 街景）
  var carBodyMat = new THREE.MeshLambertMaterial({ color: 0xa89c86 });
  var carDarkMat = new THREE.MeshLambertMaterial({ color: 0x6e675a });
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

    }  // else：Dust 沙漠二

    // 收集本图新物体（相机 / 光 / 枪不属于地图）
    scene.children.forEach(function (c) {
      if (!before[c.id]) MAP_OBJECTS.push(c);
    });
    // 统一阴影
    scene.traverse(function (o) {
      if (o.isMesh && o !== sky) { o.castShadow = true; o.receiveShadow = true; }
    });
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
      g.fillStyle = '#7a5a3e'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 200; i++) {
        g.fillStyle = 'rgba(95,65,40,' + rand(0.1, 0.35) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, rand(1, 6), rand(1, 10));
      }
      g.strokeStyle = 'rgba(50,32,18,0.7)'; g.lineWidth = 3;
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
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x6e4a30 });
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
    var waterMat = new THREE.MeshLambertMaterial({ color: 0x4a7a9a, transparent: true, opacity: 0.75 });
    var pool = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.35, 12), waterMat);
    pool.position.set(0, 0.98, -11); scene.add(pool);
    var jetTex = toSRGB(new THREE.CanvasTexture(makeCanvas(64, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      var grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, 'rgba(190,225,240,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    })));
    var jet = new THREE.Sprite(new THREE.SpriteMaterial({ map: jetTex, transparent: true, depthWrite: false }));
    jet.position.set(0, 2.4, -11); jet.scale.set(1.1, 2.8, 1); scene.add(jet);
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

  /* ---------- AK-47 ---------- */
  var akGun = new THREE.Group();
  gbox(akGun, 0.085, 0.1, 0.34, gunMatBlack, 0, 0.03, 0.1);          // 机匣
  var barrel = gcyl(akGun, 0.016, 0.34, gunMatBlack, 0, 0.05, 0.44); // 枪管
  gcyl(akGun, 0.024, 0.06, gunMatSteel, 0, 0.05, 0.63);              // 枪口
  gbox(akGun, 0.07, 0.06, 0.18, gunMatWood, 0, 0.0, 0.26);           // 护木
  var magAK = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.17, 0.1), gunMatBlack);
  magAK.position.set(0, -0.09, 0.02); magAK.rotation.x = 0.28; akGun.add(magAK);
  gbox(akGun, 0.05, 0.07, 0.05, gunMatDarkWood, 0, -0.12, 0.09);
  gbox(akGun, 0.045, 0.1, 0.06, gunMatBlack, 0, -0.08, -0.05).rotation.x = 0.35; // 握把
  gbox(akGun, 0.06, 0.1, 0.24, gunMatWood, 0, -0.02, -0.28).rotation.x = 0.06;  // 枪托
  gbox(akGun, 0.07, 0.035, 0.06, gunMatDarkWood, 0, 0.07, -0.33);
  gbox(akGun, 0.02, 0.03, 0.04, gunMatBlack, 0, 0.115, 0.24);       // 准星
  gbox(akGun, 0.025, 0.045, 0.03, gunMatBlack, 0, 0.11, -0.05);     // 照门
  var muzzleFlashAK = makeMuzzle(akGun, 0.75);
  akGun.position.set(0.24, -0.24, -0.42);

  /* ---------- AWP（Asiimov 风：白/黑/橙） ---------- */
  var awpGun = new THREE.Group();
  gcyl(awpGun, 0.016, 0.66, gunMatBlack, 0, 0.03, 0.52);             // 长枪管
  gcyl(awpGun, 0.024, 0.09, gunMatSteel, 0, 0.03, 0.9);              // 枪口制退器
  gbox(awpGun, 0.06, 0.09, 0.3, gunMatBlack, 0, 0.03, -0.02);        // 机匣
  gbox(awpGun, 0.055, 0.06, 0.26, awpMatWhite, 0, 0.0, 0.26);        // 护木
  gbox(awpGun, 0.005, 0.03, 0.26, awpMatOrange, 0, 0.035, 0.26);     // 橙色条纹
  var scope = gcyl(awpGun, 0.03, 0.4, gunMatBlack, 0, 0.13, 0.1);    // 镜筒
  gcyl(awpGun, 0.034, 0.03, awpMatOrange, 0, 0.13, 0.32);            // 镜环
  gcyl(awpGun, 0.022, 0.03, gunMatSteel, 0, 0.13, -0.11);            // 目镜
  gbox(awpGun, 0.05, 0.1, 0.26, gunMatWood, 0, -0.01, -0.28).rotation.x = 0.05;  // 枪托
  gbox(awpGun, 0.055, 0.11, 0.06, gunMatBlack, 0, -0.01, -0.42);     // 托垫
  gbox(awpGun, 0.04, 0.1, 0.05, gunMatBlack, 0, -0.09, -0.09).rotation.x = 0.3;  // 握把
  var magAWP = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.09), gunMatBlack);
  magAWP.position.set(0, -0.11, 0.07); magAWP.rotation.x = 0.2; awpGun.add(magAWP);
  gbox(awpGun, 0.025, 0.1, 0.04, gunMatBlack, 0, -0.12, 0.44);       // 脚架
  var muzzleFlashAWP = makeMuzzle(awpGun, 0.95);
  awpGun.position.set(0.18, -0.26, -0.5);

  /* ---------- 匕首（蝴蝶刀风） ---------- */
  var knifeGun = new THREE.Group();
  gbox(knifeGun, 0.045, 0.05, 0.16, gunMatBlack, 0, 0.01, -0.04).rotation.x = 0.08;  // 刀柄
  gbox(knifeGun, 0.1, 0.018, 0.04, gunMatDarkWood, 0, 0.02, 0.06);                  // 护手
  gcyl(knifeGun, 0.014, 0.1, gunMatSteel, 0, 0.02, 0.16);                           // 刀根
  var bladeKn = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.013, 0.3, 6), gunMatSteel);
  bladeKn.rotation.x = Math.PI / 2; bladeKn.position.set(0, 0.02, 0.33); knifeGun.add(bladeKn);
  var bladeKn2 = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.004, 0.3), gunMatSteel);
  bladeKn2.position.set(0, 0.02, 0.3); knifeGun.add(bladeKn2);
  gbox(knifeGun, 0.004, 0.009, 0.27, gunMatBlack, 0, 0.028, 0.29);                  // 刀背
  knifeGun.position.set(0.22, -0.22, -0.46);

  camera.add(akGun);
  camera.add(awpGun);
  camera.add(knifeGun);
  awpGun.visible = false;
  knifeGun.visible = false;
  scene.add(camera);

  /* ---------- 武器数据 ---------- */
  var WEAPONS = [
    { id: 'ak', name: 'AK-47 | 沙漠风暴', model: akGun, muzzle: muzzleFlashAK,
      rpm: 600, dmgBody: 35, dmgHead: 100,
      spreadPerShot: 0.0105, spreadMax: 0.021, spreadRecover: 5.2,
      kick: 0.0102, kickRecover: 4.2,
      auto: true, moveMul: 1.0, zoom: false, melee: false,
      baseX: 0.24, baseY: -0.24, baseZ: -0.42, shellX: 0.09, shellY: 0.06, shellZ: 0 },
    { id: 'awp', name: 'AWP | 巨龙传说', model: awpGun, muzzle: muzzleFlashAWP,
      rpm: 38, dmgBody: 115, dmgHead: 400,
      spreadPerShot: 0.0045, spreadMax: 0.008, spreadRecover: 2.6,
      kick: 0.028, kickRecover: 2.0,
      auto: false, moveMul: 0.82, zoom: true, melee: false,
      baseX: 0.18, baseY: -0.26, baseZ: -0.5, shellX: 0.1, shellY: 0.08, shellZ: -0.12 },
    { id: 'knife', name: '匕首 | 蝴蝶刀', model: knifeGun, muzzle: null,
      rpm: 140, dmgBody: 65, dmgHead: 150, range: 2.6,
      spreadPerShot: 0, spreadMax: 0, spreadRecover: 0,
      kick: 0, kickRecover: 0,
      auto: true, moveMul: 1.06, zoom: false, melee: true,
      baseX: 0.22, baseY: -0.22, baseZ: -0.46 }
  ];
  var weaponIdx = 0;
  var gun = akGun;         // 当前模型引用
  var gunKick = 0;         // 枪身位移回弹
  var gunRaise = 0;        // 枪口上抬
  var muzzleT = 0;
  var cooldown = 0;        // 攻击间隔
  var zoomed = false;

  var weaponNameEl = document.getElementById('weapon-name');
  var zoomOverlay = document.getElementById('zoom-overlay');

  function switchWeapon(idx) {
    if (idx === weaponIdx || state !== 'play') return;
    weaponIdx = idx;
    cooldown = 0;
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

  /* ================= 敌人 ================= */
  var enemies = [];
  var enemyPartsCache = {};

  function makeEnemyMaterial(color) {
    return new THREE.MeshLambertMaterial({ color: color });
  }

  function makeEnemy(spawn) {
    // 变体：T（米白）/ CT（深蓝）/ 精英（黑红，血厚稍慢）
    var roll = Math.random();
    var variant = roll < 0.28 ? 'elite' : (roll < 0.62 ? 'ct' : 't');
    var pal = variant === 'ct'
      ? { body: 0x3f5278, pants: 0x2c3444, helm: 0x252a38, goggle: 0x0c0c12 }
      : variant === 'elite'
        ? { body: 0x4d4d58, pants: 0x33333a, helm: 0x1e1e26, goggle: 0x7a1414 }
        : { body: 0xd8cba8, pants: 0x6e5f44, helm: 0x4a4a45, goggle: 0x1c1c20 };
    var maxHp = variant === 'elite' ? 180 : 100;
    var e = {
      pos: new THREE.Vector3(spawn.x, spawn.y, spawn.z),
      hp: maxHp, maxHp: maxHp, variant: variant,
      alive: true,
      state: 'spawn', stateT: 0,
      target: new THREE.Vector3(),
      speed: variant === 'elite' ? rand(2.2, 3.4) : rand(2.8, 4.2),
      lastY: spawn.y,
      vy: 0,
      jumpCd: rand(0.5, 2.0),
      fireCd: rand(0.6, 1.2),
      burstLeft: 0, burstCd: 0,
      flashT: 0, flashColor: 0xffffff,
      hurtFlash: 0,
      deathT: 0,
      group: new THREE.Group(),
      inner: new THREE.Group(),
      parts: [],          // [{name, sphere}]
      mats: [],
      walkPhase: rand(0, 6)
    };
    e.group.position.copy(e.pos);
    scene.add(e.group);
    var g = e.group, inner = e.inner;

    // 材质登记：{mat, base} 用于受击闪红恢复
    e.matList = [];
    function reg(m) { e.matList.push({ mat: m.material, base: m.material.color.getHex() }); return m; }
    // 身体
    var body = reg(new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.35, 4, 10), makeEnemyMaterial(pal.body)));
    body.position.y = 0.95; inner.add(body);
    // 裤子
    var pants = reg(new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.3, 4, 8), makeEnemyMaterial(pal.pants)));
    pants.position.y = 0.32; inner.add(pants);
    // 头
    var head = reg(new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), makeEnemyMaterial(0xd8a06b)));
    head.position.y = 1.66; inner.add(head);
    // 头盔（BOT 辨识度）
    var helm = reg(new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 6, 0, 6.3, 0, 1.2), makeEnemyMaterial(pal.helm)));
    helm.position.y = 1.68; inner.add(helm);
    // 护目镜
    var goggle = reg(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1), makeEnemyMaterial(pal.goggle)));
    goggle.position.set(0, 1.7, -0.2); inner.add(goggle);
    // 手臂
    [-1, 1].forEach(function (s) {
      var arm = reg(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.13), makeEnemyMaterial(pal.body)));
      arm.position.set(0.46 * s, 1.05, 0); inner.add(arm);
    });
    // 枪
    var egun = reg(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.55), makeEnemyMaterial(0x222226)));
    egun.position.set(0, 1.06, 0.3); inner.add(egun);
    // 枪口闪光
    var ef = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false }));
    ef.position.set(0, 1.06, 0.62); ef.scale.set(0.4, 0.4, 1);
    inner.add(ef);
    e.eflash = ef;
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
    enemies.push(e);
    sndSpawn();
  }

  function updateEnemyPartPositions(e) {
    e.parts[0].sphere.center.set(e.pos.x, e.pos.y + 1.66, e.pos.z);
    e.parts[1].sphere.center.set(e.pos.x, e.pos.y + 1.1, e.pos.z);
    e.parts[2].sphere.center.set(e.pos.x, e.pos.y + 0.55, e.pos.z);
  }

  function enemyDeadRemove(e) {
    scene.remove(e.group);
    var idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
  }

  function killEnemy(e, headshot) {
    e.alive = false;
    e.state = 'dead';
    e.deathT = 0;
    player.killShake = 1;
    stats.kills++;
    if (headshot) stats.headshots++;
    if (challenge.active) challenge.score += headshot ? 3 : 1;
    var now = clock.getElapsedTime();
    if (now - stats.lastKill < 3.2) { stats.streak++; } else { stats.streak = 1; }
    stats.lastKill = now;
    if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;

    // feed
    var item = document.createElement('div');
    item.className = 'feed-item' + (headshot ? ' hs' : '');
    item.innerHTML = '你 <span class="gun">AK-47</span> → BOT';
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
      if (settings.train === 'static') {
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
        e.holdT = rand(0.8, 2.2);
      } else {
        moveEntity(e, dx / dd * e.speed * dt, dz / dd * e.speed * dt);
        e.walkPhase += dt * 6;
      }
    } else if (e.state === 'hold') {
      if (e.stateT > e.holdT) { e.state = 'move'; e.stateT = 0; pickEnemyTarget(e); }
    } else if (e.state === 'rush') {
      // 中弹后短暂冲向玩家
      var rx = player.pos.x - e.pos.x, rz = player.pos.z - e.pos.z;
      var rd = Math.hypot(rx, rz) || 1;
      moveEntity(e, rx / rd * 5.2 * dt, rz / rd * 5.2 * dt);
      if (e.stateT > 2.0) { e.state = 'move'; e.stateT = 0; pickEnemyTarget(e); }
    }

    // 开火：移动 / 站桩 / 冲脸都会开火，burst 连射 1~3 发（静止靶不开火）
    var canFire = settings.train !== 'static';
    e.fireCd -= dt;
    if (e.burstLeft > 0) {
      e.burstCd -= dt;
      if (e.burstCd <= 0) {
        e.burstLeft--;
        e.burstCd = 0.13;
        var losF = losClear(e.pos.x, e.pos.y + 1.5, e.pos.z, player.pos.x, player.pos.y - 0.4, player.pos.z);
        if (canFire && losF && dist < 55) enemyFire(e, dist);
      }
    } else if (canFire && e.fireCd <= 0 && dist < 55) {
      e.fireCd = rand(0.55, 1.15);
      e.burstLeft = randInt(1, 3);
      e.burstCd = 0;
    }

    // 简单晃动
    e.inner.rotation.z = Math.sin(e.walkPhase) * 0.04 * (e.state === 'move' ? 1 : 0.15);

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
    var a = rand(0, Math.PI * 2), r = rand(4, 16);
    e.target.set(
      clamp(e.pos.x + Math.cos(a) * r, -20, 20),
      0,
      clamp(e.pos.z + Math.sin(a) * r, -20, 20)
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
    if (e.eShot && ac) {
      try { e.eShot.play(); } catch (err) {}
    } else {
      sndEnemyShot();
    }
    // 命中率与伤害都大幅降低：压迫为主，打不死人
    var chance = 0.35 * clamp(1 - dist / 55, 0.12, 1);
    if (Math.random() < chance) {
      var dmg = Math.round(rand(1, 2));
      hurtPlayer(dmg);
    }
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
    player.respawnT = 2.0;
    deathEl.style.opacity = 1;
    document.getElementById('death-info').textContent = '本局击杀 ' + stats.kills + ' 名 BOT，2 秒后重生…';
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
    cooldown = 60 / wp.rpm;

    // 近战：匕首挥砍
    if (wp.melee) {
      meleeAttack(wp);
      return;
    }

    stats.shots++;
    gunKick = 1;
    gunRaise = 1;
    muzzleT = 0.045;
    if (wp.muzzle) wp.muzzle.material.opacity = 1;
    sndShot();
    ejectShell(wp);

    // 弹道：用射击前的视角（本发不含本次后坐，第一发沿准星）
    var yaw = player.yaw + player.recoilYaw;
    var pitch = player.pitch + player.recoilPitch;
    var dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    // 散布圆盘（用射击前的累计散布）
    var a = Math.random() * Math.PI * 2;
    var r2 = player.spread * Math.sqrt(Math.random());
    var right = new THREE.Vector3().crossVectors(dir, _UP).normalize();
    var up2 = new THREE.Vector3().crossVectors(right, dir).normalize();
    dir.addScaledVector(right, Math.cos(a) * r2).addScaledVector(up2, Math.sin(a) * r2).normalize();

    _ray.origin.copy(camera.position);
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

  // 近战攻击：短距离射线判定，砍头一刀死
  function meleeAttack(wp) {
    stats.shots++;
    sndSwing();
    gunKick = 1.3;
    gunRaise = 1.0;
    var yaw = player.yaw + player.recoilYaw;
    var pitch = player.pitch + player.recoilPitch;
    var fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    _ray.origin.copy(camera.position);
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
      // 爆头模式：爆头必杀，身体不致死
      if (settings.train === 'head') {
        if (headshot) dmg = Math.max(dmg, e2.maxHp);
        else dmg = Math.min(dmg, Math.max(e2.hp - 1, 0));
      }
      e2.hp -= dmg;
      e2.hurtFlash = 0.09;
      spawnBlood(best.point, headshot ? 10 : 6);
      spawnDamage(best.point, dmg, headshot);
      if (headshot) sndHeadshot(); else sndHit();
      var kb = fwd.clone().multiplyScalar(0.5);
      e2.pos.x = clamp(e2.pos.x + kb.x, -22, 22);
      e2.pos.z = clamp(e2.pos.z + kb.z, -22, 22);
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
    // 爆头模式：爆头必杀（含精英），身体命中不致死，最多扣到剩 1 血
    if (settings.train === 'head') {
      if (headshot) dmg = Math.max(dmg, e.maxHp);
      else dmg = Math.min(dmg, Math.max(e.hp - 1, 0));
    }
    e.hp -= dmg;
    e.hurtFlash = 0.09;
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
      e.pos.x = clamp(e.pos.x, -22, 22);
      e.pos.z = clamp(e.pos.z, -22, 22);
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

  /* ================= 雷达 ================= */
  function drawRadar() {
    var c = radarCv.width / 2;
    radarCtx.clearRect(0, 0, 150, 150);
    radarCtx.save();
    radarCtx.translate(c, c);
    radarCtx.rotate(player.yaw);
    radarCtx.strokeStyle = 'rgba(180,220,160,0.7)';
    radarCtx.lineWidth = 1.5;
    // 外墙
    radarCtx.strokeRect(-23.5 * 3.6, -23.5 * 3.6, 47 * 3.6, 47 * 3.6);
    radarCtx.strokeStyle = 'rgba(180,220,160,0.35)';
    // 地图附加墙线（随地图切换）
    RADAR_LINES.forEach(function (ln) {
      radarCtx.beginPath();
      radarCtx.moveTo(ln[0] * 3.6, ln[1] * 3.6);
      radarCtx.lineTo(ln[2] * 3.6, ln[3] * 3.6);
      radarCtx.stroke();
    });
    // 敌人
    radarCtx.fillStyle = '#ff5a4a';
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.alive) continue;
      var ex = (e.pos.x - player.pos.x) * 3.6;
      var ez = (e.pos.z - player.pos.z) * 3.6;
      if (ex * ex + ez * ez < 60 * 60) {
        radarCtx.beginPath(); radarCtx.arc(ex, ez, 2.6, 0, 7); radarCtx.fill();
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
    stScore.textContent = challenge.score;
    if (challenge.active) {
      timerEl.textContent = Math.ceil(challenge.time);
      timerEl.classList.toggle('low', challenge.time <= 10);
    }
    ammoMain.innerHTML = '∞';
    weaponNameEl.textContent = WEAPONS[weaponIdx].name;
    hpFill.style.width = clamp(player.hp, 0, 100) + '%';
    hpFill.classList.toggle('low', player.hp <= 35);
    hpNum.textContent = Math.ceil(player.hp);
  }

  /* ================= 状态 / 设置 ================= */
  var state = 'menu';   // menu | play | paused | result
  var settings = { sens: 1.2, bots: 2, mode: 'free', train: 'move', map: 'dust' };
  var challenge = { score: 0, time: 60, active: false };
  var best = null;
  try { best = JSON.parse(localStorage.getItem('d2_best') || 'null'); } catch (e) { best = null; }
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
    player.pos.set(MAP_SPAWN.x, 1.7, MAP_SPAWN.z);
    player.yaw = MAP_SPAWN.yaw; player.pitch = 0; player.vy = 0;
    feed.innerHTML = '';
    // 清敌人
    enemies.slice().forEach(enemyDeadRemove);
    spawnTimer = 2.0;
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
      try { localStorage.setItem('d2_best', JSON.stringify(best)); } catch (e) {}
    }
    var acc = stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0;
    document.getElementById('r-rating').textContent = rating;
    document.getElementById('r-rating').className = 'r-rating rating-' + rating;
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
    if (best && best.score > 0) {
      el.textContent = '最佳成绩：' + best.rating + ' 级 · ' + best.score + ' 分 · ' + best.kills + ' 击杀 · 连杀 ' + best.streak;
      el.classList.remove('best-none');
    } else {
      el.textContent = '暂无最佳成绩，来一场 60 秒挑战吧';
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
  function showMenu(paused) {
    state = 'paused';
    pausedFromPlay = !!paused;
    startBtn.textContent = paused ? '继续训练' : '开始训练';
    menuStats.style.display = paused ? 'grid' : 'none';
    mFoot.style.display = paused ? 'none' : '';
    var trainDesc = settings.train === 'static' ? 'BOT 站桩不动、不开火 · 纯粹练准度与拉枪' :
      settings.train === 'head' ? 'BOT 会移动、反击 · 只有爆头能击杀' :
      'BOT 会移动、跳跃、反击 · 伤害极低，放心练枪';
    document.getElementById('m-foot').textContent = trainDesc + '\n练习模式：无限备弹，专注压枪与爆头';
    if (paused) refreshMenuStats();
    refreshBest();
    menu.classList.remove('hidden');
    hud.style.display = 'none';
    document.exitPointerLock && document.exitPointerLock();
  }

  function startGame() {
    initAudio();
    sessionStart = clock.getElapsedTime();
    resetStats();
    challenge.score = 0;
    challenge.time = 60;
    challenge.active = (settings.mode === 'challenge');
    timerEl.style.display = challenge.active ? 'block' : 'none';
    timerEl.classList.remove('low');
    resultEl.style.display = 'none';
    menu.classList.add('hidden');
    hud.style.display = 'block';
    hint.style.opacity = 1;
    setTimeout(function () { hint.style.transition = 'opacity 1.2s'; hint.style.opacity = 0; }, 4000);
    state = 'play';
    canvas.requestPointerLock();
  }

  // 灵敏度
  sensInput.addEventListener('input', function () {
    settings.sens = parseFloat(sensInput.value);
    sensVal.textContent = settings.sens.toFixed(1);
    try { localStorage.setItem('d2_sens', String(settings.sens)); } catch (e) {}
  });
  document.querySelectorAll('#menu .m-btn[data-bots]').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.bots = parseInt(b.dataset.bots, 10);
      document.querySelectorAll('#menu .m-btn[data-bots]').forEach(function (x) {
        x.style.borderColor = x === b ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = x === b ? '#ffd75e' : '#ddd';
      });
      try { localStorage.setItem('d2_bots', String(settings.bots)); } catch (e) {}
    });
  });
  document.querySelectorAll('#menu .m-btn[data-train]').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.train = b.dataset.train;
      document.querySelectorAll('#menu .m-btn[data-train]').forEach(function (x) {
        x.style.borderColor = x === b ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = x === b ? '#ffd75e' : '#ddd';
      });
      try { localStorage.setItem('d2_train', settings.train); } catch (e) {}
    });
  });
  // 地图切换（立即重建 + 重置本局）
  function switchMap(id) {
    if (id === settings.map) return;
    settings.map = id;
    buildMap(id);
    resetStats();
    document.querySelectorAll('#menu .m-btn[data-map]').forEach(function (x) {
      var on = x.dataset.map === id;
      x.style.borderColor = on ? '#ffd75e' : 'rgba(255,255,255,0.25)';
      x.style.color = on ? '#ffd75e' : '#ddd';
    });
    try { localStorage.setItem('d2_map', id); } catch (e) {}
  }
  document.querySelectorAll('#menu .m-btn[data-map]').forEach(function (b) {
    b.addEventListener('click', function () { switchMap(b.dataset.map); });
  });
  document.querySelectorAll('#menu .m-btn[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.mode = b.dataset.mode;
      document.querySelectorAll('#menu .m-btn[data-mode]').forEach(function (x) {
        x.style.borderColor = x === b ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = x === b ? '#ffd75e' : '#ddd';
      });
      try { localStorage.setItem('d2_mode', settings.mode); } catch (e) {}
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
    var s = localStorage.getItem('d2_sens');
    if (s) { settings.sens = parseFloat(s); sensInput.value = s; sensVal.textContent = settings.sens.toFixed(1); }
    var b = localStorage.getItem('d2_bots');
    if (b) {
      settings.bots = clamp(parseInt(b, 10), 1, 5);
      document.querySelectorAll('#menu .m-btn[data-bots]').forEach(function (x) {
        var on = parseInt(x.dataset.bots, 10) === settings.bots;
        x.style.borderColor = on ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = on ? '#ffd75e' : '#ddd';
      });
    }
    var m = localStorage.getItem('d2_mode');
    if (m && (m === 'free' || m === 'challenge')) {
      settings.mode = m;
      document.querySelectorAll('#menu .m-btn[data-mode]').forEach(function (x) {
        var on = x.dataset.mode === settings.mode;
        x.style.borderColor = on ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = on ? '#ffd75e' : '#ddd';
      });
    }
    var tr = localStorage.getItem('d2_train');
    if (tr && (tr === 'move' || tr === 'static' || tr === 'head')) {
      settings.train = tr;
      document.querySelectorAll('#menu .m-btn[data-train]').forEach(function (x) {
        var on = x.dataset.train === settings.train;
        x.style.borderColor = on ? '#ffd75e' : 'rgba(255,255,255,0.25)';
        x.style.color = on ? '#ffd75e' : '#ddd';
      });
    }
    var mp = localStorage.getItem('d2_map');
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
    if (state !== 'play') return;
    if (ev.code === 'Digit1') switchWeapon(0);
    if (ev.code === 'Digit2') switchWeapon(1);
    if (ev.code === 'Digit3') switchWeapon(2);
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
      // 点按切换开镜（不再长按，彻底避开浏览器右键行为）
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
  // 窗口失焦：自动关镜、停火，防止状态卡住
  window.addEventListener('blur', function () {
    zoomed = false;
    firing = false;
    keys = {};
  });
  canvas.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    if (state === 'play') switchWeapon((weaponIdx + 1) % WEAPONS.length);
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
      spawnManager(dt);
      drawRadar();
      updateHUD(dt);
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

    // 阴影跟随玩家（太阳方向恒定，位置随玩家移动保证阴影清晰）
    sun.position.copy(player.pos).addScaledVector(SUN_DIR, 130);
    sun.target.position.copy(player.pos);

    renderer.render(scene, camera);
  }

  /* ================= 启动 ================= */
  // v2.2 构建当前地图（内含统一阴影设置）
  buildMap(settings.map);
  clock.start();
  animate();
  window.__ready = true;
  window.__start = startGame;
  window.__test = {
    setPlay: function () { state = 'play'; hud.style.display = 'block'; menu.classList.add('hidden'); },
    reset: function () { resetStats(); challenge.score = 0; challenge.time = 60; state = 'play'; hud.style.display = 'block'; menu.classList.add('hidden'); resultEl.style.display = 'none'; },
    spawn: function () { makeEnemy(SPAWNS[Math.floor(Math.random() * SPAWNS.length)]); },
    spawnAt: function (x, z, y) { makeEnemy({ x: x, z: z, y: y || 0 }); },
    shootOnce: function () { shoot(); },
    hurt: function (d) { hurtPlayer(d); },
    reload: function () { /* 无限子弹，无换弹 */ },
    setMode: function (m) { settings.mode = m; challenge.active = (m === 'challenge'); },
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
          spawnManager(dt);
          drawRadar();
          updateHUD(dt);
        }
        updateParticles(dt);
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
    spawnCount: function () { return SPAWNS.length; }
  };

})();
