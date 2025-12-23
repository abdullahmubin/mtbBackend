# Swagger Usage Guide

Swagger UI is exposed at `/api/docs` when the server is running.

## Run the server

```bash
npm run prod   # or npm run dev
```

Then open http://localhost:3031/api/docs (or the port shown in logs).

## Explore the API

- Browse endpoints on the left, details on the right.
- Click an endpoint → **Try it out** → fill params/body → **Execute**.
- Responses, curl, and request payload are shown below.

## Authentication

Most protected routes use JWT bearer auth.

1) Obtain a token (e.g., POST /api/auth/login).  
2) In Swagger UI, click **Authorize** → paste `Bearer <token>` → **Authorize**.  
3) Execute protected endpoints; the token is sent automatically.

## Useful endpoints

- `/api/health` — service health.
- `/api/auth/login` — get a token.
- `/api/receipts` — list/create receipts (example CRUD).

## Update or add docs

- Add OpenAPI JSDoc blocks in:
  - `src/controllers/**/*.js`
  - `src/routes/**/*.js`
  - `src/docs/**/*.js`
- A starter file lives at `src/docs/openapi-seed.js`.
- Run to regenerate static spec:

```bash
npm run docs
```

## Raw spec

- JSON: `/api/openapi.json`

## Troubleshooting

- 404 on /api/docs: ensure server is running and port matches the URL.
- Auth errors: click **Authorize** and set a fresh JWT.
- Spec not updating: restart the server after editing JSDoc blocks.