import express from 'express';
import { getTopInfluencers, getDashboardData, influencerDashboard, chatViewCount } from '../controllers/dashboard.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/getTopInfluencer', getTopInfluencers);
router.post('/getData', authenticateToken, getDashboardData);

router.post('/updateChatCount', authenticateToken, chatViewCount);
// router.post('/getAll', getAllCountry);


router.post('/getInfluencerData', authenticateToken, influencerDashboard);



export default router;  