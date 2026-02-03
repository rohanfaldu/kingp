import express from 'express';
import { createCategory, editCategory, getByIdCategory, getAllCategory, deleteCategory, getInfluencersBySubCategories } from '../../controllers/v1/category.controller';


const router = express.Router();

router.post('/create', createCategory);
router.post('/edit/:id', editCategory);
router.get('/get/:id', getByIdCategory);
router.post('/getAll', getAllCategory);
router.delete('/delete/:id', deleteCategory);

router.post('/influencer', getInfluencersBySubCategories);




export default router;  