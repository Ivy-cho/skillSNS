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

> `state`는 받지 않는다 — CSRF 방지는 Supabase Auth의 PKCE 플로우(`exchange_code_for_session`)가
> 대신 처리하므로 user-service가 별도로 검증할 state 값이 없다.

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
    "created_at": "2026-06-25T00:00:00Z",
    "bio": null,
    "avatar_url": "https://lh3.googleusercontent.com/..."
  }
}
```

신규 가입이면 `avatar_url`은 제공자(구글/카카오)가 준 프로필 사진 URL로 자동 채워진다
(`user_metadata.avatar_url` 또는 `picture`) — 유저가 직접 업로드하기 전까지의 기본값이다.

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 400 | INVALID_CODE | 유효하지 않은 Authorization Code |
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

### 4-4. 내 정보 조회 / 프로필 수정

| 항목 | 내용 |
|---|---|
| Method | `GET` |
| URL | `/auth/me` |
| 설명 | 현재 로그인한 사용자 정보를 반환한다 (4-2 콜백 응답의 `user`와 동일한 구조) |
| 인증 | Access Token 필요 |

| 항목 | 내용 |
|---|---|
| Method | `PATCH` |
| URL | `/auth/me` |
| 설명 | `nickname`/`bio`/`avatar_url` 중 요청에 포함된 필드만 수정한다 |
| 인증 | Access Token 필요 |

**Request Body** (모두 선택)
```json
{ "nickname": "새 닉네임", "bio": "소개글", "avatar_url": "https://..." }
```

---

### 4-5. 프로필 사진 업로드

| 항목 | 내용 |
|---|---|
| Method | `POST` |
| URL | `/auth/me/avatar` |
| 설명 | 업로드된 이미지를 최대 512×512로 축소하고 JPEG로 통일해 Supabase Storage(`avatars` 버킷)에 저장한다. 경로가 항상 `{user_id}.jpg`라 유저당 파일이 하나로 덮어써진다. |
| 인증 | Access Token 필요 |
| Content-Type | `multipart/form-data` (`file` 필드) |

**응답 (200 OK)**
```json
{ "avatar_url": "https://.../avatars/{user_id}.jpg" }
```

**에러 응답**
| 상태코드 | 에러코드 | 설명 |
|---|---|---|
| 400 | INVALID_FILE_TYPE | 지원 안 하는 형식(jpeg/png/webp/gif 외) 또는 이미지로 열리지 않음 |
| 400 | FILE_TOO_LARGE | 원본 파일이 5MB 초과 |
| 500 | AVATAR_UPLOAD_FAILED | Storage 업로드 실패 |

---

### 4-6. 로그아웃

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
| bio | TEXT | 소개글 (nullable) |
| avatar_url | TEXT | 프로필 사진 URL (nullable) — 가입 시 소셜 프로필 사진으로 기본값 채움, 직접 업로드 시 Storage 파일로 교체 |
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
