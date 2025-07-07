import express from 'express';
import { signup, login, deleteUser, getAllInfo, getAllUsers, getByIdUser, getAllUsersAndGroup, editProfile, getUsersWithType, incrementInfluencerClick, socialLogin, updateUserBannerStatusByUserId } from '../controllers/auth.controller';
import { sendMail } from '../controllers/mail.controller';
import { authenticateToken } from '../services/authorization';


const router = express.Router();

router.post('/user/signup', signup);
router.post('/user/login', login);
router.post('/user/get', authenticateToken, getByIdUser)
router.post('/user/getAll', authenticateToken, getAllUsers)
router.post('/user/getUserGroupAll', authenticateToken, getAllUsersAndGroup)
router.post('/user/getAllInfo', getAllInfo)
router.delete('/user/delete', deleteUser)
router.post('/user/edit/:id', authenticateToken, editProfile)

router.post('/user/get-user-type', authenticateToken, getUsersWithType)
router.post('/influencer/click', authenticateToken, incrementInfluencerClick)
router.post('/social-id', socialLogin)

router.post('/user/bannerStatus', updateUserBannerStatusByUserId);

router.post('/send', sendMail)

export default router;  