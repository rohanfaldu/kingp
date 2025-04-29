import express from 'express';
import { signup } from '../controllers/auth.controller';


const router = express.Router();

router.post('/user/signup', signup);

export default router;  