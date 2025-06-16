import express from 'express';
import { createOrder, getByIdOrder, updateOrderStatus, getAllOrderList, orderSubmit, withdrawAmount, getTransactionHistory, updateOrderStatusAndInsertEarnings, withdrawCoins, getUserCoinHistory } from '../controllers/order.controller';
import { authenticateToken } from '../services/authorization';


const router = express.Router();

router.post('/create', authenticateToken, createOrder);
router.post('/getById', authenticateToken, getByIdOrder);
router.post('/updateStatus', authenticateToken, updateOrderStatus);
router.post('/getAllOrder',authenticateToken, getAllOrderList);

router.post('/orderSubmit',authenticateToken, orderSubmit);
router.post('/withdrawAmount',authenticateToken, withdrawAmount);
router.post('/getTransactionHistory',authenticateToken, getTransactionHistory);


router.post('/updateOrderStatusAndInsertEarnings', authenticateToken, updateOrderStatusAndInsertEarnings);
router.post('/withdrawCoins',authenticateToken, withdrawCoins);
router.post('/getUsersCoinSummary',authenticateToken, getUserCoinHistory);




export default router;  