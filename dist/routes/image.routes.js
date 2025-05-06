"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const image_controller_1 = require("../controllers/image.controller");
const router = express_1.default.Router();
router.post('/image', image_controller_1.uploadMultipleImages);
exports.default = router;
//# sourceMappingURL=image.routes.js.map