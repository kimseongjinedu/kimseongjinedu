# SchoolMate AI — Claude Code 인수인계

창원대산고등학교 학생용 일정·시간표 웹앱이다. claude.ai 아티팩트로 만들어졌고, 코드는 HTML·CSS·JS가 한 파일에 들어 있다(`schoolmate-ai.html`, 약 5,300줄). 사용자는 한국어를 쓰며 주로 갤럭시 탭 크롬에서 확인한다. 답은 한국어로 짧게 한다.

- 아티팩트: https://claude.ai/artifact/HkDoYdytpVRMNsJVGCA59L (링크가 있으면 누구나 볼 수 있음). 페이지 소스는 이 저장소에 없다. 고치려면 Artifact `read`로 받아서 같은 URL로 다시 올린다.
- 이 저장소에는 컴시간 동기화 스크립트(`scripts/`)만 있다. 8번 항목 참고.

## 1. 가장 먼저 알아야 할 것: 실행 환경

이 앱은 claude.ai 아티팩트 런타임의 `window.claude.use(name)`에 기대고 있다.

| 이름 | 용도 |
|---|---|
| `db` | 로그인 사용자별 저장. `data/users/<uid>/planner/schedules`(계획), `data/users/<uid>/timetable`(블록·반·학년), `data/users/<uid>/supplies`(수업 준비물). 공유 문서 `school/timetable`(컴시간 시간표, 평일 수업 시간마다·일요일 아침 갱신, 편집자 이상만 쓰기) |
| `sample` | AI 호출. `ai.fn.json(prompt, { modelTier: 'quick' \| 'default' })` |
| `assets` | 첨부 파일. `/_blob/<id>`로 제공 |
| `permissions`, `user`, `downloads` | AI 허용 상태, 사용자 id, 파일 내려받기 |

claude.ai 밖(로컬 파일, 다른 호스팅)에서는 이 API가 없다. 그래서 자동으로 localStorage에 저장하고, AI 없는 "기본 모드"(규칙 기반)로 돈다.

자체 호스팅에서 AI를 쓰려면 `ai.fn`을 Anthropic Messages API 호출로 바꿔야 한다. API 키는 브라우저에 두지 말고 서버 프록시를 둔다. 호출 비용이 든다. 첨부 파일과 db도 대체 저장소가 필요하다.

localStorage 키: `schoolmate-ai:schedules:v1`, `:timetable:v1`, `:supplies:v1`, `:classno:v1`, `:grade:v1`, `:ttsel:v1`, `:ttweek:v1`, `:view:v1`, `:dismissed:v1`, `:live-tt:v1`(마지막으로 받은 `school/timetable` 사본, 첫 화면용)

## 2. 데이터

```js
// 계획
{ id, title(≤60), deadline:'YYYY-MM-DD', time:'' /*항상 빈 값*/, importance:'high'|'normal'|'low',
  memo(≤1000), supplies:[문자열 ≤10개], duration(분, 0=미입력→60분으로 계산),
  repeatType:'none'|'day'|'week', repeatEvery, repeatDays:[0-6], repeatCount, startDate,
  files:[{id,name,type,size}], done, createdAt }
// 시간표 블록 (date가 null이면 '배치되지 않은 블록')
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
6. 선택 명령(완료 전환, 삭제, 배치되지 않은 블록 넣기 ×N)
7. `trayIntent`(이름·방금 만든 계획·선택한 계획 순으로 대상을 고른다)
8. 이름으로 완료·삭제
9. 중복 정리(`runCleanup`)
10. 우선순위 답변(`priorityAnswer`)
11. `ttIntent`: create면 `handleTimetable`, edit면 `handleTTEdit`
12. AI(`askAI`) 또는 `localRespond`

`chat.ctx = { created:[], lastAdded:[], defaultDue }`는 한 메시지 안에서 만든 계획을 기억한다. 여러 단계를 시키면 마감이 없는 계획은 일주일 뒤로 잡는다.

시간표 배치:
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
| 수학 숙제랑 영어 단어 계획 만들고 시간표 2개씩 추가해 줘 | 계획 2개, 블록 4개 |
| 국어 독후감, 금요일까지, 시간표 만들기, 오늘 뭐부터 할까? | 계획, 블록, 우선순위 답변 순서 |
| 영어 단어 암기, 이달 말까지, 이틀마다, 30분 걸려 추가해 줘 | 계획 1개(쪼개지면 안 됨) |
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
- 루틴 4개, 사용자가 정한 일정(한국 시간): 평일 1교시 25분 전 8:15(`trig_01LJtTmJQseAeuQBaR8wdDEX`), 1~4교시 시작 25분 뒤 9:05~12:05(`trig_013cQqMfekoVrKmmLWYTRPdz`), 5~7교시 시작 25분 뒤 13:55~15:55(`trig_01144D4jyTbbyf3kKQWPeohC`), 일요일 7:51(`trig_01193kz3vpEA8RC5Sc1SYH9H`, 8시 정각은 늦게 시작할 수 있어 조금 당김). 모두 실행마다 새 세션, 알림 끔, 프롬프트 같음. 교시 시각이 바뀌면 이 일정과 페이지의 `SYNC_WEEKDAY`·`SYNC_SUNDAY`를 함께 고친다. 하는 일: 아티팩트에 함께 올린 `comcigan-sync.mjs`를 내려받아 실행하고, 결과를 `school/timetable`에 `if_version`을 걸어 쓴다. **스크립트를 고치면 아티팩트의 `comcigan-sync.mjs`도 다시 올려야 루틴에 반영된다**(루틴은 GitHub을 쓰지 않는다).
- 문서 형식(`school/timetable`): `{ v:1, checkedAt, sourceUpdated, classes:{1:7,2:7,3:7}, times, base:{from, g}, weeks:[{start, g, changed}] }`. `g[학년]`은 문자열 40개(`요일*8 + 교시`, 월=0), 각 문자열은 `과목 교사|…`(1반부터). `changed`는 `'학년-반-요일(월=1)-교시(1부터)'`. 지난 주는 최근 12주까지 남긴다.
- db 규칙: `{ path: 'school', read: 'view', write: 'admin' }`. 아티팩트를 다시 올릴 때 `capabilities`를 넘기면 이 규칙을 꼭 다시 적는다(빠뜨리면 사라진다).
- 페이지 쪽: `initLive()`가 `school/timetable`을 구독한다. `readLive`/`setLive`가 검사·적용하고, `gradeTT(g, k)`는 그 주 자료가 있으면 그 주 것, 없으면 `base`, 그것도 없으면 `G*_TT`를 쓴다. `classRows(n, k)`는 날짜 `k`의 주에 맞춘다. 바뀐 수업은 `isChangedClass`로 ‘변경’ 표시, `renderTTSrc()`가 "마지막 확인" 시각을 보여 준다. `lastSyncSlot()`으로 가장 최근 예정 시각을 구해, 그 뒤 20분이 지났는데 자료가 그보다 오래됐으면 빨간색 "확인이 늦어지고 있어요"를 띄운다. 반 고르기 목록은 `buildClassSel()`이 만든다(`CLASS_LIMIT = 7`).
- GitHub 푸시가 막혀 있다(Claude GitHub 앱에 이 저장소 권한 없음). 커밋이 세션 안에만 남을 수 있으니 권한을 먼저 확인한다.
