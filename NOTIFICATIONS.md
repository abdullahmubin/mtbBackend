Notifications system: notification-first model with per-user read tracking

Overview
--------
This document describes the notification-first approach implemented in the backend and the frontend wiring.

Goals
- Provide a unified notifications API for UI.
- Support broadcasts and per-user read state.
- Keep notifications flexible (type, title, body, ref link) and efficient for aggregation.

Data model
----------
Collections added:

1) notifications
- _id
- organization_id
- type: 'message' | 'sms' | 'announcement' | 'email' | 'other'
- title
- body
- ref_id (optional): reference to a message/sms/announcement record
- recipients: either 'all' or object { tenant_ids: [], user_ids: [] }
- meta: free-form object
- created_at / updated_at (timestamps)

2) notification_reads
- _id
- notification_id (ObjectId)
- user_id (identify who read)
- tenant_id (optional)
- read_at (timestamp)
- organization_id

API endpoints (implemented)
---------------------------
- GET /notifications?limit=20
  - Returns notifications visible to the current user, with `is_read` computed.
  - Response: standardized wrapper with `data: []`.

- GET /notifications/unread-count
  - Returns { total, byType }

- POST /notifications/:id/read
  - Marks a single notification as read for the current user (upsert into notification_reads)

- POST /notifications/mark-all-read
  - Bulk upsert read rows for visible notifications for the current user.

Notes & migration
-----------------
- The `notifications` collection is intentionally flexible so existing messages/sms/announcements can be referenced using `ref_id` and `type`.
- Seeded SMS records that already include `is_read` can be backfilled into `notification_reads` if desired.

Frontend
--------
- A single `NotificationsApi.list()` should be implemented which calls `GET /notifications` and returns unified items with `is_read`.
- Dropdown should fetch latest notifications on open, show unread first, and call `POST /notifications/:id/read` when an item is clicked or when the dropdown opens (configurable).
- Use websocket events `notification.created` and `notification.read` to maintain live counts and items.

Indexes
-------
- notifications: { organization_id:1, created_at:-1 }
- notification_reads: { notification_id:1, user_id:1 }

Security
--------
- Endpoints enforce `organization_id` scoping via `attachOrganizationContext` middleware and require authenticated user.
- Mark-read endpoints only operate for the authenticated user.

Next steps
----------
- Wire up a server-side producer that creates `notifications` when messages/sms/announcements are created (e.g., in message POST handler add a notification row for broadcasts/targeted recipients).
- Implement frontend `NotificationsApi` and modify `AppLayout` to use it directly. Optionally add `mark-all-read` UX.
- Add real-time publishing of created/read events.

Backfill script
-------------

A one-off script has been added at `backend/scripts/backfill-notifications.js` to migrate existing `messages`, `sms_messages`, and `announcements` documents into the `notifications` collection and to backfill `notification_reads` for SMS items that already had `is_read` flags.

Run it from the `backend` folder:

```bash
npm run backfill:notifications
```

The script is idempotent and will skip creating duplicate notification rows when a source reference already exists.
