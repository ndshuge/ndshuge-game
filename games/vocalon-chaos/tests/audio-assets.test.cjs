'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const dir=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const expected=[
  ['track-0.m4a',1868588,'ba2f7c361f93a480fb0905da769490b2aa9341205ad2fa25c85d385a3a6195d4'],
  ['track-1.m4a',3657080,'7b5b7e8fcae551b8f53442ff7f12eb06b02d53e865c4d5ce0b44f05b49a60318'],
  ['track-2.m4a',3807408,'d460733aaa7458ef3f60dfc6fd281e6add082f7b215c78d6d50aa1549f9962e6']
];
assert.ok(Buffer.byteLength(html)<110000,'Opening HTML should not carry embedded audio');
assert.ok(!html.includes('TRACK_B64'),'No old inline audio references remain');
assert.ok(!html.includes('AAAAHGZ0eXBNNEEg'),'No M4A payload in HTML');
assert.match(html,/const TRACK_URLS=Object\.freeze\(\[/,'Song URL manifest exists');
assert.match(html,/await fetch\(TRACK_URLS\[idx\]\)/,'Audio loads on demand');
assert.match(html,/decodeAudioData\(await audioResponse\.arrayBuffer\(\)\)/,'Same WebAudio decoding path');
assert.match(html,/if\(!TRACK_URLS\[idx\]\)\{startSong\(idx,diff\);return;\}/,'Synthesizer fallback preserved');
assert.match(html,/catch\(err\)\s*\{[\s\S]*?startSong\(idx,diff\);/,'Audio load failure still uses synth fallback');
const script=/<script>\s*([\s\S]*?)\s*<\/script>/i.exec(html);
assert.ok(script,'Single inline game logic script exists');
assert.equal((html.match(/<script>/g)||[]).length,1);
new vm.Script(script[1],{filename:'vocalon-game.js'});
assert.match(html,/const ph=\(\(\(songTime\/spb\)\+i\/3\)%1\+1\)%1;/,'Negative countdown phase is normalized before canvas arc');
for(let t=-8;t<=8;t+=0.5){for(let i=0;i<3;i++){const ph=(((t/0.5)+i/3)%1+1)%1;assert(ph>=0&&ph<1,'No negative arc phase during countdown');}}
const urlBlock=/const TRACK_URLS=Object\.freeze\(\[([^\]]+)\]\)/.exec(html);
assert.ok(urlBlock);
const urls=[...urlBlock[1].matchAll(/'\.\/audio\/([^']+)'/g)].map(x=>x[1]);
assert.deepEqual(urls,expected.map(x=>x[0]),'Music URLs exactly match three indexed songs');
for(const [filename,size,sha] of expected){
 const bytes=fs.readFileSync(path.join(dir,'audio',filename));
 assert.equal(bytes.length,size,filename+': decoded bytes unchanged');
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),sha,filename+': original SHA256 matches');
 assert.equal(bytes.toString('ascii',4,12),'ftypM4A ',filename+': valid M4A signature');
 console.log('PASS '+filename+' '+bytes.length+' bytes');
}
console.log('PASS: HTML, game script, lazy loading, fallback, original audio integrity');
