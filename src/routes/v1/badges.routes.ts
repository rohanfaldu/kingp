import express from 'express';
import { createBadge, getAllBadges } from '../../controllers/v1/badges.controller';


const router = express.Router();

router.post('/create', createBadge);
// router.post('/edit/:id', editCategory);
// router.get('/get/:id', getByIdCategory);
router.post('/getAll', getAllBadges);
// router.delete('/delete/:id', deleteCategory);


export default router;  