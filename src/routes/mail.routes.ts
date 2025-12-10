import express from 'express';
import { createEmailTemplate, getAllEmailTemplates, getEmailTemplate, updateEmailTemplate, deleteEmailTemplate, sendProfileIncompleteEmails, sendEmailToSelectedUsers } from '../controllers/mail.controller';
import { authenticateToken } from '../services/authorization';
import cron from 'node-cron';

const router = express.Router();

router.post('/create', authenticateToken, createEmailTemplate);
router.post('/getAll', authenticateToken, getAllEmailTemplates);
router.get('/get/:id', authenticateToken, getEmailTemplate);
router.post('/edit/:id', authenticateToken, updateEmailTemplate);
router.delete('/delete/:id', authenticateToken, deleteEmailTemplate);

router.post('/sendManual', authenticateToken, sendEmailToSelectedUsers);

// Runs every day at 9:00 AM to send profile incomplete emails to users who signed up 1 day ago
cron.schedule('0 9 * * *', async () => {
  try {
    console.log('🕛 Running profile incomplete email job...');
    const now = new Date();
    console.log('UTC Time:', now.toISOString());
    console.log('Current Time:', now.toLocaleTimeString());
    
    await sendProfileIncompleteEmails();
    console.log('✅ Profile incomplete email job completed successfully.');
  } catch (err) {
    console.error('❌ Error during profile incomplete email job:', err);
  }
});

export default router;  