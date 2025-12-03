import express from 'express';
import { createUserBankDetails, getUserBankDetailsByUserId, editUserBankDetails, deleteUserBankDetails, createUserPaypalDetails, updateUserPaypalDetails, getUserPaypalDetails, deleteUserPaypalDetails } from '../controllers/bankDetail.controller'
import { authenticateToken } from '../services/authorization';


const router = express.Router();

router.post('/create', authenticateToken, createUserBankDetails);
router.post('/edit/:id', authenticateToken, editUserBankDetails);
router.post('/getByUserId', authenticateToken, getUserBankDetailsByUserId);
router.delete('/delete', authenticateToken, deleteUserBankDetails);


router.post('/createPaypal', authenticateToken, createUserPaypalDetails);
router.post('/updatePaypal/:id', authenticateToken, updateUserPaypalDetails);
router.get('/paypal/:userId', authenticateToken, getUserPaypalDetails);
router.delete('/deletePaypal/:id', authenticateToken, deleteUserPaypalDetails);



export default router;  