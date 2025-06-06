import express from 'express';
import { createOrder } from '../controllers/order.controller';


const router = express.Router();

router.post('/create', createOrder);
// router.post('/edit/:id', editCategory);
// router.get('/get/:id', getByIdCategory);
// router.post('/getAll', getAllCategory);
// router.delete('/delete/:id', deleteCategory);


export default router;  