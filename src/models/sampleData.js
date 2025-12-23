// Sample data for quick reference and testing relationships
export const sampleData = {
  organization: {
    organization_id: 1001,
    name: "Acme Corp",
    ownerUserId: "user_001",
    plan: "pro",
    status: "active"
  },
  user: {
    _id: "user_001",
    userName: "adminuser",
    email: "admin@acme.com",
    password: "hashed_pw",
    role: "clientadmin",
    plan: "pro",
    organization_id: 1001
  },
  tenant: {
    id: "tenant_001",
    name: "John Doe",
    organization_id: 1001,
    email: "john@tenant.com"
  },
  lease: {
    id: "lease_001",
    organization_id: 1001,
    tenant_id: "tenant_001",
    startDate: "2025-09-01",
    endDate: "2026-08-31"
  },
  sms: {
    id: "sms_001",
    organization_id: 1001,
    tenant_id: "tenant_001",
    message: "Your rent is due soon."
  },
  email: {
    id: "email_001",
    organization_id: 1001,
    tenant_id: "tenant_001",
    subject: "Lease Renewal Reminder",
    body: "Please renew your lease."
  },
  document: {
    id: "doc_001",
    organization_id: 1001,
    tenant_id: "tenant_001",
    name: "Lease Agreement.pdf"
  },
  payment: {
    id: "pay_001",
    organization_id: 1001,
    tenant_id: "tenant_001",
    amount: 1200,
    date: "2025-09-05"
  },
  ticket: {
    id: "ticket_001",
    organization_id: 1001,
    tenant_id: "tenant_001",
    subject: "Leaky faucet",
    status: "open"
  }
};
