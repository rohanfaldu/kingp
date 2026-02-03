import express from 'express';
import { createWorkPost, getWorkPosts, getWorkPostById, getAllWorkPosts, updateWorkPost, deleteWorkPost, applyForWorkPost, getWorkPostApplications } from '../../controllers/v1/workPost.controller';
import { authenticateToken } from '../../services/authorization';



const router = express.Router();

router.post('/create', authenticateToken, createWorkPost);
router.get('/get', authenticateToken, getWorkPosts);
router.get('/getById', getWorkPostById);
router.post('/getAll', authenticateToken, getAllWorkPosts);
router.post('/update/:id', authenticateToken, updateWorkPost);
router.delete('/delete/:id', authenticateToken, deleteWorkPost);

router.post('/apply/:id', authenticateToken, applyForWorkPost);
router.get('/applications', authenticateToken, getWorkPostApplications);



export default router;  