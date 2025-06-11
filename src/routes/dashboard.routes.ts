import express from 'express';
import { getTopInfluencers, getDashboardData } from '../controllers/dashboard.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/getTopInfluencer', getTopInfluencers);
router.post('/getData', authenticateToken, getDashboardData);
// router.get('/get/:id', getByIdCountry);
// router.post('/getAll', getAllCountry);
// router.delete('/delete/:id', deleteCountry);



export default router;  