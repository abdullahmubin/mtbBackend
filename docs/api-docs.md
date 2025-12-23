# API Documentation (Swagger)

Visit the live docs at `/api/docs` when the server is running.

## Add/extend documentation

- Add OpenAPI JSDoc blocks in any of these paths:
  - `src/controllers/**/*.js`
  - `src/routes/**/*.js`
  - `src/docs/**/*.js`

Examples are seeded in `src/docs/openapi-seed.js`.

## Generate a static spec

This command writes `swagger.json` in the project root using `swaggerDef.js`:

```bash
npm run docs
```

## Auth

Protected endpoints should include:

```yaml
security:
  - bearerAuth: []
```

`bearerAuth` is defined in `swaggerDef.js` under `components.securitySchemes`.

## Tips

- You can document routes in standalone files under `src/docs` without touching controller code.
- Use tags to group endpoints (Auth, Receipts, Tenants, etc.).