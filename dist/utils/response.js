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
Object.defineProperty(exports, "__esModule", { value: true });
const response = {
    // success response
    success: (res, message, data) => __awaiter(void 0, void 0, void 0, function* () {
        return res.status(200).json({
            status: true,
            message: message,
            data: data,
        });
    }),
    // error response (generic)
    error: (res, message) => __awaiter(void 0, void 0, void 0, function* () {
        return res.status(200).json({
            status: false,
            message: message,
            data: null,
        });
    }),
    // server error response
    serverError: (res, message) => __awaiter(void 0, void 0, void 0, function* () {
        return res.status(400).json({
            status: false,
            message: message,
            data: null,
        });
    }),
    // authentication error response
    authError: (res, message) => __awaiter(void 0, void 0, void 0, function* () {
        return res.status(401).json({
            status: false,
            message: message,
            data: null,
        });
    }),
};
exports.default = response;
//# sourceMappingURL=response.js.map