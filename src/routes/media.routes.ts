import express from 'express';
import { createMedia, getByIdMedia, updateMediaStatus, getAllMediaList } from '../controllers/media.controller';


const router = express.Router();

router.post('/create', createMedia);
router.post('/getById', getByIdMedia);
router.post('/updateStatus', updateMediaStatus);
router.post('/getAllMedia', getAllMediaList);

export default router;  