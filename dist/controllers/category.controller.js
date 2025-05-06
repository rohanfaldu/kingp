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
exports.deleteCategory = exports.getAllCategory = exports.getByIdCategory = exports.editCategory = exports.createCategory = void 0;
const client_1 = require("@prisma/client");
const response_1 = __importDefault(require("../utils/response"));
const uuid_1 = require("uuid");
const commonFunction_1 = require("../utils/commonFunction");
const pagination_1 = require("../utils/pagination");
const prisma = new client_1.PrismaClient();
const createCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const categoryData = req.body;
        const status = (0, commonFunction_1.resolveStatus)(categoryData.status);
        const categoryFields = __rest(categoryData, []);
        const newCategory = yield prisma.category.create({
            data: Object.assign(Object.assign({}, categoryFields), { status: status }),
        });
        return response_1.default.success(res, 'Category Created successfully!', newCategory);
    }
    catch (error) {
        return response_1.default.error(res, error.message);
    }
});
exports.createCategory = createCategory;
const editCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const categoryData = req.body;
        const status = (0, commonFunction_1.resolveStatus)(categoryData.status);
        const categoryFields = __rest(categoryData, []);
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID format');
        }
        const updateCategory = yield prisma.category.update({
            where: { id: id },
            data: Object.assign({}, categoryFields),
        });
        response_1.default.success(res, 'Category Updated successfully!', updateCategory);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.editCategory = editCategory;
const getByIdCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID format');
        }
        const category = yield prisma.category.findUnique({
            where: { id: id },
        });
        response_1.default.success(res, 'Category Get successfully!', category);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.getByIdCategory = getByIdCategory;
const getAllCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const categories = yield (0, pagination_1.paginate)(req, prisma.category, {}, "categories");
        if (!categories || categories.length === 0) {
            throw new Error("Country not Found");
        }
        response_1.default.success(res, 'Get All categories successfully!', categories);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.getAllCategory = getAllCategory;
const deleteCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID formate');
        }
        const deletedCategory = yield prisma.category.delete({
            where: { id: id },
        });
        response_1.default.success(res, 'Category Deleted successfully!', null);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.deleteCategory = deleteCategory;
//# sourceMappingURL=category.controller.js.map