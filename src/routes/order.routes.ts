import express from 'express';
import { createOrder, getByIdOrder, updateOrderStatus, getAllOrderList, getAdminAllOrderList, orderSubmit, withdrawAmount, getTransactionHistory, updateOrderStatusAndInsertEarnings, withdrawCoins, addCoins, getUserCoinHistory, getUserGstByOrderId, getDataByOrderId } from '../controllers/order.controller';
import { authenticateToken } from '../services/authorization';


const router = express.Router();

router.post('/create', authenticateToken, createOrder);
router.post('/getById', authenticateToken, getByIdOrder);
router.post('/updateStatus', authenticateToken, updateOrderStatus);
router.post('/getAllOrder',authenticateToken, getAllOrderList);
router.post('/getAdminAllOrder',authenticateToken, getAdminAllOrderList);

router.post('/orderSubmit',authenticateToken, orderSubmit);
router.post('/withdrawAmount',authenticateToken, withdrawAmount);
router.post('/getTransactionHistory',authenticateToken, getTransactionHistory);


router.post('/updateOrderStatusAndInsertEarnings', authenticateToken, updateOrderStatusAndInsertEarnings);
router.post('/withdrawCoins',authenticateToken, withdrawCoins);
router.post('/addCoins',authenticateToken, addCoins);
router.post('/getUsersCoinSummary',authenticateToken, getUserCoinHistory);
router.post('/getDataByOrderId',authenticateToken, getDataByOrderId);

router.post('/getUserGstByOrderId',authenticateToken, getUserGstByOrderId);





export default router;  