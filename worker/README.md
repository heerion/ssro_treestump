# 저장 중계 서버 (Cloudflare Worker)

`admin/timeline.html`(연표 편집기)과 `admin/members.html`(위원 편집기) 모두
**저장** 버튼을 누르면 이 작은 서버 하나가 대신 GitHub에 커밋합니다(위원
사진도 함께). 위원들은 GitHub 계정도, 토큰도 몰라도 되고, 공유받은
**비밀번호**만 알면 됩니다. 처음 한 번만 소장님(저장소 관리자)이 설정하면
그 뒤로는 아무도 신경 쓸 일이 없습니다.

무료로 충분합니다 (Cloudflare Workers 무료 플랜은 하루 10만 건까지).

## 1. GitHub 토큰 만들기

1. https://github.com/settings/personal-access-tokens/new 접속
2. **Repository access** → **Only select repositories** → 이 저장소
   (`ssro_treestump`) 하나만 선택
3. **Permissions → Repository permissions → Contents** → **Read and write**
   로 설정 (다른 권한은 전부 기본값 그대로 둡니다)
4. 유효 기간(Expiration)을 정하고 **Generate token**
5. 나오는 토큰(`github_pat_...`)을 복사해 둡니다 — 이 화면을 벗어나면 다시
   볼 수 없으니 잠깐 메모장에 붙여 둡니다.

## 2. Cloudflare Worker 만들기

1. https://dash.cloudflare.com 가입(무료) → 로그인
2. 왼쪽 메뉴 **Workers & Pages** → **Create** → **Create Worker**
3. 이름은 자유롭게 (예: `ssro-timeline-save`) 정하고 **Deploy** (일단 기본
   코드로 배포됩니다 — 다음 단계에서 내용을 바꿉니다)
4. 배포된 화면에서 **Edit code** (Quick edit) 클릭
5. 에디터에 있던 내용을 전부 지우고, 이 폴더의 `save-site.js` 파일
   내용을 그대로 붙여넣기
6. **Deploy** 로 저장

## 3. 설정값(변수·비밀) 등록

Worker 관리 화면 → **Settings** → **Variables and Secrets** 로 들어가서
아래 값을 추가합니다. 토큰과 비밀번호는 꼭 **Secret** 으로 등록하세요
(화면에 다시 노출되지 않고 암호화되어 저장됩니다).

| 이름             | 종류     | 값 예시                          |
|------------------|----------|-----------------------------------|
| `GITHUB_TOKEN`   | Secret   | 1단계에서 복사한 `github_pat_...` |
| `SITE_PASSWORD`  | Secret   | 위원들과 공유할 비밀번호 (예: 4개 낱말을 이어 붙인 것처럼 길게) |
| `GITHUB_OWNER`   | Variable | `heerion`                         |
| `GITHUB_REPO`    | Variable | `ssro_treestump`                  |
| `GITHUB_BRANCH`  | Variable | `main`                            |
| `ALLOWED_ORIGIN` | Variable | `https://heerion.github.io`       |

값을 추가한 뒤 **Deploy** 로 다시 배포합니다.

> ⚠️ **비밀번호(SITE_PASSWORD)는 짧은 단어 하나보다 길게 잡아 주세요.**
> 이 서버는 별도의 잠금(brute-force 방지) 장치가 없어서, 비밀번호가 아주
> 짧으면 계속 시도해서 맞힐 위험이 있습니다. 서로 관련 없는 단어 3~4개를
> 이어 붙인 정도(예: `나무그루터기연필18기`)를 권장합니다.

## 4. 편집기에 주소 연결하기

두 편집기가 같은 서버를 쓰지만, 주소는 **각 편집기 파일에 따로** 넣어야
합니다 (파일이 다르면 그 안의 값도 각각입니다).

1. Worker 화면 위쪽에 나오는 주소를 복사합니다.
   (`https://ssro-save.<내계정>.workers.dev` 형태)
2. 이 저장소의 **`admin/timeline-admin.js`** 파일을 열어 맨 위쪽
   `SAVE_ENDPOINT` 값에 그 주소를 넣습니다.
3. **`admin/members-admin.js`** 파일도 열어 마찬가지로 `SAVE_ENDPOINT` 에
   같은 주소를 넣습니다.

```js
const SAVE_ENDPOINT = "https://ssro-save.내계정.workers.dev";
```

4. 두 파일을 저장·커밋·푸시합니다. 사이트가 다시 배포되면(보통 1분
   안팎), `admin/timeline.html` 과 `admin/members.html` 을 각각 열어
   비밀번호를 넣고 **비밀번호 확인** 을 눌러 잘 연결됐는지 확인합니다.

이제부터는 위원 누구나 편집기를 열어 비밀번호만 입력하면 **저장** 버튼
하나로 바로 사이트에 반영할 수 있습니다.

## 문제가 생기면

- **"비밀번호가 올바르지 않아요"** — `SITE_PASSWORD` 값과 편집기에 입력한
  값이 정확히 같은지 확인하세요 (앞뒤 공백 주의).
- **"서버 설정이 아직 끝나지 않았어요"** — 3단계의 변수 이름이
  정확한지(대소문자 포함) 확인하세요.
- **"GitHub에서 파일을 읽지 못했습니다" / "GitHub 저장에 실패했습니다" /
  "사진 업로드 실패"** — 토큰이 이 저장소에 Contents: Read and write
  권한으로 되어 있는지, `GITHUB_OWNER`/`GITHUB_REPO`/`GITHUB_BRANCH` 값이
  정확한지 확인하세요. 토큰 유효 기간이 지났다면 새로 만들어
  `GITHUB_TOKEN` 을 갱신하세요. (위원 사진은 `img/members/` 폴더에
  새 파일로 올라가는데, 같은 토큰 권한으로 되니 따로 설정할 건 없습니다.)
- Worker 실행 로그는 Cloudflare 대시보드 → 해당 Worker → **Logs** 에서
  실시간으로 볼 수 있습니다.
