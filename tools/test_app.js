// 앱 계산 로직을 원본 CSV에서 독립적으로 다시 계산한 값과 맞춰 보는 점검 스크립트.
// 사용: node tools/test_app.js app data/15138735/15138735.csv
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const [appDir, csvPath] = process.argv.slice(2);
const api = require(path.resolve(appDir, 'app.js'));
const D = JSON.parse(fs.readFileSync(path.join(appDir, 'data/data.json'), 'utf8'));
const F = D.flow;

// 1) data.js 와 data.json 이 같은 내용인지
const js = fs.readFileSync(path.join(appDir, 'data/data.js'), 'utf8');
const w = {}; new Function('window', js)(w);
assert.deepStrictEqual(w.OLPARK_DATA, D);

// 2) 원본 CSV에서 직접 세어 본 값과 비교 (cp949지만 필요한 열은 숫자·기호뿐이라 latin1로 읽어도 된다)
const lines = fs.readFileSync(csvPath, 'latin1').trim().split(/\r?\n/).slice(1);
assert.strictEqual(lines.length, F.rows);
const T = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16));
const recs = lines.map(l => { const c = l.split(','); return [T(c[1]), T(c[2])]; });
// 2024-07-10(수) 11:00 에 주차 중이던 차 = 입차 <= t < 출차
const occAt = t => recs.filter(([i, o]) => i <= t && t < o).length;
const wed = ['03', '10', '17', '24', '31'].map(d => occAt(T(`2024-07-${d} 11:00`)));
const wedAvg = Math.round(wed.reduce((a, b) => a + b) / wed.length * 10) / 10;
assert.strictEqual(F.byWeekday[2].occ[22], wedAvg, '수요일 11:00 평균 주차 중 대수');
assert.strictEqual(F.byWeekday[2].occMax[22], Math.max(...wed));
assert.strictEqual(F.byWeekday[2].occMin[22], Math.min(...wed));
// 7월 21일(일) 8시대 입차 수
const d21 = recs.filter(([i]) => i >= T('2024-07-21 08:00') && i < T('2024-07-21 09:00')).length;
const suns = ['07', '14', '21', '28'].map(d => recs.filter(([i]) => i >= T(`2024-07-${d} 08:00`) && i < T(`2024-07-${d} 09:00`)).length);
assert.ok(suns.includes(d21));
assert.strictEqual(F.byWeekday[6].entries[8], Math.round(suns.reduce((a, b) => a + b) / 4 * 10) / 10);
// 10분 이내 출차 비율
const short = recs.filter(([i, o]) => (o - i) / 60000 <= 10).length;
assert.strictEqual(F.shortShare, Math.round(short / recs.length * 1000) / 1000);

// 3) 계획 계산
const p = api.plan(F, 2, 22, 4);          // 수요일 11:00 도착, 2시간
assert.strictEqual(p.arrive, wedAvg);
assert.strictEqual(p.peak, Math.max(...F.byWeekday[2].occ.slice(22, 27)));
assert.strictEqual(p.leaveSlot, 26);
assert.strictEqual(p.leaveExits, F.byWeekday[2].exits[13]);
const late = api.plan(F, 6, 44, 16);      // 일요일 22:00 도착, 8시간 → 월요일로 넘어감
assert.strictEqual(late.leaveExits, F.byWeekday[0].exits[6]);
assert.ok(late.peak >= F.byWeekday[0].occ[12]);
const b = api.better(F, 5, 34, 4);
assert.ok(b.peak <= api.plan(F, 5, 34, 4).peak && b.slot >= 12 && b.slot <= 44);
assert.strictEqual(api.levelOf(0.95).name, '만차 수준');
assert.strictEqual(api.levelOf(0.7).name, '혼잡');
assert.strictEqual(api.levelOf(0.5).name, '다소 혼잡');
assert.strictEqual(api.levelOf(0.49).name, '여유');
assert.strictEqual(api.slotLabel(13, 30), '06:30');
assert.strictEqual(api.slotLabel(50, 30), '01:00');

// 4) 구역: 목적지에 적은 구역이 데이터에 모두 있는지, 합계가 맞는지
const names = D.zones.zones.map(z => z.zone);
api.DESTS.forEach(d => d.zones.forEach(z => assert.ok(names.includes(z), z)));
let total = 0;
D.zones.zones.forEach(z => { const s = api.zoneStats(z, 23); total += s.total; assert.ok(s.beforeShare === 1 || s.fullDay === 0); });
assert.strictEqual(total, D.zones.rows);
// 5) 월별: 72행 = 2곳 × 3년 × 12달
assert.strictEqual(Object.values(D.monthly.places).reduce((a, y) => a + Object.values(y).reduce((x, m) => x + m.length, 0), 0), D.monthly.rows);
console.log('OK 모든 점검 통과', { 수요일11시평균: wedAvg, 수요일11시날짜별: wed, 십분이내비율: F.shortShare });
