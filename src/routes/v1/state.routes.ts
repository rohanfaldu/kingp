import express from 'express';
import { createState, editState, getByIdState, getAllStates, deleteState, getStateByCountryId } from '../../controllers/v1/state.controller';


const router = express.Router();

router.post('/create', createState);
router.post('/edit/:id', editState);
router.get('/get/:id', getByIdState);
router.post('/getAll', getAllStates);
router.delete('/delete/:id', deleteState);

router.post('/get-country-id/:id', getStateByCountryId);




export default router;  