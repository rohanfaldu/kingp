import express from 'express';
import { uploadMultipleImages } from '../controllers/image.controller';


const router = express.Router();

router.post('/image', uploadMultipleImages);



export default router;  