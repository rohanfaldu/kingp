"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadMultipleImages = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const response_1 = __importDefault(require("../utils/response"));
const uploadDir = path_1.default.join(__dirname, '..', 'uploads/images');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir);
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = (0, multer_1.default)({ storage }).array('images', 10);
const uploadMultipleImages = (req, res) => {
    upload(req, res, function (error) {
        return __awaiter(this, void 0, void 0, function* () {
            if (error) {
                // return res.status(400).json({ message: 'File upload failed', error: err.message });
                response_1.default.error(res, 'File upload failed');
            }
            const files = req.files;
            if (!files || files.length === 0) {
                response_1.default.error(res, 'No files uploaded');
            }
            try {
                const imagesData = files.map((file) => {
                    const imagePath = `uploads/images/${file.originalname}`;
                    return {
                        name: file.originalname,
                        path: imagePath,
                        url: `${req.protocol}://${req.get('host')}/${imagePath}`,
                        size: `${(file.size / 1024).toFixed(2)} KB`
                    };
                });
                response_1.default.success(res, 'Image Uploaded successfully!', imagesData);
            }
            catch (serverError) {
                response_1.default.serverError(res, 'Server Error');
            }
        });
    });
};
exports.uploadMultipleImages = uploadMultipleImages;
//# sourceMappingURL=image.controller.js.map