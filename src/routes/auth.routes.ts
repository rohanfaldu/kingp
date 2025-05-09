import express from 'express';
import { signup, login, deleteUser, getAllUsers, getByIdUser, editProfile, getUsersWithType, incrementInfluencerClick } from '../controllers/auth.controller';
import { authenticateToken } from '../services/authorization';


const router = express.Router();

router.post('/user/signup', signup);
router.post('/user/login', login);
router.post('/user/get', authenticateToken, getByIdUser)
router.post('/user/getAll', authenticateToken, getAllUsers)
router.delete('/user/delete', authenticateToken, deleteUser)
router.post('/user/edit/:id', authenticateToken, editProfile)

router.post('/user/get-user-type', authenticateToken, getUsersWithType)
router.post('/influencer/click', incrementInfluencerClick)


export default router;  