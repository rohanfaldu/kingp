import express from 'express';
import { submitContactForm, getAllContactRequests  } from '../controllers/contact.controller';
import { authenticateToken } from '../services/authorization';


const router = express.Router();

router.post('/create', authenticateToken, submitContactForm);
router.post('/getAll', authenticateToken, getAllContactRequests);




export default router;  