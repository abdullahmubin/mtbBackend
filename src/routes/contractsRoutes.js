import express from "express";
import * as ctrl from "../controllers/contractsController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { attachOrganizationContext } from "../middleware/planQuotaMiddleware.js";
import { commonValidations } from "../middleware/securityMiddleware.js";
import schedulerCtrl from '../controllers/schedulerController.js';
import dashboardCtrl from '../controllers/dashboardController.js';
import multer from 'multer';

// memory storage so we can forward to documentsService
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();

// protect all contracts routes
router.use(authenticateToken);
router.use(attachOrganizationContext);

router.post("/contracts", commonValidations.createContract, ctrl.createContractController);
router.get("/contracts", ctrl.listContractsController);
router.get("/contracts/:id", ctrl.getContractController);
router.put("/contracts/:id", commonValidations.updateContract, ctrl.updateContractController);
router.post('/contracts/:id/files', upload.single('document'), ctrl.addFileToContractController);
router.post('/contracts/:id/send', ctrl.sendContractNowController);

router.post('/admin/scheduler/run-reminders', schedulerCtrl.runRemindersController);
router.get('/admin/scheduler/stats', schedulerCtrl.getSchedulerStatsController);

router.get('/admin/dashboard/stats', schedulerCtrl.getDashboardStats);
router.delete("/contracts/:id", ctrl.archiveContractController);

export default router;
