"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const category_controller_1 = require("../controllers/category.controller");
const router = express_1.default.Router();
router.post('/create', category_controller_1.createCategory);
router.post('/edit/:id', category_controller_1.editCategory);
router.get('/get/:id', category_controller_1.getByIdCategory);
router.post('/getAll', category_controller_1.getAllCategory);
router.delete('/delete/:id', category_controller_1.deleteCategory);
exports.default = router;
//# sourceMappingURL=category.routes.js.map