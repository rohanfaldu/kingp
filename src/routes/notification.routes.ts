import express from 'express';
import { sendNotification, listNotifications, sendNotificationtoAllUser, sendNotificationToUser } from '../controllers/notification.controller';
import { authenticateToken } from '../services/authorization';
import cron from 'node-cron';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

router.post('/notify', sendNotification);
router.post('/get', authenticateToken, listNotifications);

cron.schedule('30 9 * * *', async () => {

  const now = new Date();
  console.log('🕛 Running scheduled job (every 1 minute)...', now);
  console.log('UTC Time:', now.toISOString());
  console.log('Current Time:', now.toLocaleTimeString());

  try {
    await sendNotificationtoAllUser();
    console.log('✅ Job completed successfully.');
  } catch (err) {
    console.error('❌ Error during scheduled job:', err);
  } 
});

cron.schedule('0 9 * * *', async () => {

  console.log('🕛 Running scheduled job (every 1 minute)...');
  try {
    await sendNotificationToUser();
    console.log('✅ Job completed successfully.');
  } catch (err) {
    console.error('❌ Error during scheduled job:', err);
  } 
});


// Runs every day at 00:00 (12 AM server time)
cron.schedule("0 0 * * *", async () => {
    try {
        console.log("⏳ Resetting spin status for all users...");

        await prisma.user.updateMany({
            data: {
                isSpin: true
            }
        });

        console.log("✅ Spin status reset successfully!");
    } catch (error) {
        console.error("❌ Failed to reset spin status:", error);
    }
});
export default router;  