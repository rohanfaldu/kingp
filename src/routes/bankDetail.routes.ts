import express from 'express';
import { createUserBankDetails, getUserBankDetailsByUserId, editUserBankDetails, deleteUserBankDetails } from '../controllers/bankDetail.controller'
import { authenticateToken } from '../services/authorization';


const router = express.Router();

router.post('/create', authenticateToken, createUserBankDetails);
router.post('/edit/:id', authenticateToken, editUserBankDetails);
router.post('/getByUserId', authenticateToken, getUserBankDetailsByUserId);
router.delete('/delete', authenticateToken, deleteUserBankDetails);



export default router;  