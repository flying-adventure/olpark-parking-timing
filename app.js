/* 올팍 주차 타이밍 — 빌드 도구 없이 동작하는 순수 자바스크립트.
   데이터는 data/data.js 가 window.OLPARK_DATA 로 넣어 준다(tools/build_data.py 산출물). */
(function (root) {
  'use strict';

  /* ── 공식 홈페이지 안내에서 옮긴 기준값 ─────────────────────────────
     출처: 올림픽공원 홈페이지 「주차 안내」「주차장 예상 이용률 서비스」(2026-11-20 확인).
     공공데이터 파일에는 없는 값이라 여기 따로 적고 화면에도 출처를 표시한다. */
  var CAPACITY = 2200;                 // 동2문·남2문·북2문 수용 가능 대수
  var LEVELS = [                       // 공식 예상 이용률 서비스와 같은 구간
    { min: 0.9, name: '만차 수준', color: 'var(--critical)', mark: '●' },
    { min: 0.7, name: '혼잡', color: 'var(--serious)', mark: '▲' },
    { min: 0.5, name: '다소 혼잡', color: 'var(--warning)', mark: '◆' },
    { min: 0, name: '여유', color: 'var(--good)', mark: '○' }
  ];
  var DESTS = [                        // 목적지별 가장 가까운 주차구역
    { name: 'KSPO DOME(올림픽체조경기장)', zones: ['P5'], cap: 176 },
    { name: '올림픽홀', zones: ['P2'], cap: 320, capNote: '올림픽홀 지하주차장 포함' },
    { name: '티켓링크 라이브 아레나(핸드볼경기장)', zones: ['P6'], cap: 167 },
    { name: '우리금융아트홀(올림픽역도경기장)', zones: ['P7'], cap: 137 },
    { name: 'K-아트홀(태권도공연장)', zones: ['P1A', 'P1B'], cap: 562 },
    { name: '올림픽수영장', zones: ['P4'], cap: 117 },
    { name: '올림픽테니스경기장', zones: ['P11'], cap: 190 }
  ];
  var GATES = { P4: '북2문', P5: '북2문', P1B: '동2문', P2: '동2문', P1A: '남2문', P6: '남2문', P7: '남2문' };
  var ENTRY_FROM = 6, ENTRY_TO = 22;   // 공식 안내 입차시간 06:00~22:00

  /* ── 계산(화면과 분리: node 로도 검증한다) ────────────────────────── */
  function levelOf(ratio) {
    for (var i = 0; i < LEVELS.length; i++) if (ratio >= LEVELS[i].min) return LEVELS[i];
    return LEVELS[LEVELS.length - 1];
  }
  function slotLabel(slot, slotMin) {
    var m = (slot * slotMin) % 1440;
    var h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }
  // 요일 w, 슬롯 s 에서 n 슬롯 뒤의 값을 돌려준다(자정을 넘으면 다음 요일 프로필로 이어 붙임).
  function at(flow, key, w, s) {
    var per = flow.byWeekday[0][key].length;
    var day = Math.floor(s / per);
    return flow.byWeekday[(w + day) % 7][key][s % per];
  }
  function plan(flow, w, arrSlot, staySlots) {
    var peak = -1, peakSlot = arrSlot, worst = -1;
    for (var s = arrSlot; s <= arrSlot + staySlots; s++) {
      var v = at(flow, 'occ', w, s);
      if (v > peak) { peak = v; peakSlot = s; }
      worst = Math.max(worst, at(flow, 'occMax', w, s));
    }
    var leaveSlot = arrSlot + staySlots;
    var perHour = 60 / flow.slotMin;
    var leaveHour = Math.floor(leaveSlot / perHour);
    var exits = flow.byWeekday[(w + Math.floor(leaveHour / 24)) % 7].exits[leaveHour % 24];
    return {
      arrive: at(flow, 'occ', w, arrSlot),
      arriveMin: at(flow, 'occMin', w, arrSlot),
      arriveMax: at(flow, 'occMax', w, arrSlot),
      peak: peak, peakSlot: peakSlot, worst: worst,
      leaveSlot: leaveSlot, leaveExits: exits
    };
  }
  // 앞뒤 2시간 안에서 '머무는 동안 최고치'가 가장 낮은 도착 시각을 찾는다.
  function better(flow, w, arrSlot, staySlots) {
    var perHour = 60 / flow.slotMin, best = null;
    for (var s = arrSlot - 2 * perHour; s <= arrSlot + 2 * perHour; s++) {
      if (s < ENTRY_FROM * perHour || s > ENTRY_TO * perHour) continue;
      var p = plan(flow, w, s, staySlots);
      if (!best || p.peak < best.peak) best = { slot: s, peak: p.peak };
    }
    return best;
  }
  function busiestExitHour(flow, w) {
    var ex = flow.byWeekday[w].exits, h = 0;
    for (var i = 1; i < 24; i++) if (ex[i] > ex[h]) h = i;
    return h;
  }
  function zoneStats(zone, arrHour) {
    var total = zone.counts['원활'] + zone.counts['혼잡'] + zone.counts['만차'];
    var before = 0, day = 0;
    for (var h = ENTRY_FROM; h < 24; h++) {
      day += zone.fullByHour[h];
      if (h <= arrHour) before += zone.fullByHour[h];
    }
    return { total: total, full: zone.counts['만차'], fullShare: zone.counts['만차'] / total,
             fullDay: day, before: before, beforeShare: day ? before / day : 0 };
  }
  var api = { CAPACITY: CAPACITY, DESTS: DESTS, levelOf: levelOf, slotLabel: slotLabel, plan: plan,
              better: better, busiestExitHour: busiestExitHour, zoneStats: zoneStats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  /* ── 화면 ───────────────────────────────────────────────────────── */
  var D = root.OLPARK_DATA;
  var $ = function (id) { return document.getElementById(id); };
  if (!D) {
    $('result').textContent = '데이터 파일(data/data.js)을 읽지 못했습니다.';
    return;
  }
  var F = D.flow, Z = D.zones, M = D.monthly;
  var PER_HOUR = 60 / F.slotMin;
  var num = function (n) { return Math.round(n).toLocaleString('ko-KR'); };
  var pctTxt = function (r) { return Math.round(r * 100) + '%'; };
  var state = { w: 0, arr: 0, stay: 4, dest: 0, place: Object.keys(M.places)[0] };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  /* 툴팁: 하나를 같이 쓴다 */
  var tip = $('tip');
  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    var r = tip.getBoundingClientRect();
    var left = Math.min(Math.max(8, x + 12), window.innerWidth - r.width - 8);
    var top = y - r.height - 12;
    if (top < 8) top = y + 16;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip() { tip.hidden = true; }

  function niceMax(v) {
    var steps = [100, 200, 250, 300, 400, 500, 600, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 200000];
    for (var i = 0; i < steps.length; i++) if (v <= steps[i] * 4) return steps[i] * Math.ceil(v / steps[i]);
    return v;
  }
  function ticks(max) {
    var out = [], step = max / 4;
    for (var i = 0; i <= 4; i++) out.push(step * i);
    return out;
  }
  function frame(el, h) {
    var w = Math.max(280, Math.floor(el.clientWidth || 320));
    return { w: w, h: h, l: 44, r: 12, t: 12, b: 26 };
  }
  function yAxis(f, max) {
    var s = '';
    ticks(max).forEach(function (v) {
      var y = f.t + (f.h - f.t - f.b) * (1 - v / max);
      s += '<line class="gridl" x1="' + f.l + '" x2="' + (f.w - f.r) + '" y1="' + y + '" y2="' + y + '"/>' +
           '<text x="' + (f.l - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + num(v) + '</text>';
    });
    return s;
  }
  // 손가락·마우스 위치에서 가장 가까운 칸 번호를 알려 주는 공통 처리
  function hover(el, f, count, band, onIndex) {
    var svg = el.querySelector('svg');
    function move(e) {
      var r = svg.getBoundingClientRect();
      var x = (e.clientX - r.left) * (f.w / r.width);
      var inner = f.w - f.l - f.r;
      var i = band ? Math.floor((x - f.l) / (inner / count)) : Math.round((x - f.l) / (inner / (count - 1)));
      i = Math.max(0, Math.min(count - 1, i));
      onIndex(i, e.clientX, e.clientY);
    }
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', function () { hideTip(); onIndex(-1); });
  }

  /* ① 주차 중 대수: 평균 선 + 최소~최대 띠 + 수용 대수 기준선 */
  function drawOcc() {
    var el = $('occChart'), f = frame(el, 240), wd = F.byWeekday[state.w];
    var n = wd.occ.length, max = niceMax(Math.max(CAPACITY, Math.max.apply(null, wd.occMax)));
    var iw = f.w - f.l - f.r, ih = f.h - f.t - f.b;
    var X = function (i) { return f.l + iw * i / (n - 1); };
    var Y = function (v) { return f.t + ih * (1 - v / max); };
    var up = '', down = '', line = '';
    for (var i = 0; i < n; i++) {
      up += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(wd.occMax[i]).toFixed(1);
      line += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(wd.occ[i]).toFixed(1);
    }
    for (i = n - 1; i >= 0; i--) down += 'L' + X(i).toFixed(1) + ' ' + Y(wd.occMin[i]).toFixed(1);
    var xl = '';
    for (var h = 0; h <= 21; h += 3) {
      xl += '<text x="' + X(h * PER_HOUR) + '" y="' + (f.h - 8) + '" text-anchor="middle">' + h + '시</text>';
    }
    var capY = Y(CAPACITY);
    var a0 = X(state.arr), a1 = X(Math.min(n - 1, state.arr + state.stay));
    el.innerHTML =
      '<svg viewBox="0 0 ' + f.w + ' ' + f.h + '" role="img" aria-label="' + wd.label + '요일 30분 간격 주차 중 차량 수. 평균 최고 ' +
      num(Math.max.apply(null, wd.occ)) + '대">' + yAxis(f, max) +
      '<rect x="' + a0 + '" y="' + f.t + '" width="' + Math.max(2, a1 - a0) + '" height="' + ih + '" fill="var(--text)" opacity="0.07"/>' +
      '<path d="' + up + down + 'Z" fill="var(--series-1-soft)" opacity="0.75"/>' +
      '<line x1="' + f.l + '" x2="' + (f.w - f.r) + '" y1="' + capY + '" y2="' + capY + '" stroke="var(--text-3)" stroke-width="1.5" stroke-dasharray="5 4"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      (a0 > f.w - f.r - 80   // 오른쪽 끝에 가까우면 글자를 띠 왼쪽에 둔다
        ? '<text class="lab" x="' + (a0 - 4) + '" y="' + (f.t + 12) + '" text-anchor="end">내 주차 시간</text>'
        : '<text class="lab" x="' + (a0 + 4) + '" y="' + (f.t + 12) + '">내 주차 시간</text>') +
      '<line id="occX" y1="' + f.t + '" y2="' + (f.t + ih) + '" stroke="var(--text-3)" stroke-width="1" visibility="hidden"/>' +
      '<circle id="occDot" r="5" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>' +
      xl + '</svg>';
    var cross = el.querySelector('#occX'), dot = el.querySelector('#occDot');
    hover(el, f, n, false, function (i, cx, cy) {
      if (i < 0) { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); return; }
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(wd.occ[i])); dot.setAttribute('visibility', 'visible');
      showTip('<b>' + wd.label + ' ' + slotLabel(i, F.slotMin) + '</b><br>평균 ' + num(wd.occ[i]) + '대 (' + pctTxt(wd.occ[i] / CAPACITY) +
              ')<br>범위 ' + num(wd.occMin[i]) + '~' + num(wd.occMax[i]) + '대', cx, cy);
    });

    var rows = '<tr><th>시각</th><th>평균</th><th>최소</th><th>최대</th><th>평균 이용률</th></tr>';
    for (i = 0; i < n; i += PER_HOUR) {
      rows += '<tr><td>' + slotLabel(i, F.slotMin) + '</td><td>' + num(wd.occ[i]) + '</td><td>' + num(wd.occMin[i]) +
              '</td><td>' + num(wd.occMax[i]) + '</td><td>' + pctTxt(wd.occ[i] / CAPACITY) + '</td></tr>';
    }
    $('occTable').innerHTML = rows;
  }

  /* ② 시간대별 입차·출차: 두 계열 묶음 막대 */
  function drawFlow() {
    var el = $('flowChart'), f = frame(el, 200), wd = F.byWeekday[state.w];
    var max = niceMax(Math.max(Math.max.apply(null, wd.entries), Math.max.apply(null, wd.exits)));
    var iw = f.w - f.l - f.r, ih = f.h - f.t - f.b, bw = iw / 24, base = f.t + ih;
    var bar = Math.max(2, Math.min(9, (bw - 4) / 2));
    var s = '';
    function rect(x, v, color) {
      var hgt = ih * v / max, r = Math.min(3, bar / 2, hgt);
      // 위쪽 끝만 둥글게, 아래는 기준선에 붙인다
      return '<path d="M' + x + ' ' + base + 'V' + (base - hgt + r) + 'q0 ' + (-r) + ' ' + r + ' ' + (-r) + 'h' + (bar - 2 * r) +
             'q' + r + ' 0 ' + r + ' ' + r + 'V' + base + 'Z" fill="' + color + '"/>';
    }
    for (var h = 0; h < 24; h++) {
      var cx = f.l + bw * h + bw / 2;
      s += rect(cx - bar - 1, wd.entries[h], 'var(--series-1)') + rect(cx + 1, wd.exits[h], 'var(--series-2)');
      if (h % 3 === 0) s += '<text x="' + cx + '" y="' + (f.h - 8) + '" text-anchor="middle">' + h + '시</text>';
    }
    el.innerHTML = '<svg viewBox="0 0 ' + f.w + ' ' + f.h + '" role="img" aria-label="' + wd.label + '요일 시간대별 평균 입차·출차 대수">' +
      yAxis(f, max) + '<rect id="flowHi" y="' + f.t + '" width="' + bw + '" height="' + ih + '" fill="var(--text)" opacity="0.07" visibility="hidden"/>' +
      s + '<line class="axis" x1="' + f.l + '" x2="' + (f.w - f.r) + '" y1="' + base + '" y2="' + base + '"/></svg>';
    var hi = el.querySelector('#flowHi');
    hover(el, f, 24, true, function (i, cx, cy) {
      if (i < 0) { hi.setAttribute('visibility', 'hidden'); return; }
      hi.setAttribute('x', f.l + bw * i); hi.setAttribute('visibility', 'visible');
      showTip('<b>' + wd.label + ' ' + i + '시대</b><br>입차 ' + num(wd.entries[i]) + '대<br>출차 ' + num(wd.exits[i]) + '대', cx, cy);
    });
    var st = F.stayByHour[Math.floor(state.arr / PER_HOUR)];
    $('stayNote').textContent = st && st.median != null
      ? Math.floor(state.arr / PER_HOUR) + '시대에 들어온 차는 ' + pctTxt(st.shortShare) + '가 ' + F.freeMin + '분 안에 다시 나갔고(내려 주고 가는 차 등), 나머지는 보통 ' +
        st.median + '분(가운데 절반은 ' + st.p25 + '~' + st.p75 + '분) 머물렀습니다. 2024년 7월 전체 요일 기준.'
      : '';
  }

  /* ③ 계획 결과 */
  function drawPlan() {
    var wd = F.byWeekday[state.w];
    var p = plan(F, state.w, state.arr, state.stay);
    var ratio = p.peak / CAPACITY, lv = levelOf(ratio);
    var worstLv = levelOf(p.worst / CAPACITY);
    var b = better(F, state.w, state.arr, state.stay);
    var exitH = busiestExitHour(F, state.w);
    var leaveH = Math.floor(p.leaveSlot / PER_HOUR) % 24;
    var html =
      '<div class="level"><span class="badge"><i class="dot" style="background:' + lv.color + '"></i>' + lv.mark + ' ' + lv.name + '</span>' +
      '<span class="note" style="margin:0">머무는 동안 가장 찼을 때 기준</span></div>' +
      '<p class="big" style="margin:8px 0 0">' + num(p.peak) + '<small>대 주차 중 · 2,200대의 ' + pctTxt(ratio) + ' (' + slotLabel(p.peakSlot, F.slotMin) + '쯤)</small></p>' +
      '<div class="meter" role="img" aria-label="평균 ' + pctTxt(ratio) + ', 가장 붐빈 날 ' + pctTxt(p.worst / CAPACITY) + '">' +
      '<i style="width:' + Math.min(100, ratio * 100) + '%;background:' + lv.color + '"></i>' +
      '<b style="left:calc(' + Math.min(100, p.worst / CAPACITY * 100) + '% - 2px)"></b></div>' +
      '<div class="metercap"><span>0</span><span>세로선: 같은 요일 중 가장 붐볐던 날</span><span>2,200대</span></div>' +
      '<ul class="facts">' +
      '<li>도착하는 <b>' + slotLabel(state.arr, F.slotMin) + '</b>에는 평균 <b>' + num(p.arrive) + '대</b>(' + pctTxt(p.arrive / CAPACITY) +
      ')가 주차 중이었습니다. 날에 따라 ' + num(p.arriveMin) + '~' + num(p.arriveMax) + '대.</li>' +
      '<li>가장 붐볐던 ' + wd.label + '요일에는 머무는 동안 <b>' + num(p.worst) + '대</b>(' + pctTxt(p.worst / CAPACITY) + ', ' + worstLv.name +
      ')까지 찼습니다. 공연·행사가 있는 날은 평균보다 이 값에 가깝다고 보는 편이 안전합니다.</li>' +
      '<li>나가는 <b>' + slotLabel(p.leaveSlot, F.slotMin) + '</b>쯤 ' + leaveH + '시대에는 한 시간에 평균 <b>' + num(p.leaveExits) + '대</b>가 빠져나갑니다' +
      (leaveH === exitH ? ' — ' + wd.label + '요일 중 출차가 가장 몰리는 시간대입니다.' : '. ' + wd.label + '요일 출차가 가장 몰리는 때는 ' + exitH + '시대(' + num(wd.exits[exitH]) + '대)입니다.') + '</li>';
    if (b && b.slot !== state.arr && p.peak - b.peak >= 0.03 * CAPACITY) {
      html += '<li>앞뒤 2시간 안에서는 <b>' + slotLabel(b.slot, F.slotMin) + '</b> 도착이 가장 한산했습니다(머무는 동안 최고 ' + num(b.peak) + '대, ' +
              pctTxt(b.peak / CAPACITY) + '). 지금 선택보다 ' + num(p.peak - b.peak) + '대 적습니다.</li>';
    } else {
      html += '<li>앞뒤 2시간 안에서 도착 시각을 옮겨도 차이는 크지 않았습니다(2,200대의 3% 미만).</li>';
    }
    html += '</ul>';
    $('result').innerHTML = html;
    $('planNote').textContent = '근거: 2024년 7월 ' + wd.label + '요일 ' + wd.days + '일치 입출차 기록의 평균(' + wd.dates.map(function (d) { return +d.slice(8) + '일'; }).join('·') +
      '). 혼잡 구간(50·70·90%)과 수용 대수 2,200대는 올림픽공원 「주차장 예상 이용률 서비스」 표기를 따랐습니다. 예측이 아니라 과거 기록 요약입니다.';
    $('dayWd').textContent = wd.label;
  }

  /* ④ 구역별 만차 기록 */
  var HEAT_FROM = 8, HEAT_TO = 21;
  function drawZones() {
    var dest = DESTS[state.dest], arrHour = Math.floor(state.arr / PER_HOUR);
    var maxCell = 0, early = 0;
    Z.zones.forEach(function (z) {
      z.fullByHour.forEach(function (c, h) {
        if (h >= HEAT_FROM && h <= HEAT_TO) maxCell = Math.max(maxCell, c); else early += c;
      });
    });
    var head = '<tr><th>구역</th>';
    for (var h = HEAT_FROM; h <= HEAT_TO; h++) head += '<th>' + h + '</th>';
    head += '<th class="tot">만차/전체</th></tr>';
    var body = '';
    Z.zones.forEach(function (z) {
      var st = zoneStats(z, arrHour), on = dest.zones.indexOf(z.zone) >= 0;
      body += '<tr' + (on ? ' class="on"' : '') + '><th scope="row">' + esc(z.zone) + '</th>';
      for (var h = HEAT_FROM; h <= HEAT_TO; h++) {
        var c = z.fullByHour[h], a = c ? 0.12 + 0.78 * c / maxCell : 0;
        body += '<td style="background:rgba(var(--heat-rgb),' + a.toFixed(2) + ')' + (a > 0.55 ? ';color:#fff' : '') + '">' + (c || '') + '</td>';
      }
      body += '<td class="tot">' + st.full + '/' + st.total + '</td></tr>';
    });
    $('zoneTable').innerHTML = '<caption class="note" style="text-align:left;caption-side:bottom">가로: 기록된 시(時). 숫자: 그 시각에 ‘만차’로 기록된 횟수. 색이 짙을수록 많음.</caption>' + head + body;

    var parts = dest.zones.map(function (name) {
      var z = Z.zones.filter(function (x) { return x.zone === name; })[0];
      if (!z) return '';
      var st = zoneStats(z, arrHour);
      return '<li><b>' + esc(name) + '</b>' + (GATES[name] ? ' (' + GATES[name] + ' 진입)' : '') + ' — 기록 ' + st.total + '건 중 만차 <b>' + st.full + '건</b>(' +
        pctTxt(st.fullShare) + '). 만차 기록의 <b>' + pctTxt(st.beforeShare) + '</b>가 ' + arrHour + '시대까지 찍혔고, 가운데 시각은 ' +
        Math.floor(z.fullMedianHour) + '시대입니다.</li>';
    }).join('');
    var rank = Z.zones.slice().sort(function (a, b) { return zoneStats(a, arrHour).beforeShare - zoneStats(b, arrHour).beforeShare; });
    var late = rank.slice(0, 3).map(function (z) { return z.zone + '(' + pctTxt(zoneStats(z, arrHour).beforeShare) + ')'; }).join(', ');
    // 늦은 시각이면 모든 구역의 만차 기록이 이미 지나 있어 순위가 의미 없다
    var lateMsg = zoneStats(rank[0], arrHour).beforeShare >= 0.95
      ? arrHour + '시대는 모든 구역에서 만차 기록이 거의 다 찍힌 뒤의 시각입니다. 낮 시간대를 골라 보면 구역별 차이가 보입니다.'
      : arrHour + '시대까지 만차 기록이 가장 덜 쌓인 구역: <b>' + late + '</b>. 늦게 차는 구역일수록 자리가 남아 있을 가능성이 높습니다.';
    $('zoneResult').innerHTML = '<ul class="facts"><li>' + esc(dest.name) + '에서 가장 가까운 주차구역은 <b>' + dest.zones.join('·') + '</b>, 주차 가능 ' +
      num(dest.cap) + '대' + (dest.capNote ? '(' + dest.capNote + ')' : '') + '입니다. <span class="note">올림픽공원 홈페이지 주차 안내 기준</span></li>' + parts +
      '<li>' + lateMsg + '</li></ul>';
    $('zoneNote').textContent = '근거: 주차장 혼잡도 정보 ' + num(Z.rows) + '건(' + Z.from + ' ~ ' + Z.to + ', ' + Z.dates + '일). 기록이 남은 날의 ' +
      pctTxt((Z.datesByWeekday[5] + Z.datesByWeekday[6]) / Z.dates) + '가 토·일요일이라 주로 붐비는 주말의 모습입니다. 상시 센서값이 아니라 상태가 바뀔 때 남긴 기록이어서 건수는 ‘얼마나 자주 찼는지’의 참고치입니다.' +
      (early ? ' ' + HEAT_FROM + '시 이전·' + HEAT_TO + '시 이후 만차 기록 ' + early + '건은 표에서 뺐습니다.' : '');
  }

  /* ⑤ 월별: 연도 3개 선 */
  function drawMonthly() {
    var el = $('monthChart'), f = frame(el, 220);
    f.l = 58; f.r = 40;
    var years = Object.keys(M.places[state.place]).sort();
    var colors = ['var(--series-3)', 'var(--series-2)', 'var(--series-1)'], cls = ['y2023', 'y2024', 'y2025'];
    var all = [];
    years.forEach(function (y) { all = all.concat(M.places[state.place][y]); });
    var max = niceMax(Math.max.apply(null, all));
    var iw = f.w - f.l - f.r, ih = f.h - f.t - f.b;
    var X = function (i) { return f.l + iw * i / 11; };
    var Y = function (v) { return f.t + ih * (1 - v / max); };
    var s = '', lastY = [];
    years.forEach(function (y, k) {
      var v = M.places[state.place][y], d = '';
      for (var i = 0; i < 12; i++) d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v[i]).toFixed(1);
      s += '<path d="' + d + '" fill="none" stroke="' + colors[k] + '" stroke-width="2" stroke-linejoin="round"/>';
      lastY.push({ y: Y(v[11]), label: y });
    });
    // 끝점 연도 표시가 겹치지 않게 최소 12px 띄운다
    lastY.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < lastY.length; i++) if (lastY[i].y - lastY[i - 1].y < 12) lastY[i].y = lastY[i - 1].y + 12;
    lastY.forEach(function (o) { s += '<text class="lab" x="' + (X(11) + 6) + '" y="' + (o.y + 4) + '">' + o.label + '</text>'; });
    for (i = 0; i < 12; i++) s += '<text x="' + X(i) + '" y="' + (f.h - 8) + '" text-anchor="middle">' + (i + 1) + '</text>';
    el.innerHTML = '<svg viewBox="0 0 ' + f.w + ' ' + f.h + '" role="img" aria-label="' + esc(state.place) + ' 월별 주차 대수 ' + years.join(', ') + '년">' +
      yAxis(f, max) + s + '<line id="mX" y1="' + f.t + '" y2="' + (f.t + ih) + '" stroke="var(--text-3)" stroke-width="1" visibility="hidden"/></svg>';
    var cross = el.querySelector('#mX');
    hover(el, f, 12, false, function (i, cx, cy) {
      if (i < 0) { cross.setAttribute('visibility', 'hidden'); return; }
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      showTip('<b>' + (i + 1) + '월</b><br>' + years.map(function (y) { return y + '년 ' + num(M.places[state.place][y][i]) + '대'; }).join('<br>'), cx, cy);
    });
    $('monthLegend').innerHTML = years.map(function (y, k) { return '<span><i class="sw ' + cls[k] + '"></i>' + y + '년</span>'; }).join('');

    // 3년 평균으로 본 달별 지수(연평균=100)
    var avg = [];
    for (i = 0; i < 12; i++) avg.push(years.reduce(function (a, y) { return a + M.places[state.place][y][i]; }, 0) / years.length);
    var mean = avg.reduce(function (a, b) { return a + b; }, 0) / 12;
    var hiM = avg.indexOf(Math.max.apply(null, avg)), loM = avg.indexOf(Math.min.apply(null, avg));
    var note = state.place + '은 3년 평균으로 ' + (hiM + 1) + '월이 가장 많고(연평균의 ' + Math.round(avg[hiM] / mean * 100) + '%) ' + (loM + 1) + '월이 가장 적습니다(' +
      Math.round(avg[loM] / mean * 100) + '%).';
    if (state.place.indexOf('올림픽') >= 0) {
      note += ' 위 ‘언제 갈까’의 근거인 7월은 연평균의 ' + Math.round(avg[6] / mean * 100) + '% 수준인 달이어서, ' + (hiM + 1) + '월 같은 성수기에는 더 붐빈다고 봐야 합니다.';
    }
    $('monthNote').textContent = note + ' 월별주차현황의 대수는 입출차 정보 건수와 집계 기준이 달라(2024년 7월: 월별 ' + num(M.places['올림픽공원'] ? M.places['올림픽공원']['2024'][6] : 0) +
      '대, 입출차 ' + num(F.rows) + '건) 달 사이의 상대 비교에만 썼습니다.';
  }

  function drawSources() {
    var src = [
      ['올림픽공원 입출차 정보', '15138735', num(F.rows) + '건 · ' + F.from + ' ~ ' + F.to + ' · 입차일시/출차일시 → 하루 흐름, 머문 시간'],
      ['주차장 혼잡도 정보', '15164156', num(Z.rows) + '건 · ' + Z.from + ' ~ ' + Z.to + ' · 구역별 원활/혼잡/만차 → 구역별 만차 기록'],
      ['월별주차현황', '15131671', num(M.rows) + '건 · 2023~2025년 · 올림픽공원/미사경정공원 → 달별 비교']
    ];
    $('srcList').innerHTML = src.map(function (s) {
      return '<li><a href="https://www.data.go.kr/data/' + s[1] + '/fileData.do" target="_blank" rel="noopener">한국체육산업개발주식회사_' + s[0] +
             '</a> (공공데이터포털 파일데이터) — ' + s[2] + '</li>';
    }).join('') +
      '<li>수용 대수 2,200대, 혼잡 구간, 목적지별 주차구역·주차 가능 대수: <a href="https://www.ksponco.or.kr/olympicpark/parkingInfo?mid=a20111000000" target="_blank" rel="noopener">올림픽공원 홈페이지 주차 안내</a> (2026-11-20 확인)</li>';
    $('limits').innerHTML = [
      '입출차 기록은 2024년 7월 한 달치입니다. 요일별 평균은 ' + F.byWeekday.map(function (w) { return w.label + ' ' + w.days + '일'; }).join(', ') + '을 평균한 값이라 표본이 작습니다.',
      '한 달 중 주차 중 대수가 가장 많았던 순간은 ' + num(F.peakOcc) + '대로, 공식 수용 대수 2,200대와 거의 같습니다.',
      '공연 일정과 날씨는 넣지 않았습니다. 해당 데이터(올림픽공원 공연정보, 차량입출차·공연·날씨 연계 데이터)는 인증키가 필요한 오픈API로만 제공됩니다.',
      '혼잡도 정보의 ‘등록시간’은 분·초 자리에 월·일이 들어 있어(' + num(Z.timeFieldBroken) + '건 전부) 시(時)만 사용했습니다.',
      '전체 입차의 ' + pctTxt(F.shortShare) + '는 ' + F.freeMin + '분 안에 나간 차입니다. 주차 중 대수에는 포함되지만 머문 시간 통계에서는 뺐습니다.',
      '데이터 가공일: ' + D.generated + '. 가공 스크립트는 tools/build_data.py 입니다.'
    ].map(function (t) { return '<li>' + t + '</li>'; }).join('');
  }

  function drawAll() { drawPlan(); drawOcc(); drawFlow(); drawZones(); }

  function init() {
    $('hdRows').textContent = num(F.rows);
    var now = new Date();
    state.w = (now.getDay() + 6) % 7;                       // 월=0 … 일=6
    var s = Math.ceil((now.getHours() * 60 + now.getMinutes()) / F.slotMin);
    state.arr = Math.min(ENTRY_TO * PER_HOUR, Math.max(ENTRY_FROM * PER_HOUR, s));

    $('wd').innerHTML = F.byWeekday.map(function (w, i) { return '<option value="' + i + '">' + w.label + '요일</option>'; }).join('');
    var o = '';
    for (var i = ENTRY_FROM * PER_HOUR; i <= ENTRY_TO * PER_HOUR; i++) o += '<option value="' + i + '">' + slotLabel(i, F.slotMin) + '</option>';
    $('arr').innerHTML = o;
    o = '';
    [1, 2, 3, 4, 6, 8, 10, 12, 16].forEach(function (n) {
      var m = n * F.slotMin;
      o += '<option value="' + n + '">' + (m < 60 ? m + '분' : (m / 60) + '시간') + '</option>';
    });
    $('stay').innerHTML = o;
    $('dest').innerHTML = DESTS.map(function (d, i) { return '<option value="' + i + '">' + esc(d.name) + '</option>'; }).join('');
    $('wd').value = state.w; $('arr').value = state.arr; $('stay').value = state.stay;

    $('wd').addEventListener('change', function () { state.w = +this.value; drawAll(); });
    $('arr').addEventListener('change', function () { state.arr = +this.value; drawAll(); });
    $('stay').addEventListener('change', function () { state.stay = +this.value; drawAll(); });
    $('dest').addEventListener('change', function () { state.dest = +this.value; drawZones(); });

    $('placeSeg').innerHTML = Object.keys(M.places).map(function (p) {
      return '<button type="button" aria-pressed="' + (p === state.place) + '" data-p="' + esc(p) + '">' + esc(p) + '</button>';
    }).join('');
    $('placeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state.place = b.getAttribute('data-p');
      Array.prototype.forEach.call(this.children, function (c) { c.setAttribute('aria-pressed', c === b); });
      drawMonthly();
    });

    drawAll(); drawMonthly(); drawSources();
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { drawOcc(); drawFlow(); drawMonthly(); }, 150);
    });
    window.addEventListener('scroll', hideTip, { passive: true });
  }
  init();
})(typeof window !== 'undefined' ? window : globalThis);
