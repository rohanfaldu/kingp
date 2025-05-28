import express from 'express';
import { groupCreate, editGroup, getAllGroups, deleteGroup } from '../controllers/group.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/create', groupCreate);
router.post('/getAll', getAllGroups);
router.post('/edit/:id', authenticateToken, editGroup);
router.delete('/delete/:id', authenticateToken, deleteGroup);





export default router;  