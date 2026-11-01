(() => {
  const KEY = 't09-agent-v2';
  const DATE_RE = /(\d{4})[-./년]\s?(\d{1,2})[-./월]\s?(\d{1,2})/;
  const TYPES = { repeat: '되풀이되는 말', power: '힘이 난 날', surprise: '놀란 순간' };
  const STEPS = ['', '기록 읽기', '규칙 다섯', '강점 지도', '회복탄력성', '자기소개서', '점검·저장'];
  const SUBS = { 3: ['후보 받기', '직접 고르기', '표 검토'], 4: ['고난 적기', '직접 고쳐 쓰기', '동료 답'], 5: ['자기소개서', '포트폴리오'] };
  const DEFAULT_RULES = [
    '① 형용사 대신 장면을 쓴다. 형용사 하나에 날짜 붙은 장면 하나를 붙인다.',
    '② 한 번 나온 것보다 여러 날 되풀이된 것을 앞에 둔다.',
    '③ 내가 본 나와 남이 본 나를 나란히 둔다. 강점마다 동료가 해 준 말을 함께 찾는다.',
    '④ 기록이 없는 시점이나 사건도 흐름이 이어지게 서사로 채운다. 채운 문장에는 [채움]을 붙인다.',
    '⑤ 먼저 3인칭으로 쓴다. 초안은 "○○ 님은"으로 시작한다.'
  ];
  const CRIT = {
    C01: '서사 문서 첫머리에 본인 이름', C02: '직접 고른 대목이 날짜와 함께', C03: '에이전트 규칙 다섯 개 이상',
    C04: '"기록이 없어도 서사로 채운다"는 규칙', C05: '규칙이 부딪칠 때 우선순위 한 줄', C06: '강점 세 개 이상',
    C07: '강점마다 날짜 있는 장면', C08: '강점마다 동료가 말한 것 또는 자신의 느낌', C09: '강점마다 1~8번 과제 하나 이상',
    C10: 'AI 제안 중 내가 지운 항목과 이유', C11: '고난(과정 이전, 연도·장소) · 다시 일어난 날 · 더 나아진 나',
    C12: '3인칭 초안과 1인칭 완성본 둘 다', C13: '동료 두 사람의 답 (이름 없이)', C14: '자기소개서에 이름·강점 셋·고비 장면·하고 싶은 것',
    C15: '포트폴리오 뼈대에 이름과 강점별 1~8번 산출물',
    C17: '문서 안의 짧은 확인 방법', C18: '파일 한 개 (MD 또는 TXT), 비밀번호 없이 열림', C19: '문서 속 URL은 로그인 없이 시크릿 창에서 열림',
    C26: '본인 외 실명·연락처·비밀번호·토큰·API 키 없음'
  };

  const blank = () => ({
    v: 2, fileName: '', name: '', records: [], marks: [], curType: 'repeat',
    step: 1, sub: { 1: 0, 3: 0, 4: 0, 5: 0 }, view3: 'table',
    rules: DEFAULT_RULES.slice(), priority: '부딪치면 ④를 가장 먼저 따르고, 그다음 ① > ② > ③ > ⑤ 순서로 따른다.',
    assign: '', cands: [], strengths: [], dels: [],
    hardship: { year: '', place: '', scene: '', changed: '' },
    story3: '', story1: '', peers: [{ like: '', made: '' }, { like: '', made: '' }],
    reader: '나를 처음 만나는 사람', want: '', introFirst: '', intro: '', introLast: '',
    introPrev: '', fmt: 'md'
  });
  const uid = () => Math.random().toString(36).slice(2, 10);
  // Saved state may come from an older version of this page: fill missing or wrong-typed fields with defaults.
  const normalize = s => {
    const b = blank();
    if (!s || s.v !== 2) return b;
    const o = Object.assign(b, s);
    ['records', 'marks', 'rules', 'cands', 'strengths', 'dels', 'peers'].forEach(k => { if (!Array.isArray(o[k])) o[k] = blank()[k]; });
    ['hardship', 'sub'].forEach(k => { o[k] = Object.assign(blank()[k], o[k] && typeof o[k] === 'object' ? o[k] : {}); });
    const txt = v => typeof v === 'string' ? v : '';
    ['name', 'fileName', 'priority', 'assign', 'story3', 'story1', 'reader', 'want', 'introFirst', 'intro', 'introLast', 'introPrev'].forEach(k => { o[k] = txt(o[k]); });
    Object.keys(o.hardship).forEach(k => { o.hardship[k] = txt(o.hardship[k]); });
    o.rules = DEFAULT_RULES.map((d, i) => typeof o.rules[i] === 'string' ? o.rules[i] : d);
    o.peers = [0, 1].map(i => { const p = o.peers[i] && typeof o.peers[i] === 'object' ? o.peers[i] : {}; return { like: txt(p.like), made: txt(p.made) }; });
    o.records = o.records.filter(r => r && typeof r.date === 'string' && Array.isArray(r.items));
    ['marks', 'cands', 'dels'].forEach(k => { o[k] = o[k].filter(x => x && typeof x === 'object'); });
    o.strengths = o.strengths.filter(x => x && typeof x === 'object');
    o.strengths.forEach(x => { if (!x.id) x.id = uid(); ['name', 'scene', 'peer', 'value', 'assignment'].forEach(k => { x[k] = txt(x[k]); }); });
    delete o.aiLog; delete o.judge;
    return o;
  };
  let S;
  let storageOk = true;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; storageOk = false; }
  S = normalize(S);
  let gen = 0; // bumps on file swap / reset so late AI answers from the old work are dropped

  const $ = s => document.querySelector(s);
  const main = $('#main');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const filled = s => String(s ?? '').trim().length > 0;
  const hasDate = s => DATE_RE.test(String(s ?? ''));
  let saveT;
  const saveNow = () => { clearTimeout(saveT); saveT = null; try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; } catch (e) { storageOk = false; } };
  const save = () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 300); };
  window.addEventListener('pagehide', () => { if (saveT) saveNow(); });
  const getPath = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

  // ---------- records ----------
  const PARTS = { open: '아침', close: '마무리', morning: '아침', evening: '마무리' };
  const normDate = m => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const splitQA = line => { const s = String(line).trim(); const i = s.indexOf(':'); return i > 0 && i < 40 ? { q: s.slice(0, i).trim(), a: s.slice(i + 1).trim() } : { q: '', a: s }; };
  const flat = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(x => flat(x, out)); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => typeof x === 'string' ? out.push(`${k}: ${x}`) : flat(x, out)); return out; };
  function parseRecords(raw) {
    let data = null, out = [];
    try { data = JSON.parse(raw); } catch (e) {}
    if (data) {
      const walk = node => {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (!node || typeof node !== 'object') return;
        const de = Object.entries(node).find(([, v]) => typeof v === 'string' && v.length < 40 && DATE_RE.test(v));
        if (de) {
          const date = normDate(de[1].match(DATE_RE));
          const groups = Object.entries(node).filter(([k, v]) => k !== de[0] && v && typeof v === 'object');
          if (groups.length) groups.forEach(([k, v]) => { const items = flat(v).filter(filled).map(splitQA); if (items.length) out.push({ date, part: PARTS[k] || k, items }); });
          else { const items = Object.entries(node).filter(([k, v]) => k !== de[0] && typeof v === 'string' && filled(v)).map(([k, v]) => splitQA(`${k}: ${v}`)); if (items.length) out.push({ date, part: '', items }); }
          return;
        }
        Object.values(node).forEach(walk);
      };
      walk(data);
    }
    if (!out.length) {
      let cur = null;
      raw.split(/\r?\n/).forEach(line => {
        const m = line.match(DATE_RE);
        if (m && m.index < 12) { if (cur) out.push(cur); cur = { date: normDate(m), part: '', items: [] }; const rest = line.slice(m.index + m[0].length).replace(/^[\s#:\-\]\)일.]+/, '').trim(); if (rest) cur.items.push(splitQA(rest)); }
        else if (cur && filled(line)) cur.items.push(splitQA(line));
      });
      if (cur) out.push(cur);
    }
    out = out.filter(r => r.items.length).sort((a, b) => a.date.localeCompare(b.date));
    return { records: out, student: data && typeof data.student === 'string' ? data.student.trim() : '' };
  }
  // The file masks peer names as "(이름 가림)". Items whose whole answer is the mask carry nothing to read, so they are hidden;
  // inside an answer each mask becomes 동료A, 동료B… (letters, because the file already uses "동료 1/2" for fixed roles).
  const MASK_RE = /\(\s*이름\s*가림\s*\)/g;
  const isEmptyItem = it => String(it.a).replace(MASK_RE, '').replace(/[\s\-—–.,·:~]/g, '') === '';
  const cleanA = a => { let n = 0; return String(a).replace(MASK_RE, () => '동료' + 'ABCDEFGHIJ'[Math.min(n++, 9)]); };
  const itemText = it => it.q ? `${it.q}: ${cleanA(it.a)}` : cleanA(it.a);
  const recLabel = r => `${r.date}${r.part ? ' ' + r.part : ''}`;
  const keyInfo = key => { const [ri, ii] = String(key).split(':').map(Number); const r = S.records[ri]; const it = r && r.items[ii]; return r && it ? { r, it, label: recLabel(r), text: itemText(it) } : null; };
  const idToKey = id => { const m = String(id).match(/r(\d+)-(\d+)/); return m ? `${m[1]}:${m[2]}` : null; };

  // ---------- checks ----------
  const NOT_IN = /기록에\s*없음/;
  const ASSIGN_RE = /(^|[^\d])[1-8]\s*번|T0?[1-8](?!\d)/i;
  // Surname + title ("최부장님", "김 과장") still identifies a real person even when the name itself is masked
  const TITLE_RE = /(?<![가-힣])[김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허남심노곽차구민진][ ]?(부장|과장|차장|팀장|대리|실장|본부장|상무|전무|선배|교수|강사|멘토|매니저)님?/g;
  function checks() {
    const st = S.strengths, md = buildDoc();
    const leaks = [];
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(md)) leaks.push('이메일');
    if (/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/.test(md)) leaks.push('전화번호');
    if (/(sk-[A-Za-z0-9_-]{10,}|api[_-]?key|비밀번호\s*[:=]|password\s*[:=])/i.test(md)) leaks.push('키·비밀번호');
    const titled = [...new Set(md.match(TITLE_RE) || [])];
    if (titled.length) leaks.push(`성+직함 표현(${titled.slice(0, 4).join(', ')})`);
    const urls = [...new Set(md.match(/https?:\/\/[^\s)|>\]"']+/g) || [])];
    const repoUrls = urls.filter(u => /github\.com\/[^/]+\/[^/]+/i.test(u));
    const nm = S.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const third = new RegExp(`${nm ? nm + '\\s*님은|' : ''}그는|그녀는`);
    const all = (arr, f) => arr.length > 0 && arr.every(f);
    const has = s => filled(s) && !NOT_IN.test(s);
    const R = [];
    const add = (c, state, step, sub, note) => R.push({ c, state, step, sub, note });
    add('C01', filled(S.name) ? 'ok' : 'empty', 1, 0);
    add('C02', S.marks.length ? 'ok' : 'empty', 1, 1);
    add('C03', S.rules.filter(filled).length < 5 ? 'empty' : S.rules.some((r, i) => r.trim() === DEFAULT_RULES[i]) ? 'check' : 'ok', 2, 0, '기본 문장 그대로인 규칙이 있습니다. 내 말로 다듬어 주세요.');
    add('C04', !filled(S.rules[3]) ? 'empty' : /기록/.test(S.rules[3]) && /채/.test(S.rules[3]) && !/채우지\s*(않|말)/.test(S.rules[3]) ? 'ok' : 'check', 2, 0, '"기록이 없어도 서사로 채운다"는 뜻이 남아 있는지 확인해 주세요.');
    add('C05', filled(S.priority) ? 'ok' : 'empty', 2, 0);
    add('C06', st.filter(s => filled(s.name)).length >= 3 ? 'ok' : 'empty', 3, st.length ? 2 : 0);
    add('C07', all(st, s => has(s.scene) && hasDate(s.scene)) && all(st, s => has(s.value)) ? 'ok' : 'empty', 3, 2, '날짜 있는 장면이나 지킨 가치가 빈 강점이 있습니다. 기록에서 찾아 채워 주세요.');
    add('C08', all(st, s => has(s.peer)) ? 'ok' : 'empty', 3, 2, '동료가 말한 것이나 자신의 느낌이 빈 강점이 있습니다.');
    add('C09', all(st, s => has(s.assignment) && ASSIGN_RE.test(s.assignment)) ? 'ok' : 'empty', 3, 2, '1~8번 과제가 번호와 함께 연결되지 않은 강점이 있습니다. 예: "4번: 대전 유기동물 공고 모니터링"');
    add('C10', S.dels.length && S.dels.every(d => filled(d.reason)) ? 'ok' : 'empty', 3, 2, '표에서 아닌 것을 하나 이상 지우고 이유를 남겨 주세요.');
    const h = S.hardship;
    add('C11', filled(h.year) && filled(h.place) && filled(h.scene) && filled(h.changed) && filled(S.story1) ? 'check' : 'empty', 4, filled(S.story3) ? 1 : 0, '세 부분(고난·다시 일어난 날·더 나아진 나)이 1인칭 완성본에 있는지 읽어 주세요.');
    add('C12', !(filled(S.story3) && filled(S.story1)) ? 'empty' : 'check', 4, 1, (S.story1.trim() === S.story3.trim() || third.test(S.story1)) ? '1인칭 완성본에 3인칭 표현이 남아 있거나 초안과 같습니다. 내 손으로 고쳐 써 주세요.' : '1인칭 완성본이 초안을 내 손으로 고쳐 쓴 글인지 확인해 주세요.');
    add('C13', S.peers.every(p => filled(p.like) && filled(p.made)) ? 'ok' : 'empty', 4, 2, '실제로 받은 답을 적어 주세요.');
    const intro = [S.introFirst, S.intro, S.introLast].join(' ');
    add('C14', filled(S.introFirst) && filled(S.intro) && filled(S.introLast) && filled(S.want) && filled(S.name) && intro.includes(S.name.trim()) ? 'check' : 'empty', 5, 0, '이름이 들어간 첫 문장·본문·마지막 문장과 하고 싶은 것이 필요합니다. 강점 셋과 고비 장면이 들어갔는지 읽어 주세요.');
    add('C15', filled(S.name) && st.length >= 3 && all(st, s => has(s.assignment) && ASSIGN_RE.test(s.assignment)) ? 'ok' : 'empty', 5, 1);
    add('C17', 'ok', 6, 0);
    add('C18', 'ok', 6, 0);
    add('C19', urls.length ? 'check' : 'ok', 3, 0, urls.length ? `문서에 URL ${urls.length}개가 있습니다(${urls.join(', ')}). 모두 로그인 없이 새 시크릿 창에서 열리는지 확인해 주세요.${repoUrls.length ? ` 소스 저장소 주소는 받지 않으니 빼 주세요: ${repoUrls.join(', ')}` : ''}` : '');
    add('C26', 'check', 6, 0, '다른 사람의 실명·연락처·비밀번호·토큰·API 키가 없는지 문서 전체를 한 번 읽어 주세요. 표시한 대목과 지운 항목도 문서에 들어갑니다.' + (leaks.length ? ` 의심되는 내용: ${leaks.join(', ')}.` : ''));
    return R;
  }
  const CHECK_ICON = '<svg class="ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr">완료</span>';
  const STEP_CODES = { 1: ['C01', 'C02'], 2: ['C03', 'C04', 'C05'], 3: ['C06', 'C07', 'C08', 'C09', 'C10'], 4: ['C11', 'C12', 'C13'], 5: ['C14', 'C15'], 6: ['C17', 'C18', 'C19', 'C26'] };

  // ---------- document ----------
  const cell = s => String(s ?? '').trim().replace(/\|/g, '\\|').replace(/\r?\n/g, ' ') || '기록에 없음';
  function buildDoc() {
    const name = S.name.trim() || '(이름)';
    const L = [];
    L.push(`# ${name} · 나를 말하는 에이전트 (과제 9)`, '');
    L.push('## 1. 직접 고른 기록 대목', '');
    S.marks.map(m => ({ m, k: keyInfo(m.key) })).filter(x => x.k).sort((a, b) => a.m.key.localeCompare(b.m.key, undefined, { numeric: true })).forEach(({ m, k }) => L.push(`- ${k.label} · ${TYPES[m.type]} · ${k.text}`));
    L.push('', '## 2. 에이전트 규칙', '');
    S.rules.forEach(r => L.push(`- ${r.trim()}`));
    L.push(`- 우선순위: ${S.priority.trim()}`, '');
    L.push('## 3. 강점 지도', '', '| 강점 | 날짜 있는 장면 | 동료가 말한 것 / 자신의 느낌 | 지킨 가치 | 1~8번 과제 |', '|---|---|---|---|---|');
    S.strengths.forEach(s => L.push(`| ${cell(s.name)} | ${cell(s.scene)} | ${cell(s.peer)} | ${cell(s.value)} | ${cell(s.assignment)} |`));
    L.push('', '### 내가 지운 항목과 이유', '');
    S.dels.forEach(d => L.push(`- ${d.strength} · ${d.label}: "${d.text}" → ${d.reason}`));
    L.push('', '## 4. 나의 회복탄력성', '', '### 과정 이전의 고난 (직접 작성)', '');
    L.push(`- ${S.hardship.year}년, ${S.hardship.place}`, `- 장면: ${S.hardship.scene}`, `- 그때 바꾼 것: ${S.hardship.changed}`, '');
    L.push('### 3인칭 초안 (에이전트)', '', S.story3.trim(), '', '### 1인칭 완성본 (직접 고쳐 씀)', '', S.story1.trim(), '');
    L.push('### 동료 두 사람의 답 (이름 없음)', '');
    S.peers.forEach((p, i) => L.push(`- 동료 ${i + 1} · 나 같은가? ${p.like.trim()}`, `- 동료 ${i + 1} · 지어낸 느낌이 있는가? ${p.made.trim()}`));
    L.push('', '## 5. 자기소개서 초안', '', `> 읽는 사람: ${S.reader.trim()}`, '');
    L.push([S.introFirst, S.intro, S.introLast].map(s => s.trim()).filter(Boolean).join('\n\n'), '');
    L.push('## 6. 포트폴리오 뼈대', '', `- 이름: ${name}`, '- 자기소개서: 이 문서 5절', '- 강점 셋과 증거');
    S.strengths.forEach(s => L.push(`  - ${s.name.trim()}: ${s.assignment.trim() || '(1~8번 산출물 연결 필요)'}`));
    L.push('- 앞으로 채울 자리: 10번 논문 / 11번 소설 / 마지막 과제 대표작', '');
    L.push('## 7. 확인 방법', '', '- 자기소개서 초안: 5절', '- 강점 지도: 3절 (지운 항목과 이유 포함)', '- 3인칭 초안·1인칭 완성본·동료 답: 4절', '- 포트폴리오 뼈대: 6절', '');
    return L.join('\n');
  }
  const toTxt = md => md.replace(/^#+\s*/gm, '').replace(/^> /gm, '').replace(/^\|---.*$/gm, '').replace(/^\| (.*) \|$/gm, (m, x) => x.split(' | ').join(' / '));

  // ---------- AI ----------
  let sample = null, run = null;
  const ERR = {
    not_granted: 'AI 사용을 허용하지 않아 이 기능을 쓸 수 없습니다. 직접 입력하거나 다른 AI에서 받은 결과를 붙여 넣어 주세요.',
    sampling_disabled: '이 계정에서는 AI를 쓸 수 없습니다. 직접 입력해 주세요.',
    rate_limited: '요청이 많거나 사용량 한도에 닿았습니다. 잠시 뒤 다시 눌러 주세요.',
    session_expired: 'Claude 로그인이 만료되었습니다. 다시 로그인한 뒤 눌러 주세요.',
    prompt_too_large: '기록이 너무 깁니다. 과제 안내대로 최근 30일을 먼저 넣고 나머지는 따로 요청해 결과를 합쳐 주세요.',
    invalid_json: '결과를 읽지 못했습니다. 기존 내용은 그대로 있습니다. 다시 눌러 주세요.',
    refused: 'AI가 이 요청에 답하지 않았습니다. 내용을 바꿔 다시 시도해 주세요.',
    empty_completion: 'AI가 빈 답을 냈습니다. 다시 눌러 주세요.'
  };
  const errText = e => ERR[e && e.code] || '연결이 끊겼습니다. 입력한 내용은 그대로 있습니다. 잠시 뒤 다시 눌러 주세요.';
  function setStat(key, html, cls) { const el = document.getElementById('st-' + key); if (el) { el.className = 'aistat' + (cls ? ' ' + cls : ''); el.setAttribute('role', 'status'); el.innerHTML = html; } }
  const recordsForAI = () => S.records.map((r, ri) => `[${recLabel(r)}]\n` + r.items.map((it, ii) => isEmptyItem(it) ? '' : `(r${ri}-${ii}) ${itemText(it)}`).filter(Boolean).join('\n')).join('\n\n');
  const rulesBlock = () => `[에이전트 규칙]\n${S.rules.map(r => r.trim()).join('\n')}\n우선순위: ${S.priority.trim()}`;
  const BASE = () => `너는 한 학생의 아침·마무리 리추얼 기록에서 강점과 이야기를 찾는 에이전트다. 아래 [에이전트 규칙]을 우선순위대로 따른다. 기록에 없는 사실을 사실처럼 쓰지 않는다. 다른 사람의 실명은 쓰지 않는다.\n\n${rulesBlock()}\n\n[학생 이름] ${S.name.trim() || '학생'}\n\n`;
  // Resolves with the answer, or null when it failed, was stopped, or belongs to work that was replaced meanwhile.
  async function runAI(key, prompt, { json = false, onText = null, lock = null }) {
    if (!sample) { setStat(key, 'AI를 쓸 수 없는 환경입니다. claude.ai에서 열거나, 직접 입력해 주세요. 강점은 "강점 직접 추가"로, 3인칭 초안은 칸에 직접 붙여 넣을 수 있습니다.', 'err'); return null; }
    if (run) return null;
    const ctl = new AbortController();
    const me = { key, ctl, t0: Date.now(), got: false, gen, lock };
    run = me;
    const live = () => run === me && me.gen === gen && !ctl.signal.aborted;
    const tick = () => {
      if (!live()) return;
      const s = Math.floor((Date.now() - me.t0) / 1000);
      const msg = s >= 60 ? '평소보다 오래 걸립니다. 기다리거나 중지할 수 있습니다.' : s >= 30 ? '아직 작성 중입니다. 중지해도 직접 쓴 내용은 남습니다.' : me.got ? '초안을 쓰고 있습니다.' : '기록을 읽고 있습니다. 보통 5~60초 걸립니다.';
      setStat(key, `<span>${msg}</span><span class="secs">${s}초</span><button type="button" class="btn secondary small" data-act="stop">중지</button>`);
    };
    tick(); me.timer = setInterval(tick, 1000);
    applyRunLock();
    try {
      let out;
      if (json) out = await sample.json(prompt, { signal: ctl.signal, cache: false });
      else out = (await sample(prompt, { signal: ctl.signal, cache: false, onText: ({ text }) => { me.got = true; if (live() && onText) onText(text); } })).text;
      if (!live()) return null;
      setStat(key, '완료했습니다. 결과를 원문과 대조해 검토해 주세요.');
      return out;
    } catch (e) {
      if (run !== me || me.gen !== gen) return null;
      if (e && e.code === 'cancelled') setStat(key, '요청을 중지했습니다. 직접 쓴 내용은 그대로 있습니다.');
      else setStat(key, esc(errText(e)), 'err');
      return null;
    } finally {
      clearInterval(me.timer);
      if (run === me) { run = null; applyRunLock(); }
    }
  }
  // While a request runs, its target field stays read-only and AI buttons stay off, even after re-renders
  function applyRunLock() {
    document.querySelectorAll('[data-ai]').forEach(b => { b.disabled = !!run || b.hasAttribute('data-locked'); });
    document.querySelectorAll('textarea[data-k], input[data-k]').forEach(el => { el.readOnly = !!(run && run.lock && el.id === run.lock); });
  }
  const stopAI = () => { if (!run) return; const r = run; run = null; clearInterval(r.timer); r.ctl.abort(); applyRunLock(); };
  // A second click within a few seconds confirms replacing existing AI output
  let armed = null;
  const REPLACE_NOTE = {
    cand: '지금 받은 강점 후보와 고른 표시가 새 후보로 바뀝니다. 강점 표와 지운 항목 기록은 그대로입니다.',
    table: '지금 강점 표가 새 표로 바뀝니다. 표에서 직접 고치거나 추가한 내용도 바뀌고, 지운 항목 기록은 그대로 남습니다.',
    story: '지금 3인칭 초안이 새 초안으로 바뀝니다. 1인칭 완성본과 동료 답은 그대로입니다.',
    intro: '지금 본문이 새 초안으로 바뀝니다. 첫 문장과 마지막 문장은 그대로입니다.'
  };
  const confirmReplace = (key, exists) => {
    if (!exists || armed === key) { armed = null; return true; }
    armed = key; setTimeout(() => { if (armed === key) armed = null; }, 6000);
    setStat(key, `한 번 더 누르면 바꿉니다. ${REPLACE_NOTE[key]}`);
    return false;
  };

  // ---------- render helpers ----------
  const head = (step, todo, subIdx) => {
    const codes = STEP_CODES[step];
    const subs = SUBS[step];
    return `<header class="stephead">
      <p class="kicker">${step}/6 단계${subs ? ` · ${subs.length}단계 중 ${subIdx + 1}번째 · ${esc(subs[subIdx])}` : ''}</p>
      <h1 id="stepTitle" tabindex="-1">${esc(STEPS[step])}</h1>
      <p class="todo"><strong>지금 할 일</strong>${todo}</p>
      <details class="crit"><summary>과제 기준 ${codes.join('·')}</summary><ul>${codes.map(c => `<li>${c} ${esc(CRIT[c])}</li>`).join('')}</ul></details>
    </header>`;
  };
  const tagMe = '<span class="tag me">직접 작성 · 필수</span>';
  const tagAI = '<span class="tag ai">AI 초안 · 검토하세요</span>';
  const fid = k => 'f-' + k.replace(/\./g, '-');
  const field = (k, label, tag, opts = {}) => `<label class="f${opts.ai ? ' ai-field' : ''}"><span class="ftop"><span>${label}</span>${tag || ''}</span>${opts.area
    ? `<textarea id="${fid(k)}" data-k="${k}" rows="${opts.rows || 3}"${opts.long ? ' class="long"' : ''} placeholder="${esc(opts.ph || '')}">${esc(getPath(S, k))}</textarea>`
    : `<input type="text" id="${fid(k)}" data-k="${k}" value="${esc(getPath(S, k))}" placeholder="${esc(opts.ph || '')}">`}${opts.help ? `<span class="help">${opts.help}</span>` : ''}</label>`;
  const actions = (primary, secondary = '') => `<div class="actions"><div class="row">${secondary}${fromCheck && S.step !== 6 ? '<button type="button" class="btn secondary" data-act="backToCheck">점검으로 돌아가기</button>' : ''}</div>${primary}</div>`;
  const pbtn = (act, label, extra = '') => `<button type="button" class="btn primary" data-act="${act}" ${extra}>${label}</button>`;
  const sbtn = (act, label, extra = '') => `<button type="button" class="btn secondary" data-act="${act}" ${extra}>${label}</button>`;
  const back = (label = '이전') => `<button type="button" class="btn text" data-act="back">${label}</button>`;

  // ---------- step 1 ----------
  function viewUpload() {
    if (!S.records.length || S.sub[1] === 0) {
      const loaded = S.records.length > 0;
      const days = new Set(S.records.map(r => r.date)).size;
      const cnt = p => S.records.filter(r => r.part === p).length;
      return `${head(1, loaded ? '이름을 확인하고 기록 읽기를 시작하세요.' : '내 리추얼 기록 JSON 파일을 올려 주세요.')}
      <section class="panel">
        <div class="group"><h2>이 도구로 하는 일</h2>
          <ol class="how"><li>내 기록을 직접 읽고 기억에 남는 대목을 표시합니다.</li><li>AI가 기록 전체에서 강점과 이야기 초안을 뽑습니다.</li><li>내가 고르고 지우고 다듬어 제출 문서 하나를 저장합니다.</li></ol>
          <p class="help">전체 6단계입니다. 입력한 내용은 이 브라우저에만 임시로 남습니다. AI 버튼을 누를 때만 기록과 규칙이 내 Claude 계정의 AI로 전달됩니다.</p>
        </div>
        <div class="drop" id="drop">
          <p>${loaded ? `<span class="summary">${days}일 · 아침 ${cnt('아침')} · 마무리 ${cnt('마무리')}</span><br><span class="help">${esc(S.fileName)}</span>` : '파일을 여기에 놓거나 선택하세요.'}</p>
          <label class="btn ${loaded ? 'secondary' : 'primary'}" for="file">${loaded ? '다른 파일로 바꾸기' : '기록 파일 선택'}</label>
          <input type="file" id="file" accept=".json,.txt,.md,application/json,text/plain">
          ${loaded ? '<p class="help">다른 파일로 바꾸면 표시·강점·이야기가 비워집니다. 규칙과 1~8번 과제 목록은 남습니다.</p>' : ''}
          <p class="aistat" id="st-file"></p>
        </div>
        ${loaded ? `${field('name', '내 이름 (문서 첫머리에 들어갑니다)', '<span class="tag">파일에서 가져옴</span>', { ph: '이름을 적어 주세요' })}
        ${actions(pbtn('startRead', '기록 읽기 시작'))}` : ''}
      </section>`;
    }
    return viewRead();
  }
  function markPanelInner() {
    const counts = Object.keys(TYPES).map(t => `<span class="chip">${TYPES[t]} ${S.marks.filter(m => m.type === t).length}</span>`).join('');
    const list = S.marks.map(m => ({ m, k: keyInfo(m.key) })).filter(x => x.k).sort((a, b) => a.m.key.localeCompare(b.m.key, undefined, { numeric: true }));
    return `<h2>표시한 대목 ${S.marks.length}개</h2><div class="counts">${counts}</div>
      <ul class="mlist">${list.length ? list.map(({ m, k }) => `<li class="t-${m.type}"><span class="meta">${esc(k.label)}</span><span>${esc(cleanA(k.it.a).slice(0, 80))}${k.it.a.length > 80 ? '…' : ''}</span><span class="row"><button type="button" class="btn text small" data-act="goItem" data-key="${m.key}">기록으로 이동</button><select data-retype="${m.key}" aria-label="표시 종류 바꾸기">${Object.entries(TYPES).map(([t, l]) => `<option value="${t}"${t === m.type ? ' selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="btn text small" data-act="unmark" data-key="${m.key}">해제</button></span></li>`).join('') : '<li class="help">아직 표시한 대목이 없습니다. 기록에서 항목을 눌러 보세요.</li>'}</ul>`;
  }
  function viewRead() {
    const marked = new Map(S.marks.map(m => [m.key, m.type]));
    const byDate = new Map();
    S.records.forEach((r, ri) => { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push({ r, ri }); });
    const dates = [...byDate.keys()];
    return `${head(1, '기록을 읽고 되풀이되는 말, 힘이 난 날, 놀란 순간을 직접 표시하세요. 표시는 나중에 AI가 제대로 뽑았는지 견주어 보는 내 기준이며, AI에게 보내지 않습니다.')}
    <div class="readtools">
      <div class="typepick" role="group" aria-label="표시 종류">${Object.entries(TYPES).map(([t, l]) => `<button type="button" class="t-${t}" data-type="${t}" aria-pressed="${S.curType === t}"><span class="bar t-${t}"></span>${l}</button>`).join('')}</div>
      <div class="datejump"><button type="button" class="btn secondary small" data-act="prevDay">이전 날짜</button>
        <label class="help">날짜 <select id="datesel">${dates.map(d => `<option value="${d}">${d}</option>`).join('')}</select></label>
        <button type="button" class="btn secondary small" data-act="nextDay">다음 날짜</button>
        <span class="help">항목을 누르면 위에서 고른 종류로 표시되고, 다시 누르면 해제됩니다.</span></div>
    </div>
    <div class="readlayout">
      <div class="days">${dates.map(d => `<article class="day" id="day-${d}"><h2 tabindex="-1">${d}</h2><div class="dayparts">${byDate.get(d).map(({ r, ri }) => `<div class="part"><h3>${esc(r.part || '기록')}</h3>${r.items.map((it, ii) => { if (isEmptyItem(it)) return ''; const key = `${ri}:${ii}`; const t = marked.get(key); return `<button type="button" class="item${t ? ' t-' + t : ''}" id="it-${ri}-${ii}" data-key="${key}" aria-pressed="${!!t}">${itemInner(it, t)}</button>`; }).join('')}</div>`).join('')}</div></article>`).join('')}</div>
      <details class="mobilemarks" open><summary class="btn secondary small">표시한 대목 ${S.marks.length}개</summary>
      <aside class="markpanel" id="markpanel" aria-label="표시한 대목">${markPanelInner()}</aside></details>
    </div>
    ${actions(pbtn('next', '표시를 마치고 규칙으로'), back('파일·이름 확인'))}`;
  }

  // ---------- step 2 ----------
  function viewRules() {
    return `${head(2, '미리 채운 규칙 다섯을 내 말로 다듬고, 부딪칠 때의 우선순위를 적으세요. 이 규칙이 그대로 에이전트가 됩니다.')}
    <section class="panel">
      ${S.rules.map((r, i) => `<div class="rule">${field(`rules.${i}`, `규칙 ${i + 1}`, r.trim() === DEFAULT_RULES[i] ? '<span class="tag base">기본 문장 · 내 말로 고쳐 보세요</span>' : tagMe, { area: true, rows: 2 })}</div>`).join('')}
      ${field('priority', '규칙끼리 부딪칠 때 우선순위 (한 줄)', tagMe)}
      ${actions(pbtn('next', '규칙을 확인하고 강점 지도로'), back())}
    </section>`;
  }

  // ---------- step 3 ----------
  const srcLinks = ids => (ids || []).map(idToKey).filter(k => k && keyInfo(k)).map(k => `<button type="button" class="src" data-act="goItem" data-key="${k}">${esc(keyInfo(k).label)}</button>`).join('');
  function view3() {
    const sub = S.sub[3];
    if (sub === 0) return `${head(3, '1~8번 과제 산출물을 적고, 기록 전체에서 강점 후보 10개를 받아 보세요.', 0)}
      <section class="panel">
        ${field('assign', '1~8번 과제 산출물 (한 줄에 하나)', tagMe, { area: true, rows: 8, ph: '1번: 과제 제목이나 만든 것\n2번: ...', help: 'AI는 이 목록 안에서만 강점과 과제를 연결합니다. 목록에 없는 제목은 만들지 않습니다.' })}
        <p class="help">AI는 규칙과 기록 전체를 읽습니다. 내가 표시한 대목은 보내지 않습니다. 이 요청은 내 Claude 계정 사용량을 쓰고, 처음엔 허용 창이 뜹니다.</p>
        <p class="aistat" id="st-cand"></p>
        ${actions(pbtn('getCand', S.cands.length ? '후보 다시 받기' : '강점 후보 10개 받기', 'data-ai'), back() + (S.cands.length ? sbtn('toSub1', '받은 후보 보기') : ''))}
      </section>`;
    if (sub === 1) {
      const n = S.cands.filter(c => c.pick).length;
      return `${head(3, '후보 중 나를 잘 보여 주는 강점을 3개 이상 고르세요.', 1)}
      <section class="panel">
        <p class="help" aria-live="polite">${n}개 골랐습니다${n < 3 ? `. ${3 - n}개 이상 더 골라 주세요.` : '.'}</p>
        <div class="cands">${S.cands.map((c, i) => `<label class="cand"><input type="checkbox" data-cand="${i}"${c.pick ? ' checked' : ''}><span><span class="nm">${esc(c.name)}</span> <span class="tag ai">AI 후보</span><br><span class="dt">되풀이된 날 ${esc(c.days)}일</span><br>${esc(c.evidence)}<span class="srcs">${srcLinks(c.sources)}</span></span></label>`).join('') || '<p class="help">아직 후보가 없습니다. 이전 화면에서 후보를 받아 주세요.</p>'}</div>
        <p class="aistat" id="st-table"></p>
        ${actions(pbtn('getTable', S.strengths.length ? '고른 강점으로 표 다시 만들기' : '고른 강점으로 표 만들기', `data-ai${n < 3 ? ' data-locked disabled' : ''}`), back() + (S.strengths.length ? sbtn('toSub2', '만든 표 보기') : ''))}
      </section>`;
    }
    return `${head(3, '표를 원문과 대조해 아닌 내용을 지우고 이유를 남기세요. 기록에 없는 장면, 나 같지 않은 표현, 남이 말한 것을 부풀린 것이 지울 대상입니다.', 2)}
      <section class="panel">
        <div class="tabs" role="group" aria-label="보기"><button type="button" data-view="table" aria-pressed="${S.view3 === 'table'}">강점 표</button><button type="button" data-view="cmp" aria-pressed="${S.view3 === 'cmp'}">AI 강점 ↔ 내 표시</button></div>
        ${S.strengths.length > 3 ? `<p class="help">강점이 ${S.strengths.length}개입니다. 자기소개서에 쓸 대표 강점 3개에 "대표"를 눌러 주세요. 고르지 않으면 위에서부터 3개를 씁니다.</p>` : ''}
        <p class="aistat" id="st-del"></p>
        ${S.view3 === 'table' ? viewTable() : viewCmp()}
        <div class="group"><h2>내가 지운 항목과 이유 ${S.dels.length}개</h2>
          <ul class="dellog">${S.dels.length ? S.dels.map((d, i) => `<li><span><strong>${esc(d.strength)}</strong> · ${esc(d.label)}: "${esc(d.text.slice(0, 60))}${d.text.length > 60 ? '…' : ''}" → ${esc(d.reason)}</span><button type="button" class="btn text small" data-act="undoDel" data-i="${i}">되돌리기</button></li>`).join('') : '<li class="help">아직 지운 항목이 없습니다. 기록에 없는 장면이나 나답지 않은 표현을 다시 살펴보세요.</li>'}</ul>
        </div>
        ${actions(pbtn('next', '검토를 마치고 회복탄력성으로'), back('후보로 돌아가기') + sbtn('addRow', '강점 직접 추가'))}
      </section>`;
  }
  const SF = [['scene', '날짜 있는 장면'], ['peer', '동료가 말한 것 / 자신의 느낌'], ['value', '지킨 가치'], ['assignment', '1~8번 과제']];
  let pendingDel = null;
  function viewTable() {
    if (!S.strengths.length) return '<p class="help">아직 표가 없습니다. 후보를 고르고 표를 만들어 주세요.</p>';
    return S.strengths.map((s, i) => `<article class="scard" id="sc-${i}">
      <header><input type="text" data-k="strengths.${i}.name" value="${esc(s.name)}" aria-label="강점 이름" placeholder="강점 이름">
        <span class="row">${s.sources ? tagAI : tagMe}${S.strengths.length > 3 ? `<button type="button" class="btn secondary small" data-act="toggleRep" data-id="${s.id}" aria-pressed="${!!s.rep}">${s.rep ? '대표 ✓' : '대표'}</button>` : ''}<button type="button" class="btn danger small" data-act="askDel" data-i="${i}">강점 전체 지우기</button></span></header>
      ${pendingDel && pendingDel.i === i && !pendingDel.f ? delBox() : ''}
      <div class="sfields">${SF.map(([f, l]) => `<div class="sfield"><span class="lab"><span>${l}</span>${filled(s[f]) ? `<button type="button" class="btn text small" data-act="askDel" data-i="${i}" data-f="${f}">지우기</button>` : ''}</span>
        <textarea data-k="strengths.${i}.${f}" aria-label="${esc(s.name)} ${l}" placeholder="기록에서 직접 찾아 채우거나 '기록에 없음'으로 두세요">${esc(s[f])}</textarea>
        ${pendingDel && pendingDel.i === i && pendingDel.f === f ? delBox() : ''}</div>`).join('')}</div>
      ${s.sources && s.sources.length ? `<p class="help">근거 원문 <span class="srcs">${srcLinks(s.sources)}</span></p>` : ''}
    </article>`).join('');
  }
  function delBox() {
    const s = S.strengths[pendingDel.i];
    const what = pendingDel.f ? `"${s.name}"의 ${SF.find(x => x[0] === pendingDel.f)[1]}: ${s[pendingDel.f].slice(0, 80)}` : `강점 "${s.name}" 전체`;
    return `<div class="delbox"><p class="what">${esc(what)}</p>
      <label class="f"><span class="ftop"><span>왜 지우나요? (한 줄, 필수)</span>${tagMe}</span><input type="text" id="delReason" placeholder="예: 기록에 없는 장면 / 나 같지 않은 표현 / 남이 말한 것을 부풀림"></label>
      <p class="aistat err" id="delErr"></p>
      <div class="row"><button type="button" class="btn primary" data-act="doDel">이유 남기고 지우기</button><button type="button" class="btn text" data-act="cancelDel">취소</button></div></div>`;
  }
  function viewCmp() {
    if (!S.strengths.length) return '<p class="help">표를 만든 뒤에 비교할 수 있습니다.</p>';
    const aiKeys = new Map();
    S.strengths.forEach(s => (s.sources || []).map(idToKey).filter(k => k && keyInfo(k)).forEach(k => { if (!aiKeys.has(k)) aiKeys.set(k, []); aiKeys.get(k).push(s.name); }));
    const markKeys = new Set(S.marks.map(m => m.key));
    const both = S.marks.filter(m => aiKeys.has(m.key));
    const onlyMine = S.marks.filter(m => !aiKeys.has(m.key));
    const onlyAI = [...aiKeys.keys()].filter(k => !markKeys.has(k));
    const li = (k, extra) => { const x = keyInfo(k); return x ? `<li><span class="help">${esc(x.label)}${extra ? ' · ' + esc(extra) : ''}</span><span>${esc(x.text)}</span><span class="row"><button type="button" class="btn text small" data-act="goItem" data-key="${k}">원문 보기</button></span></li>` : ''; };
    return `<div class="cmp">
      <p class="help">AI에는 내 표시를 보내지 않았습니다. AI가 근거로 든 원문과 내가 표시한 원문이 같은 항목인지로 비교합니다.</p>
      <div class="group"><h3>겹치는 근거 ${both.length}개</h3><ul>${both.map(m => li(m.key, `${TYPES[m.type]} · ${aiKeys.get(m.key).join(', ')}`)).join('') || '<li class="help">없음</li>'}</ul></div>
      <div class="group"><h3>AI에만 있음 · 지울지 검토 ${onlyAI.length}개</h3><ul>${onlyAI.map(k => li(k, aiKeys.get(k).join(', '))).join('') || '<li class="help">없음</li>'}</ul></div>
      <div class="group"><h3>내 표시에만 있음 · AI가 놓친 대목 ${onlyMine.length}개</h3><ul>${onlyMine.map(m => li(m.key, TYPES[m.type])).join('') || '<li class="help">없음</li>'}</ul></div>
    </div>`;
  }

  // ---------- step 4 ----------
  function view4() {
    const sub = S.sub[4];
    if (sub === 0) return `${head(4, '이 과정에 오기 전, 가장 힘들었던 때를 연도와 장소가 있는 장면으로 적으세요. 아픈 일이 아니어도 됩니다. 처음으로 끝까지 해낸 일, 오래 걸려 익힌 일도 됩니다.', 0)}
      <section class="panel">
        <div class="grid2">${field('hardship.year', '연도', tagMe, { ph: '예: 2021' })}${field('hardship.place', '장소', tagMe, { ph: '예: 첫 직장 사무실' })}</div>
        ${field('hardship.scene', '고난 장면', tagMe, { area: true, rows: 4 })}
        ${field('hardship.changed', '그때 무엇을 바꿨는지 (한 줄)', tagMe)}
        <p class="help">3인칭 초안은 내 이야기를 남의 이야기처럼 한 걸음 떨어져 읽어 보기 위한 글입니다. AI가 이 고난과 리추얼 기록 속 '다시 일어난 날', 동료가 본 내 모습을 이어 "○○ 님은…"으로 시작하는 900자 안팎의 글을 씁니다. 읽어 보면 쑥스러운 문장과 나답지 않은 문장이 잘 보이고, 그걸 지우며 1인칭으로 고쳐 쓰는 것이 다음 할 일입니다. 기록에 없는 연결은 [채움]으로 표시됩니다.</p>
        <p class="aistat" id="st-story"></p>
        ${actions(pbtn('getStory', S.story3 ? '3인칭 초안 다시 받기' : '3인칭 초안 받기', 'data-ai'), back() + (S.story3 ? sbtn('toSub1', '받은 초안 보기') : ''))}
      </section>`;
    if (sub === 1) return `${head(4, 'AI 초안을 읽고, 나답지 않은 문장을 지운 뒤 내 손으로 1인칭으로 고쳐 쓰세요.', 1)}
      <section class="panel">
        ${field('story3', '3인칭 초안', tagAI, { area: true, long: true, ai: true, ph: 'AI 초안이 여기에 들어옵니다. AI를 쓸 수 없으면 다른 곳에서 받은 3인칭 초안을 붙여 넣어도 됩니다.', help: '다른 사람의 이름·성·직함이 들어 있으면 여기서 "강사", "동료"처럼 역할로 고쳐 주세요. 그 밖의 내용은 아래 1인칭 칸에서 고쳐 씁니다.' })}
        <div class="row">${sbtn('copy31', '3인칭 초안을 복사해 와서 고쳐 쓰기')}</div>
        ${field('story1', '1인칭 완성본', tagMe, { area: true, long: true, help: `<span class="count" id="c-story1">${S.story1.length}자</span>` })}
        ${actions(pbtn('next', '내 글을 동료에게 보여 줄 준비 완료'), back())}
      </section>`;
    return `${head(4, '1인칭 완성본을 동료 두 사람에게 읽히고, 실제로 받은 답을 이름 없이 적으세요.', 2)}
      <section class="panel">
        <p class="help">실제로 받은 답을 적는 자리입니다. 아직 받지 않았다면 나중에 이어 쓰세요. 불리한 답도 지우지 않습니다.</p>
        <div class="peers">${[0, 1].map(i => `<div class="peer"><h3><span>동료 ${i + 1}</span>${tagMe}</h3>${field(`peers.${i}.like`, '나 같은가?', '')}${field(`peers.${i}.made`, '지어낸 느낌이 있는가?', '')}</div>`).join('')}</div>
        ${actions(pbtn('next', '동료 답을 남기고 자기소개서로'), back())}
      </section>`;
  }

  // ---------- step 5 ----------
  function view5() {
    const sub = S.sub[5];
    if (sub === 0) {
      const total = (S.introFirst + S.intro + S.introLast).length;
      return `${head(5, '첫 문장과 마지막 문장은 직접 쓰고, AI가 제안한 가운데 본문을 다듬으세요. 전체 1,000자 안팎이면 됩니다.', 0)}
      <section class="panel">
        <div class="grid2">${field('reader', '누구에게 쓰나', tagMe)}${field('want', '지금 하고 싶은 것', tagMe)}</div>
        ${field('introFirst', '첫 문장', tagMe)}
        <p class="aistat" id="st-intro"></p>
        <div class="row"><button type="button" class="btn secondary" data-act="getIntro" data-ai>${S.intro ? '본문 초안 다시 받기' : '본문 초안 받기'}</button>${S.intro ? '<button type="button" class="btn secondary" data-act="polishIntro" data-ai>본문 자연스럽게 다듬기</button>' : ''}${S.introPrev ? '<button type="button" class="btn text" data-act="unpolish">다듬기 전으로</button>' : ''}</div>
        ${field('intro', '본문', tagAI, { area: true, long: true, ai: true })}
        ${field('introLast', '마지막 문장', tagMe)}
        <p class="count" id="c-intro">전체 ${total}자 (첫·마지막 문장 포함)</p>
        <details class="group"><summary class="btn secondary small">합쳐 읽기</summary><div class="readbox" id="introAll">${esc([S.introFirst, S.intro, S.introLast].map(s => s.trim()).filter(Boolean).join('\n\n')) || '<span class="help">아직 쓴 내용이 없습니다.</span>'}</div></details>
        ${actions(pbtn('next', '포트폴리오 확인으로'), back())}
      </section>`;
    }
    return `${head(5, '강점별로 연결한 1~8번 과제 산출물이 맞는지 포트폴리오 뼈대를 확인하세요.', 1)}
      <section class="panel">
        <div class="group"><div class="ftop"><h2>포트폴리오 뼈대</h2><span class="tag">입력한 내용으로 구성</span></div>
          <ul class="portfolio"><li>이름: ${esc(S.name)}</li><li>자기소개서: 문서 5절</li><li>강점 셋과 증거<ul>${S.strengths.map(s => `<li>${esc(s.name)}: ${esc(s.assignment) || '<span class="help">(3단계에서 1~8번 산출물 연결 필요)</span>'}</li>`).join('')}</ul></li><li>앞으로 채울 자리: 10번 논문 / 11번 소설 / 마지막 과제 대표작</li></ul></div>
        ${actions(pbtn('next', '최종 점검으로'), back() + sbtn('goStep', '강점 지도에서 과제 연결 고치기', 'data-step="3" data-sub="2"'))}
      </section>`;
  }

  // ---------- step 6 ----------
  const fname = () => `T09_${(S.name.trim() || '이름').replace(/[\\/:*?"<>|\s]+/g, '_')}.${S.fmt}`;
  function view6() {
    const cs = checks();
    const n = st => cs.filter(c => c.state === st).length;
    const label = { ok: CHECK_ICON, check: '확인해 주세요', empty: '비어 있음' };
    const hasEmpty = n('empty') > 0;
    return `${head(6, '비어 있는 항목과 확인할 내용을 살핀 뒤, 서사 문서 하나로 저장하세요.')}
      <section class="panel">
        <div class="chsum"><span class="chip ok">${CHECK_ICON} ${n('ok')}</span><span class="chip check">확인해 주세요 ${n('check')}</span><span class="chip empty">비어 있음 ${n('empty')}</span></div>
        <ul class="checks" id="checks">${cs.map(c => `<li class="${c.state}"><span class="st">${label[c.state]}</span><span class="code">${c.c}</span><span>${esc(CRIT[c.c])}${c.state !== 'ok' && c.note ? `<br><span class="help">${esc(c.note)}</span>` : ''}</span>${c.step !== 6 && c.state !== 'ok' ? `<button type="button" class="btn text small" data-act="goStep" data-step="${c.step}" data-sub="${c.sub}">${STEPS[c.step]}로 이동</button>` : '<span></span>'}</li>`).join('')}</ul>
        ${storageOk ? '' : '<p class="notice warn">이 브라우저에 임시 저장하지 못했습니다. 창을 닫기 전에 내용을 복사해 주세요.</p>'}
        <div class="group"><h2>최종 문서 미리 보기</h2><pre class="doc" id="doc">${esc(buildDoc())}</pre></div>
        <div class="row"><label class="help">형식 <select id="fmt"><option value="md"${S.fmt === 'md' ? ' selected' : ''}>MD</option><option value="txt"${S.fmt === 'txt' ? ' selected' : ''}>TXT</option></select></label><span class="help" id="fname">${esc(fname())}</span></div>
        <p class="aistat" id="st-save"></p>
        ${actions(pbtn('save', hasEmpty ? '비어 있는 항목부터 채우기' : '서사 문서 저장'), back() + sbtn('copy', '문서 내용 복사'))}
        <div class="reset"><button type="button" class="btn text small" data-act="reset">이 브라우저의 작업 지우기</button><div id="resetBox"></div></div>
      </section>`;
  }

  // ---------- nav & render ----------
  function renderNav() {
    const cs = checks();
    const done = step => STEP_CODES[step].every(c => cs.find(x => x.c === c).state !== 'empty');
    $('#stepnav').innerHTML = [1, 2, 3, 4, 5, 6].map(i => `<li><button type="button" data-goto="${i}"${S.step === i ? ' aria-current="step"' : ''}><span class="n">${i}</span>${STEPS[i]}${i < 6 && done(i) ? `<span class="st">${CHECK_ICON}</span>` : ''}</button></li>`).join('');
    $('#mpos').textContent = `${S.step}/6 ${STEPS[S.step]}`;
  }
  function render(focus = true) {
    const v = { 1: viewUpload, 2: viewRules, 3: view3, 4: view4, 5: view5, 6: view6 }[S.step];
    main.innerHTML = v();
    renderNav();
    applyRunLock();
    if (run) setStat(run.key, '<span>AI가 작성 중입니다.</span><button type="button" class="btn secondary small" data-act="stop">중지</button>');
    const ds = $('#datesel'); if (ds) ds.value = currentDay();
    if (focus) { const t = $('#stepTitle'); if (t) t.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
    save();
  }
  function go(step, sub) {
    step = Number(step);
    if (sub != null && sub !== '' && S.sub[step] != null) S.sub[step] = Number(sub);
    if (step === 1 && S.records.length && sub == null) S.sub[1] = 1;
    S.step = step; pendingDel = null;
    $('#stepnav').classList.remove('open'); $('#navToggle').setAttribute('aria-expanded', 'false');
    render();
  }
  function next() {
    const subs = SUBS[S.step];
    if (S.step === 1 && S.sub[1] === 0) { S.sub[1] = 1; return render(); }
    if (subs && S.sub[S.step] < subs.length - 1) { S.sub[S.step]++; return render(); }
    if (S.step < 6) go(S.step + 1, SUBS[S.step + 1] ? 0 : null);
  }
  function prev() {
    if (S.step === 1) { S.sub[1] = 0; return render(); }
    if (SUBS[S.step] && S.sub[S.step] > 0) { S.sub[S.step]--; pendingDel = null; return render(); }
    const p = S.step - 1;
    go(p, SUBS[p] ? SUBS[p].length - 1 : p === 1 ? 1 : null);
  }
  function currentDay() {
    const days = [...document.querySelectorAll('.day')];
    let cur = days[0];
    for (const d of days) { if (d.getBoundingClientRect().top - 170 <= 0) cur = d; else break; }
    return cur ? cur.id.slice(4) : '';
  }
  function jumpDay(d) { const el = document.getElementById('day-' + d); if (!el) return; el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); el.querySelector('h2').focus({ preventScroll: true }); $('#datesel').value = d; }
  function goItem(key) {
    if (S.step !== 1 || S.sub[1] !== 1) { S.step = 1; S.sub[1] = 1; pendingDel = null; render(false); }
    const el = document.getElementById('it-' + String(key).replace(':', '-'));
    if (!el) return;
    el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200);
  }
  function loadFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      const { records, student } = parseRecords(String(rd.result));
      if (!records.length) { setStat('file', '기록을 읽지 못했어요. student와 days가 있는 JSON인지 확인해 주세요. 기존 작업은 그대로 있습니다.', 'err'); return; }
      if (S.records.length) { stopAI(); gen++; const fresh = blank(); Object.assign(fresh, { rules: S.rules, priority: S.priority, assign: S.assign }); S = fresh; }
      S.records = records; S.fileName = file.name; if (!filled(S.name) && student) S.name = student;
      S.step = 1; S.sub[1] = 0; render();
    };
    rd.onerror = () => setStat('file', '파일을 열지 못했습니다. 다시 선택해 주세요.', 'err');
    rd.readAsText(file, 'utf-8');
  }

  // ---------- AI actions ----------
  // AI JSON is untrusted: keep only well-formed objects so a bad answer never wipes the current results
  const objs = v => Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : [];
  const str = v => typeof v === 'string' ? v : v == null ? '' : String(v);
  // With more than three strengths, the self-introduction uses the three the student marked (or the first three)
  const repStrengths = () => { const st = S.strengths.filter(s => filled(s.name)); const r = st.filter(s => s.rep); return st.length > 3 && r.length ? r : st.slice(0, 3); };
  const repCount = () => S.strengths.filter(s => s.rep && filled(s.name)).length;
  const srcs = v => Array.isArray(v) ? v.map(String).filter(id => { const k = idToKey(id); return k && keyInfo(k); }) : [];
  async function getCand() {
    if (!confirmReplace('cand', S.cands.length, '강점 후보')) return;
    const prompt = BASE() + `[1~8번 과제 산출물]\n${S.assign.trim() || '(없음)'}\n\n[리추얼 기록, 날짜순. 괄호 안은 항목 번호]\n${recordsForAI()}\n\n강점 후보를 여러 날 되풀이된 순서로 10개 뽑아라. 형용사만 쓰지 말고 근거가 된 기록 항목 번호와 대표 장면 한 줄을 붙여라. 다음 형식의 JSON 배열만 답하라: [{"name":"강점 이름(짧게)","days":되풀이된 서로 다른 날짜 수(숫자),"evidence":"날짜로 시작하는 대표 장면 한 줄","sources":["r0-3","r5-1"]}]`;
    const out = await runAI('cand', prompt, { json: true });
    if (out === null) return;
    const cands = objs(out).map(c => ({ name: str(c.name).trim(), days: Number(c.days) || 0, evidence: str(c.evidence), sources: srcs(c.sources), pick: false })).filter(c => c.name).slice(0, 12);
    if (!cands.length) { setStat('cand', esc(ERR.invalid_json), 'err'); return; }
    S.cands = cands; S.sub[3] = 1; render();
  }
  async function getTable() {
    const picks = S.cands.filter(c => c.pick);
    if (picks.length < 3) return;
    if (!confirmReplace('table', S.strengths.length, '강점 표')) return;
    const prompt = BASE() + `[1~8번 과제 산출물 — 이 목록 안에서만 연결하고, 없으면 빈 문자열]\n${S.assign.trim() || '(없음)'}\n\n[리추얼 기록, 날짜순. 괄호 안은 항목 번호]\n${recordsForAI()}\n\n[학생이 고른 강점]\n${picks.map(c => '- ' + c.name).join('\n')}\n\n고른 강점마다 다음을 채워라. scene: 기록에 있는 날짜(YYYY-MM-DD)로 시작하는 장면 한두 문장. peer: 동료가 해 준 말이 기록에 있으면 "동료: ..." 형식으로, 없으면 "자신의 느낌: ..."으로 기록 속 학생의 느낌을 쓴다(새로 지어내지 않는다). value: 그때 지킨 가치. assignment: 위 과제 목록 중 그 강점이 드러난 것(번호 포함, 목록에 없으면 빈 문자열). sources: 근거가 된 항목 번호 배열. 강점끼리 서로 다른 장면으로 구분되게 하라. 다음 JSON 배열만 답하라: [{"name":"","scene":"","peer":"","value":"","assignment":"","sources":["r0-3"]}]`;
    const out = await runAI('table', prompt, { json: true });
    if (out === null) return;
    const rows = objs(out).map(s => ({ id: uid(), rep: false, name: str(s.name).trim(), scene: str(s.scene), peer: str(s.peer), value: str(s.value), assignment: str(s.assignment), sources: srcs(s.sources) })).filter(s => s.name);
    if (!rows.length) { setStat('table', esc(ERR.invalid_json), 'err'); return; }
    S.strengths = rows; S.sub[3] = 2; S.view3 = 'table'; render();
  }
  // Shared writing rules for every prose request: the first drafts read like a data dump (many dates, record field names, tallies)
  const STORY_STYLE = '글쓰기 방식: 처음 읽는 사람이 한 번에 이해하는 짧은 에세이처럼 쓴다. 문단은 4개, 문단마다 장면 하나를 중심에 둔다. 한 문장에는 한 가지 내용만 담고 짧게 쓴다. 사건을 나열하지 말고 원인과 결과가 이어지게 쓴다. 날짜는 꼭 필요한 장면에만 붙이고 전체에서 3개를 넘기지 않는다. 기록의 질문 이름(예: "강점 행동", "첫 행동", "감사일기")이나 "며칠 나온다" 같은 집계 표현을 쓰지 말고 그 내용을 자연스러운 문장으로 풀어 쓴다. 기록을 따옴표로 그대로 옮기는 것은 전체에서 두 번 이하로 한다. 기록 속 낯선 줄임말이나 수업 용어는 풀어 쓰거나 뺀다. 다른 사람은 이름, 성, 성+직함(예: 김 과장님)으로 부르지 말고 "강사", "동료"처럼 역할로만 부른다. 과장된 수식어 없이 담백하게 쓴다.';
  async function getStory() {
    const h = S.hardship;
    const miss = ['year', 'place', 'scene', 'changed'].find(k => !filled(h[k]));
    if (miss) { setStat('story', '연도, 장소, 고난 장면, 바꾼 것을 먼저 직접 적어 주세요.', 'err'); const el = document.getElementById('f-hardship-' + miss); el && el.focus(); return; }
    if (!confirmReplace('story', filled(S.story3), '3인칭 초안')) return;
    const name = S.name.trim() || '학생';
    const prompt = BASE() + `[리추얼 기록, 날짜순]\n${recordsForAI()}\n\n[검토를 마친 강점]\n${S.strengths.map(s => `- ${s.name}: ${s.scene}`).join('\n') || '(없음)'}\n\n[과정 이전의 고난 — 학생이 직접 씀]\n${h.year}년, ${h.place}. ${h.scene}\n그때 바꾼 것: ${h.changed}\n\n고난에서 다시 일어나 더 나아진 지금에 이르는 이야기를 3인칭으로 900자 안팎으로 써라. "${name} 님은 ${h.year}년"으로 시작한다.
내용: 1) 고난: 학생이 쓴 장면만 쓰고 과거를 새로 지어내지 않는다. 2) 다시 일어난 날: 리추얼 기록에서 같은 힘이 다시 드러난 날 하나를 고른다. 마무리 기록에 "못 했다"고 적은 다음 날 무엇을 바꿨는지가 고비다. 3) 남이 본 나: 동료가 말해 준 모습 하나. 4) 더 나아진 나: 지금 무엇이 달라졌고 앞으로 무엇을 하고 싶은지.
${STORY_STYLE}
기록에 없는 연결은 규칙 ④대로 채우되, 채운 문장 끝에만 [채움]을 붙인다. 항목 번호는 쓰지 않는다. 본문만 답하라.`;
    const out = await runAI('story', prompt, {});
    if (out) { S.story3 = out; S.sub[4] = 1; render(); }
  }
  async function getIntro() {
    if (!filled(S.story1)) { setStat('intro', '4단계의 1인칭 완성본을 먼저 써 주세요.', 'err'); return; }
    if (S.strengths.length > 3 && repCount() && repCount() !== 3) { setStat('intro', `대표 강점을 ${repCount()}개 골랐습니다. 강점 지도에서 정확히 3개를 골라 주세요.`, 'err'); return; }
    if (!confirmReplace('intro', filled(S.intro), '본문')) return;
    const prompt = `아래 1인칭 이야기를 바탕으로 자기소개서의 가운데 본문을 새로 써라. 이야기 문장을 오려 붙이지 말고, 한 사람이 처음부터 자기 말로 쓴 글처럼 자연스럽게 다시 쓴다.
구성: 문단 3개, 800자 안팎. 1) 내가 어떤 사람인지 보여 주는 장면 한두 개 속에 강점 셋(${repStrengths().map(s => s.name).join(', ')})이 자연스럽게 드러나게 한다. "첫째, 둘째"처럼 강점을 나열하지 않는다. 2) 고비 한 장면과 그때 무엇을 바꿨는지. 3) 그래서 지금 하고 싶은 것(${S.want.trim() || '이야기에서 찾기'}).
반드시 지킬 것: 이름(${S.name.trim() || '학생'})을 본문에 한 번 자연스럽게 넣는다. 읽는 사람은 ${S.reader.trim() || '나를 처음 만나는 사람'}이다. 문단과 문장이 앞뒤로 이어지게 접속과 흐름을 신경 쓴다. 날짜는 많아야 하나. 기록의 질문 이름, 집계 표현, [채움] 표시, 다른 사람의 이름·성·직함은 쓰지 않는다. 문장은 짧고 담백하게, 과장된 수식어 없이 쓴다. 첫 문장과 마지막 문장은 학생이 직접 쓰므로 그 사이에 자연스럽게 이어지는 본문만 답하라.\n\n[학생이 직접 쓴 첫 문장] ${S.introFirst.trim() || '(아직 없음)'}\n[학생이 직접 쓴 마지막 문장] ${S.introLast.trim() || '(아직 없음)'}\n\n[1인칭 이야기]\n${S.story1}`;
    const out = await runAI('intro', prompt, { onText: t => { const ta = $('#f-intro'); if (ta) ta.value = t; }, lock: 'f-intro' });
    if (out) { S.intro = out; S.introPrev = ''; render(false); setStat('intro', '완료했습니다. 합쳐 읽기에서 첫 문장·마지막 문장과 이어지는지 확인해 주세요.'); }
    else { const ta = $('#f-intro'); if (ta) ta.value = S.intro; }
  }

  async function polishIntro() {
    if (!filled(S.intro)) { setStat('intro', '다듬을 본문이 없습니다. 먼저 본문 초안을 받거나 써 주세요.', 'err'); return; }
    const before = S.intro;
    const prompt = `다음은 자기소개서 본문이다. 내용과 사실은 바꾸지 말고, 짜깁기한 느낌이 나는 곳을 자연스럽게 이어지도록 문장만 다듬어라. 문장 사이 연결, 중복 표현, 어색한 인용, 날짜 나열, 기록의 질문 이름을 정리하고 분량은 비슷하게 유지한다. 새 사건이나 사실을 더하지 않는다. 이름(${S.name.trim() || '학생'})은 남긴다. 다른 사람의 이름·성·직함은 역할(강사, 동료)로 바꾼다. 다듬은 본문만 답하라.\n\n[첫 문장 — 바꾸지 말 것] ${S.introFirst.trim() || '(없음)'}\n[마지막 문장 — 바꾸지 말 것] ${S.introLast.trim() || '(없음)'}\n\n[본문]\n${S.intro}`;
    const out = await runAI('intro', prompt, { onText: t => { const ta = $('#f-intro'); if (ta) ta.value = t; }, lock: 'f-intro' });
    if (out) { S.introPrev = before; S.intro = out; save(); render(false); setStat('intro', '다듬었습니다. 마음에 들지 않으면 다듬기 전으로 되돌릴 수 있습니다.'); }
    else { const ta = $('#f-intro'); if (ta) ta.value = S.intro; }
  }

  // ---------- events ----------
  let fromCheck = false;
  // Marking patches the one item and the side panel instead of redrawing all 35 days
  const itemInner = (it, t) => `${t ? `<span class="mk">${TYPES[t]}</span>` : ''}<span class="q">${esc(it.q)}</span><span class="a">${esc(cleanA(it.a))}</span>`;
  function toggleMark(el) {
    const key = el.dataset.key; const i = S.marks.findIndex(m => m.key === key);
    if (i >= 0) S.marks.splice(i, 1); else S.marks.push({ key, type: S.curType });
    const t = i >= 0 ? null : S.curType;
    el.className = 'item' + (t ? ' t-' + t : '');
    el.setAttribute('aria-pressed', String(!!t));
    el.innerHTML = itemInner(keyInfo(key).it, t);
    const panel = $('#markpanel'); if (panel) panel.innerHTML = markPanelInner();
    const sum = document.querySelector('.mobilemarks > summary'); if (sum) sum.textContent = `표시한 대목 ${S.marks.length}개`;
    save(); clearTimeout(navT); navT = setTimeout(renderNav, 200);
  }
  function updateCounts() {
    const c1 = $('#c-story1'); if (c1) c1.textContent = `${S.story1.length}자`;
    const ci = $('#c-intro'); if (ci) ci.textContent = `전체 ${(S.introFirst + S.intro + S.introLast).length}자 (첫·마지막 문장 포함)`;
    const ia = $('#introAll'); if (ia) ia.textContent = [S.introFirst, S.intro, S.introLast].map(s => s.trim()).filter(Boolean).join('\n\n');
  }
  let navT;
  document.addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.k;
    if (!k) return;
    setPath(S, k, e.target.value);
    save(); updateCounts();
    clearTimeout(navT); navT = setTimeout(renderNav, 400);
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'file' && t.files && t.files[0]) loadFile(t.files[0]);
    else if (t.dataset.cand != null) { S.cands[t.dataset.cand].pick = t.checked; render(false); const el = document.querySelector(`[data-cand="${t.dataset.cand}"]`); el && el.focus(); }
    else if (t.dataset.retype) { const m = S.marks.find(x => x.key === t.dataset.retype); if (m) { m.type = t.value; render(false); } }
    else if (t.id === 'datesel') jumpDay(t.value);
    else if (t.id === 'fmt') { S.fmt = t.value; save(); $('#fname').textContent = fname(); }
  });
  main.addEventListener('dragover', e => { const d = e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  main.addEventListener('dragleave', e => { const d = e.target.closest('#drop'); if (d) d.classList.remove('over'); });
  main.addEventListener('drop', e => { const d = e.target.closest('#drop'); if (!d) return; e.preventDefault(); d.classList.remove('over'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });
  $('#navToggle').addEventListener('click', () => { const open = $('#stepnav').classList.toggle('open'); $('#navToggle').setAttribute('aria-expanded', String(open)); });
  $('#stepnav').addEventListener('click', e => { const b = e.target.closest('[data-goto]'); if (b) { fromCheck = false; go(b.dataset.goto); } });
  main.addEventListener('click', async e => {
    const it = e.target.closest('.item');
    if (it) { toggleMark(it); return; }
    const tp = e.target.closest('[data-type]'); if (tp) { S.curType = tp.dataset.type; document.querySelectorAll('.typepick button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === S.curType))); save(); return; }
    const tab = e.target.closest('[data-view]'); if (tab) { S.view3 = tab.dataset.view; pendingDel = null; render(false); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'next') next();
    else if (a === 'back') prev();
    else if (a === 'startRead') { S.sub[1] = 1; render(); }
    else if (a === 'toSub1') { S.sub[S.step] = 1; render(); }
    else if (a === 'toSub2') { S.sub[S.step] = 2; render(); }
    else if (a === 'goStep') { fromCheck = S.step === 6; go(b.dataset.step, b.dataset.sub); }
    else if (a === 'goItem') goItem(b.dataset.key);
    else if (a === 'unmark') { S.marks = S.marks.filter(m => m.key !== b.dataset.key); render(false); }
    else if (a === 'prevDay' || a === 'nextDay') { const ds = $('#datesel'); const opts = [...ds.options].map(o => o.value); const i = opts.indexOf(currentDay()); const j = Math.max(0, Math.min(opts.length - 1, i + (a === 'nextDay' ? 1 : -1))); jumpDay(opts[j]); }
    else if (a === 'stop') { const k = run && run.key; stopAI(); if (k) setStat(k, '요청을 중지했습니다. 직접 쓴 내용은 그대로 있습니다.'); }
    else if (a === 'getCand') getCand();
    else if (a === 'getTable') getTable();
    else if (a === 'getStory') getStory();
    else if (a === 'getIntro') getIntro();
    else if (a === 'polishIntro') polishIntro();
    else if (a === 'unpolish') { if (S.introPrev) { S.intro = S.introPrev; S.introPrev = ''; render(false); } }
    else if (a === 'addRow') { S.strengths.push({ id: uid(), rep: false, name: '', scene: '', peer: '', value: '', assignment: '', sources: null }); render(false); }
    else if (a === 'askDel') { pendingDel = { i: Number(b.dataset.i), f: b.dataset.f || null }; render(false); const r = $('#delReason'); if (r) { r.scrollIntoView({ block: 'center' }); r.focus({ preventScroll: true }); } }
    else if (a === 'cancelDel') { pendingDel = null; render(false); }
    else if (a === 'doDel') {
      const reason = ($('#delReason').value || '').trim();
      if (!reason) { $('#delErr').textContent = '왜 지우는지 한 줄 적어 주세요.'; $('#delReason').focus(); return; }
      const s = S.strengths[pendingDel.i];
      if (pendingDel.f) { S.dels.push({ sid: s.id, strength: s.name, field: pendingDel.f, label: SF.find(x => x[0] === pendingDel.f)[1], text: s[pendingDel.f], reason }); s[pendingDel.f] = ''; }
      else { S.dels.push({ sid: s.id, strength: s.name, field: null, label: '강점 전체', text: [s.scene, s.peer].filter(Boolean).join(' / '), reason, row: { ...s }, at: pendingDel.i }); S.strengths.splice(pendingDel.i, 1); }
      pendingDel = null; render(false);
    }
    else if (a === 'undoDel') {
      const i = Number(b.dataset.i); const d = S.dels[i]; if (!d) return;
      if (d.field) {
        const s = S.strengths.find(x => x.id === d.sid);
        if (!s) { setStat('del', '이 강점은 표에서 이미 빠져 되돌릴 수 없습니다. 지운 기록은 그대로 남깁니다.', 'err'); return; }
        if (filled(s[d.field])) { setStat('del', `"${esc(s.name)}"의 ${esc(d.label)} 칸에 이미 새 내용이 있어 되돌리지 않았습니다.`, 'err'); return; }
        s[d.field] = d.text;
      } else if (d.row) S.strengths.splice(Math.min(d.at ?? S.strengths.length, S.strengths.length), 0, d.row);
      S.dels.splice(i, 1); render(false);
    }
    else if (a === 'toggleRep') {
      const s = S.strengths.find(x => x.id === b.dataset.id); if (!s) return;
      if (!s.rep && repCount() >= 3) { setStat('del', '대표 강점은 3개까지 고를 수 있습니다. 다른 강점의 대표를 먼저 풀어 주세요.', 'err'); return; }
      s.rep = !s.rep; render(false); setStat('del', `대표 강점 ${repCount()}/3개`);
    }
    else if (a === 'copy31') { if (!filled(S.story1)) { S.story1 = S.story3; const ta = $('#f-story1'); if (ta) ta.value = S.story1; save(); updateCounts(); } const ta = $('#f-story1'); if (ta) ta.focus(); }
    else if (a === 'save') {
      const first = checks().find(c => c.state === 'empty');
      if (first) { go(first.step, first.sub); return; }
      const data = S.fmt === 'txt' ? toTxt(buildDoc()) : buildDoc();
      let dl = null;
      try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (err) { dl = null; }
      if (!dl) { setStat('save', '여기서는 파일로 저장할 수 없습니다. 문서 내용 복사를 눌러 메모장에 붙여넣고 .md로 저장해 주세요.', 'err'); return; }
      setStat('save', '저장 확인 창을 열었습니다.');
      try { await dl.save({ filename: fname(), data }); setStat('save', `저장했습니다. ${esc(fname())}`); }
      catch (err) { setStat('save', err && err.code === 'declined' ? '저장을 취소했습니다.' : '파일 저장을 마치지 못했습니다. 문서 내용 복사를 눌러 메모장에 붙여넣고 저장해 주세요.', 'err'); }
    }
    else if (a === 'copy') {
      const data = S.fmt === 'txt' ? toTxt(buildDoc()) : buildDoc();
      try { await navigator.clipboard.writeText(data); setStat('save', '복사했습니다.'); }
      catch (err) { const r = document.createRange(); r.selectNodeContents($('#doc')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); setStat('save', '미리 보기 전체를 선택해 두었습니다. Ctrl+C(맥은 ⌘C)로 복사해 주세요.'); }
    }
    else if (a === 'reset') { $('#resetBox').innerHTML = '<p class="notice warn">이 브라우저에 남은 기록·표시·규칙·글이 모두 지워집니다. 이미 저장한 제출 파일은 지워지지 않습니다.</p><div class="row"><button type="button" class="btn danger small" data-act="resetYes">모두 지우기</button><button type="button" class="btn text small" data-act="resetNo">취소</button></div>'; }
    else if (a === 'resetNo') $('#resetBox').innerHTML = '';
    else if (a === 'resetYes') { stopAI(); gen++; try { localStorage.removeItem(KEY); } catch (err) {} S = blank(); render(); }
    else if (a === 'backToCheck') { fromCheck = false; go(6); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'delReason') { e.preventDefault(); const b = main.querySelector('[data-act="doDel"]'); b && b.click(); } });
  let scT; window.addEventListener('scroll', () => { clearTimeout(scT); scT = setTimeout(() => { const ds = $('#datesel'); if (ds) ds.value = currentDay(); }, 120); }, { passive: true });

  render(false);
  (window.claude && window.claude.use ? window.claude.use('sample') : Promise.resolve(null)).then(s => { sample = s; }, () => { sample = null; });
})();
