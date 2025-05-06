"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_controller_1 = require("../controllers/auth.controller");
const authorization_1 = require("../services/authorization");
const router = express_1.default.Router();
router.post('/user/signup', auth_controller_1.signup);
router.post('/user/login', auth_controller_1.login);
router.get('/user/get/:id', authorization_1.authenticateToken, auth_controller_1.getByIdUser);
router.post('/user/getAll', authorization_1.authenticateToken, auth_controller_1.getAllUsers);
router.delete('/user/delete/:id', authorization_1.authenticateToken, auth_controller_1.deleteUser);
router.post('/user/edit/:id', authorization_1.authenticateToken, auth_controller_1.editProfile);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map