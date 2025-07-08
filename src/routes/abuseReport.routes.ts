import express from 'express';
import { createAbuseReport } from '../controllers/abuseReport.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/create', authenticateToken, createAbuseReport);
// router.post('/edit/:id', editCity);
// router.get('/get/:id', getByIdCity);
// router.post('/getAll', getAllCity);
// router.delete('/delete/:id', deleteCity);



export default router;  