import express from 'express';
import { createAppSetting, editAppSetting, getByIdAppVersionData, getAllAppVersionData, deleteAppVersionData } from '../../controllers/v1/versionControl.controller';


const router = express.Router();

router.post('/create', createAppSetting);
router.post('/edit/:id', editAppSetting);
router.get('/get/:id', getByIdAppVersionData);
router.post('/getAll', getAllAppVersionData);
router.delete('/delete/:id', deleteAppVersionData);



export default router;  