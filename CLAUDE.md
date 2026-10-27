# SchoolMate AI — Claude Code 인수인계

창원대산고등학교 학생용 일정·시간표 웹앱이다. claude.ai 아티팩트로 만들어졌고, 코드는 HTML·CSS·JS가 한 파일에 들어 있다(`app/schoolmate-ai.html`, 약 5,600줄). 같은 파일로 설치형 앱(GitHub Pages)도 만든다(9번). 사용자는 한국어를 쓰며 주로 갤럭시 탭 크롬에서 확인한다. 답은 한국어로 짧게 한다.

- 아티팩트: https://claude.ai/artifact/HkDoYdytpVRMNsJVGCA59L (링크가 있으면 누구나 볼 수 있음). 페이지 소스는 `app/schoolmate-ai.html`이다. 고친 뒤 같은 URL로 다시 올리고(먼저 Artifact `read`로 다른 사람이 바꾼 것이 없는지 본다), 이 파일도 커밋한다. 커밋하면 앱도 다시 배포된다.
- 앱: https://kimseongjinedu.github.io/kimseongjinedu/ (9번).
- `scripts/`: 컴시간 동기화(8번), 앱 빌드(9번).

## 1. 가장 먼저 알아야 할 것: 실행 환경

이 앱은 claude.ai 아티팩트 런타임의 `window.claude.use(name)`에 기대고 있다.

| 이름 | 용도 |
|---|---|
| `db` | 로그인 사용자별 저장. `data/users/<uid>/planner/schedules`(계획), `data/users/<uid>/timetable`(블록·반·학년), `data/users/<uid>/supplies`(수업 준비물). 공유 문서 `school/timetable`(컴시간 시간표, 평일 수업 시간마다·일요일 저녁 갱신, 편집자 이상만 쓰기) |
| `sample` | AI 호출. `ai.fn.json(prompt, { modelTier: 'quick' \| 'default' })` |
| `assets` | 첨부 파일. `/_blob/<id>`로 제공 |
| `permissions`, `user`, `downloads` | AI 허용 상태, 사용자 id, 파일 내려받기 |

claude.ai 밖(로컬 파일, 다른 호스팅, 9번의 앱)에서는 이 API가 없다. 그래서 자동으로 localStorage에 저장하고, AI 없는 "기본 모드"(규칙 기반)로 돈다.

자체 호스팅에서 AI를 쓰려면 `ai.fn`을 Anthropic Messages API 호출로 바꿔야 한다. API 키는 브라우저에 두지 말고 서버 프록시를 둔다. 호출 비용이 든다. 첨부 파일과 db도 대체 저장소가 필요하다.

localStorage 키: `schoolmate-ai:schedules:v1`, `:timetable:v1`, `:supplies:v1`, `:classno:v1`, `:grade:v1`, `:ttsel:v1`, `:ttweek:v1`, `:view:v1`, `:dismissed:v1`, `:live-tt:v1`(마지막으로 받은 `school/timetable` 사본, 첫 화면용)

## 2. 데이터

```js
// 계획
{ id, title(≤60), deadline:'YYYY-MM-DD'|'' /*''=마감 기한 없음*/, time:'' /*항상 빈 값*/, importance:'high'|'normal'|'low',
  memo(≤1000), supplies:[문자열 ≤10개], duration(분, 0=미입력→60분으로 계산),
  repeatType:'none', repeatEvery:1, repeatDays:[], repeatCount:0 /*반복 규칙은 없앴다. clean()이 항상 none으로 만든다*/, startDate,
  files:[{id,name,type,size}], done, createdAt }
// 시간표 블록 (date가 null이면 '배치되지 않은 블록'의 카드)
{ id, itemId, title, importance, date:'YYYY-MM-DD'|null, start:분|null, dur:분 }
// 수업 준비물 저장 형식
{ occ:[{ d:'YYYY-MM-DD', p:교시index, items:[] }], subj:[{ s:과목키, items:[] }] }
//   과목키: 정확한 과목명 | '@과목군'(예 '@체육') | '~줄임말'(예 '~스생')
```

학교 자료(전부 코드 안 상수):
- `G1_TT`, `G2_TT`, `G3_TT`: `[요일 0~4][교시 0~7] = '과목 교사|과목 교사|…'`(1~7반). 컴시간 기본 시간표(2026-10-26 주)로 채운 예비 자료다. 평소에는 8번의 `school/timetable`이 이것을 대신한다. **8반부터는 쓰지 않는다**(특별반, 사용자 확인). `SUBJ_NAME`은 1학년 줄임말을 정식 이름으로 바꾼다. 2·3학년은 컴시간 줄임말을 그대로 쓴다.
- `ALL_SCHOOL_EVENTS`: `[시작, 끝, 이름, kind, grades?]`. kind는 `exam|holiday|vacation|event|trip`이다. `applyGradeEvents()`가 고른 학년의 일정만 `SCHOOL_EVENTS`와 `schoolByDay`에 채운다.
- 시간표·학사일정 범위: 2026-10-01 ~ 2026-12-31(`TT_FROM`, `TT_TO`, `CLASS_FROM`, `CLASS_TO`).
- `PERIODS`: 1교시 08:40부터 50분 수업, 10분 쉬는 시간. `LUNCH`: 12:30~13:30.

### 반복하는 날 = 시간표에 놓은 날 (2026-10-18 바뀜)
- 계획에는 반복 설정이 없다(편집 화면에서 뺐다). 계획의 블록이 시간표에 놓인 날과 시각이 그 계획의 "반복하는 날"이다. `placedByItem()`/`placedOf(id)`(ttState.blocks 배열이 바뀔 때마다 다시 계산)로 구한다.
- 목록: 2번 이상 놓였으면 "반복 N회 · 시간표에 놓은 날" + 칩(`placeChips`, "10/21 수 17:00", 지난 것 흐리게, 다음 것 강조, 마감 뒤는 점선). 1번이면 "시간표 10월 21일(수) 17:00~18:00". 캘린더의 반복 표시와 날짜 칸(반복 n/total, 시각)도 같은 자료를 쓴다.
- 마감 기한은 선택이다. 비우면 `deadline:''`, 목록에 "마감 기한 없음", D-day 없음, 정렬은 맨 뒤(`dueKey`). 끝 날짜가 없는 명령은 12월 31일까지만 한다.
- '배치되지 않은 블록'의 카드는 틀이다. 시간표에 놓으면(끌기, 또는 카드를 누르고 빈 칸 누르기) 복사본이 놓이고 카드는 남는다(`placeCopy`). 누른 채로 여러 날을 누를 수 있다. 시간표의 블록을 빼면(트레이로 끌기, 배치 빼기, Delete) 같은 계획의 카드가 이미 있을 때는 지우고, 없으면 카드가 된다(`unplaceBlock`).
- 카드(트레이 또는 시간표)를 누른 상태에서는 트레이 머리의 "모두 지우기"가 쓰레기통이 되고, 누르면 그 카드만 지운다(`syncTrayClear`).
- 편집 화면: 취소 버튼은 위쪽(`.ed-top`), 저장 버튼은 아래쪽. 목록·캘린더·시간표 탭을 바꾸거나 휴대폰에서 SchoolMate AI 탭으로 가면 편집 화면이 닫힌다(`setPageView`, `setView`).
- 중복·겹침 알림은 모두 껐다(사용자 요청): 겹침 막대, '겹침' 표시, "겹치는 일정이 있어요" 토스트, 채팅 안내, 학교 시간표가 바뀌었다는 토스트. `renderList`에서 `groups = []`. '중복 계획 정리' 명령은 그대로 된다.

## 3. 학교 시간표 규칙 (`classBlocksFor(k)`)
- 수요일 5·6교시: 동아리활동, 또는 그날 학사일정의 활동(`wedActivity`).
- 목요일 7교시: 학급특색활동.
- 월요일에 '특색활동' 일정이 있으면 1교시 자율활동 자리를 그 활동으로 바꾼다(추정 규칙).
- 시험 날: 하루를 시험 블록 하나로 표시한다. 목요일이면 7교시만 학급특색활동이다. 수능은 하루 종일이다.
- `trip`(수학여행, 현장체험학습 등): 하루 종일 블록이다.
- 학교 수업 시간에는 계획 블록을 놓을 수 없다(`schoolSpan`, `schoolPseudo`).

## 4. 채팅 처리 흐름
`send()` → `splitSteps()` → 단계마다 `routeStep()`.

`splitSteps`는 연결어(만들고, 추가하고, 추가해서, 만든 다음, 그리고 …), 문장부호, 쉼표 목록 속 시간표 명령·질문, 끝에 붙은 "시간표 (N개) (만들기)"로 단계를 나눈다.

`routeStep` 순서:
1. 학교 시간표 끄기
2. 반·학년 바꾸기
3. "N일 시간표" 조회
4. 준비물 설정(`supplyIntent` → `runSupplyCommand`)
5. 준비물 질문
5-1. 반복 배치(`REPEAT_WORD` → `repeatTargets` → `runRepeatPlace`/`repeatPlan`): "2일마다 11월 30일까지 5시부터 선택한 계획 추가해 줘". 대상은 같은 메시지에서 만든 계획 → 체크한 계획(없으면 시간표에서 누른 카드의 계획) → '모든 계획' → 이름이 나온 계획 순. 대상이 없으면 아래로 내려가 계획을 만들고, `deliver()` 끝에서 새 계획을 같은 말대로 배치한다. 날짜는 오늘(시각이 지났으면 내일, '부터' 날짜가 있으면 그날)부터 '까지' 날짜, 없으면 계획 마감, 없으면 12/31까지. 오전·오후 없이 1~11시이고 16:30 전이면 오후로 읽는다. 시각이 없으면 수업 끝난 뒤(`openStart`). 그날 같은 계획 블록은 새 것으로 바꾼다. 블록은 400개까지.
6. 선택 명령(완료 전환, 삭제, 배치되지 않은 블록 넣기 ×N)
7. `trayIntent`(이름·방금 만든 계획·선택한 계획 순으로 대상을 고른다)
8. 이름으로 완료·삭제
9. 중복 정리(`runCleanup`)
10. 우선순위 답변(`priorityAnswer`)
11. `ttIntent`: create면 `handleTimetable`, edit면 `handleTTEdit`
12. AI(`askAI`) 또는 `localRespond`

`chat.ctx = { created:[], lastAdded:[], multi }`는 한 메시지 안에서 만든 계획을 기억한다. 마감을 말하지 않은 계획은 "추가/만들" 같은 말이 있거나 여러 단계 명령이면 마감 기한 없이 만든다. 그런 말 없이 이름만 말하면 "언제까지 할까요? 없으면 ‘없어’"라고 묻는다.

시간표 배치:
- 시간표 단어가 없어도 "5시부터 선택한 계획 추가해 줘"처럼 선택·시각·추가가 있으면 그날 시간표 만들기로 본다(`ttIntent`).
- `applyTTResult`는 트레이 카드를 지우지 않는다. 범위가 있으면 그날의 같은 계획 블록만 바꾸고, 못 놓은 계획은 카드가 없을 때만 카드로 만든다.
- `parseTTRequest(text)`는 `{ date, start, end, mode }`를 돌려준다. mode는 `'from'`("7시부터"), `'until'`("9시까지"), `''`(범위)다.
- `openStart(k)`는 지금 시각과 수업 끝 시각 중 늦은 쪽을 시작으로 잡는다.
- 오전·오후가 없으면 이미 지난 시각이나 수업 시간일 때 오후로 읽는다.
- `scheduleLocal`은 중요도, 마감, 길이 순으로 정렬하고, 여유가 있으면 10분 간격을 둔다.
- AI 경로는 `askAITimetable`, `buildTTPrompt`, `validateTT`다. AI가 블록을 안 주면 `res.local`로 표시하고 앱이 배치한다.

모든 변경은 `commit(label, changes, ttAfter)`를 거친다. undo/redo는 60개까지 보관한다.

## 5. 테스트 방식과 회귀 문장
지금까지 Playwright(크로미움)로 `file://`을 열고 시험했다. localStorage 시드, `Date` 고정 shim, 가짜 `window.claude`를 썼다. **실제 Claude 응답은 검증된 적이 없다.**

새 문장 패턴에서 실패가 반복되었다. 아래 문장들은 꼭 자동 테스트로 묶을 것.

| 입력 | 기대 결과 |
|---|---|
| 수학, 내일까지, 중요, 시간표 만들기 | 계획 1개(중요도 높음), 블록 1개 |
| 수학, 내일, 시간표 / 수학 내일 시간표 | 계획 1개, 블록 1개 |
| 수학, 영어, 내일까지, 시간표 2개 추가 | 계획 2개, 블록 4개 |
| 수학 숙제랑 영어 단어 계획 만들고 시간표 2개씩 추가해 줘 | 계획 2개(마감 기한 없음), 블록 4개 |
| 국어 독후감, 금요일까지, 시간표 만들기, 오늘 뭐부터 할까? | 계획, 블록, 우선순위 답변 순서 |
| 영어 단어 암기, 이달 말까지, 이틀마다, 30분 걸려 추가해 줘 | 계획 1개(쪼개지면 안 됨) + 이달 말까지 이틀마다 수업 끝난 뒤 블록 |
| 2일마다 11월 30일까지 5시부터 선택한 계획 추가해줘 | 고른 계획을 오늘부터 11/30까지 2일마다 17:00에 배치 |
| 매일 9시부터 선택한 계획 추가해줘(마감 없는 계획) | 12/31까지 매일 21:00 |
| 5시부터 선택한 계획 추가해줘 | 오늘 17:00에 배치 |
| 수학 숙제 추가해 줘 | 마감 기한 없는 계획 1개 |
| 수학 숙제 → 없어 | 언제까지 묻고, ‘없어’면 마감 기한 없이 추가 |
| 과학 보고서를 할까? 수학 숙제를 할까? | 우선순위 답변(쪼개지면 안 됨) |
| 선택한 계획으로 시간표 7시부터 만들어줘 | 19:00부터 배치 |
| 선택한 계획으로 시간표 9시까지 만들어줘 | 수업 끝 뒤부터 21:00 전까지 배치 |
| 오후 4시부터 8시까지 선택한 계획으로 시간표 만들어 줘 | 범위 안에 배치 |
| 선택한 계획으로 시간표 만들기(시각 없음) | 배치되지 않은 블록 |
| 내일 시간표 / 월요일 시간표 보여줘 | 그날 수업 목록(계획을 만들면 안 됨) |
| 내일 음악 시간 준비물 리코더 추가해 줘 | 그날 음악 수업에 준비물 추가 |
| 모든 체육 시간에 운동화 준비물 추가해 줘 | '@체육'(2·3학년 스생 포함) |
| 2학년 3반 시간표로 바꿔 줘 | 반·학년, 학사일정 필터 전환 |

## 6. 미해결·추정 사항
- 2·3학년 과목명은 컴시간 줄임말 그대로다(이제 사진이 아니라 컴시간에서 바로 받으므로 오타 걱정은 없다).
- 2·3학년의 수요일 5·6교시, 목요일 7교시 창체, 월요일 1교시 특색활동, 시험 끝 시각, 12/25부터 겨울방학은 모두 추정이다.
- 교육계획서의 3학년 12/9 진로교육원체험활동과 11/21(토) 현장체험학습은 넣지 않았다.
- 2·3학년 10월 일정은 교육계획서 기준이라 학교의 최신 변경은 반영되지 않는다.
- 문장 해석이 정규식 기반이라 취약하다. 한 메시지에 최대 8단계, 계획당 블록 20개, 전체 블록 400개까지만 처리한다.
- 전체화면 버튼은 iframe 안에서 막힐 수 있다. 링크(아티팩트)마다 저장 공간이 따로다.

## 7. 다음 작업 제안
1. 파일을 나눈다: 학교 자료(JSON), 문장 해석, 배치 로직, 화면.
2. 5번 회귀 문장을 단위 테스트로 만든다(시각 고정).
3. AI 호출을 서버 프록시로 옮기고, 실제 응답으로 테스트한다.
4. 학기·학년도마다 학교 자료(시간표, 학사일정)를 바꿔 끼울 수 있게 한다.

## 8. 컴시간 시간표 자동 동기화 (2026-10-18 추가)
학교 시간표는 컴시간알리미(http://컴시간학생.kr → `comci.net:4082`, 학교 코드 31720)에서 학교 일과에 맞춰 받아 온다. 아티팩트는 외부 사이트를 직접 읽지 못해서 이렇게 나눴다.

- `scripts/comcigan-sync.mjs`: 컴시간 학생 페이지(`/st`)에서 경로 번호와 `자료NNN` 키를 찾아 읽고(컴시간이 가끔 바꾼다), 1~3학년 1~7반의 이번 주·다음 주 시간표(바뀐 수업 포함)와 기본 시간표를 문서 하나로 만든다. Node 내장 모듈만 쓴다. `HTTPS_PROXY`가 있으면 CONNECT로 터널을 연다. 테스트: `node --test scripts/*.test.mjs`
- 루틴 4개, 사용자가 정한 일정(한국 시간): 평일 1교시 25분 전 8:15(`trig_01LJtTmJQseAeuQBaR8wdDEX`), 1~4교시 시작 25분 뒤 9:05~12:05(`trig_013cQqMfekoVrKmmLWYTRPdz`), 5~7교시 시작 25분 뒤 13:55~15:55(`trig_01144D4jyTbbyf3kKQWPeohC`), 일요일 19:51(`trig_01193kz3vpEA8RC5Sc1SYH9H`, 사용자 요청은 오후 8시. 정각은 늦게 시작할 수 있어 조금 당김). 모두 실행마다 새 세션, 알림 끔, 프롬프트 같음. 교시 시각이 바뀌면 이 일정과 페이지의 `SYNC_WEEKDAY`·`SYNC_SUNDAY`를 함께 고친다. 하는 일: 아티팩트에 함께 올린 `comcigan-sync.mjs`를 내려받아 실행하고, 결과를 `school/timetable`에 `if_version`을 걸어 쓴다. **스크립트를 고치면 아티팩트의 `comcigan-sync.mjs`도 다시 올려야 루틴에 반영된다**(루틴은 GitHub을 쓰지 않는다).
- 문서 형식(`school/timetable`): `{ v:1, checkedAt, sourceUpdated, classes:{1:7,2:7,3:7}, times, base:{from, g}, weeks:[{start, g, changed}] }`. `g[학년]`은 문자열 40개(`요일*8 + 교시`, 월=0), 각 문자열은 `과목 교사|…`(1반부터). `changed`는 `'학년-반-요일(월=1)-교시(1부터)'`. 지난 주는 최근 12주까지 남긴다.
- db 규칙: `{ path: 'school', read: 'view', write: 'admin' }`. 아티팩트를 다시 올릴 때 `capabilities`를 넘기면 이 규칙을 꼭 다시 적는다(빠뜨리면 사라진다).
- 페이지 쪽: `initLive()`가 `school/timetable`을 구독한다. `readLive`/`setLive`가 검사·적용하고, `gradeTT(g, k)`는 그 주 자료가 있으면 그 주 것, 없으면 `base`, 그것도 없으면 `G*_TT`를 쓴다. `classRows(n, k)`는 날짜 `k`의 주에 맞춘다. 바뀐 수업은 `isChangedClass`로 ‘변경’ 표시, `renderTTSrc()`가 "마지막 확인" 시각을 보여 준다. `lastSyncSlot()`으로 가장 최근 예정 시각을 구해, 그 뒤 20분이 지났는데 자료가 그보다 오래됐으면 빨간색 "확인이 늦어지고 있어요"를 띄운다. 반 고르기 목록은 `buildClassSel()`이 만든다(`CLASS_LIMIT = 7`).
- 9번의 앱은 이 db를 못 읽어서, GitHub Actions가 같은 시각에 같은 스크립트를 돌려 `timetable.json`으로 올린다. 루틴(아티팩트용)과 Actions(앱용)는 따로 돈다.
- GitHub 푸시: 2026-10-18 한때 막혔다가 지금은 된다(기본 브랜치가 `claude/hourly-class-check-link-g51x4a`).

## 9. 설치형 앱 (GitHub Pages, 2026-10-27 추가)
사용자 요청("앱으로 만들어줘"). claude.ai 아티팩트는 claude.ai 안의 iframe으로만 열리고(`frame-ancestors 'self'`, 웹 앱 매니페스트 없음) 설치할 수 없어서, 같은 페이지를 GitHub Pages에 PWA로 올린다. 크롬(안드로이드)에서 설치하면 WebAPK가 되어 앱 서랍·홈 화면에 아이콘이 생긴다.

- 주소: https://kimseongjinedu.github.io/kimseongjinedu/ . 저장소 설정 Settings → Pages → Source가 **GitHub Actions**여야 한다(워크플로 토큰으로는 켤 수 없다. 사용자가 켬).
- 파일: `app/schoolmate-ai.html`(페이지, 아티팩트와 같음), `app/manifest.webmanifest`, `app/sw.js`(`__VERSION__`을 빌드가 채움), `app/icons/`(학교 마크를 `app/icons/make-icons.cjs`로 크로미움에서 그림). `scripts/build-app.mjs --out _site`가 `<title>` 뒤에 `<meta name="schoolmate-app">`, 매니페스트, 아이콘 태그를 넣어 `index.html`을 만든다. 테스트 `scripts/build-app.test.mjs`.
- `.github/workflows/app.yml`: `app/`·`scripts/`·워크플로를 푸시할 때, 루틴과 같은 시각(평일 8:15, 9:05~12:05, 13:55~15:55, 일 19:51, cron은 UTC), 수동 실행 때 돈다. 테스트 → 빌드 → 지난 `timetable.json`을 받아 `comcigan-sync.mjs --prev`로 새로 받기(실패하면 지난 것을 그대로) → Pages가 켜져 있으면(API `build_type == workflow`) 배포, 꺼져 있으면 알림만 남기고 성공으로 끝낸다. 커밋은 만들지 않는다. GitHub 예약 실행은 늦게 시작할 수 있고, 공개 저장소에서 60일 동안 커밋이 없으면 예약이 꺼진다.
- 페이지의 앱 모드(`APP_BUILD` = meta 있음 + `window.claude` 없음): `initLiveFile()`이 `timetable.json`을 열 때·화면에 돌아올 때(1분 뒤부터)·10분마다 읽어 `applyLiveDoc()`으로 적용. 서비스 워커 등록(https나 localhost), "확인이 늦어지고 있어요" 여유 60분(아티팩트 20분). AI·계정 저장·첨부 파일은 없다(기본 모드, 이 기기 localStorage).
- 머리의 휴대폰 아이콘(`#appBtn`) → "앱 설치와 백업" 창. 앱: `beforeinstallprompt`가 오면 [앱 설치] 버튼, 아니면 크롬 메뉴 안내, 원래 페이지 링크. 아티팩트: 앱 주소. 둘 다 [백업 파일 저장](아티팩트는 `downloads` 능력, 앱은 a[download]) / [백업 불러오기](파일 선택). 백업 형식 `{ app:'schoolmate-ai', v:1, exportedAt, items, blocks, classNo, grade, supplies }`. 불러오기는 합친다(같은 id는 백업 것, 같은 계획·같은 자리 블록은 하나만, 반·학년은 백업 것, 첨부 파일 저장소가 없으면 files 비움). `commit`을 거쳐 되돌리기 된다.
- 시험: 빌드한 폴더를 `python3 -m http.server`로 열고 Playwright로 설치 가능(`Page.getInstallabilityErrors`), 서비스 워커, 오프라인 다시 열기, `timetable.json` 적용, 백업 왕복을 확인했다.
