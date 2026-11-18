/* 만세력 계산 엔진
 * - 절기 시각: lunar-javascript (UTC+8 기준) → UTC 로 변환해 정확히 비교
 * - 출생 시각: Asia/Seoul 역사적 표준시·서머타임(브라우저 tz DB)을 반영해 UTC 로 변환
 * - 일주·시주: 경도 보정(평균태양시) 적용 가능
 */
(function (global) {
  'use strict';

  const STEM_H = '甲乙丙丁戊己庚辛壬癸'.split('');
  const STEM_K = '갑을병정무기경신임계'.split('');
  const BR_H = '子丑寅卯辰巳午未申酉戌亥'.split('');
  const BR_K = '자축인묘진사오미신유술해'.split('');
  const BR_ANIMAL = '쥐 소 호랑이 토끼 용 뱀 말 양 원숭이 닭 개 돼지'.split(' ');
  const EL_K = ['목', '화', '토', '금', '수'];
  const EL_H = ['木', '火', '土', '金', '水'];
  const STEM_EL = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
  const BR_EL = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
  // 지장간 [여기, 중기, 정기] (없으면 null)
  const JIJANGGAN = [
    [8, null, 9], [9, 7, 5], [4, 2, 0], [0, null, 1], [1, 9, 4], [4, 6, 2],
    [2, 5, 3], [3, 1, 5], [4, 8, 6], [6, null, 7], [7, 3, 4], [4, 0, 8],
  ];
  const BR_MAIN = JIJANGGAN.map(j => j[2]);
  // 지지 음양 (체용 반영: 정기 기준) — 0 양 / 1 음
  const BR_YIN = BR_MAIN.map(s => s % 2);

  const SIPSIN = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인'];
  const SIPSIN_GROUP = ['비겁', '비겁', '식상', '식상', '재성', '재성', '관성', '관성', '인성', '인성'];
  const UNSEONG = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양'];
  const UNSEONG_START = [11, 6, 2, 9, 2, 9, 5, 0, 8, 3];
  const SINSAL12 = ['겁살', '재살', '천살', '지살', '연살(도화)', '월살', '망신살', '장성살', '반안살', '역마살', '육해살', '화개살'];

  const NAYIN = ['해중금', '노중화', '대림목', '노방토', '검봉금', '산두화', '간하수', '성두토', '백랍금', '양류목',
    '천중수', '옥상토', '벽력화', '송백목', '장류수', '사중금', '산하화', '평지목', '벽상토', '금박금',
    '복등화', '천하수', '대역토', '차천금', '상자목', '대계수', '사중토', '천상화', '석류목', '대해수'];

  // 절(節) → 월지
  const JIE_MAP = {
    '立春': 2, 'LI_CHUN': 2, '惊蛰': 3, 'JING_ZHE': 3, '清明': 4, 'QING_MING': 4, '立夏': 5, 'LI_XIA': 5,
    '芒种': 6, 'MANG_ZHONG': 6, '小暑': 7, 'XIAO_SHU': 7, '立秋': 8, 'LI_QIU': 8, '白露': 9, 'BAI_LU': 9,
    '寒露': 10, 'HAN_LU': 10, '立冬': 11, 'LI_DONG': 11, '大雪': 0, 'DA_XUE': 0, '小寒': 1, 'XIAO_HAN': 1,
  };
  const JIE_NAME_K = { 2: '입춘', 3: '경칩', 4: '청명', 5: '입하', 6: '망종', 7: '소서', 8: '입추', 9: '백로', 10: '한로', 11: '입동', 0: '대설', 1: '소한' };

  const mod = (a, n) => ((a % n) + n) % n;
  const gzIndex = (s, b) => mod(6 * s - 5 * b, 60);
  const gzOf = idx => ({ s: idx % 10, b: idx % 12, idx });

  function sipsin(dayStem, otherStem) {
    const rel = mod(STEM_EL[otherStem] - STEM_EL[dayStem], 5);
    const same = (dayStem % 2) === (otherStem % 2);
    const base = [0, 2, 4, 6, 8][rel];
    return base + (same ? 0 : 1);
  }
  // 오행 관계: 일간 오행 기준, 어떤 오행이 무슨 그룹인지
  function groupOfElement(dayEl, el) {
    return ['비겁', '식상', '재성', '관성', '인성'][mod(el - dayEl, 5)];
  }
  function elementOfGroup(dayEl, group) {
    return mod(dayEl + ['비겁', '식상', '재성', '관성', '인성'].indexOf(group), 5);
  }
  function unseong(stem, branch) {
    const st = UNSEONG_START[stem];
    return stem % 2 === 0 ? mod(branch - st, 12) : mod(st - branch, 12);
  }

  // ---------- 시간대 ----------
  const fmtCache = {};
  function tzOffsetMs(utcMs, tz) {
    if (!fmtCache[tz]) {
      fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    }
    const p = {};
    for (const x of fmtCache[tz].formatToParts(new Date(utcMs))) p[x.type] = x.value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - Math.floor(utcMs / 1000) * 1000;
  }
  function wallToUtc(y, m, d, h, mi, tz) {
    const wall = Date.UTC(y, m - 1, d, h, mi);
    let utc = wall - tzOffsetMs(wall - 9 * 3600e3, tz);
    utc = wall - tzOffsetMs(utc, tz);
    return utc;
  }

  // ---------- 절기 ----------
  const jieCache = {};
  function jieListAround(utcMs) {
    // UTC+8 날짜 기준 앞뒤 테이블을 합쳐 정렬된 절(節) 리스트
    const out = [];
    const seen = new Set();
    for (const off of [-50, 0, 50]) {
      const t = new Date(utcMs + 8 * 3600e3 + off * 86400e3);
      const key = t.getUTCFullYear() + '-' + t.getUTCMonth();
      let table = jieCache[key];
      if (!table) {
        const lunar = Solar.fromYmd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()).getLunar();
        const raw = lunar.getJieQiTable();
        table = [];
        for (const name in raw) {
          if (!(name in JIE_MAP)) continue;
          const s = raw[name];
          const ms = Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond()) - 8 * 3600e3;
          table.push({ branch: JIE_MAP[name], ms });
        }
        jieCache[key] = table;
      }
      for (const j of table) {
        const k = j.ms;
        if (!seen.has(k)) { seen.add(k); out.push(j); }
      }
    }
    out.sort((a, b) => a.ms - b.ms);
    return out;
  }

  function jdn(y, m, d) {
    const a = Math.floor((14 - m) / 12);
    const yy = y + 4800 - a;
    const mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }
  const dayGzIndex = (y, m, d) => mod(jdn(y, m, d) + 49, 60);

  // ---------- 메인 계산 ----------
  /**
   * opts: { calendar:'solar'|'lunar', leap:bool, y,m,d, h,mi (null=시간 모름), gender:'M'|'F',
   *         lon:number, tz:'Asia/Seoul', solarCorrect:bool, ziMode:'midnight'|'zi23', name }
   */
  function compute(opts) {
    let { y, m, d } = opts;
    const timeKnown = opts.h !== null && opts.h !== undefined && opts.h !== '';
    const h = timeKnown ? +opts.h : 12;
    const mi = timeKnown ? +opts.mi : 0;
    const tz = opts.tz || 'Asia/Seoul';
    const notes = [];

    let lunarInfo;
    if (opts.calendar === 'lunar') {
      const leapMonth = LunarYear.fromYear(y).getLeapMonth();
      if (opts.leap && leapMonth !== m) throw new Error(`${y}년에는 윤${m}월이 없습니다.` + (leapMonth ? ` (이 해의 윤달은 ${leapMonth}월)` : ''));
      const lunar = Lunar.fromYmd(y, opts.leap ? -m : m, d);
      const s = lunar.getSolar();
      lunarInfo = { y, m, d, leap: !!opts.leap };
      y = s.getYear(); m = s.getMonth(); d = s.getDay();
    } else {
      const l = Solar.fromYmd(y, m, d).getLunar();
      lunarInfo = { y: l.getYear(), m: Math.abs(l.getMonth()), d: l.getDay(), leap: l.getMonth() < 0 };
    }

    const utc = wallToUtc(y, m, d, h, mi, tz);
    const offset = tzOffsetMs(utc, tz);
    const stdOffset = Math.min(tzOffsetMs(Date.UTC(y, 0, 15, 3), tz), tzOffsetMs(Date.UTC(y, 6, 15, 3), tz));
    const dstMin = Math.round((offset - stdOffset) / 60000);
    if (timeKnown && dstMin > 0) notes.push(`출생 시각이 서머타임 기간이라 ${dstMin}분을 빼서 계산했습니다.`);
    if (timeKnown && stdOffset !== 9 * 3600e3) notes.push(`당시 한국 표준시는 UTC+${stdOffset / 3600e3}였습니다(현재와 다름). 이를 반영했습니다.`);

    // 평균태양시(경도 보정) 또는 표준시
    const corrMs = opts.solarCorrect ? opts.lon * 240000 : stdOffset;
    const lmt = new Date(utc + corrMs);
    const solarCorrectMin = Math.round((corrMs - offset) / 60000);
    const L = { y: lmt.getUTCFullYear(), m: lmt.getUTCMonth() + 1, d: lmt.getUTCDate(), h: lmt.getUTCHours(), mi: lmt.getUTCMinutes() };

    // 연주·월주 (절기 시각과 실제 순간 비교)
    const jies = jieListAround(utc);
    let prev = null, next = null;
    for (const j of jies) {
      if (j.ms <= utc) prev = j; else { next = j; break; }
    }
    // 입춘 기준 연도
    const yearLC = jies.filter(j => j.branch === 2);
    let lcYear = y;
    const lcThis = yearLC.find(j => new Date(j.ms + 8 * 3600e3).getUTCFullYear() === y);
    if (lcThis && utc < lcThis.ms) lcYear = y - 1;
    const yearIdx = mod(lcYear - 4, 60);
    const yearGz = gzOf(yearIdx);
    const monthBranch = prev.branch;
    const firstMonthStem = mod((yearGz.s % 5) * 2 + 2, 10);
    const monthStem = mod(firstMonthStem + mod(monthBranch - 2, 12), 10);
    const monthGz = gzOf(gzIndex(monthStem, monthBranch));

    // 일주
    let dayDate = new Date(Date.UTC(L.y, L.m - 1, L.d));
    const lateZi = timeKnown && L.h >= 23;
    if (lateZi && opts.ziMode === 'zi23') dayDate = new Date(dayDate.getTime() + 86400e3);
    const dayGz = gzOf(dayGzIndex(dayDate.getUTCFullYear(), dayDate.getUTCMonth() + 1, dayDate.getUTCDate()));
    if (lateZi) {
      notes.push(opts.ziMode === 'zi23'
        ? '23시 이후(자시) 출생: 자시부터 다음 날로 보는 방식으로 일주를 잡았습니다.'
        : '23시~24시(야자시) 출생: 일주는 당일, 시주는 다음 날 자시 기준으로 잡았습니다. 설정에서 바꿀 수 있습니다.');
    }

    // 시주
    let hourGz = null;
    if (timeKnown) {
      const minutes = L.h * 60 + L.mi;
      const hb = Math.floor(mod(minutes + 60, 1440) / 120);
      const baseDayStem = lateZi ? (opts.ziMode === 'zi23' ? dayGz.s : mod(dayGz.s + 1, 10)) : dayGz.s;
      const hs = mod((baseDayStem % 5) * 2 + hb, 10);
      hourGz = gzOf(gzIndex(hs, hb));
    }

    const ds = dayGz.s;
    const dayEl = STEM_EL[ds];
    const pillars = [
      { key: 'hour', label: '시주', gz: hourGz },
      { key: 'day', label: '일주', gz: dayGz },
      { key: 'month', label: '월주', gz: monthGz },
      { key: 'year', label: '연주', gz: yearGz },
    ].map(p => {
      if (!p.gz) return { ...p, empty: true };
      const { s, b } = p.gz;
      return {
        ...p,
        stem: s, branch: b,
        stemSipsin: p.key === 'day' ? null : sipsin(ds, s),
        branchSipsin: sipsin(ds, BR_MAIN[b]),
        jijanggan: JIJANGGAN[b].map(x => x === null ? null : { stem: x, sipsin: sipsin(ds, x) }),
        unseong: unseong(ds, b),
        selfUnseong: unseong(s, b),
        nayin: NAYIN[Math.floor(p.gz.idx / 2)],
        sinsal12Year: sinsal12(yearGz.b, b),
        sinsal12Day: sinsal12(dayGz.b, b),
      };
    });

    // 오행 분포 (겉 8글자)
    const elCount = [0, 0, 0, 0, 0];
    const elWeighted = [0, 0, 0, 0, 0];
    const groupCount = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
    const sipsinCount = Array(10).fill(0);
    for (const p of pillars) {
      if (p.empty) continue;
      elCount[STEM_EL[p.stem]]++;
      elCount[BR_EL[p.branch]]++;
      elWeighted[STEM_EL[p.stem]] += 1;
      const jj = JIJANGGAN[p.branch];
      const parts = jj[1] === null ? [[jj[0], 0.3], [jj[2], 0.7]] : [[jj[0], 0.2], [jj[1], 0.2], [jj[2], 0.6]];
      for (const [st, w] of parts) elWeighted[STEM_EL[st]] += w * (p.key === 'month' ? 1.5 : 1);
      if (p.key !== 'day') { sipsinCount[p.stemSipsin]++; groupCount[SIPSIN_GROUP[p.stemSipsin]]++; }
      sipsinCount[p.branchSipsin]++; groupCount[SIPSIN_GROUP[p.branchSipsin]]++;
    }

    const strength = calcStrength(pillars, ds);
    const yongsin = applyYongBasis(calcYongsin(strength, groupCount, dayEl, monthGz.b, elCount), elWeighted, dayEl, opts.yongBasis);
    const gyeok = calcGyeok(pillars, ds, monthGz.b);
    const relations = calcRelations(pillars);
    const sinsal = calcSinsal(pillars, ds, yearGz, dayGz);
    const gongmang = (() => { const b0 = mod(dayGz.idx - (dayGz.idx % 10), 12); return [mod(b0 + 10, 12), mod(b0 + 11, 12)]; })();

    // 대운
    const forward = (yearGz.s % 2 === 0) === (opts.gender === 'M');
    const target = forward ? next : prev;
    const days = Math.abs(target.ms - utc) / 86400e3;
    const startAgeF = days / 3;
    const daeunNum = Math.max(1, Math.round(startAgeF));
    const daeun = [];
    for (let i = 1; i <= 10; i++) {
      const idx = mod(monthGz.idx + (forward ? i : -i), 60);
      const g = gzOf(idx);
      const age = daeunNum + (i - 1) * 10;
      daeun.push({
        idx, s: g.s, b: g.b, age, startYear: y + age,
        stemSipsin: sipsin(ds, g.s), branchSipsin: sipsin(ds, BR_MAIN[g.b]),
        unseong: unseong(ds, g.b),
        rating: rateLuck(g.s, g.b, yongsin),
      });
    }

    // 세운 (올해 기준 -1 ~ +9)
    const nowY = new Date().getFullYear();
    const seun = [];
    for (let yy = nowY - 1; yy <= nowY + 9; yy++) {
      const g = gzOf(mod(yy - 4, 60));
      seun.push({
        year: yy, idx: g.idx, s: g.s, b: g.b, age: yy - y,
        stemSipsin: sipsin(ds, g.s), branchSipsin: sipsin(ds, BR_MAIN[g.b]),
        rating: rateLuck(g.s, g.b, yongsin),
        hits: luckHits(g.s, g.b, pillars),
      });
    }
    const curAge = nowY - y;
    const curDaeun = daeun.filter(dd => dd.age <= curAge).pop() || null;

    return {
      input: opts, timeKnown, notes,
      solar: { y, m, d, h: timeKnown ? h : null, mi: timeKnown ? mi : null },
      lunar: lunarInfo,
      lmt: L, solarCorrectMin,
      jie: {
        prevName: JIE_NAME_K[prev.branch], prevMs: prev.ms,
        nextName: JIE_NAME_K[next.branch], nextMs: next.ms,
        sincePrevDays: (utc - prev.ms) / 86400e3, toNextDays: (next.ms - utc) / 86400e3,
      },
      pillars, dayStem: ds, dayEl,
      elCount, elWeighted, groupCount, sipsinCount,
      strength, yongsin, gyeok, relations, sinsal, gongmang,
      daeun: { forward, startAgeF, daeunNum, list: daeun, current: curDaeun },
      seun, curAge, nowY,
    };
  }

  function sinsal12(baseBranch, b) {
    const g = { 0: 8, 1: 5, 2: 2, 3: 11 }[baseBranch % 4];
    return mod(b - (g - 3), 12);
  }

  // 신강·신약 (점수식 근사)
  function calcStrength(pillars, ds) {
    const W = { 'year-s': 10, 'year-b': 10, 'month-s': 10, 'month-b': 30, 'day-b': 15, 'hour-s': 10, 'hour-b': 10 };
    const dayEl = STEM_EL[ds];
    let total = 0, support = 0;
    const isSupport = el => { const g = groupOfElement(dayEl, el); return g === '비겁' || g === '인성'; };
    const flags = {};
    for (const p of pillars) {
      if (p.empty) continue;
      if (p.key !== 'day') { const w = W[p.key + '-s']; total += w; if (isSupport(STEM_EL[p.stem])) support += w; }
      const wb = W[p.key + '-b'];
      // 지지는 지장간 비율로
      const jj = JIJANGGAN[p.branch];
      const parts = jj[1] === null ? [[jj[0], 0.3], [jj[2], 0.7]] : [[jj[0], 0.2], [jj[1], 0.2], [jj[2], 0.6]];
      total += wb;
      for (const [st, r] of parts) if (isSupport(STEM_EL[st])) support += wb * r;
    }
    const month = pillars.find(p => p.key === 'month');
    const day = pillars.find(p => p.key === 'day');
    flags.deukryeong = isSupport(BR_EL[month.branch]);
    flags.deukji = isSupport(BR_EL[day.branch]);
    const others = pillars.filter(p => !p.empty);
    let cnt = 0, sup = 0;
    for (const p of others) {
      if (p.key !== 'day') { cnt++; if (isSupport(STEM_EL[p.stem])) sup++; }
      if (p.key !== 'month' && p.key !== 'day') { cnt++; if (isSupport(BR_EL[p.branch])) sup++; }
    }
    flags.deukse = sup >= cnt / 2;
    const score = Math.round(support / total * 100);
    let level, label;
    if (score >= 70) { level = 3; label = '극신강'; }
    else if (score >= 56) { level = 2; label = '신강'; }
    else if (score >= 46) { level = 1; label = '중화(약간 강)'; }
    else if (score >= 36) { level = -1; label = '중화(약간 약)'; }
    else if (score >= 22) { level = -2; label = '신약'; }
    else { level = -3; label = '극신약'; }
    return { score, level, label, ...flags };
  }

  function calcYongsin(st, gc, dayEl, monthBranch, elCount) {
    const E = g => elementOfGroup(dayEl, g);
    let yong, reason;
    const strong = st.level > 0;
    if (st.level === 3 && gc['비겁'] + gc['인성'] >= 6) {
      // 종왕/종강 가능성: 강한 기운을 따르는 쪽
      yong = gc['인성'] > gc['비겁'] ? '인성' : '비겁';
      reason = '기운이 한쪽으로 매우 쏠려 있어(종격 가능성) 억누르기보다 강한 흐름을 따르는 쪽을 먼저 검토합니다. 종격 여부는 전문가 확인을 권합니다.';
    } else if (strong) {
      if (gc['비겁'] >= gc['인성'] + 1) { yong = '관성'; reason = '비겁(나와 같은 기운)이 많아 강하므로, 나를 다스리는 관성으로 균형을 잡습니다.'; }
      else if (gc['인성'] >= gc['비겁'] + 1) { yong = '재성'; reason = '인성(나를 돕는 기운)이 과해서 강하므로, 인성을 제어하는 재성으로 균형을 잡습니다.'; }
      else { yong = '식상'; reason = '스스로 힘이 넉넉하므로, 힘을 밖으로 풀어내는 식상(표현·활동)이 순하게 기운을 빼 줍니다.'; }
    } else {
      if (gc['관성'] >= Math.max(gc['재성'], gc['식상'])) { yong = '인성'; reason = '관성(압박·책임)이 나를 누르므로, 관성의 힘을 받아 나에게 넘겨 주는 인성이 필요합니다(살인상생).'; }
      else if (gc['재성'] >= gc['식상']) { yong = '비겁'; reason = '재성(재물·현실 과제)이 많아 감당이 버거우므로, 나와 같은 기운인 비겁이 힘을 보태야 합니다.'; }
      else { yong = '인성'; reason = '식상으로 기운이 많이 새어 나가므로, 인성으로 나를 채우고 식상을 조절합니다.'; }
    }
    const yongEl = E(yong);
    const huiEl = mod(yongEl - 1, 5);       // 용신을 생하는 오행
    const giEl = mod(yongEl - 2, 5);        // 용신을 극하는 오행
    const guEl = mod(giEl - 1, 5);          // 기신을 생하는 오행
    // 조후
    let johu = null;
    if ([5, 6, 7].includes(monthBranch)) johu = { el: 4, text: '여름(사·오·미월) 생이라 더운 기운이 강합니다. 수(水)로 열을 식혀 주는 조후가 중요합니다.' };
    else if ([11, 0, 1].includes(monthBranch)) johu = { el: 1, text: '겨울(해·자·축월) 생이라 차가운 기운이 강합니다. 화(火)로 따뜻하게 해 주는 조후가 중요합니다.' };
    else if (monthBranch === 2) johu = { el: 1, text: '초봄(인월)은 아직 쌀쌀해 화(火)가 있으면 좋습니다.' };
    else if (monthBranch === 8 || monthBranch === 9) johu = { el: null, text: '가을(신·유월)은 건조하고 숙살 기운이 강해, 수(水)로 윤택하게 하거나 화(火)로 다듬는 쪽을 함께 봅니다.' };
    const missing = elCount.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0);
    return { yong, yongEl, huiEl, giEl, guEl, reason, johu, missing, strong };
  }

  function calcGyeok(pillars, ds, mb) {
    // 월지 정기·중기·여기 중 천간에 투출한 것 우선, 없으면 정기
    const stems = pillars.filter(p => !p.empty && p.key !== 'day').map(p => p.stem);
    const jj = JIJANGGAN[mb];
    let chosen = null, how = '';
    for (const x of [jj[2], jj[1], jj[0]]) {
      if (x !== null && stems.includes(x)) { chosen = x; how = '투출'; break; }
    }
    if (chosen === null) { chosen = jj[2]; how = '정기'; }
    let ss = sipsin(ds, chosen);
    let name;
    if (ss === 0) name = '건록격';
    else if (ss === 1) name = ds % 2 === 0 ? '양인격' : '월겁격';
    else name = SIPSIN[ss] + '격';
    return { name, sipsin: ss, stem: chosen, how };
  }

  const POS_NAME = { year: '연', month: '월', day: '일', hour: '시' };
  function calcRelations(pillars) {
    const ps = pillars.filter(p => !p.empty);
    const out = [];
    const stemHe = { '0-5': '토', '1-6': '금', '2-7': '수', '3-8': '목', '4-9': '화' };
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const A = ps[i], B = ps[j];
      const a = A.stem, b = B.stem;
      const k = Math.min(a, b) + '-' + Math.max(a, b);
      const where = `${POS_NAME[A.key]}간-${POS_NAME[B.key]}간`;
      const nm = STEM_K[a] + STEM_K[b];
      if (stemHe[k]) out.push({ type: '천간합', where, text: `${nm}합(${stemHe[k]})`, keys: [A.key, B.key] });
      if ([0, 1, 2, 3].includes(Math.min(a, b)) && Math.abs(a - b) === 6) out.push({ type: '천간충', where, text: `${nm}충`, keys: [A.key, B.key] });
      const x = A.branch, y = B.branch;
      const wb = `${POS_NAME[A.key]}지-${POS_NAME[B.key]}지`;
      const bn = BR_K[x] + BR_K[y];
      if (mod(x + y, 12) === 1) out.push({ type: '육합', where: wb, text: `${bn}합`, keys: [A.key, B.key] });
      if (Math.abs(x - y) === 6) out.push({ type: '충', where: wb, text: `${bn}충`, keys: [A.key, B.key] });
      const pair = (p, q) => (x === p && y === q) || (x === q && y === p);
      const hyeong = [[2, 5], [5, 8], [2, 8], [1, 10], [10, 7], [1, 7], [0, 3]];
      if (hyeong.some(([p, q]) => pair(p, q))) out.push({ type: '형', where: wb, text: `${bn}형`, keys: [A.key, B.key] });
      if (x === y && [4, 6, 9, 11].includes(x)) out.push({ type: '형', where: wb, text: `${bn} 자형`, keys: [A.key, B.key] });
      if ([[0, 9], [1, 4], [2, 11], [3, 6], [5, 8], [7, 10]].some(([p, q]) => pair(p, q))) out.push({ type: '파', where: wb, text: `${bn}파`, keys: [A.key, B.key] });
      if ([[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]].some(([p, q]) => pair(p, q))) out.push({ type: '해', where: wb, text: `${bn}해`, keys: [A.key, B.key] });
      if ([[0, 7], [1, 6], [2, 9], [3, 8], [4, 11], [5, 10]].some(([p, q]) => pair(p, q))) out.push({ type: '원진', where: wb, text: `${bn} 원진`, keys: [A.key, B.key] });
      if ([[0, 9], [1, 6], [2, 7], [3, 8], [4, 11], [5, 10]].some(([p, q]) => pair(p, q))) out.push({ type: '귀문', where: wb, text: `${bn} 귀문`, keys: [A.key, B.key] });
    }
    // 삼합 / 반합 / 방합
    const bs = ps.map(p => p.branch);
    const has = b => bs.includes(b);
    const samhap = [[8, 0, 4, '수'], [11, 3, 7, '목'], [2, 6, 10, '화'], [5, 9, 1, '금']];
    for (const [a, w, c, el] of samhap) {
      const n = [a, w, c].filter(has).length;
      const nm = [a, w, c].map(i => BR_K[i]).join('');
      if (n === 3) out.push({ type: '삼합', where: '지지', text: `${nm} 삼합(${el}국)` });
      else if (n === 2 && has(w)) out.push({ type: '반합', where: '지지', text: `${[a, w, c].filter(has).map(i => BR_K[i]).join('')} 반합(${el})` });
    }
    const banghap = [[2, 3, 4, '목'], [5, 6, 7, '화'], [8, 9, 10, '금'], [11, 0, 1, '수']];
    for (const [a, b, c, el] of banghap) if ([a, b, c].every(has)) out.push({ type: '방합', where: '지지', text: `${[a, b, c].map(i => BR_K[i]).join('')} 방합(${el})` });
    return out;
  }

  function calcSinsal(pillars, ds, yearGz, dayGz) {
    const ps = pillars.filter(p => !p.empty);
    const out = [];
    const add = (name, p, base) => out.push({ name, key: p.key, label: `${POS_NAME[p.key]}지 ${BR_K[p.branch]}`, base });
    const cheoneul = [[1, 7], [0, 8], [11, 9], [11, 9], [1, 7], [0, 8], [1, 7], [2, 6], [5, 3], [5, 3]];
    const munchang = [5, 6, 8, 9, 8, 9, 11, 0, 2, 3];
    const yangin = { 0: 3, 2: 6, 4: 6, 6: 9, 8: 0 };
    const geonrok = [2, 3, 5, 6, 5, 6, 8, 9, 11, 0];
    const hongyeom = [6, 6, 2, 7, 4, 4, 10, 9, 0, 8];
    for (const p of ps) {
      if (cheoneul[ds].includes(p.branch)) add('천을귀인', p, '일간');
      if (p.key !== 'day' && cheoneul[yearGz.s].includes(p.branch) && !cheoneul[ds].includes(p.branch)) add('천을귀인', p, '연간');
      if (munchang[ds] === p.branch) add('문창귀인', p, '일간');
      if (yangin[ds] === p.branch) add('양인', p, '일간');
      if (geonrok[ds] === p.branch) add('건록', p, '일간');
      if (hongyeom[ds] === p.branch) add('홍염살', p, '일간');
    }
    // 도화·역마·화개 (연지·일지 기준)
    for (const [base, bb] of [['연지', yearGz.b], ['일지', dayGz.b]]) {
      for (const p of ps) {
        if ((base === '연지' && p.key === 'year') || (base === '일지' && p.key === 'day')) continue;
        const idx = sinsal12(bb, p.branch);
        if (idx === 4) add('도화살', p, base);
        if (idx === 9) add('역마살', p, base);
        if (idx === 11) add('화개살', p, base);
      }
    }
    const baekho = ['甲辰', '乙未', '丙戌', '丁丑', '戊辰', '壬戌', '癸丑'];
    const goegang = ['庚辰', '庚戌', '壬辰', '壬戌', '戊戌'];
    for (const p of ps) {
      const gz = STEM_H[p.stem] + BR_H[p.branch];
      if (baekho.includes(gz)) out.push({ name: '백호대살', key: p.key, label: `${POS_NAME[p.key]}주 ${STEM_K[p.stem]}${BR_K[p.branch]}` });
      if (p.key === 'day' && goegang.includes(gz)) out.push({ name: '괴강살', key: p.key, label: `일주 ${STEM_K[p.stem]}${BR_K[p.branch]}` });
    }
    // 중복 제거
    const seen = new Set();
    return out.filter(o => { const k = o.name + o.key; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  // 용신 기준: 억부(기본) · 조후 · 통관. 고른 기준이 해당 없으면 억부로 돌아간다.
  const BASIS_LABEL = { eokbu: '억부', johu: '조후', tonggwan: '통관' };
  function calcTonggwan(elWeighted) {
    const total = elWeighted.reduce((a, b) => a + b, 0) || 1;
    const pct = elWeighted.map(v => v / total * 100);
    let best = null;
    for (let a = 0; a < 5; a++) {
      const b = mod(a + 2, 5);              // a가 b를 극한다
      if (pct[a] >= 25 && pct[b] >= 25) {
        const score = Math.min(pct[a], pct[b]);
        if (!best || score > best.score) best = { a, b, el: mod(a + 1, 5), score };
      }
    }
    if (!best) return { el: null, text: '두 기운이 정면으로 크게 부딪치는 구조가 아니라 통관 용신이 필요하지 않습니다.' };
    const K = i => `${EL_K[i]}(${EL_H[i]})`;
    return { el: best.el, a: best.a, b: best.b, text: `${K(best.a)}·${K(best.b)} 두 기운이 모두 강해 정면으로 부딪칩니다(${EL_H[best.a]}剋${EL_H[best.b]}). ${K(best.a)}의 힘을 받아 ${K(best.b)} 쪽으로 넘겨 주는 ${K(best.el)} 기운이 둘 사이를 이어 줍니다.` };
  }
  function applyYongBasis(base, elWeighted, dayEl, basis) {
    const tong = calcTonggwan(elWeighted);
    const candidates = {
      eokbu: { el: base.yongEl, text: base.reason },
      johu: base.johu && base.johu.el !== null
        ? { el: base.johu.el, text: base.johu.text }
        : { el: null, text: base.johu ? base.johu.text + ' 한 가지 오행으로 정하기 어려워 조후 용신을 따로 두지 않습니다.' : '봄·가을 환절기처럼 덥거나 춥지 않은 계절이라 조후가 크게 필요하지 않습니다.' },
      tonggwan: tong,
    };
    const want = BASIS_LABEL[basis] ? basis : 'eokbu';
    const used = candidates[want].el === null ? 'eokbu' : want;
    const yongEl = candidates[used].el;
    const giEl = mod(yongEl - 2, 5);
    return {
      ...base,
      yong: ['비겁', '식상', '재성', '관성', '인성'][mod(yongEl - dayEl, 5)],
      yongEl, huiEl: mod(yongEl - 1, 5), giEl, guEl: mod(giEl - 1, 5),
      reason: candidates[used].text,
      basis: used, basisLabel: BASIS_LABEL[used], wanted: want,
      fallback: used !== want ? `${BASIS_LABEL[want]} 기준은 이 사주에 해당하지 않아 억부 기준으로 보여 줍니다. ${candidates[want].text}` : '',
      candidates,
    };
  }

  function rateLuck(s, b, ys) {
    const sc = el => el === ys.yongEl ? 2 : el === ys.huiEl ? 1 : el === ys.giEl ? -2 : el === ys.guEl ? -1 : 0;
    const v = sc(STEM_EL[s]) + sc(BR_EL[b]) * 1.2;
    let label, cls;
    if (v >= 2.4) { label = '매우 유리'; cls = 'g2'; }
    else if (v >= 0.9) { label = '유리'; cls = 'g1'; }
    else if (v > -0.9) { label = '보통'; cls = 'g0'; }
    else if (v > -2.4) { label = '주의'; cls = 'b1'; }
    else { label = '조심'; cls = 'b2'; }
    return { v: Math.round(v * 10) / 10, label, cls };
  }

  function luckHits(s, b, pillars) {
    const hits = [];
    for (const p of pillars) {
      if (p.empty) continue;
      if (Math.abs(p.branch - b) === 6) hits.push(`${POS_NAME[p.key]}지 충`);
      else if (mod(p.branch + b, 12) === 1) hits.push(`${POS_NAME[p.key]}지 합`);
      if (Math.abs(p.stem - s) === 5) hits.push(`${POS_NAME[p.key]}간 합`);
    }
    return hits;
  }

  // ---------- 일진(그날의 간지) 운세 ----------
  // 지금 이 순간(UTC ms)의 연주·월주 — 절기 입절 시각 기준
  function yearMonthAt(utc) {
    const jies = jieListAround(utc);
    let prev = null;
    for (const j of jies) { if (j.ms <= utc) prev = j; else break; }
    const kstY = new Date(utc + 9 * 3600e3).getUTCFullYear();
    const lc = jies.find(j => j.branch === 2 && new Date(j.ms + 8 * 3600e3).getUTCFullYear() === kstY);
    const beforeLc = lc ? utc < lc.ms : new Date(utc + 9 * 3600e3).getUTCMonth() === 0;
    const yearGz = gzOf(mod((beforeLc ? kstY - 1 : kstY) - 4, 60));
    const ms = mod((yearGz.s % 5) * 2 + 2 + mod(prev.branch - 2, 12), 10);
    return { year: yearGz, month: gzOf(gzIndex(ms, prev.branch)) };
  }

  const CHEONEUL = [[1, 7], [0, 8], [11, 9], [11, 9], [1, 7], [0, 8], [1, 7], [2, 6], [5, 3], [5, 3]];
  // 운의 간지(s,b)가 원국과 맺는 작용. good: 길한 작용, bad: 조심할 작용
  function dayHits(s, b, pillars, ds) {
    const out = [];
    const pair = (x, p, q) => (x === p && b === q) || (x === q && b === p);
    for (const p of pillars) {
      if (p.empty) continue;
      const x = p.branch, pos = p.key;
      if (Math.abs(x - b) === 6) out.push({ type: '충', pos, bad: true });
      if (mod(x + b, 12) === 1) out.push({ type: '육합', pos, good: true });
      if ([[2, 5], [5, 8], [2, 8], [1, 10], [10, 7], [1, 7], [0, 3]].some(([u, v]) => pair(x, u, v)) || (x === b && [4, 6, 9, 11].includes(b))) out.push({ type: '형', pos, bad: true });
      if (pos === 'day' && [[0, 7], [1, 6], [2, 9], [3, 8], [4, 11], [5, 10]].some(([u, v]) => pair(x, u, v))) out.push({ type: '원진', pos, bad: true });
      if (p.key !== 'day' && Math.abs(p.stem - s) === 5) out.push({ type: '천간합', pos, good: true });
      if (p.key === 'day' && Math.abs(ds - s) === 5) out.push({ type: '천간합', pos, good: true });
    }
    if (CHEONEUL[ds].includes(b)) out.push({ type: '천을귀인', pos: null, good: true });
    return out;
  }

  function rateDay(v) {
    if (v >= 2.4) return { label: '매우 좋음', cls: 'g2' };
    if (v >= 0.9) return { label: '좋음', cls: 'g1' };
    if (v > -0.9) return { label: '보통', cls: 'g0' };
    if (v > -2.4) return { label: '주의', cls: 'b1' };
    return { label: '조심', cls: 'b2' };
  }

  /** r: compute() 결과, (y,m,d): 한국 날짜 */
  function dayLuck(r, y, m, d) {
    const g = gzOf(dayGzIndex(y, m, d));
    const ds = r.dayStem;
    const base = rateLuck(g.s, g.b, r.yongsin);
    const hits = dayHits(g.s, g.b, r.pillars, ds);
    let adj = 0;
    for (const h of hits) {
      if (h.type === '충') adj -= h.pos === 'day' ? 1.2 : 0.6;
      else if (h.type === '형' || h.type === '원진') adj -= h.pos === 'day' ? 0.6 : 0.3;
      else if (h.type === '천을귀인') adj += 0.8;
      else if (h.good) adj += 0.3;
    }
    const v = Math.round((base.v + adj) * 10) / 10;
    return {
      y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
      idx: g.idx, s: g.s, b: g.b,
      stemSipsin: sipsin(ds, g.s), branchSipsin: sipsin(ds, BR_MAIN[g.b]),
      unseong: unseong(ds, g.b), hits, base: base.v, v, rating: rateDay(v),
    };
  }

  function monthLuck(r, utc) {
    const { month } = yearMonthAt(utc);
    return {
      s: month.s, b: month.b, stemSipsin: sipsin(r.dayStem, month.s), branchSipsin: sipsin(r.dayStem, BR_MAIN[month.b]),
      rating: rateLuck(month.s, month.b, r.yongsin), hits: dayHits(month.s, month.b, r.pillars, r.dayStem),
    };
  }

  global.Saju = {
    compute, dayLuck, monthLuck, STEM_H, STEM_K, BR_H, BR_K, BR_ANIMAL, EL_K, EL_H, STEM_EL, BR_EL, SIPSIN, SIPSIN_GROUP,
    UNSEONG, SINSAL12, BR_MAIN, groupOfElement, elementOfGroup, mod,
  };
})(typeof window !== 'undefined' ? window : this);
