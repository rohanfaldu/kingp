"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const subcategory_controller_1 = require("../controllers/subcategory.controller");
const router = express_1.default.Router();
router.post('/create', subcategory_controller_1.createSubCategory);
router.post('/edit/:id', subcategory_controller_1.editSubCategory);
router.get('/get/:id', subcategory_controller_1.getByIdSubCategories);
router.post('/getAll', subcategory_controller_1.getAllSubCategories);
router.delete('/delete/:id', subcategory_controller_1.deleteSubCategory);
exports.default = router;
//# sourceMappingURL=subcategory.routes.js.map