import express from 'express';
import { createAppSetting, editAppSetting, getByIdAppVersionData, getAllAppVersionData, deleteAppVersionData } from '../controllers/versionControl.controller';


const router = express.Router();

router.post('/create', createAppSetting);
router.post('/edit/:id', editAppSetting);
router.post('/get/:id', getByIdAppVersionData);
router.post('/getAll', getAllAppVersionData);
router.post('/delete/:id', deleteAppVersionData);



export default router;  