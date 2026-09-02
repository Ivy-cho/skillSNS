# feed-service — 기술 설계

- **포트**: 8003
- **책임**: 공개 스킬 피드 조회 **하나**. 검색(`q`) + 페이징(`limit`/`offset`).
- **소유 테이블**: **없음.** `skills` / `users` / `scraps` / `categories`를 읽기 전용으로 조인만 한다.
- **인증**: 없음 (공개 목록)

3개 백엔드 중 유일하게 "쓰기"가 없고, DB 스키마에 손대지 않는 서비스다.

---

## 1. SW 구조

```
feed-service/
├── main.py                 # FastAPI 앱 + CORS + feed_router + /health.  lifespan/Base 없음
├── Dockerfile              # python:3.11-slim, uvicorn main:app --host 0.0.0.0 --port 8003
├── requirements.txt        # fastapi, uvicorn, sqlalchemy, asyncpg, pydantic-settings (LLM/PIL/jose 전부 불필요)
└── app/
    ├── core/config.py      # Settings: DATABASE_URL, CORS_ORIGINS 뿐
    ├── db/database.py      # async engine(NullPool) + get_db.  ★ Base / create_all 없음 (스키마를 만들지 않는다)
    ├── schemas/feed.py     # FeedItem (응답 모델)
    └── api/routes/feed.py  # GET /feed — raw SQL 2개(일반/검색) + 핸들러
```

### 설계 의도

- `db/database.py`에 **`Base`도 `create_all`도 없다.** 이 서비스가 실수로라도 스키마를
  만들거나 바꾸지 못하게 하기 위한 의도적 생략이다.
- SQLAlchemy ORM 모델을 두지 않고 **raw SQL(`sqlalchemy.text`)** 로 조회한다. 다른
  서비스가 소유한 테이블을 조인만 하는 읽기 전용 뷰라서, 모델을 중복 정의하는 것보다
  쿼리를 직접 쓰는 편이 경계를 더 분명하게 한다.
- user-service/skill-service와 **같은 Supabase Postgres 인스턴스**를 가리켜야 한다
  (`DATABASE_URL`).

---

## 2. 데이터 접근 (조회만)

### 응답 모델 `FeedItem`

```
id, title, description,
category (소분류 이름), category_emoji,
major_category (대분류 이름, 백필 전 라벨이면 null),
user_id, author_nickname, author_avatar_url,
scrap_count, view_count, created_at
```

### 쿼리 (`app/api/routes/feed.py`)

`GET /feed?q=&sort=recent&category=&limit=20&offset=0` — 고정 `SELECT ... FROM ... JOIN`
(`_SELECT_FROM`)에 `WHERE`/`ORDER BY`를 파라미터에 따라 조립해 붙인다.
사용자 입력은 전부 바인드 파라미터이고, `sort`만 화이트리스트(`_SORT_ORDER`) 키로 매핑한다.

```sql
FROM skills s
LEFT JOIN users u        ON u.id = s.user_id            -- 작성자 닉네임·프로필 사진
LEFT JOIN categories c    ON c.id = s.category           -- 소분류 이름·이모지 해석
LEFT JOIN categories cm   ON cm.id = c.parent_id         -- 대분류 이름(major_category), 검색·필터
LEFT JOIN (SELECT skill_id, COUNT(*) cnt FROM scraps GROUP BY skill_id) sc
                         ON sc.skill_id = s.id           -- 스크랩 수
[ WHERE <q 조건> [AND <category 조건>] ]
ORDER BY <sort>
LIMIT :limit OFFSET :offset
```

- **`COALESCE(c.name, s.category)`** / **`COALESCE(c.emoji, '🏷️')`** — `s.category`는
  `categories.id`지만, 아직 id로 백필되지 않은(라벨 문자열) 옛 스킬은 조인이 안 맞으므로
  원본 값을 그대로 보여준다. `major_category`는 `cm.name`(대분류) — 백필 전 스킬이면 `null`.
- **검색 `q`**: `title` / `description` / 소분류(`c.name`) / 대분류(`cm.name`) /
  원본 라벨(`s.category`) / 작성자 닉네임(`u.nickname`)에 대소문자 무시 부분일치(`ILIKE '%q%'`).
- **정렬 `sort`**: `recent`(기본, `s.created_at DESC`) / `views`(`s.view_count DESC`, 동점
  `s.title ASC`) / `scraps`(`COALESCE(sc.cnt,0) DESC`, 동점 `s.title ASC`). 화이트리스트
  밖이면 `400 INVALID_SORT`.
- **필터 `category`**: 소분류 id **또는** 소분류/대분류 이름으로 **정확일치**
  (`s.category = :cat OR c.name = :cat OR cm.name = :cat`) — `q`의 부분일치와 달리 다른
  카테고리 스킬이 안 딸려온다. `q`와 병행 가능.
- **페이징**: `offset`/`limit`. 응답 배열 길이 < `limit`이면 마지막 페이지. 프론트는
  300ms 디바운스 + 무한 스크롤.
- "요즘 뜨는 스킬" 트렌딩은 여전히 프론트가 이 응답을 가공해 만든다(전용 엔드포인트 없음).
- 카테고리 칩 목록은 skill-service `GET /categories`(별도 서비스)에서 받는다 — feed-service는
  `?category=` 필터만 담당한다.

---

## 3. 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://...` — user/skill-service와 동일 인스턴스 |
| `CORS_ORIGINS` | | 쉼표 구분. 기본 `http://localhost:3000` |

---

## 4. 배포

Render `env: docker`. `branch: develop`, `autoDeploy: false`.
`uvicorn main:app --host 0.0.0.0 --port 8003`.
과거 재생성 시 `sync: false`인 `DATABASE_URL` 재입력을 빠뜨려 기동 실패한 이력이 있다
(README 11.7절). 파이프라인은 [`../tech-decisions.md`](../tech-decisions.md) 9절.
