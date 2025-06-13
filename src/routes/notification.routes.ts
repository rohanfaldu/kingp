import express from 'express';
import { sendNotification, listNotifications } from '../controllers/notification.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/notify', sendNotification);
router.post('/get', authenticateToken, listNotifications);



export default router;  