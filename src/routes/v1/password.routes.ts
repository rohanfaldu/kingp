import express from 'express';
import { changePassword, forgotPassword, verifyOtp, resetPassword } from '../../controllers/v1/password.controller';
import { authenticateToken } from '../../services/authorization';



const router = express.Router();

router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);
router.post('/change-password', authenticateToken, changePassword);



export default router;  