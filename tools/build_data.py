#!/usr/bin/env python3
"""공공데이터 원본 CSV를 앱이 읽는 요약 JSON으로 바꾼다.

사용: python3 -I tools/build_data.py <data 폴더> <app/data 폴더>
입력(공공데이터포털 파일데이터, 한국체육산업개발주식회사):
  15138735 올림픽공원 입출차 정보      (입차일, 입차일시, 출차일시)
  15164156 주차장 혼잡도 정보          (구역별 원활/혼잡/만차 기록)
  15131671 월별주차현황                (연도, 월, 주차장소, 주차대수)
출력: data.json (사람이 확인용), data.js (index.html이 script로 읽는 같은 내용)
"""
import collections
import csv
import datetime as dt
import json
import statistics
import sys

SLOT_MIN = 30                      # 주차 중 대수를 재는 간격(분)
SLOTS = 24 * 60 // SLOT_MIN
FREE_MIN = 10                      # 공식 요금 안내: 10분 이내 출차 무료 → '잠깐 들른 차' 기준
WD = ['월', '화', '수', '목', '금', '토', '일']


def read(data_dir, ds):
    with open(f'{data_dir}/{ds}/{ds}.csv', encoding='cp949', newline='') as f:
        rows = list(csv.reader(f))
    return rows[0], rows[1:]


def pct(sorted_vals, q):
    return sorted_vals[min(len(sorted_vals) - 1, int(len(sorted_vals) * q))]


def build_flow(data_dir):
    """입출차 기록 → 요일별 시간대 입차·출차·주차 중 대수."""
    _, rows = read(data_dir, '15138735')
    parse = lambda s: dt.datetime.strptime(s, '%Y-%m-%d %H:%M')
    recs = [(parse(b), parse(c)) for _, b, c in rows]
    first = min(i for i, _ in recs).date()
    last = max(i for i, _ in recs).date()
    days = [first + dt.timedelta(n) for n in range((last - first).days + 1)]
    idx = {d: n for n, d in enumerate(days)}
    nd = len(days)

    ent = [[0] * 24 for _ in range(nd)]      # 날짜×시 입차 수
    ext = [[0] * 24 for _ in range(nd)]      # 날짜×시 출차 수
    # 주차 중 대수: 슬롯 경계 시각마다 +1/-1 차분을 쌓아 누적합
    diff = [0] * (nd * SLOTS + 1)
    t0 = dt.datetime.combine(first, dt.time())
    stay_by_hour = [[] for _ in range(24)]   # 도착 시각별 체류 분(잠깐 들른 차 제외)
    short_by_hour = [0] * 24
    for i, o in recs:
        ent[idx[i.date()]][i.hour] += 1
        if o.date() in idx:
            ext[idx[o.date()]][o.hour] += 1
        mins = (o - i).total_seconds() / 60
        if mins <= FREE_MIN:
            short_by_hour[i.hour] += 1
        else:
            stay_by_hour[i.hour].append(mins)
        # 슬롯 시각 t에 주차 중 = 입차 <= t < 출차
        a = -(-int((i - t0).total_seconds() // 60) // SLOT_MIN)   # 올림
        b = -(-int((o - t0).total_seconds() // 60) // SLOT_MIN)
        a, b = max(a, 0), min(b, nd * SLOTS)
        if a < b:
            diff[a] += 1
            diff[b] -= 1
    occ, run = [], 0
    for v in diff[:-1]:
        run += v
        occ.append(run)

    by_wd = []
    for w in range(7):
        ds = [n for n, d in enumerate(days) if d.weekday() == w]
        mean = lambda xs: round(sum(xs) / len(xs), 1)
        by_wd.append({
            'label': WD[w],
            'days': len(ds),
            'dates': [days[n].isoformat() for n in ds],
            'entries': [mean([ent[n][h] for n in ds]) for h in range(24)],
            'exits': [mean([ext[n][h] for n in ds]) for h in range(24)],
            'occ': [mean([occ[n * SLOTS + s] for n in ds]) for s in range(SLOTS)],
            'occMin': [min(occ[n * SLOTS + s] for n in ds) for s in range(SLOTS)],
            'occMax': [max(occ[n * SLOTS + s] for n in ds) for s in range(SLOTS)],
        })

    stay = []
    for h in range(24):
        v = sorted(stay_by_hour[h])
        total = len(v) + short_by_hour[h]
        stay.append({
            'n': total,
            'shortShare': round(short_by_hour[h] / total, 3) if total else None,
            'p25': round(pct(v, .25)) if v else None,
            'median': round(statistics.median(v)) if v else None,
            'p75': round(pct(v, .75)) if v else None,
        })
    all_stay = sorted(m for hs in stay_by_hour for m in hs)
    daily = [{'date': d.isoformat(), 'wd': WD[d.weekday()], 'entries': sum(ent[n]),
              'peakOcc': max(occ[n * SLOTS:(n + 1) * SLOTS]),
              'peakSlot': max(range(SLOTS), key=lambda s: occ[n * SLOTS + s])}
             for n, d in enumerate(days)]
    return {
        'rows': len(rows), 'from': first.isoformat(), 'to': last.isoformat(),
        'slotMin': SLOT_MIN, 'freeMin': FREE_MIN,
        'byWeekday': by_wd, 'stayByHour': stay, 'daily': daily,
        'shortShare': round(sum(short_by_hour) / len(rows), 3),
        'stayMedian': round(statistics.median(all_stay)),
        'peakOcc': max(occ),
    }


def build_zones(data_dir):
    """구역별 혼잡도 기록 → 상태별 건수와 '만차'가 찍힌 시각 분포.

    원본 '등록시간'은 HH:MM:SS 꼴이지만 분·초 자리에 월·일이 들어 있어(전 행 확인) 시(HH)만 쓴다.
    """
    _, rows = read(data_dir, '15164156')
    bad_time = sum(1 for r in rows if r[5][3:5] == r[4][5:7] and r[5][6:8] == r[4][8:10])
    zones = collections.OrderedDict()
    dates = set()
    for _, _, zone, level, date, time in rows:
        z = zones.setdefault(zone, {'zone': zone, 'counts': {'원활': 0, '혼잡': 0, '만차': 0},
                                    'fullByHour': [0] * 24, 'busyByHour': [0] * 24,
                                    'fullWeekend': 0, 'fullWeekday': 0, 'dates': set()})
        z['counts'][level] += 1
        z['dates'].add(date)
        dates.add(date)
        h = int(time[:2])
        if level == '만차':
            z['fullByHour'][h] += 1
            if dt.date.fromisoformat(date).weekday() >= 5:
                z['fullWeekend'] += 1
            else:
                z['fullWeekday'] += 1
        elif level == '혼잡':
            z['busyByHour'][h] += 1
    out = []
    for z in zones.values():
        hours = sorted(h for h, c in enumerate(z['fullByHour']) for _ in range(c) if h >= 6)
        z['fullMedianHour'] = statistics.median(hours) if hours else None
        z['dates'] = len(z['dates'])
        out.append(z)
    key = lambda z: (len(z['zone']), z['zone'])
    all_dates = sorted(dates)
    wd = collections.Counter(dt.date.fromisoformat(d).weekday() for d in all_dates)
    return {
        'rows': len(rows), 'from': all_dates[0], 'to': all_dates[-1], 'dates': len(all_dates),
        'datesByWeekday': [wd.get(w, 0) for w in range(7)],
        'timeFieldBroken': bad_time,
        'zones': sorted(out, key=lambda z: (int(''.join(c for c in z['zone'] if c.isdigit())), z['zone'])),
    }


def build_monthly(data_dir):
    _, rows = read(data_dir, '15131671')
    out = collections.OrderedDict()
    for year, month, place, n in rows:
        out.setdefault(place, {}).setdefault(year, [0] * 12)[int(month[:2]) - 1] = int(n)
    return {'rows': len(rows), 'places': out}


def main(data_dir, out_dir):
    data = {
        'generated': dt.date.today().isoformat(),
        'flow': build_flow(data_dir),
        'zones': build_zones(data_dir),
        'monthly': build_monthly(data_dir),
    }
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(f'{out_dir}/data.json', 'w', encoding='utf-8') as f:
        f.write(text)
    with open(f'{out_dir}/data.js', 'w', encoding='utf-8') as f:
        f.write('// tools/build_data.py가 만든 파일. 직접 고치지 말 것.\nwindow.OLPARK_DATA=' + text + ';\n')
    print('rows', data['flow']['rows'], data['zones']['rows'], data['monthly']['rows'], 'bytes', len(text))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
