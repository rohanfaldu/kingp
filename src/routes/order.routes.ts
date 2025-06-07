import express from 'express';
import { createOrder, getByIdOrder, updateOrderStatus, getAllOrderList } from '../controllers/order.controller';


const router = express.Router();

router.post('/create', createOrder);
router.post('/getById', getByIdOrder);
router.post('/updateStatus', updateOrderStatus);
router.post('/getAllOrder', getAllOrderList);

export default router;  