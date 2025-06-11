import express from 'express';
import { getTopInfluencers } from '../controllers/dashboard.controller';


const router = express.Router();

router.post('/getTopInfluencer', getTopInfluencers);
// router.post('/edit/:id', editCountry);
// router.get('/get/:id', getByIdCountry);
// router.post('/getAll', getAllCountry);
// router.delete('/delete/:id', deleteCountry);



export default router;  