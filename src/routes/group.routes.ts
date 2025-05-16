import express from 'express';
import { groupCreate, editGroup, deleteGroup } from '../controllers/group.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/create', groupCreate);
router.post('/edit/:id', authenticateToken, editGroup);
router.post('/delete/:id', authenticateToken, deleteGroup);





export default router;  