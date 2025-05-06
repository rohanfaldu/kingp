"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const state_controller_1 = require("../controllers/state.controller");
const router = express_1.default.Router();
router.post('/create', state_controller_1.createState);
router.post('/edit/:id', state_controller_1.editState);
// router.get('/get/:id', getByIdCountry);
// router.get('/getAll', getAllCountry);
// router.delete('/delete/:id', deleteCountry);
exports.default = router;
//# sourceMappingURL=state.routes.js.map