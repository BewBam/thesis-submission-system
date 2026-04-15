# Thesis Deposit Portal

Skeleton implementation for Sprint 1 of the thesis/dissertation legal deposit system integrated with DSpace.

## Current structure

- `frontend`: React + Ant Design starter
- `backend`: NestJS-style API starter with `auth` and `users` modules
- `db/init/001_schema.sql`: PostgreSQL schema for core tables
- `docker-compose.yml`: local development stack

## Quick start

```bash
docker compose up --build
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:3000`

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

- `student1 / student123` (`student`)
- `reviewer1 / review123` (`reviewer`)
- `admin1 / admin123` (`admin`)
