# 🍱 오늘 뭐 먹지? (lunchVote)

실시간으로 점심 메뉴/식당을 투표해서 정하는 웹앱입니다.
링크만 공유하면 여러 명이 같은 방에 들어와 실시간으로 투표하고, 제한 시간이 끝나면 1위가 발표됩니다.

> **배포**: https://lunchvote-0ez3.onrender.com

---

## ✨ 주요 기능

- **실시간 투표** — Socket.IO로 표가 즉시 반영. 방 링크(`?room=xxxx`) 공유로 참여.
- **1인 1표** — 서버 쿠키(`vid`) 기반이라 새로고침·재접속해도 중복 투표 불가.
- **맛집 검색 (카카오)**
  - 지역 선택(시/도·시군구·동) 또는 **현재 위치(GPS)** 기준 추천 맛집 10곳
  - 지도를 움직여 **"이 지역에서 검색"**, 또는 지도 범위 + 검색어 조합 검색
  - 검색 결과 클릭 한 번으로 후보 등록
- **후보 표시** — 카카오 카테고리로 **음식 이모지**(🍜🍖🍗…) 자동 매칭, 지도 링크·좌표 저장
- **투표 제한 시간** — 휴대폰 타이머식 **분·초 휠 피커**로 설정
- **시간 종료 후** — 방장이 **연장(+분)** 하거나 **종료 확정**을 선택 (자동 종료 X)
- **결과 화면** — 순위, 최종 1위 발표, **후보 위치 지도(상호명 라벨)**, 1위 **길찾기** 링크
- **반응형** — 모바일은 풀스크린, 데스크탑은 가운데 카드 레이아웃
- **디자인** — 뉴브루탈리즘(화이트 + 검정 테두리 + 옐로/핑크 포인트)

---

## 🛠 기술 스택

| 구분 | 사용 |
|---|---|
| 서버 | Node.js, Express 5, Socket.IO |
| 프론트 | Vanilla JS, HTML, CSS (Noto Sans KR) |
| 외부 API | 카카오 로컬(키워드/카테고리/좌표변환), 카카오맵 JS SDK |
| 배포 | Render |

---

## 📁 프로젝트 구조

```
lunchVote/
├─ server.js          # Express + Socket.IO 서버, 카카오 API 프록시
├─ public/
│  ├─ index.html      # 화면 (투표 / 투표 만들기)
│  ├─ script.js       # 클라이언트 로직 (소켓·검색·지도·렌더)
│  └─ style.css       # 스타일
├─ .env               # 카카오 키 (git 제외)
└─ package.json
```

---

## 🚀 로컬 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경변수 설정
프로젝트 루트에 `.env` 파일 생성:
```
KAKAO_REST_KEY=여기에_카카오_REST_API_키
KAKAO_JS_KEY=여기에_카카오_JavaScript_키
```
- 카카오 키는 [카카오 개발자](https://developers.kakao.com) → 내 애플리케이션 → **앱 키** 에서 발급.
- `KAKAO_REST_KEY`: 맛집 검색·지역 변환용 (서버에서만 사용).
- `KAKAO_JS_KEY`: 지도 표시용 (프론트 로드).

### 3. 카카오 지도 도메인 등록 (지도 표시 필수)
카카오 개발자 콘솔 → 앱 설정 → **플랫폼 → Web → 사이트 도메인** 에 접속 주소 등록:
```
http://localhost:3000
https://내-배포-도메인.onrender.com
```
> 등록하지 않으면 지도가 401 오류로 뜨지 않습니다.

### 4. 실행
```bash
node server.js
```
→ 브라우저에서 **http://localhost:3000** 접속.

---

## ☁️ 배포 (Render)

1. GitHub 저장소를 Render **New → Web Service** 로 연결
2. Build Command: `npm install` / Start Command: `node server.js`
3. **Environment Variables** 에 `KAKAO_REST_KEY`, `KAKAO_JS_KEY` 등록
4. 배포된 도메인을 카카오 콘솔의 Web 사이트 도메인에 추가

> 서버는 `process.env.PORT`를 사용하므로 Render에서 바로 동작합니다.

---

## 🔌 서버 API 요약

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/search?query=&location=&rect=` | 맛집 키워드 검색 (지역 또는 지도 범위 기준) |
| `GET /api/nearby?rect=` | 지도 범위(rect) 내 음식점 검색 |
| `GET /api/region?x=&y=` | 좌표 → 지역명(시/구/동) 변환 (현재 위치) |
| `GET /api/config` | 프론트에 카카오 JS 키 전달 |

### 실시간 이벤트 (Socket.IO)
- `joinRoom` — 방 입장 (쿠키/voterId로 식별)
- `startVoteSession` — 투표 시작 (후보·시간·링크)
- `castVote` — 투표/취소 (1인 1표)
- `extendVote` / `endVote` — 시간 연장 / 종료 확정 (방장)
- `timeUp` / `finishVote` / `updateData` — 상태 브로드캐스트

---

## ⚠️ 참고 / 한계

- 카카오 로컬 API는 **평점·리뷰·사진을 제공하지 않습니다.** 그래서 추천은 "지역 + 맛집" 키워드 관련도순이며, 사진 대신 지도·이모지로 표현합니다.
- 1인 1표는 브라우저 쿠키 기반이라, 쿠키를 지우거나 다른 브라우저/시크릿창을 쓰면 별개 사용자로 인식됩니다.
