import express from 'express';
import { createCategory, editCategory, getByIdCategory, getAllCategory, deleteCategory } from '../controllers/category.controller';


const router = express.Router();

router.post('/create', createCategory);
router.post('/edit/:id', editCategory);
router.get('/get/:id', getByIdCategory);
router.get('/getAll', getAllCategory);
router.delete('/delete/:id', deleteCategory);



export default router;  