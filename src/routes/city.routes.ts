import express from 'express';
import { createCity, editCity, getByIdCity, getAllCity, deleteCity, getCityByStateId } from '../controllers/city.controller';


const router = express.Router();

router.post('/create', createCity);
router.post('/edit/:id', editCity);
router.get('/get/:id', getByIdCity);
router.post('/getAll', getAllCity);
router.delete('/delete/:id', deleteCity);

router.post('/get-state-id/:id', getCityByStateId);


export default router;  