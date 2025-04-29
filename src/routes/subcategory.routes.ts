import express from 'express';
import { createSubCategory  } from '../controllers/subcategory.controller';


const router = express.Router();

router.post('/create', createSubCategory);
// router.post('/edit/:id', editCategory);
// router.post('/get/:id', getByIdCategory);
// router.post('/getAll', getAllCategory);
// router.post('/delete/:id', deleteCategory);



export default router;  