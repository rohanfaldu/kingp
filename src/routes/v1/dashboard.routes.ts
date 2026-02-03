import express from 'express';
import { getTopInfluencers, getDashboardData, influencerDashboard, chatViewCount, getAdminDashboardStats, getAdminEarningsList } from '../../controllers/v1/dashboard.controller';
import { authenticateToken } from '../../services/authorization';



const router = express.Router();

router.post('/getTopInfluencer', getTopInfluencers);
router.post('/getData', authenticateToken, getDashboardData);

router.post('/updateChatCount', authenticateToken, chatViewCount);
// router.post('/getAll', getAllCountry);


router.post('/getInfluencerData', authenticateToken, influencerDashboard);
router.post('/getAdminDashboardStats', authenticateToken, getAdminDashboardStats);
router.post('/getAdminEarningsList', authenticateToken, getAdminEarningsList);





export default router;  