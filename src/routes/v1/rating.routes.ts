import express from 'express';
import { createRating, getUserRatings, getOrderRatings } from '../../controllers/v1/ratings.controller';
import { authenticateToken } from '../../services/authorization';



const router = express.Router();

router.post('/create', authenticateToken, createRating);
router.post('/get', getUserRatings);
router.post('/orderRatings', getOrderRatings);


export default router;  