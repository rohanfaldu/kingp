import express from 'express';
import { createCategory, editCategory, getByIdCategory, getAllCategory, deleteCategory } from '../controllers/category.controller';


const router = express.Router();

router.post('/create', createCategory);
router.post('/edit/:id', editCategory);
router.post('/get/:id', getByIdCategory);
router.post('/getAll', getAllCategory);
router.post('/delete/:id', deleteCategory);



export default router;  