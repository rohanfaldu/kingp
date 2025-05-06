import express from 'express';
import { createState, editState } from '../controllers/state.controller';


const router = express.Router();

router.post('/create', createState);
router.post('/edit/:id', editState);
// router.get('/get/:id', getByIdCountry);
// router.get('/getAll', getAllCountry);
// router.delete('/delete/:id', deleteCountry);



export default router;  