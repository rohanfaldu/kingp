import express from 'express';
import { createBrand, editBrand, getByIdBrand, getAllBrand, deleteBrand } from '../controllers/brandType.controller'

const router = express.Router();

router.post('/create', createBrand);
router.post('/edit/:id', editBrand);
router.get('/get/:id', getByIdBrand);
router.post('/getAll', getAllBrand);
router.delete('/delete/:id', deleteBrand);



export default router;  