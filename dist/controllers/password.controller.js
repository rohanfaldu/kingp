"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.resetPassword = exports.verifyOtp = exports.forgotPassword = exports.changePassword = void 0;
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const response_1 = __importDefault(require("../utils/response"));
const prisma = new client_1.PrismaClient();
const changePassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { currentPassword, newPassword } = req.body;
        if (!userId) {
            return response_1.default.error(res, 'Unauthorized user.');
        }
        if (!currentPassword || !newPassword) {
            return response_1.default.error(res, 'Current and new password required.');
        }
        const user = yield prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        const isPasswordMatch = yield bcrypt.compare(currentPassword, user.password);
        if (!isPasswordMatch) {
            return response_1.default.error(res, 'Current password is incorrect.');
        }
        const hashedNewPassword = yield bcrypt.hash(newPassword, 10);
        yield prisma.user.update({
            where: { id: userId },
            data: { password: hashedNewPassword },
        });
        return response_1.default.success(res, 'Password changed successfully.', null);
    }
    catch (error) {
        return response_1.default.serverError(res, error.message);
    }
});
exports.changePassword = changePassword;
const forgotPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { emailAddress } = req.body;
    const otp = Math.floor(100000 + Math.random() * 999999).toString();
    const expireAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins from now
    try {
        const existing = yield prisma.paswordReset.findFirst({
            where: { emailAddress: emailAddress },
        });
        if (existing) {
            yield prisma.paswordReset.update({
                where: { id: existing.id },
                data: {
                    otp,
                    expireAt,
                    verified: false,
                    updatedAt: new Date(),
                },
            });
        }
        else {
            yield prisma.paswordReset.create({
                data: {
                    emailAddress: emailAddress,
                    otp,
                    expireAt,
                    updatedAt: new Date(),
                },
            });
        }
        return response_1.default.success(res, 'OTP sent to your email.', otp);
    }
    catch (error) {
        return response_1.default.serverError(res, error.message);
    }
});
exports.forgotPassword = forgotPassword;
const verifyOtp = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { emailAddress, otp } = req.body;
    try {
        const record = yield prisma.paswordReset.findFirst({
            where: { emailAddress },
        });
        if (!record || record.otp !== otp) {
            return response_1.default.error(res, 'Invalid OTP.');
        }
        if (record.expireAt && new Date() > record.expireAt) {
            return response_1.default.error(res, 'OTP expired.');
        }
        yield prisma.paswordReset.update({
            where: { id: record.id },
            data: {
                verified: true,
                updatedAt: new Date(),
            },
        });
        return response_1.default.success(res, 'OTP verified Succesfully.', null);
    }
    catch (error) {
        return response_1.default.serverError(res, error.message);
    }
});
exports.verifyOtp = verifyOtp;
const resetPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { emailAddress, newPassword, confirmPassword } = req.body;
    try {
        if (newPassword !== confirmPassword) {
            return response_1.default.error(res, 'Password and confirm password do not match.');
        }
        const reset = yield prisma.paswordReset.findFirst({
            where: { emailAddress: emailAddress },
        });
        if (!reset || !reset.verified) {
            return response_1.default.error(res, 'Email Address is incoreect or OTP not verified.');
        }
        yield prisma.user.update({
            where: { emailAddress: emailAddress },
            data: {
                password: yield bcrypt.hash(newPassword, 10),
            },
        });
        yield prisma.paswordReset.delete({
            where: { id: reset.id },
        });
        return response_1.default.success(res, 'Password reset successfully.', null);
    }
    catch (error) {
        return response_1.default.serverError(res, error.message);
    }
});
exports.resetPassword = resetPassword;
//# sourceMappingURL=password.controller.js.map