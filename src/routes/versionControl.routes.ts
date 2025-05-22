import express from 'express';
import { createAppSetting, editAppSetting, getAllAppVersionData, deleteAppVersionData } from '../controllers/versionControl.controller';


const router = express.Router();

router.post('/getAll', getAllAppVersionData);
router.post('/create', createAppSetting);
router.post('/edit/:id', editAppSetting);
router.post('/delete/:id', deleteAppVersionData);



export default router;  