(function () {
  'use strict';
  const S = window.Saju, I = window.Interp;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CITIES = [
    ['서울', 126.98], ['인천', 126.71], ['수원', 127.03], ['춘천', 127.73], ['강릉', 128.90], ['청주', 127.49],
    ['대전', 127.38], ['전주', 127.15], ['광주', 126.85], ['목포', 126.39], ['대구', 128.60], ['포항', 129.37],
    ['울산', 129.31], ['부산', 129.08], ['창원', 128.68], ['진주', 128.11], ['제주', 126.53], ['직접 입력', null],
  ];
  const elOfStem = s => S.STEM_EL[s], elOfBr = b => S.BR_EL[b];
  const ELN = i => `${S.EL_K[i]}(${S.EL_H[i]})`;
  const SS = i => S.SIPSIN[i];

  // ---------- 폼 ----------
  const city = $('#city');
  city.innerHTML = CITIES.map(([n, l], i) => `<option value="${i}">${n}${l ? ` (${l}°E)` : ''}</option>`).join('');
  city.onchange = () => { const c = CITIES[city.value]; if (c[1] !== null) $('#lon').value = c[1]; else $('#lon').focus(); };

  function seg(id) {
    const el = $('#' + id);
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if (id === 'calendar') $('#leapWrap').hidden = b.dataset.v !== 'lunar';
    });
    return () => el.querySelector('.on').dataset.v;
  }
  const getGender = seg('gender'), getCal = seg('calendar'), getZi = seg('ziMode');
  const setSeg = (id, v) => $('#' + id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === v));
  $('#noTime').onchange = e => { $('#time').disabled = e.target.checked; };

  // 테마
  const root = document.documentElement;
  try { const t = localStorage.getItem('theme'); if (t) root.dataset.theme = t; } catch (e) { }
  $('#themeBtn').onclick = () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) { }
  };

  function parseDate(s) {
    const d = s.replace(/[^0-9]/g, '');
    if (d.length !== 8) throw new Error('생년월일을 8자리로 입력해 주세요. 예: 19900515');
    const y = +d.slice(0, 4), m = +d.slice(4, 6), dd = +d.slice(6, 8);
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || dd < 1 || dd > 31) throw new Error('날짜 범위를 확인해 주세요 (1900~2100년).');
    return { y, m, d: dd };
  }
  function parseTime(s) {
    const t = s.replace(/[^0-9]/g, '');
    if (!t) return null;
    let h, mi;
    if (t.length <= 2) { h = +t; mi = 0; } else { h = +t.slice(0, t.length - 2); mi = +t.slice(-2); }
    if (h > 23 || mi > 59) throw new Error('시각을 확인해 주세요. 예: 1430 (오후 2시 30분)');
    return { h, mi };
  }

  let current = null;
  $('#form').addEventListener('submit', e => {
    e.preventDefault();
    $('#err').hidden = true;
    try {
      const dt = parseDate($('#date').value);
      const tm = $('#noTime').checked ? null : parseTime($('#time').value);
      if (!$('#noTime').checked && !tm) throw new Error('태어난 시각을 입력하거나 "시간 모름"을 체크해 주세요.');
      if (getCal() === 'solar') {
        const chk = new Date(Date.UTC(dt.y, dt.m - 1, dt.d));
        if (chk.getUTCMonth() !== dt.m - 1) throw new Error('존재하지 않는 날짜입니다.');
      }
      const opts = {
        name: $('#name').value.trim(), gender: getGender(), calendar: getCal(), leap: $('#leap').checked,
        y: dt.y, m: dt.m, d: dt.d, h: tm ? tm.h : null, mi: tm ? tm.mi : null,
        lon: parseFloat($('#lon').value) || 126.98, tz: 'Asia/Seoul',
        solarCorrect: $('#solarCorrect').checked, ziMode: getZi(), cityIdx: +city.value,
        dateRaw: $('#date').value, timeRaw: $('#time').value, noTime: $('#noTime').checked,
      };
      const t0 = performance.now();
      current = S.compute(opts);
      render(current);
      current.ms = performance.now() - t0;
      $('#calcMs').textContent = current.ms.toFixed(1);
      try { localStorage.setItem('lastInput', JSON.stringify(opts)); } catch (er) { }
      $('#result').hidden = false;
      $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (er) {
      $('#err').textContent = er.message || String(er);
      $('#err').hidden = false;
      console.error(er);
    }
  });

  // 마지막 입력 복원
  try {
    const o = JSON.parse(localStorage.getItem('lastInput') || 'null');
    if (o) {
      $('#name').value = o.name || ''; $('#date').value = o.dateRaw || ''; $('#time').value = o.timeRaw || '';
      $('#noTime').checked = !!o.noTime; $('#time').disabled = !!o.noTime;
      setSeg('gender', o.gender); setSeg('calendar', o.calendar); setSeg('ziMode', o.ziMode);
      $('#leapWrap').hidden = o.calendar !== 'lunar'; $('#leap').checked = !!o.leap;
      if (o.cityIdx !== undefined) city.value = o.cityIdx; $('#lon').value = o.lon;
      $('#solarCorrect').checked = o.solarCorrect !== false;
    }
  } catch (e) { }

  // URL 파라미터로 바로 보기: ?d=19900515&t=1430&g=F&c=lunar&leap=1&n=이름
  (() => {
    const q = new URLSearchParams(location.search);
    if (!q.get('d')) return;
    $('#date').value = q.get('d');
    $('#time').value = q.get('t') || '';
    $('#noTime').checked = !q.get('t'); $('#time').disabled = !q.get('t');
    $('#name').value = q.get('n') || '';
    setSeg('gender', q.get('g') === 'F' ? 'F' : 'M');
    setSeg('calendar', q.get('c') === 'lunar' ? 'lunar' : 'solar');
    $('#leapWrap').hidden = q.get('c') !== 'lunar'; $('#leap').checked = q.get('leap') === '1';
    setTimeout(() => $('#form').requestSubmit(), 0);
  })();

  // ---------- 렌더 ----------
  function render(r) {
    renderSummary(r); renderChart(r); renderElements(r); renderBalance(r); renderGuide(r);
    renderRelations(r); renderSinsal(r); renderDaeun(r); renderSeun(r);
    $('#aiOut').innerHTML = '';
  }

  const pad = n => String(n).padStart(2, '0');
  function fmtKst(ms) { const d = new Date(ms + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; }

  function renderSummary(r) {
    const o = r.input, yp = r.pillars.find(p => p.key === 'year'), dp = r.pillars.find(p => p.key === 'day');
    const sol = `${r.solar.y}년 ${r.solar.m}월 ${r.solar.d}일`;
    const lun = `${r.lunar.y}년 ${r.lunar.leap ? '윤' : ''}${r.lunar.m}월 ${r.lunar.d}일`;
    const time = r.timeKnown ? `${pad(r.solar.h)}:${pad(r.solar.mi)}` : '모름';
    const corr = r.timeKnown ? `${pad(r.lmt.h)}:${pad(r.lmt.mi)} (${r.solarCorrectMin >= 0 ? '+' : ''}${r.solarCorrectMin}분)` : '—';
    $('#summary').innerHTML = `
      <div class="sum-head">
        <span class="nm">${esc(o.name || '이름 없음')}</span>
        <span class="muted">${o.gender === 'M' ? '남' : '여'} · ${S.STEM_K[yp.stem]}${S.BR_K[yp.branch]}년생 ${S.BR_ANIMAL[yp.branch]}띠 · 일주 <b class="t${elOfStem(dp.stem)}">${S.STEM_K[dp.stem]}${S.BR_K[dp.branch]}(${S.STEM_H[dp.stem]}${S.BR_H[dp.branch]})</b></span>
      </div>
      <div class="facts">
        <div><b>양력</b>${sol} ${time}</div>
        <div><b>음력</b>${lun}</div>
        <div><b>보정 시각</b>${corr}</div>
        <div><b>절기</b>${r.jie.prevName} 후 ${r.jie.sincePrevDays.toFixed(1)}일 (${r.jie.prevName} ${fmtKst(r.jie.prevMs)})</div>
        <div><b>다음 절기</b>${r.jie.nextName} ${fmtKst(r.jie.nextMs)}</div>
        <div><b>공망</b>${r.gongmang.map(b => S.BR_K[b] + S.BR_H[b]).join(' ')}</div>
      </div>
      ${r.notes.length ? `<div class="notes">${r.notes.map(n => `<div>${esc(n)}</div>`).join('')}</div>` : ''}
      <p class="muted small" style="margin:8px 0 0">계산 <span id="calcMs"></span>ms</p>`;
  }

  function renderChart(r) {
    const ps = r.pillars;
    const cols = ps.map(p => `<th>${I.PILLAR_POS[p.key].name}<br><span class="small">${p.key === 'day' ? '나·배우자' : I.PILLAR_POS[p.key].theme.split('·')[0]}</span></th>`).join('');
    const row = (label, f) => `<tr><td class="rowlabel">${label}</td>${ps.map(p => p.empty ? '<td class="muted">—</td>' : `<td>${f(p)}</td>`).join('')}</tr>`;
    const gzCell = (p, isStem) => {
      if (p.empty) return `<td><div class="gz empty">시간<br>모름</div></td>`;
      const ch = isStem ? p.stem : p.branch, el = isStem ? elOfStem(ch) : elOfBr(ch);
      const yin = isStem ? ch % 2 : [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1][ch];
      return `<td><div class="gz e${el} ${isStem && p.key === 'day' ? 'me' : ''}">${isStem ? S.STEM_H[ch] : S.BR_H[ch]}<small>${isStem ? S.STEM_K[ch] : S.BR_K[ch]} · ${yin ? '음' : '양'}${S.EL_K[el]}</small></div></td>`;
    };
    $('#chart').innerHTML = `<table class="chart">
      <tr><td class="rowlabel"></td>${cols}</tr>
      ${row('십신', p => `<span class="ss">${p.key === 'day' ? '일간(나)' : SS(p.stemSipsin)}</span>`)}
      <tr><td class="rowlabel">천간</td>${ps.map(p => gzCell(p, true)).join('')}</tr>
      <tr><td class="rowlabel">지지</td>${ps.map(p => gzCell(p, false)).join('')}</tr>
      ${row('십신', p => `<span class="ss">${SS(p.branchSipsin)}</span>`)}
      ${row('지장간', p => `<div class="jj">${p.jijanggan.filter(Boolean).map(j => `<span class="t${elOfStem(j.stem)}">${S.STEM_H[j.stem]}<em>${SS(j.sipsin)}</em></span>`).join('')}</div>`)}
      ${row('12운성', p => S.UNSEONG[p.unseong])}
      ${row('12신살', p => S.SINSAL12[p.sinsal12Year].replace('(도화)', ''))}
      ${row('납음', p => p.nayin)}
    </table>
    <p class="muted small" style="margin:10px 0 0">12운성은 일간 기준(봉법), 12신살은 연지 기준입니다. 일간 테두리 칸이 '나'입니다.</p>`;
  }

  function renderElements(r) {
    const total = r.elCount.reduce((a, b) => a + b, 0);
    const wt = r.elWeighted.reduce((a, b) => a + b, 0);
    const bars = r.elCount.map((c, i) => {
      const pct = Math.round(r.elWeighted[i] / wt * 100);
      return `<div class="bar"><span class="t${i}"><b>${ELN(i)}</b></span><div class="track"><div class="fill f${i}" style="width:${pct}%"></div></div><span class="v">${c}개 · ${pct}%</span></div>`;
    }).join('');
    const groups = ['비겁', '식상', '재성', '관성', '인성'];
    const gmax = Math.max(1, ...groups.map(g => r.groupCount[g]));
    const gbars = groups.map(g => {
      const el = S.elementOfGroup(r.dayEl, g);
      return `<div class="bar"><span><b>${g}</b></span><div class="track"><div class="fill f${el}" style="width:${r.groupCount[g] / gmax * 100}%"></div></div><span class="v">${r.groupCount[g]}개 · ${S.EL_K[el]}</span></div>`;
    }).join('');
    const many = r.elCount.map((c, i) => c >= 3 ? `<p><b class="t${i}">${ELN(i)} 많음(${c})</b> — ${I.OHAENG[i].many}</p>` : '').join('');
    const few = r.elCount.map((c, i) => c === 0 ? `<p><b class="t${i}">${ELN(i)} 없음</b> — ${I.OHAENG[i].few}</p>` : '').join('');
    $('#elements').innerHTML = `${bars}
      <p class="muted small">개수는 겉으로 드러난 ${total}글자 기준, %는 지장간·월령 가중치를 반영한 실제 세력입니다.</p>
      <h3>십신 그룹 (일간 제외)</h3>${gbars}
      <div class="kv">${many}${few}</div>`;
  }

  function renderBalance(r) {
    const st = r.strength, ys = r.yongsin;
    const chip = (label, el) => `<span class="chip e${el}">${label}<b>${ELN(el)}</b></span>`;
    $('#balance').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:18px">${st.label}</b><span class="muted">지원 세력 ${st.score}%</span></div>
      <div class="meter"><div class="pin" style="left:${Math.min(98, Math.max(2, st.score))}%"></div></div>
      <div class="meter-l"><span>신약</span><span>중화</span><span>신강</span></div>
      <div class="chips">
        <span class="chip">${st.deukryeong ? '✔' : '✕'} 득령(월지)</span>
        <span class="chip">${st.deukji ? '✔' : '✕'} 득지(일지)</span>
        <span class="chip">${st.deukse ? '✔' : '✕'} 득세(나머지)</span>
      </div>
      <div class="chips">${chip('용신 ', ys.yongEl)}${chip('희신 ', ys.huiEl)}${chip('기신 ', ys.giEl)}${chip('구신 ', ys.guEl)}</div>
      <div class="kv">
        <p><b>억부 용신: ${ys.yong}(${ELN(ys.yongEl)})</b> — ${ys.reason}</p>
        ${ys.johu ? `<p><b>조후</b> — ${ys.johu.text}${ys.johu.el !== null && ys.johu.el !== ys.yongEl ? ` 억부 용신과 별도로 ${ELN(ys.johu.el)}을(를) 보조로 함께 고려하세요.` : ''}</p>` : ''}
        <p class="muted small">용신은 점수식 근사입니다. 종격·화격 등 특수 구조는 판단이 달라질 수 있습니다.</p>
      </div>`;
  }

  function renderGuide(r) {
    const ds = r.dayStem, il = I.ILGAN[ds];
    const day = r.pillars.find(p => p.key === 'day');
    const ys = r.yongsin, st = r.strength;
    const steps = [];

    steps.push(['나의 본질 — 일간 ' + il.name, `
      <p><b>${il.image}</b>의 기운. ${il.desc}</p>
      <p>${il.key.map(k => `<span class="tag">${k}</span>`).join('')}</p>
      <p><b>강점</b> ${il.good}<br><b>약점</b> ${il.weak}</p>
      <p>일간이 일지에서 <b>${S.UNSEONG[day.unseong]}</b>(${I.UNSEONG[S.UNSEONG[day.unseong]]})에 앉아 있습니다.</p>
      <p class="muted">→ 해석의 출발점입니다. 모든 글자는 '이 일간에게 무엇인가'로 읽습니다.</p>`]);

    steps.push(['힘의 균형 — ' + st.label, `
      <p>월지(태어난 계절)에서 ${st.deukryeong ? '힘을 얻었고(득령)' : '힘을 얻지 못했고(실령)'}, 일지에서 ${st.deukji ? '뿌리를 얻었으며(득지)' : '뿌리가 약하며(실지)'}, 나머지 글자에서는 ${st.deukse ? '돕는 세력이 많습니다(득세).' : '돕는 세력이 적습니다(실세).'}</p>
      <p>${st.level > 0
        ? '신강한 사주는 에너지가 넘치므로, 그 힘을 <b>밖으로 쓰는 것(일·재물·성과)</b>에서 운이 열립니다. 남의 도움보다 스스로 책임지고 이끄는 자리가 맞습니다.'
        : '신약한 사주는 섬세하고 협력에 강하므로, <b>나를 받쳐 주는 환경(공부·자격·좋은 동료·조직)</b>을 먼저 갖출 때 운이 열립니다. 혼자 다 짊어지기보다 팀으로 움직이는 것이 유리합니다.'}</p>
      <p class="muted">→ 같은 십신이라도 신강·신약에 따라 길흉이 정반대가 됩니다.</p>`]);

    const yb = I.OHAENG[ys.yongEl];
    steps.push([`해석의 방향 — 용신 ${ELN(ys.yongEl)} · ${ys.yong}`, `
      <p>${ys.reason}</p>
      <p>따라서 이 사주는 <b>${ys.yong}(${I.GROUP[ys.yong].theme})</b>의 영역을 키우는 방향이 좋고, 운에서 <b class="t${ys.yongEl}">${S.EL_K[ys.yongEl]}</b>·<b class="t${ys.huiEl}">${S.EL_K[ys.huiEl]}</b> 기운이 올 때 순풍, <b class="t${ys.giEl}">${S.EL_K[ys.giEl]}</b> 기운이 강할 때는 속도를 조절하는 편이 좋습니다.</p>
      <p><b>생활 속 보완(${yb.name})</b> ${yb.boost} · 방향 ${yb.dir}</p>
      ${ys.missing.length ? `<p>원국에 없는 오행: ${ys.missing.map(i => `<b class="t${i}">${ELN(i)}</b>`).join(', ')} — 이 기운이 대운·세운으로 들어올 때 새로운 경험이나 변화가 생기기 쉽습니다.</p>` : ''}`]);

    const gy = I.GYEOK[r.gyeok.name] || '';
    steps.push([`사회적 그릇 — ${r.gyeok.name}`, `
      <p>월지 지장간 중 ${S.STEM_K[r.gyeok.stem]}(${S.STEM_H[r.gyeok.stem]})이 ${r.gyeok.how === '투출' ? '천간에 드러나(투출)' : '월지의 본기로'} 격을 이룹니다.</p>
      <p>${gy}</p>
      <p class="muted">→ 격국은 직업·사회적 역할의 큰 틀입니다. 용신과 같은 방향이면 그 길이 순탄합니다.</p>`]);

    const groups = ['비겁', '식상', '재성', '관성', '인성'];
    const sipsinLines = [];
    r.sipsinCount.forEach((c, i) => { if (c >= 2) sipsinLines.push(`<p><b>${SS(i)} ×${c}</b> — ${I.SIPSIN[SS(i)].short}. ${I.SIPSIN[SS(i)].many}</p>`); });
    groups.forEach(g => { if (r.groupCount[g] === 0) { const nm = g === '비겁' ? '비견' : g === '식상' ? '식신' : g === '재성' ? '정재' : g === '관성' ? '정관' : '정인'; sipsinLines.push(`<p><b>${g} 없음</b> (${I.GROUP[g].theme}) — ${I.SIPSIN[nm].none}</p>`); } });
    steps.push(['두드러진 십신 — 삶의 주제', sipsinLines.join('') || '<p>십신이 고르게 분포해 한쪽으로 치우치지 않은 편입니다.</p>']);

    const sp = I.SPOUSE_BY_SIPSIN[SS(day.branchSipsin)];
    const dayRels = r.relations.filter(x => x.keys && x.keys.includes('day') && x.where.includes('일지'));
    steps.push(['배우자궁(일지) — ' + SS(day.branchSipsin), `<p>${sp}</p>
      ${dayRels.length ? `<p>일지가 ${dayRels.map(x => `<b>${x.text}</b>(${x.where})`).join(', ')}의 작용을 받아, 배우자·가정 자리에 변동이나 강한 인연의 작용이 있습니다.</p>` : '<p>일지에 강한 충·형이 없어 배우자 자리가 비교적 안정적입니다.</p>'}`]);

    const dn = r.daeun.current, sy = r.seun.find(x => x.year === r.nowY);
    const best = r.daeun.list.filter(d => d.age + 10 > r.curAge).sort((a, b) => b.rating.v - a.rating.v)[0];
    steps.push(['지금의 흐름 — 대운·세운', `
      ${dn ? `<p><b>현재 대운 ${S.STEM_K[dn.s]}${S.BR_K[dn.b]}(${dn.age}~${dn.age + 9}세)</b> — 천간 ${SS(dn.stemSipsin)}, 지지 ${SS(dn.branchSipsin)}. 용신 기준 <span class="rt ${dn.rating.cls}">${dn.rating.label}</span><br>${I.SIPSIN[SS(dn.stemSipsin)].short}의 주제가 앞 5년, ${I.SIPSIN[SS(dn.branchSipsin)].short}의 주제가 뒤 5년에 더 강하게 작용합니다.</p>` : `<p>아직 첫 대운(${r.daeun.daeunNum}세) 이전입니다.</p>`}
      ${sy ? `<p><b>${sy.year}년 ${S.STEM_K[sy.s]}${S.BR_K[sy.b]}년</b> — ${SS(sy.stemSipsin)}/${SS(sy.branchSipsin)}의 해, <span class="rt ${sy.rating.cls}">${sy.rating.label}</span>${sy.hits.length ? ` · 원국과 ${sy.hits.join(', ')}` : ''}</p>` : ''}
      ${best ? `<p>앞으로 용신 기준 가장 유리한 대운은 <b>${best.age}세(${best.startYear}년~) ${S.STEM_K[best.s]}${S.BR_K[best.b]}</b>입니다.</p>` : ''}`]);

    steps.push(['읽는 순서 정리', `<p>① 일간으로 '나'를 정하고 → ② 신강·신약으로 힘을 재고 → ③ 용신으로 필요한 기운을 정한 뒤 → ④ 격국·십신으로 삶의 주제를 보고 → ⑤ 합충으로 사건성을 보고 → ⑥ 대운(10년)·세운(1년)이 용신을 돕는지로 시기를 판단합니다.</p>
      <p class="muted">자동 해석은 규칙 기반 근사입니다. 더 깊은 종합 해석은 아래 AI 해석을 이용하세요.</p>`]);

    $('#guide').innerHTML = steps.map((s, i) => `<div class="step"><div class="n">${i + 1}</div><div><h3>${s[0]}</h3>${s[1]}</div></div>`).join('');
  }

  function renderRelations(r) {
    if (!r.relations.length) { $('#relations').innerHTML = '<p class="muted">원국 안에 뚜렷한 합·충·형이 없습니다. 비교적 안정적인 구조입니다.</p>'; return; }
    $('#relations').innerHTML = `<div class="list">${r.relations.map(x => `
      <div class="it"><div class="h">${x.text}<span>${x.where} · ${x.type}</span></div><div class="muted small">${I.RELATION[x.type] || ''}</div></div>`).join('')}</div>`;
  }

  function renderSinsal(r) {
    const items = r.sinsal.map(x => `<div class="it"><div class="h">${x.name}<span>${x.label}${x.base ? ` (${x.base} 기준)` : ''}</span></div><div class="muted small">${I.SINSAL[x.name] || ''}</div></div>`);
    const gm = r.pillars.filter(p => !p.empty && p.key !== 'day' && r.gongmang.includes(p.branch));
    if (gm.length) items.push(`<div class="it"><div class="h">공망<span>${gm.map(p => I.PILLAR_POS[p.key].name).join(', ')}</span></div><div class="muted small">비어 있는 자리. 해당 궁(자리)의 일이 기대만큼 채워지지 않거나 정신적·비물질적 방향으로 작용합니다.</div></div>`);
    $('#sinsal').innerHTML = items.length ? `<div class="list">${items.join('')}</div>` : '<p class="muted">주요 신살이 없습니다.</p>';
  }

  function luckCard(x, label, cls) {
    return `<div class="lk ${cls}" data-i="${x._i}">
      <div class="age">${label}</div>
      <div class="g"><span class="t${elOfStem(x.s)}">${S.STEM_H[x.s]}</span><br><span class="t${elOfBr(x.b)}">${S.BR_H[x.b]}</span></div>
      <div class="ss">${SS(x.stemSipsin)}<br>${SS(x.branchSipsin)}</div>
      <span class="rt ${x.rating.cls}">${x.rating.label}</span></div>`;
  }
  function luckDetail(x, title) {
    return `<p><b>${title}</b> ${S.STEM_K[x.s]}${S.BR_K[x.b]}(${S.STEM_H[x.s]}${S.BR_H[x.b]}) · <span class="rt ${x.rating.cls}">${x.rating.label}</span></p>
      <p>천간 <b>${SS(x.stemSipsin)}</b> — ${I.SIPSIN[SS(x.stemSipsin)].short} (${I.SIPSIN[SS(x.stemSipsin)].pos})</p>
      <p>지지 <b>${SS(x.branchSipsin)}</b> — ${I.SIPSIN[SS(x.branchSipsin)].short} (${I.SIPSIN[SS(x.branchSipsin)].pos})</p>
      <p>오행: <span class="t${elOfStem(x.s)}">${ELN(elOfStem(x.s))}</span> / <span class="t${elOfBr(x.b)}">${ELN(elOfBr(x.b))}</span> — 용신 ${ELN(current.yongsin.yongEl)} 기준 평가${x.unseong !== undefined ? ` · 12운성 ${S.UNSEONG[x.unseong]}` : ''}${x.hits && x.hits.length ? ` · 원국과 ${x.hits.join(', ')}` : ''}</p>`;
  }

  function renderDaeun(r) {
    const list = r.daeun.list.map((d, i) => ({ ...d, _i: i }));
    $('#daeun').innerHTML = `<p class="muted small" style="margin-top:-6px">${r.daeun.forward ? '순행' : '역행'} · 대운수 ${r.daeun.daeunNum} (만 나이 기준, 정밀값 ${r.daeun.startAgeF.toFixed(2)}세) · 카드를 누르면 상세</p>
      <div class="luck">${list.map(d => luckCard(d, `${d.age}세 · ${d.startYear}`, r.daeun.current && d.idx === r.daeun.current.idx ? 'cur' : '')).join('')}</div>
      <div class="lk-detail" id="dDetail"></div>`;
    const show = i => {
      const d = list[i];
      $('#daeun').querySelectorAll('.lk').forEach(x => x.classList.toggle('sel', +x.dataset.i === i));
      $('#dDetail').innerHTML = luckDetail(d, `${d.age}~${d.age + 9}세 대운 (${d.startYear}~${d.startYear + 9})`);
    };
    $('#daeun .luck').onclick = e => { const c = e.target.closest('.lk'); if (c) show(+c.dataset.i); };
    show(r.daeun.current ? list.findIndex(d => d.idx === r.daeun.current.idx) : 0);
  }

  function renderSeun(r) {
    const list = r.seun.map((d, i) => ({ ...d, _i: i }));
    $('#seun').innerHTML = `<div class="luck">${list.map(d => luckCard(d, `${d.year} · ${d.age}세`, d.year === r.nowY ? 'cur' : '')).join('')}</div><div class="lk-detail" id="sDetail"></div>`;
    const show = i => {
      $('#seun').querySelectorAll('.lk').forEach(x => x.classList.toggle('sel', +x.dataset.i === i));
      $('#sDetail').innerHTML = luckDetail(list[i], `${list[i].year}년`);
    };
    $('#seun .luck').onclick = e => { const c = e.target.closest('.lk'); if (c) show(+c.dataset.i); };
    show(list.findIndex(d => d.year === r.nowY));
  }

  // ---------- AI ----------
  function chartText(r) {
    const o = r.input;
    const P = p => p.empty ? '시주 모름' : `${I.PILLAR_POS[p.key].name} ${S.STEM_H[p.stem]}${S.BR_H[p.branch]}(${S.STEM_K[p.stem]}${S.BR_K[p.branch]}) 천간:${p.key === 'day' ? '일간' : SS(p.stemSipsin)} 지지:${SS(p.branchSipsin)} 지장간:${p.jijanggan.filter(Boolean).map(j => S.STEM_H[j.stem]).join('')} 12운성:${S.UNSEONG[p.unseong]}`;
    return [
      `성별: ${o.gender === 'M' ? '남' : '여'}, 양력 ${r.solar.y}-${r.solar.m}-${r.solar.d} ${r.timeKnown ? `${r.solar.h}:${pad(r.solar.mi)}` : '(시간 모름)'}, 현재 만 ${r.curAge}세 무렵, 올해 ${r.nowY}년`,
      ...r.pillars.map(P),
      `오행 개수(목화토금수): ${r.elCount.join('/')}, 세력%: ${r.elWeighted.map(v => v.toFixed(1)).join('/')}`,
      `신강약: ${r.strength.label}(지원 ${r.strength.score}%, 득령 ${r.strength.deukryeong}, 득지 ${r.strength.deukji}, 득세 ${r.strength.deukse})`,
      `억부 용신(규칙 기반 추정): ${r.yongsin.yong} ${S.EL_K[r.yongsin.yongEl]}, 희신 ${S.EL_K[r.yongsin.huiEl]}, 기신 ${S.EL_K[r.yongsin.giEl]}${r.yongsin.johu ? `, 조후: ${r.yongsin.johu.text}` : ''}`,
      `격국: ${r.gyeok.name}`,
      `합충: ${r.relations.map(x => `${x.text}(${x.where})`).join(', ') || '없음'}`,
      `신살: ${r.sinsal.map(x => `${x.name}(${x.label})`).join(', ') || '없음'}, 공망: ${r.gongmang.map(b => S.BR_H[b]).join('')}`,
      `대운(${r.daeun.forward ? '순행' : '역행'}, 대운수 ${r.daeun.daeunNum}): ${r.daeun.list.map(d => `${d.age}세 ${S.STEM_H[d.s]}${S.BR_H[d.b]}`).join(', ')}`,
      `현재 대운: ${r.daeun.current ? S.STEM_H[r.daeun.current.s] + S.BR_H[r.daeun.current.b] : '대운 전'}`,
      `세운: ${r.seun.slice(0, 5).map(d => `${d.year} ${S.STEM_H[d.s]}${S.BR_H[d.b]}`).join(', ')}`,
    ].join('\n');
  }

  function md(t) {
    const lines = esc(t).split('\n'); let out = '', inList = false;
    for (let l of lines) {
      l = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
      if (/^\s*[-*] /.test(l)) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${l.replace(/^\s*[-*] /, '')}</li>`; continue; }
      if (inList) { out += '</ul>'; inList = false; }
      if (/^#{1,2} /.test(l)) out += `<h3>${l.replace(/^#+ /, '')}</h3>`;
      else if (/^#{3,} /.test(l)) out += `<h4>${l.replace(/^#+ /, '')}</h4>`;
      else if (l.trim()) out += `<p>${l}</p>`;
    }
    return out + (inList ? '</ul>' : '');
  }

  // ---------- AI 해석 (Gemini, 브라우저에서 직접 호출) ----------
  const GEMINI_MODEL = 'gemini-2.5-flash';
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;
  const SYSTEM_PROMPT = `당신은 한국 명리학(사주팔자)에 정통한 상담가입니다.
사용자의 원국·대운·세운은 이미 만세력 프로그램이 정확히 계산해 두었습니다. 기둥(간지)을 다시 계산하거나 바꾸지 말고, 주어진 데이터를 근거로 해석하세요.
프로그램이 제시한 용신은 규칙 기반 추정치이므로, 원국 전체(조후, 격국, 합충, 통근 여부)를 보고 동의하거나 다르게 판단되면 이유와 함께 말해 주세요.

다음 순서로 한국어 마크다운으로 답하세요(각 소제목은 '## '로 시작):
## 한 줄 요약
## 타고난 성향과 기질
## 사주의 구조와 용신 판단
## 재물·직업 방향
## 관계·배우자·가족
## 대운 흐름 (지금 대운과 앞으로의 큰 전환점)
## 올해와 내년
## 실천 조언 (3~5개, 구체적으로)
사용자가 질문을 남겼다면 마지막에 '## 질문에 대한 답'을 추가하세요.

원칙: 근거가 되는 글자(예: 월지 午의 정관)를 짚으며 설명하고, 운명론적 단정·공포 조장·의료/법률/투자에 대한 확정적 지시는 피하며, 균형 있고 실용적으로 씁니다. 전체 분량은 1500~2500자 정도로 간결하게.`;

  const KEY_STORE = 'geminiKey';
  const getKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } };
  function renderKey() {
    const k = getKey();
    $('#keyEdit').hidden = !!k;
    $('#keyView').hidden = !k;
    $('#keyMask').textContent = k ? '••••' + k.slice(-4) : '';
    $('#aiBtn').disabled = !k;
    $('#aiBtn').title = k ? '' : '먼저 Gemini API 키를 저장해 주세요';
  }
  $('#keySave').onclick = () => {
    const k = $('#keyInput').value.trim();
    if (!k) { $('#keyInput').focus(); return; }
    try { localStorage.setItem(KEY_STORE, k); } catch (e) {
      $('#aiOut').innerHTML = '<div class="warn">이 브라우저에서는 키를 저장할 수 없습니다 (사생활 보호 모드 등).</div>'; return;
    }
    $('#keyInput').value = ''; renderKey();
  };
  $('#keyInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#keySave').click(); });
  $('#keyChange').onclick = () => { $('#keyEdit').hidden = false; $('#keyView').hidden = true; $('#keyInput').focus(); };
  $('#keyDelete').onclick = () => {
    if (!confirm('저장된 Gemini API 키를 이 브라우저에서 지울까요?')) return;
    try { localStorage.removeItem(KEY_STORE); } catch (e) { }
    renderKey();
  };
  renderKey();

  function geminiError(status, body) {
    let msg = '';
    try { msg = JSON.parse(body).error.message || ''; } catch (e) { msg = body.slice(0, 200); }
    if (status === 400 && /API key/i.test(msg)) return 'API 키가 올바르지 않습니다. 키를 확인한 뒤 [변경]으로 다시 넣어 주세요.';
    if (status === 403) return 'API 키에 Gemini API 사용 권한이 없습니다. AI Studio에서 발급한 키인지 확인해 주세요.';
    if (status === 429) return '요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.';
    if (status >= 500) return `Gemini 서버 오류입니다 (${status}). 잠시 후 다시 시도해 주세요.`;
    return `AI 호출 실패 (${status}): ${msg}`;
  }

  $('#aiBtn').onclick = async () => {
    if (!current) return;
    const key = getKey();
    if (!key) { renderKey(); $('#keyInput').focus(); return; }
    const btn = $('#aiBtn'), out = $('#aiOut');
    btn.disabled = true; out.innerHTML = '<p class="muted">해석 중…</p>';
    let userMsg = '[사주 데이터]\n' + chartText(current);
    const q = $('#aiQ').value.trim().slice(0, 500);
    if (q) userMsg += '\n\n[사용자 질문]\n' + q;
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userMsg }] }],
          generationConfig: { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 1024 } },
        }),
      });
      if (!res.ok) { out.innerHTML = `<div class="warn">${esc(geminiError(res.status, await res.text()))}</div>`; return; }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '', text = '', finish = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          let ev; try { ev = JSON.parse(line.slice(5)); } catch (e) { continue; }
          const c = (ev.candidates || [])[0];
          if (!c) { if (ev.promptFeedback && ev.promptFeedback.blockReason) finish = 'BLOCKED'; continue; }
          for (const part of (c.content && c.content.parts) || []) if (part.text && !part.thought) text += part.text;
          if (c.finishReason) finish = c.finishReason;
        }
        out.innerHTML = md(text) || '<p class="muted">해석 중…</p>';
      }
      if (finish === 'MAX_TOKENS') out.innerHTML += '<p class="muted small">(답변이 길어 중간에 잘렸습니다.)</p>';
      else if (finish === 'SAFETY' || finish === 'BLOCKED') out.innerHTML += '<div class="warn">AI가 이 요청에 대한 답변을 거절했습니다.</div>';
      else if (!text) out.innerHTML = '<div class="warn">AI가 빈 응답을 보냈습니다. 다시 시도해 주세요.</div>';
    } catch (e) {
      out.innerHTML = `<div class="warn">Gemini에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요. (${esc(e.message)})</div>`;
    } finally { renderKey(); }
  };
})();
