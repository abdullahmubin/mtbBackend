This folder contains a sample CSV you can open in Excel to test tenant bulk import.

Expected columns (header row):
- id
- first_name
- last_name
- email
- phone
- building_id
- floor_id
- suite_id
- lease_start_date (ISO date: YYYY-MM-DD)
- lease_end_date (ISO date: YYYY-MM-DD)
- status (e.g., Active, Pending, Vacated, Expiring Soon)

Notes:
- The backend also accepts Excel (.xlsx) via the frontend importer, which maps columns similarly to the CSV import. If a column name uses different casing or spaces (e.g., "First Name"), the importer tries normalized matches.
- To test the backend bulk import endpoint directly, convert the CSV to JSON and POST to `/api/tenants/batch` with body:

  {
    "tenants": [ { ... }, { ... } ]
  }

- The import enforces tenant quotas per plan. If the import would exceed your organization's tenant limit the request will be rejected with a 403 and a message describing the limit.
- For large imports, it's recommended to use the batch API to reduce the number of requests from the client.

Example: Use Excel to open `sample-tenants.csv`, then save as `.xlsx` if you want to test the Excel upload flow in the frontend.
