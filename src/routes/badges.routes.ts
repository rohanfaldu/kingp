import express from 'express';
import { createBadge } from '../controllers/badges.controller';


const router = express.Router();

router.post('/create', createBadge);
// router.post('/edit/:id', editCategory);
// router.get('/get/:id', getByIdCategory);
// router.post('/getAll', getAllCategory);
// router.delete('/delete/:id', deleteCategory);


export default router;  