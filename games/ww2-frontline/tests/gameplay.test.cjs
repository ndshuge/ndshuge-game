'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {sweepAxis,renderPixelRatio,weaponKey}=require('../gameplay-utils.js');
const wall={minX:0,maxX:.1,minZ:-1,maxZ:1,h:3,step:false};
function approx(actual,expected,message){
 assert.ok(Math.abs(actual-expected)<1e-8,message+': '+actual+' !== '+expected);
}
function test(name,fn){
 try{fn();console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}
}
test('swept rightward collision blocks thin walls even with huge frame delta',()=>{
 approx(sweepAxis(-2,0,5,'x',.45,0,[wall]),-.45,'from left');
});
test('swept leftward collision blocks both directions',()=>{
 approx(sweepAxis(2,0,-5,'x',.45,0,[wall]),.55,'from right');
});
test('no false wall collision when walking parallel/outside wall',()=>{
 approx(sweepAxis(-2,1.5,5,'x',.45,0,[wall]),3,'outside lateral span');
 approx(sweepAxis(-2,0,-2,'x',.45,0,[wall]),-4,'moving away');
});
test('touching the expanded wall bounds cannot enter it',()=>{
 approx(sweepAxis(-.45,0,.1,'x',.45,0,[wall]),-.45,'left edge');
 approx(sweepAxis(.55,0,-.1,'x',.45,0,[wall]),.55,'right edge');
});
test('walking beside a wall slides on the unblocked axis',()=>{
 const x=sweepAxis(-2,0,5,'x',.45,0,[wall]);
 const z=sweepAxis(-3,x,2,'z',.45,0,[wall]);
 approx(x,-.45,'blocked horizontal');
 approx(z,-1,'tangential movement allowed alongside wall');
});
test('nearest wall blocks independently of walls array order',()=>{
 const further={minX:2,maxX:2.1,minZ:-2,maxZ:2,step:false,h:5};
 approx(sweepAxis(-2,0,10,'x',.45,0,[further,wall]),-.45,'first far');
 approx(sweepAxis(-2,0,10,'x',.45,0,[wall,further]),-.45,'first near');
});
test('elevated platform respects existing step height threshold',()=>{
 const platform={...wall,step:true,h:1.1};
 approx(sweepAxis(-2,0,4,'x',.45,0,[platform]),-.45,'below step');
 approx(sweepAxis(-2,0,4,'x',.45,1.06,[platform]),2,'above step');
});
test('invalid delta ignored for safe movement',()=>{
 approx(sweepAxis(1,2,NaN,'x',.45,0,[wall]),1,'NaN ignored');
 approx(sweepAxis(1,2,Infinity,'x',.45,0,[wall]),1,'Infinity ignored');
});
test('renderer pixel budget respected for laptop/4K screens',()=>{
 approx(renderPixelRatio(1920,1080,1),1,'1080p 1x unchanged');
 approx(renderPixelRatio(390,844,3),2,'mobile DPR 2 cap');
 const dpr=renderPixelRatio(3840,2160,2);
 assert.ok(3840*2160*dpr*dpr<=2600000.01,'4K pixel budget');
 assert.ok(dpr<1,'4K needs downscale');
 assert.ok(renderPixelRatio(1440,900,2)<2,'HiDPI laptop capped');
});
test('Q and direct-select weapons ignore auto-repeat',()=>{
 assert.equal(weaponKey('KeyQ',false),5);
 assert.equal(weaponKey('Digit1',false),0);
 assert.equal(weaponKey('Digit5',false),4);
 assert.equal(weaponKey('KeyQ',true),-1);
 assert.equal(weaponKey('Digit3',true),-1);
 assert.equal(weaponKey('KeyW',false),-1);
});
const dir=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const js=fs.readFileSync(path.join(dir,'game.js'),'utf8');
test('HTML dependency order and gameplay script syntax',()=>{
 assert.ok(html.indexOf('src="gameplay-utils.js"')<html.indexOf('src="game.js"'));
 new vm.Script(js,{filename:'game.js'});
 assert.match(js,/rules\.sweepAxis\(/);
 assert.match(js,/rules\.renderPixelRatio\(/);
 assert.match(js,/rules\.weaponKey\(ev\.code,\s*ev\.repeat\)/);
 assert.match(js,/getRenderInfo:\s*function/);
 assert.match(js,/updatePerfHud\(performance\.now\(\)\)/);
 assert.match(js,/if \(now - radarLastPaint < 1000 \/ 15\) return;/,'Radar limits redraw frequency');
 assert.equal((js.match(/drawRadarWhenDue\(\);/g)||[]).length,2,'Both animation and test-step loops use radar throttle');
 assert.match(js,/getRadarPaints: function/);
});
console.log('ALL GAMEPLAY REGRESSIONS PASS');