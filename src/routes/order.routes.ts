import express from 'express';
import { createOrder, getByIdOrder, updateOrderStatus, getAllOrderList } from '../controllers/order.controller';


const router = express.Router();

router.post('/create', createOrder);
router.post('/getById', getByIdOrder);
router.post('/updateStatus', updateOrderStatus);
router.post('/getAllOrder', getAllOrderList);
// router.post('/edit/:id', editCategory);
// router.get('/get/:id', getByIdCategory);
// router.post('/getAll', getAllCategory);
// router.delete('/delete/:id', deleteCategory);


export default router;  