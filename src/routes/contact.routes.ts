import express from 'express';
import { submitContactForm, getAllContactRequests, deleteContactRequest, updateContactRequestStatus  } from '../controllers/contact.controller';
import { authenticateToken } from '../services/authorization';


const router = express.Router();

router.post('/create', authenticateToken, submitContactForm);
router.post('/updateStatus', authenticateToken, updateContactRequestStatus);

router.post('/getAll', authenticateToken, getAllContactRequests);
router.delete('/delete/:id', authenticateToken, deleteContactRequest);




export default router;  