import express from 'express';
import { createSocialMediaPlatform, editSocialMediaPlatform, getByIdeditSocialMediaPlatform, getSocialMediaPlatformsByUserId, getAllSocialMediaPlatform, deleteSocialMediaPlatform } from '../controllers/socialMedia.controller';


const router = express.Router();

router.post('/create', createSocialMediaPlatform);
router.post('/edit/:id', editSocialMediaPlatform);
router.get('/get/:id', getByIdeditSocialMediaPlatform);
router.get('/user/:userId', getSocialMediaPlatformsByUserId)
router.post('/getAll', getAllSocialMediaPlatform);
router.delete('/delete/:id', deleteSocialMediaPlatform);



export default router;  