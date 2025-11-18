import express from 'express';
import { sendNotification, listNotifications, sendNotificationtoAllUser } from '../controllers/notification.controller';
import { authenticateToken } from '../services/authorization';
import cron from 'node-cron';

const router = express.Router();

router.post('/notify', sendNotification);
router.post('/get', authenticateToken, listNotifications);

cron.schedule('30 9 * * *', async () => {

  console.log('🕛 Running scheduled job (every 1 minute)...');
  try {
    await sendNotificationtoAllUser();
    console.log('✅ Job completed successfully.');
  } catch (err) {
    console.error('❌ Error during scheduled job:', err);
  } 
});

export default router;  