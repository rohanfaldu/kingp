import express from 'express';
import { createEmailTemplate, getAllEmailTemplates, getEmailTemplate, updateEmailTemplate, deleteEmailTemplate } from '../controllers/mail.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/create', authenticateToken, createEmailTemplate);
router.post('/getAll', authenticateToken, getAllEmailTemplates);
router.get('/get/:id', authenticateToken, getEmailTemplate);
router.post('/edit/:id', authenticateToken, updateEmailTemplate);
router.delete('/delete/:id', authenticateToken, deleteEmailTemplate);

export default router;  