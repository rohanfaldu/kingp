import express from 'express';
import { createDailyTips, editDailyTips, getByIdTips, getAllDailyTips, deleteTips } from '../controllers/tips.controller';
import { authenticateToken } from '../services/authorization';


const router = express.Router();

router.post('/create', authenticateToken, createDailyTips);
router.post('/edit/:id', editDailyTips);
router.post('/get', getByIdTips);
router.post('/getAll', getAllDailyTips);
router.delete('/delete', deleteTips);



export default router;  