"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const password_controller_1 = require("../controllers/password.controller");
const authorization_1 = require("../services/authorization");
const router = express_1.default.Router();
router.post('/forgot-password', password_controller_1.forgotPassword);
router.post('/verify-otp', password_controller_1.verifyOtp);
router.post('/reset-password', password_controller_1.resetPassword);
router.post('/change-password', authorization_1.authenticateToken, password_controller_1.changePassword);
exports.default = router;
//# sourceMappingURL=password.routes.js.map