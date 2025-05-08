import express from 'express';
import { createSubCategory, getAllSubCategories, getByIdSubCategories, editSubCategory, deleteSubCategory, getByCategoriesId  } from '../controllers/subcategory.controller';


const router = express.Router();

router.post('/create', createSubCategory);
router.post('/edit/:id', editSubCategory);
router.get('/get/:id', getByIdSubCategories);
router.post('/getAll', getAllSubCategories);
router.delete('/delete/:id', deleteSubCategory);
router.post('/catrgory/:id', getByCategoriesId);



export default router;  