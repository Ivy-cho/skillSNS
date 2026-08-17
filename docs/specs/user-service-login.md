# 기능 명세서 - 로그인 (user-service)

- **작성일**: 2026-06-25
- **서비스**: user-service
- **버전**: v1.0

---

## 1. 개요

Supabase Auth를 통해 소셜 로그인(Google / Kakao)을 처리하고,
자체 JWT(Access Token + Refresh Token)를 발급하여 클라이언트에 반환한다.

---

## 2. 소셜 로그인 제공자

| 제공자 | 지원 여부 |
|---|---|
| Google | ✅ |
| Kakao | ✅ |

---

## 3. 플로우

```
클라이언트
  │
  │  1. 소셜 로그인 요청 (provider 선택)
  ▼
user-service
  │
  │  2. Supabase Auth OAuth URL 생성 및 반환
  ▼
클라이언트
  │
  │  3. 소셜 플랫폼 로그인 화면으로 리다이렉트
  ▼
Google / Kakao
  │
  │  4. 인증 완료 → Authorization Code 발급
  ▼
user-service (callback)
  │
  │  5. Supabase Auth가 Code → 사용자 정보 처리
  │  6. DB에 사용자 저장 (신규) 또는 조회 (기존)
  │  7. Access Token + Refresh Token 발급
  ▼
클라이언트
  │
  │  8. 토큰 수신 → 로그인 완료
```

---

## 4. API 명세

### 4-1. 소셜 로그인 URL 요청

| 항목 | 내용 |
|---|---|
| Method | `GET` |
| URL | `/auth/login/{provider}` |
| 설명 | 소셜 로그인 페이지 URL을 반환한다 |

**Path Parameter**
| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| provider | string | ✅ | `google` / `kakao` |

**응답 (200 OK)**
```json
{
  "login_url": "https://accounts.google.com/o/oauth2/auth?..."
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 400 | INVALID_PROVIDER | 지원하지 않는 provider |

---

### 4-2. 소셜 로그인 콜백

| 항목 | 내용 |
|---|---|
| Method | `GET` |
| URL | `/auth/callback` |
| 설명 | 소셜 플랫폼 인증 후 리다이렉트되는 콜백 엔드포인트 |

**Query Parameter**
| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| code | string | ✅ | 소셜 플랫폼이 발급한 Authorization Code |
| state | string | ✅ | CSRF 방지용 상태값 |

**응답 (200 OK)**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "email": "user@gmail.com",
    "nickname": "홍길동",
    "provider": "google",
    "created_at": "2026-06-25T00:00:00Z"
  }
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 400 | INVALID_CODE | 유효하지 않은 Authorization Code |
| 400 | INVALID_STATE | state 불일치 (CSRF 의심) |
| 500 | AUTH_SERVER_ERROR | Supabase Auth 서버 오류 |

---

### 4-3. 토큰 재발급

| 항목 | 내용 |
|---|---|
| Method | `POST` |
| URL | `/auth/refresh` |
| 설명 | Refresh Token으로 새 Access Token을 발급한다 |

**Request Body**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**응답 (200 OK)**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "expires_in": 3600
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 401 | INVALID_REFRESH_TOKEN | 유효하지 않은 Refresh Token |
| 401 | EXPIRED_REFRESH_TOKEN | 만료된 Refresh Token → 재로그인 필요 |

---

### 4-4. 로그아웃

| 항목 | 내용 |
|---|---|
| Method | `POST` |
| URL | `/auth/logout` |
| 설명 | Refresh Token을 무효화하고 로그아웃 처리한다 |
| 인증 | Access Token 필요 (Authorization 헤더) |

**Request Header**
```
Authorization: Bearer {access_token}
```

**응답 (200 OK)**
```json
{
  "message": "로그아웃 되었습니다."
}
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 401 | UNAUTHORIZED | 유효하지 않은 Access Token |

---

## 5. 토큰 명세

| 항목 | Access Token | Refresh Token |
|---|---|---|
| 수명 | 1시간 | 7일 |
| 저장 위치 | 클라이언트 메모리 | 클라이언트 스토리지 |
| DB 저장 | ❌ | ✅ (무효화 처리용) |
| 만료 시 | Refresh Token으로 재발급 | 재로그인 필요 |

---

## 6. DB 테이블

### users
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | PK, 자동 생성 |
| email | VARCHAR | 소셜 계정 이메일 |
| nickname | VARCHAR | 표시 이름 |
| provider | VARCHAR | `google` / `kakao` |
| provider_id | VARCHAR | 소셜 플랫폼 고유 ID |
| created_at | TIMESTAMP | 가입일 |
| updated_at | TIMESTAMP | 수정일 |

### refresh_tokens
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users.id |
| token | TEXT | Refresh Token 값 |
| expires_at | TIMESTAMP | 만료 시각 |
| created_at | TIMESTAMP | 발급일 |

---

## 7. 비즈니스 규칙

- 동일 이메일로 다른 provider 로그인 시 → 별도 계정으로 처리
- 신규 사용자 최초 로그인 시 → users 테이블에 자동 생성
- 로그아웃 시 → DB에서 해당 Refresh Token 삭제
- Refresh Token은 1인 1토큰 (재발급 시 기존 토큰 교체)
