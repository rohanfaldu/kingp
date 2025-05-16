import express from 'express';
import { groupCreate } from '../controllers/group.controller';


const router = express.Router();

router.post('/create', groupCreate);



export default router;  