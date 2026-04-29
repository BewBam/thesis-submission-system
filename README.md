# Thesis Deposit Portal

Current phase focuses on frontend and backend only. DSpace API integration is deferred to a later sprint.

## Current structure

- `frontend`: React + Ant Design starter
- `backend`: NestJS-style API starter with `auth` and `users` modules
- `db/init/001_schema.sql`: PostgreSQL schema for core tables
- `docker-compose.yml`: local development stack

## Current scope (phase 1)

- Build authentication and role-based access (`student`, `reviewer`, `admin`)
- Build submission and review flow in frontend/backend
- Persist workflow state in PostgreSQL
- Prepare integration-ready architecture for DSpace (without calling DSpace APIs yet)

## Quick start

```bash
docker compose up --build
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:3000`

## Database notes

Postgres is initialized from `db/init/*.sql` (includes `users` table + demo seed accounts).

If you run backend **on your machine** while Postgres runs in Docker with port `5432` published, the default DB host is `127.0.0.1`.

If you run backend **inside Docker Compose**, set `DB_HOST=postgres` (already set in `docker-compose.yml`).

If you need to re-run SQL init scripts, reset the volume:

```bash
docker compose down -v
docker compose up --build
```

## Auth test endpoint

- `POST /auth/login`
- Example payload:

```json
{
  "username": "student1",
  "password": "student123"
}
```

Available demo users:

- `student1` / `student2` / `student3` + password `student123` (`student`)
- `reviewer1` / `reviewer2` / `reviewer3` + password `review123` (`reviewer`)
- `admin1 / admin123` (`admin`)

## Users list (for searchable dropdowns)

- `GET /users?role=student`
- `GET /users?role=reviewer` (used by the submission form to pick reviewers)

## Submissions

- `POST /submissions` (multipart):
  - Requires `Authorization: Bearer <access_token>` and a `student` account.
  - `authorIds`: JSON array of student user ids, e.g. `["11111111-1111-1111-1111-111111111101","11111111-1111-1111-1111-111111111102"]`
  - must include `studentId` (the submitting student must be one of the authors)
  - `reviewerIds`: JSON array of reviewer user ids, e.g. `["22222222-2222-2222-2222-222222222201"]`

## Thesis workflow (updated)

- Student tao va submit thesis -> status `reviewing`
- Cac reviewer duoc gan review thesis:
  - Reviewer `approve`: tiep tuc cho den khi tat ca reviewer deu approve
  - Reviewer `reject`: thesis -> status `reject`
- Sau khi tat ca reviewer approve, thesis chuyen sang status `approving`
- Admin review lan cuoi:
  - Admin `approve`: thesis -> status `approved`
  - Admin `reject`: thesis -> status `reject`

Status chuan:

- `reviewing`: reviewer dang review
- `approving`: admin dang review lan cuoi
- `approved`: duoc duyet cuoi cung
- `reject`: bi tu choi boi reviewer hoac admin

## Reviews (reviewer)

- `GET /reviews/my-queue` (requires `Authorization: Bearer <access_token>` and `reviewer` role)
- `POST /reviews/action` (JSON):

```json
{
  "submissionId": "00000000-0000-0000-0000-000000000000",
  "action": "approve"
}
```

Reject example:

```json
{
  "submissionId": "00000000-0000-0000-0000-000000000000",
  "action": "reject",
  "comment": "Reason is required for reject"
}
```

## API docs

- Xem tài liệu chi tiết từng endpoint tại `docs/api/README.md`.
