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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.editProfile = exports.deleteUser = exports.getAllUsers = exports.getByIdUser = exports.login = exports.signup = void 0;
const client_1 = require("@prisma/client");
const userValidation_1 = require("../utils/userValidation");
const bcrypt = __importStar(require("bcryptjs"));
const userType_enum_1 = require("../enums/userType.enum");
const response_1 = __importDefault(require("../utils/response"));
const commonFunction_1 = require("../utils/commonFunction");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const pagination_1 = require("../utils/pagination");
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const signup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const userData = req.body;
        (0, userValidation_1.validateUser)(userData);
        const hashedPassword = yield bcrypt.hash(userData.password, 10);
        const { countryId, password, emailAddress } = userData, userFields = __rest(userData, ["countryId", "password", "emailAddress"]);
        if (!countryId) {
            return response_1.default.error(res, 'countryId is required.');
        }
        const existingUser = yield prisma.user.findUnique({
            where: { emailAddress },
        });
        if (existingUser) {
            return response_1.default.error(res, 'A user with this email already exists.');
        }
        const status = (0, commonFunction_1.resolveStatus)(userData.status);
        const gender = ((_a = userData.gender) !== null && _a !== void 0 ? _a : userType_enum_1.Gender.MALE);
        const newUser = yield prisma.user.create({
            data: Object.assign(Object.assign({}, userFields), { password: hashedPassword, type: (_b = userData.type) !== null && _b !== void 0 ? _b : userType_enum_1.UserType.BUSINESS, brandType: (_c = userData.brandType) !== null && _c !== void 0 ? _c : userType_enum_1.BrandType.STARTUP, gender, status: status, emailAddress, CountryData: {
                    connect: { id: countryId }
                } }),
            include: {
                CountryData: false // Include country in response if needed
            }
        });
        return response_1.default.success(res, 'Sign Up successfully!', newUser);
    }
    catch (error) {
        return response_1.default.serverError(res, error.message);
    }
});
exports.signup = signup;
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { emailAddress, password, fcmToken: fcmToken } = req.body;
        if (!emailAddress || !password) {
            return response_1.default.error(res, 'Email and password are required.');
        }
        let user = yield prisma.user.findUnique({
            where: { emailAddress },
        });
        if (!user) {
            return response_1.default.error(res, 'Invalid email address.');
        }
        const validPassword = yield bcrypt.compare(password, user.password);
        if (!validPassword) {
            return response_1.default.error(res, 'Invalid password.');
        }
        if (fcmToken) {
            user = yield prisma.user.update({
                where: { id: user.id },
                data: { fcmToken },
            });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.emailAddress }, JWT_SECRET, { expiresIn: '7d' });
        const { password: _ } = user, userWithFcm = __rest(user, ["password"]);
        return response_1.default.success(res, 'Login successful!', {
            user: userWithFcm,
            token,
        });
    }
    catch (error) {
        return response_1.default.serverError(res, error.message || 'Login failed.');
    }
});
exports.login = login;
const getByIdUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID format');
        }
        const user = yield prisma.user.findUnique({
            where: { id: id },
        });
        response_1.default.success(res, 'User Fetch successfully!', user);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.getByIdUser = getByIdUser;
const getAllUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { type } = req.body;
        const filter = {};
        if (type && typeof type === 'string') {
            const normalizedType = type.toUpperCase();
            if (['BUSINESS', 'INFLUENCER'].includes(normalizedType)) {
                filter.type = normalizedType;
            }
            else {
                return response_1.default.error(res, 'Invalid user type');
            }
        }
        const users = yield (0, pagination_1.paginate)(req, prisma.user, { where: filter }, 'Users data');
        if (!users || users.length === 0) {
            throw new Error("Users not Found");
        }
        response_1.default.success(res, 'Get All Users successfully!', users);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.getAllUsers = getAllUsers;
const deleteUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID formate');
        }
        const deletedUser = yield prisma.user.delete({
            where: { id: id },
        });
        response_1.default.success(res, 'User Deleted successfully!', null);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.deleteUser = deleteUser;
const editProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const userData = req.body;
        if (!(0, uuid_1.validate)(id)) {
            return response_1.default.error(res, 'Invalid UUID format');
        }
        // Destructure to remove uneditable fields
        const { emailAddress, password } = userData, updatableFields = __rest(userData, ["emailAddress", "password"]);
        // Optional: Normalize or validate status
        if ('status' in userData) {
            updatableFields.status = (0, commonFunction_1.resolveStatus)(userData.status);
        }
        if ('gender' in userData) {
            updatableFields.gender = userData.gender;
        }
        const editedUser = yield prisma.user.update({
            where: { id },
            data: updatableFields,
        });
        return response_1.default.success(res, 'User profile updated successfully!', editedUser);
    }
    catch (error) {
        return response_1.default.error(res, error.message || 'Failed to update user profile');
    }
});
exports.editProfile = editProfile;
//# sourceMappingURL=auth.controller.js.map