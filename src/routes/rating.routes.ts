import express from 'express';
import { createRating, getUserRatings, getOrderRatings } from '../controllers/ratings.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/create', authenticateToken, createRating);
router.post('/get', getUserRatings);
router.post('/orderRatings', getOrderRatings);
// router.post('/getAllMedia', getAllMediaList);

export default router;  