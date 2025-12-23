import configureReceiptController from './receiptsController.js'
import configureReceiptCategoriesController from './receiptCategoriesController.js';
import configureAuthController from './authController.js'
import configureSubscriptionController from './subscriptionController.js';
import configureReceiptByUserController from './receiptByUserController.js';
import configureDocumentController from './documentsController.js';
import configuareUserController from './userController.js';
import configuareWebhookController from './webhookController.js'
import configureDashboard from './dashboardController.js';
import configureBankStatement from './bankStatementController.js';
import configureActivityLogController from './activityLogController.js';
import configurePlanSettings from './planSettingsController.js';
import configureEmailTemplates from './emailTemplatesController.js';
import configureResendController from './resendController.js';
import emailRoutes from '../routes/emailRoutes.js';
import { collections } from '../models/registry.js';
import { makeController } from './genericController.js';
import configureTenants from './tenantsController.js';
import configureLeases from './leasesController.js';
import configureBuildings from './buildingsController.js';
import configureFloors from './floorsController.js';
import configureSuites from './suitesController.js';
import configurePayments from './paymentsController.js';
import configureStripePayments from './stripePaymentController.js';
import configureTickets from './ticketsController.js';
import configureQuota from './quotaController.js';
import configureErrorLogs from './errorLogsController.js';
import configureUsage from './usageController.js';
import makeMessagesController from './messagesController.js';
import makeNotificationsController from './notificationsController.js';
import tenantRoutes from '../routes/tenantRoutes.js';
import dashboardRoutes from '../routes/dashboardRoutes.js';
import contractsRoutes from '../routes/contractsRoutes.js';
import organizationRoutes from '../routes/organizationRoutes.js';


const configure = (app) => {
    configureReceiptController(app);
    configureReceiptCategoriesController(app);
    configureAuthController(app);
    configureSubscriptionController(app);
    configureReceiptByUserController(app);
    configureDocumentController(app);
    configuareUserController(app);
    configuareWebhookController(app);
    configureDashboard(app);
    configureBankStatement(app);
    configureActivityLogController(app);

    // Strict, validated routes first for critical resources
    configureTenants(app);
    configureLeases(app);
    configurePayments(app);
    configureStripePayments(app);
    configureTickets(app);
    configureQuota(app);
    configureErrorLogs(app);
    configureUsage(app);
    configurePlanSettings(app);
    // Email templates: compile/preview endpoint
    configureEmailTemplates(app);
    // Resend / email debug endpoints
    configureResendController(app);
    app.use('/api/email', emailRoutes);
    
    // Tenant-specific routes
    app.use('/api/tenant', tenantRoutes);
    // Organization-specific upload/serve routes (explicit)
    app.use('/organization', organizationRoutes);
    app.use('/api/organization', organizationRoutes);
    
    // Dashboard-specific routes
    app.use('/api/dashboard', dashboardRoutes);

    // Contracts routes
    app.use('/api', contractsRoutes);

    // Custom controller for messages
    const messagesRouter = makeMessagesController();
    app.use('/messages', messagesRouter);
    app.use('/api/messages', messagesRouter);

    // Notifications controller
    const notificationsRouter = makeNotificationsController();
    app.use('/notifications', notificationsRouter);
    app.use('/api/notifications', notificationsRouter);

    // Generic REST endpoints for data mirrored from db.json
    // Mount these before routers that apply broad '/api' middleware so
    // public collections (like contact_messages) are reachable without
    // being intercepted by other routers' auth middleware.
    // Register explicit controllers for buildings/floors/suites to avoid
    // tenant-driven filtering in the generic controller that caused empty
    // results when tenant records were not present.
    configureBuildings(app);
    configureFloors(app);
    configureSuites(app);

    for (const c of collections) {
        // Skip 'messages' as we're using a custom controller
        if (c === 'messages') continue;
        // Skip collections that now have explicit controllers
        if (['buildings','floors','suites'].includes(c)) continue;
        const router = makeController(c);
        // mount both with and without /api to cover frontend calls
        app.use(`/${c}`, router);
        app.use(`/api/${c}`, router);
    }
}

export default configure;