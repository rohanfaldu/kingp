"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const country_controller_1 = require("../controllers/country.controller");
const router = express_1.default.Router();
router.post('/create', country_controller_1.createCountry);
router.post('/edit/:id', country_controller_1.editCountry);
router.get('/get/:id', country_controller_1.getByIdCountry);
router.post('/getAll', country_controller_1.getAllCountry);
router.delete('/delete/:id', country_controller_1.deleteCountry);
exports.default = router;
//# sourceMappingURL=country.routes.js.map