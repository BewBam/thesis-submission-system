# Sprint 1 Kickoff - Baseline Implementation

Phan vi hien tai: tap trung frontend + backend, tam hoan tich hop API DSpace.

## Da thuc hien

- Khoi tao `frontend` voi React + Ant Design + Vite.
- Khoi tao `backend` theo NestJS style, gom module `auth` va `users`.
- Cai dat role co ban: `student`, `reviewer`, `admin`.
- Tao endpoint login mau: `POST /auth/login`.
- Tao schema PostgreSQL: `submissions`, `submission_files`, `reviews`.
- Tao `docker-compose.yml` cho stack local (frontend/backend/postgres).

## Chua thuc hien trong Sprint 1 hien tai

- HTTPS cho moi truong deploy (dang de open trong checklist Sprint 1).
- Kiem thu chay thuc te bang container (`docker compose up --build`) tren may.
- Cac luong goi API DSpace (de chuyen sang sprint tich hop sau).

## Tep lien quan

- Frontend: `frontend/`
- Backend: `backend/`
- Database schema: `db/init/001_schema.sql`
- Compose: `docker-compose.yml`
- Tong quan: `README.md`
