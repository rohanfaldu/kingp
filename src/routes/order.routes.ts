import express from 'express';
import { createOrder, getByIdOrder, updateOrderStatus, getAllOrderList, orderSubmit, updateOrderStatusAndInsertEarnings } from '../controllers/order.controller';
import { authenticateToken } from '../services/authorization';


const router = express.Router();

router.post('/create', authenticateToken, createOrder);
router.post('/getById', authenticateToken, getByIdOrder);
router.post('/updateStatus', authenticateToken, updateOrderStatus);
router.post('/getAllOrder',authenticateToken, getAllOrderList);

router.post('/orderSubmit',authenticateToken, orderSubmit);
router.post('/updateOrderStatusAndInsertEarnings', authenticateToken, updateOrderStatusAndInsertEarnings);



export default router;  