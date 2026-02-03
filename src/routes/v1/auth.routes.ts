import express from 'express';
import { signup, login, deleteUser, getAllInfo, getAllUsers, getByIdUser, getAllUsersAndGroup, getAllUsersForEmail, editProfile, getUsersWithType, suspendOrReactivateUser, incrementInfluencerClick, socialLogin, updateUserBannerStatusByUserId, getRawUserDetailList, getUserBannerStatusByUserId } from '../../controllers/v1/auth.controller';
import { sendMail } from '../../controllers/v1/mail.controller';
import { authenticateToken } from '../../services/authorization';


const router = express.Router();

router.post('/user/signup', signup);
router.post('/user/login', login);
router.post('/user/get', authenticateToken, getByIdUser)
router.post('/user/getAll', authenticateToken, getAllUsers)
router.post('/user/getAllUsersForEmail', authenticateToken, getAllUsersForEmail)
router.post('/user/getUserGroupAll', authenticateToken, getAllUsersAndGroup)
router.post('/user/getAllInfo', getAllInfo)
router.delete('/user/delete', deleteUser)
router.post('/user/edit/:id', authenticateToken, editProfile)

router.post('/user/get-user-type', authenticateToken, getUsersWithType)
router.post('/influencer/click', authenticateToken, incrementInfluencerClick)
router.post('/social-id', socialLogin)

router.post('/user/bannerStatus', updateUserBannerStatusByUserId);
router.post('/user/getAllBanner', getRawUserDetailList);
router.post('/user/getByUserId', getUserBannerStatusByUserId);

router.post('/user/suspendOrReactivateUser', authenticateToken, suspendOrReactivateUser)



router.post('/send', sendMail)

export default router;  