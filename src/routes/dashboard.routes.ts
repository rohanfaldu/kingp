import express from 'express';
import { getTopInfluencers, getDashboardData } from '../controllers/dashboard.controller';


const router = express.Router();

router.post('/getTopInfluencer', getTopInfluencers);
router.post('/getData', getDashboardData);
// router.get('/get/:id', getByIdCountry);
// router.post('/getAll', getAllCountry);
// router.delete('/delete/:id', deleteCountry);



export default router;  