import express from 'express';
import { groupCreate, editGroup, getGroupById, getAllGroups, deleteGroup, getMyGroups, respondToGroupInvite, listGroupInvitesByStatus } from '../controllers/group.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/create', authenticateToken, groupCreate);
router.post('/getAll', authenticateToken, getAllGroups);
router.post('/edit/:id', authenticateToken,  editGroup);
router.post('/get/:id', authenticateToken, getGroupById);
router.delete('/delete/:id', authenticateToken, deleteGroup);

router.post('/getMyGroup', authenticateToken, getMyGroups);

router.post('/respondRequest', authenticateToken, respondToGroupInvite);
router.post('/listInvites', authenticateToken, listGroupInvitesByStatus);





export default router;  