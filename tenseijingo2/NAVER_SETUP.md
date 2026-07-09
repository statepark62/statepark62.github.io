# 네이버 카페 자동 게시 설정 안내

프로그램 설치 없이 브라우저만으로 끝낼 수 있도록 구성한 절차입니다.
전체 소요 시간은 15분 정도입니다. 딱 한 번만 하면 됩니다.

---

## 1단계. 네이버 개발자 센터에서 애플리케이션 등록

1. https://developers.naver.com 접속 → 네이버 로그인
2. 상단 메뉴 [Application] → [애플리케이션 등록] 클릭
3. 다음과 같이 입력:
   - 애플리케이션 이름: 천성인어자동게시 (아무 이름이나 가능)
   - 사용 API: **네이버 로그인** 과 **카페** 두 가지를 모두 추가
     (네이버 로그인의 권한 항목은 아무것도 체크하지 않아도 됩니다)
   - 로그인 오픈 API 서비스 환경: **PC 웹** 선택
   - 서비스 URL: https://statepark62.github.io
   - 네이버 로그인 Callback URL: https://statepark62.github.io
4. 등록 완료 화면에서 **Client ID** 와 **Client Secret** 을 메모장에 복사

## 2단계. 인증 코드 받기 (브라우저 주소창 이용)

1. 메모장에서 아래 주소를 만든다. {클라이언트ID} 자리에 1단계의 Client ID를 넣는다:

```
https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id={클라이언트ID}&redirect_uri=https://statepark62.github.io&state=tenseijingo
```

2. 완성된 주소를 브라우저 주소창에 붙여넣고 이동
3. 네이버 로그인 → 동의 화면이 나오면 [동의하기]
4. 교수님 홈페이지로 이동되는데, 이때 **주소창을 보면** 뒤에
   `?code=XXXXXX&state=tenseijingo` 가 붙어 있다.
   이 **code= 뒤의 값**(XXXXXX 부분)을 복사한다.
   ※ 이 코드는 10분만 유효하므로 바로 3단계로 진행

## 3단계. Refresh Token 받기 (역시 주소창 이용)

1. 메모장에서 아래 주소를 만든다 (세 곳을 채움):

```
https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id={클라이언트ID}&client_secret={클라이언트시크릿}&code={2단계에서복사한코드}&state=tenseijingo
```

2. 주소창에 붙여넣고 이동하면 글자만 있는 화면(JSON)이 나온다:

```
{"access_token":"AAA...","refresh_token":"BBB...","token_type":"bearer", ...}
```

3. 이 중 **"refresh_token" 뒤의 값**(따옴표 안, BBB... 부분)을 복사해 둔다.
   이것이 자동화의 열쇠이며, 만료되지 않고 계속 쓰인다.

## 4단계. 카페 번호 확인

1. PC 브라우저로 카페(cafe.naver.com/statepark62) 접속
2. 자동 게시할 **게시판**을 클릭
3. 주소창에서 숫자 두 개를 찾는다:
   - 구형 주소: `...clubid=12345678...menuid=25...`
   - 신형 주소: `.../cafes/12345678/menus/25...`
   - 앞의 긴 숫자가 **클럽 ID**, 뒤의 짧은 숫자가 **메뉴(게시판) ID**

## 5단계. GitHub Secrets 등록 (5개)

저장소 → Settings → Secrets and variables → Actions → New repository secret
아래 5개를 하나씩 등록한다 (Name은 정확히 이대로 타이핑):

| Name | Secret 값 |
|---|---|
| NAVER_CLIENT_ID | 1단계의 Client ID |
| NAVER_CLIENT_SECRET | 1단계의 Client Secret |
| NAVER_REFRESH_TOKEN | 3단계의 refresh_token 값 |
| NAVER_CAFE_CLUB_ID | 4단계의 클럽 ID (숫자) |
| NAVER_CAFE_MENU_ID | 4단계의 메뉴 ID (숫자) |

## 완료 후 동작

매일 아침 발행이 끝나면 자동으로 카페에 글이 올라갑니다:
- 제목: [天声人語 학습] 7월 10일 — 오늘의 주제
- 본문: 주제 + 한 문장 정리 + 학습 페이지 링크
- 첨부: 그날의 학습 카드 이미지

Secrets를 등록하지 않으면 카페 게시만 조용히 건너뛰고,
페이지 발행은 평소대로 진행됩니다. (실패해도 발행에는 영향 없음)

## 문제가 생기면

- 토큰 갱신 실패: 오랫동안 사용하지 않으면 refresh token이 만료될 수
  있습니다. 2~3단계를 다시 해서 새 값으로 Secret을 갱신하세요.
- 글자가 %EC%95... 형태로 깨져 보이면: 알려 주세요. 인코딩 방식 한 줄을
  조정해 드립니다.
