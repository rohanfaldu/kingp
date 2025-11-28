import express from 'express';
import { createProduct, editProduct, getProductById, getAllProducts, deleteProduct, createPurchase, getPurchases, updatePurchaseStatus, getPurchasesByProduct, getAllProductPurchases } from '../controllers/product.controller';
import { authenticateToken } from '../services/authorization';



const router = express.Router();

router.post('/create', authenticateToken, createProduct);
router.post('/edit/:id', editProduct);
router.get('/get/:id', getProductById);
router.post('/getAll', getAllProducts);
router.delete('/delete/:id', deleteProduct);

router.post('/purchase', authenticateToken, createPurchase);
router.get('/purchase', authenticateToken, getPurchases);
router.post('/purchase/:id', authenticateToken, updatePurchaseStatus);
router.post('/purchase/product/:id', authenticateToken, getPurchasesByProduct);
router.post('/all/purchase', authenticateToken, getAllProductPurchases);






export default router;  