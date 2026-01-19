import express from 'express';
import { createCountry, editCountry, getAllCountry, getByIdCountry, deleteCountry, toggleCountryVisibility, getAllCountryForAdmin } from '../controllers/country.controller';


const router = express.Router();

router.post('/create', createCountry);
router.post('/edit/:id', editCountry);
router.get('/get/:id', getByIdCountry);
router.post('/getAll', getAllCountry);
router.post('/getAllForAdmin', getAllCountryForAdmin);
router.delete('/delete/:id', deleteCountry);

router.post('/toggle-visibility', toggleCountryVisibility);


export default router;  