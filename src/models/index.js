import ReceiptsDB from "./receipts.js";
import ReceiptCategoriesDB from './receiptCategories.js'
import UserDB from './user.js'
import ReceiptByUserDB from './receiptByUser.js'
import SubscriptionsDB from './subscriptions.js'
import DocumentsDB from './documents.js';
import ActivityLogDB from './activityLog.js';
import TenantsDB from './tenants.js';
import LeasesDB from './leases.js';
import PaymentsDB from './payments.js';
import TicketsDB from './tickets.js';
import OrganizationDB from './organizations.js';
let ContractsDB;
try {
	// Attempt dynamic import so a broken/missing contracts.js doesn't crash the whole app
	ContractsDB = (await import('./contracts.js')).default;
} catch (err) {
	// Provide a safe placeholder with no-op implementations for common mongoose-like calls
	console.warn('Warning: contracts model failed to load, using placeholder. Error:', err && err.message);
	ContractsDB = {
		find: async () => [],
		findOne: async () => null,
		findById: async () => null,
		create: async (d) => ({ ...d, _id: 'placeholder' }),
		findOneAndUpdate: async () => null,
		deleteOne: async () => ({ deletedCount: 0 })
	};
}

const models = { ReceiptsDB, ReceiptCategoriesDB, UserDB, ReceiptByUserDB, SubscriptionsDB, DocumentsDB, ActivityLogDB, TenantsDB, LeasesDB, PaymentsDB, TicketsDB, OrganizationDB, ContractsDB }

export default models