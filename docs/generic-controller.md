# Generic Controller and Service

A minimal, flexible REST layer that exposes CRUD endpoints for any collection listed in `src/models/registry.js` without writing collection-specific code. This is ideal for bootstrapping data mirrored from `db.json` and iterating quickly before you promote entities to strict, validated controllers.

## What it provides

- Auto-mounted routes for each collection at both `/collection` and `/api/collection`.
- CRUD endpoints implemented once and reused for all collections.
- Pagination via `limit` and `skip` query params.
- Optional organization scoping via `?organization_id=123`.
- Mixed id support (numeric or string) so collections like `plan_settings` work alongside numeric ids.
- Lean reads and sensible default sort by `updatedAt` (Mongoose timestamps).

## Where the pieces are

- Router factory: `src/controllers/genericController.js`
- Service factory: `src/services/genericService.js`
- Dynamic model registry: `src/models/registry.js` (open schema, strict: false)
- Route mounting: `src/controllers/index.js` loops `collections` and mounts them.

## Endpoints

For a collection named `tenants` (works similarly for all collections listed in `registry.collections`):

- GET `/tenants` or `/api/tenants` — list with optional filters
  - Query params: `organization_id` (Number), `limit` (Number, default 500 from controller), `skip` (Number)
- GET `/tenants/:id` — fetch by `id` (supports numeric and string ids)
- POST `/tenants` — create; if body contains `id`, request is upserted by `id`
- PUT `/tenants/:id` — update by `id`
- DELETE `/tenants/:id` — remove by `id`

Notes:
- The underlying Mongoose schema is open (`strict: false`), so fields not explicitly declared will be stored as-is.
- Timestamps are enabled; default listing sort is `{ updatedAt: -1 }`.

## Usage examples

- List all announcements for an organization:
  - `GET /api/announcements?organization_id=12&limit=50`
- Create or upsert a plan setting with string id:
  - `POST /api/plan_settings` with `{ "id": "free", "name": "Free", ... }`
- Update a numeric id item:
  - `PUT /api/buildings/101` with JSON body of fields to update

## Promoting to strict controllers

Use the generic layer to move fast. When a collection becomes critical (business rules, validation, RBAC, indexes), promote it:

1. Create a strict Mongoose schema in `src/models/<name>.js`.
2. Build a dedicated controller in `src/controllers/<name>Controller.js` with Joi validation and RBAC.
3. Mount it in `src/controllers/index.js` BEFORE the generic loop so it takes precedence.

This pattern is already applied to: `tenants`, `leases`, `payments`, `tickets`.

## Benefits

- Speed: Add a collection name to `registry.collections` and get a full CRUD API instantly.
- Consistency: Uniform endpoints across collections for the frontend to consume.
- Flexibility: Mixed id types, open schema, and upsert-by-id make importing legacy data easy.
- Evolvability: Start generic, then harden to strict models/controllers without breaking routes.
- Maintainability: One well-tested controller/service pair covers many collections.

## Caveats and best practices

- Validation: Generic routes do not enforce DTO validation. Validate in the client or promote to a strict controller.
- RBAC: Apply auth/role middleware at the app level or prefer strict controllers for sensitive collections.
- Indexes: The generic model indexes `id` and `organization_id`. Add specific indexes in strict models for performance.
- Data types: `organization_id` is treated as Number; keep it numeric for consistent filtering.
- Pagination: The controller defaults to `limit=500`. Override via query params for large datasets.

## Quick reference

- Add a new collection quickly:
  - Add its name to `registry.collections`.
  - Restart the server. Routes appear at `/<name>` and `/api/<name>`.
- Fetch with org filter: `GET /api/<name>?organization_id=1&limit=100&skip=0`.
- Get by id (string or number): `GET /api/<name>/<id>`.
- Upsert by id on create: include `id` in POST body.
