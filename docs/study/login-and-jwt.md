# 로그인 & JWT 공부 정리

---

## 1. OAuth 2.0 플로우

### 개념
소셜 로그인(Google, Kakao, Naver 등)을 구현할 때 사용하는 인증 표준 프로토콜.
사용자의 비밀번호를 우리 서버에 저장하지 않고, 소셜 플랫폼이 인증을 대신 처리해준다.

### 플로우 (Authorization Code Flow)
```
사용자 → 우리 앱 → 소셜 플랫폼 → 우리 앱 → 사용자
  1. 사용자가 "구글로 로그인" 클릭
  2. 구글 로그인 화면으로 이동
  3. 사용자가 구글 계정으로 인증
  4. 구글이 Authorization Code(임시 코드) 발급 → 우리 앱으로 전달
  5. 우리 앱이 Code로 구글에 Access Token 요청
  6. 구글이 Access Token 발급
  7. 우리 앱이 Access Token으로 사용자 정보(이메일, 이름 등) 조회
  8. 우리 앱이 자체 JWT 발급 → 사용자에게 전달
```

### 핵심 개념 3가지
| 개념 | 설명 |
|---|---|
| Authorization Code | 소셜 플랫폼이 발급하는 1회용 임시 코드. 보안상 짧은 시간만 유효 |
| Access Token (소셜) | 소셜 플랫폼이 발급. 사용자 정보를 가져오는 데 사용. 우리 앱 인증엔 직접 사용 안 함 |
| 우리 JWT | 소셜 정보를 받은 후 우리 서버가 직접 발급. 실제 API 인증에 사용 |

### Supabase Auth를 쓰면?
복잡한 OAuth 플로우를 Supabase가 대신 처리해준다.
우리는 최종 사용자 정보만 받아서 JWT를 발급하면 된다.

---

## 2. JWT (JSON Web Token)

### 개념
서버가 발급하는 **위조 불가능한 디지털 신분증**.
사용자가 로그인하면 서버가 JWT를 발급하고, 이후 모든 API 요청에 이 토큰을 첨부해서 인증한다.

### 구조
JWT는 `.` 으로 구분된 3파트로 구성된다.
```
Header.Payload.Signature
```

| 파트 | 역할 | 예시 |
|---|---|---|
| Header | 암호화 알고리즘 정보 | `{ "alg": "HS256", "typ": "JWT" }` |
| Payload | 토큰에 담긴 실제 데이터 | `{ "userId": "123", "email": "user@gmail.com", "exp": 만료시간 }` |
| Signature | 위조 방지 서명 (서버 비밀키로 생성) | `HMAC_SHA256(header + payload, 서버_비밀키)` |

### 위조가 불가능한 이유
```
사용자가 Payload를 임의로 수정
  → Signature가 달라짐
    → 서버 검증 시 불일치 감지
      → 요청 거부
```
비밀키를 모르면 올바른 Signature를 만들 수 없다.

---

## 3. Access Token vs Refresh Token

### 개념
| 토큰 | 수명 | 용도 |
|---|---|---|
| Access Token | 짧음 (30분 ~ 1시간) | API 요청 헤더에 담아서 인증 |
| Refresh Token | 김 (7일 ~ 30일) | Access Token 만료 시 재발급 요청 |

### 실제 흐름
```
1. 로그인
   → Access Token (1시간) + Refresh Token (7일) 동시 발급

2. API 요청 시
   → 헤더에 Access Token 첨부

3. Access Token 만료 (1시간 후)
   → Refresh Token으로 새 Access Token 자동 재발급
   → 사용자는 이 과정을 모름 (자동 처리)

4. Refresh Token도 만료 (7일 후)
   → 다시 로그인 필요
```

### 사용자 경험
Refresh Token이 7일이면 → 7일 동안 로그인이 안 풀린다.
앱이 자동으로 Access Token을 재발급해주기 때문에 사용자는 7일 내내 로그인 상태를 유지한다.

### 보안 관리
| 상황 | 대응 |
|---|---|
| 로그아웃 | DB에서 Refresh Token 삭제 → 즉시 무효화 |
| 탈취 의심 | 서버에서 강제 만료 가능 |
| 기기 변경 | 기기별 토큰 관리로 특정 기기만 로그아웃 |

- **Access Token**: DB에 저장하지 않음 → 서버가 즉시 제어 불가 (만료까지 대기)
- **Refresh Token**: DB에 저장 → 서버가 언제든 무효화 가능

---

## 4. 우리 프로젝트 적용 방식

```
구글 / 카카오 / 네이버 소셜 로그인
  → Supabase Auth가 OAuth 플로우 처리
    → 사용자 정보 수신
      → user-service에서 JWT 발급
          Payload: { userId, email, provider: "google" }
      → Access Token (1시간) + Refresh Token (7일)
        → 클라이언트에 전달
```

### 채택 스펙
| 항목 | 결정 |
|---|---|
| 로그인 방식 | 소셜 로그인 (Google, Kakao, Naver) |
| OAuth 처리 | Supabase Auth |
| 토큰 전략 | Access Token + Refresh Token |
| Access Token 수명 | 1시간 |
| Refresh Token 수명 | 7일 |
