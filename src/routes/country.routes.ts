import express from 'express';
import { createCountry, editCountry, getAllCountry, getByIdCountry, deleteCountry } from '../controllers/country.controller';


const router = express.Router();

router.post('/create', createCountry);
router.post('/edit/:id', editCountry);
router.get('/get/:id', getByIdCountry);
router.post('/getAll', getAllCountry);
router.delete('/delete/:id', deleteCountry);



export default router;  