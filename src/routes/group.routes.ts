import express from 'express';
import { groupCreate, editGroup } from '../controllers/group.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/create', groupCreate);
router.post('/edit/:id', authenticateToken, editGroup);




export default router;  