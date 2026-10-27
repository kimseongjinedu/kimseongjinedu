# 컴시간 시간표 동기화

SchoolMate AI 앱의 학교 시간표를 [컴시간알리미](http://컴시간학생.kr)(창원대산고등학교, 학교 코드 31720)에서 학교 일과에 맞춰 받아 옵니다.

- `comcigan-sync.mjs`: 모든 학년 1~7반(8반부터는 특별반이라 뺌)의 이번 주·다음 주 시간표와 기본 시간표를 받아 JSON 문서 하나로 만듭니다. Node 18 이상, 외부 패키지 없음.
- Claude 루틴 4개(평일 8:15, 9:05~12:05 매시 5분, 13:55~15:55 매시 55분, 일요일 19:51, 모두 한국 시간)이 이 스크립트를 실행하고 결과를 앱의 공유 데이터베이스 문서 `school/timetable`에 씁니다. 앱은 이 문서를 실시간으로 읽어 시간표 탭, 준비물 창, SchoolMate AI 답변에 반영합니다.
- 루틴은 GitHub이 아니라 아티팩트에 함께 올린 사본(`comcigan-sync.mjs`)을 내려받아 실행합니다. 스크립트를 고치면 아티팩트에도 다시 올려야 루틴에 반영됩니다.
- `school/timetable`은 편집자(관리자) 이상만 쓸 수 있고, 링크가 있는 사람은 모두 읽을 수 있습니다.
- 설치형 앱(https://kimseongjinedu.github.io/kimseongjinedu/)은 이 db를 읽지 못해서, GitHub Actions(`.github/workflows/app.yml`)가 같은 시각에 이 스크립트를 돌려 `timetable.json`으로 함께 배포합니다.
- `build-app.mjs`: `app/schoolmate-ai.html`로 앱 폴더(`index.html`, 매니페스트, 서비스 워커, 아이콘)를 만듭니다. `node scripts/build-app.mjs --out _site`

```sh
node scripts/comcigan-sync.mjs --out /tmp/tt.json --prev /tmp/prev.json
node --test scripts/*.test.mjs
```

`--prev`에는 지금 데이터베이스에 있는 문서를 넘깁니다. 컴시간이 더 이상 보여 주지 않는 지난 주 시간표는 그대로 남겨 둡니다(최근 12주).

## 문서 형식

```json
{
  "v": 1,
  "checkedAt": "2026-10-18T00:55:00.000Z",
  "sourceUpdated": "2026-10-16 15:27:55",
  "classes": { "1": 7, "2": 7, "3": 7 },
  "base": { "from": "2026-10-26", "g": { "1": ["…40개…"], "2": [], "3": [] } },
  "weeks": [{ "start": "2026-10-19", "g": { "1": [] }, "changed": ["1-7-1-2"] }]
}
```

- `g[학년]`은 문자열 40개입니다. 순서는 `요일*8 + 교시`(월=0, 1교시=0)이고, 각 문자열은 `과목 교사|과목 교사|…`(1반부터)입니다.
- `changed`는 컴시간에서 바뀐 수업으로 `학년-반-요일(월=1)-교시(1부터)` 형식입니다.
