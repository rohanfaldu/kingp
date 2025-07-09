import express from 'express';
import { createAbuseReport, getAllAbuseReports, getByIdAbuseReport } from '../controllers/abuseReport.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/create', authenticateToken, createAbuseReport);
router.post('/get', getByIdAbuseReport);
router.post('/getAll', authenticateToken, getAllAbuseReports);



export default router;  