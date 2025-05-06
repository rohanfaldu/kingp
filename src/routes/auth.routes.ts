import express from 'express';
import { signupBusiness, login, deleteUser, getAllUsers, getByIdUser, editProfile } from '../controllers/auth.controller';
import { authenticateToken } from '../services/authorization';


const router = express.Router();

router.post('/user/signup-business', signupBusiness);
router.post('/user/login', login);
router.get('/user/get/:id', authenticateToken, getByIdUser)
router.get('/user/getAll', authenticateToken, getAllUsers)
router.delete('/user/delete/:id', authenticateToken, deleteUser)
router.post('/user/edit/:id', authenticateToken, editProfile)


export default router;  