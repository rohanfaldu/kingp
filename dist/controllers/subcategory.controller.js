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
exports.deleteSubCategory = exports.getAllSubCategories = exports.getByIdSubCategories = exports.editSubCategory = exports.createSubCategory = void 0;
const client_1 = require("@prisma/client");
const response_1 = __importDefault(require("../utils/response"));
const commonFunction_1 = require("../utils/commonFunction");
const uuid_1 = require("uuid");
const pagination_1 = require("../utils/pagination");
const prisma = new client_1.PrismaClient();
const createSubCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const subcategoryData = req.body;
        if (!subcategoryData.categoryId) {
            return response_1.default.error(res, 'categoryId is required.');
        }
        const existingCategory = yield prisma.category.findUnique({
            where: { id: subcategoryData.categoryId },
        });
        if (!existingCategory) {
            return response_1.default.error(res, 'Invalid categoryId: Category not found.');
        }
        // Optional: Check for duplicate name within same category
        const existingSubCategory = yield prisma.subCategory.findFirst({
            where: {
                name: subcategoryData.name,
                categoryId: subcategoryData.categoryId,
            },
        });
        if (existingSubCategory) {
            return response_1.default.error(res, 'Sub-category with this name already exists in the selected category.');
        }
        const status = (0, commonFunction_1.resolveStatus)(subcategoryData.status);
        const subcategoryFields = __rest(subcategoryData, []);
        const newSubCategory = yield prisma.subCategory.create({
            data: Object.assign(Object.assign({}, subcategoryFields), { status }),
        });
        return response_1.default.success(res, 'Sub-category Created successfully!', newSubCategory);
    }
    catch (error) {
        return response_1.default.error(res, error.message);
    }
});
exports.createSubCategory = createSubCategory;
const editSubCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const categoryData = req.body;
        const status = (0, commonFunction_1.resolveStatus)(categoryData.status);
        const subCategoryFields = __rest(categoryData, []);
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID format');
        }
        const updateCategory = yield prisma.subCategory.update({
            where: { id: id },
            data: Object.assign({}, subCategoryFields),
            include: {
                categoryInformation: true,
            },
        });
        response_1.default.success(res, 'Category Updated successfully!', updateCategory);
    }
    catch (error) {
        return response_1.default.serverError(res, error.message || 'Failed to efit sub-categories.');
    }
});
exports.editSubCategory = editSubCategory;
const getByIdSubCategories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID format');
        }
        const subCategory = yield prisma.subCategory.findUnique({
            where: { id: id },
            include: {
                categoryInformation: true,
            },
        });
        response_1.default.success(res, 'Sub-Category Get successfully!', subCategory);
    }
    catch (error) {
        return response_1.default.serverError(res, error.message || 'Failed to fetch sub-categories.');
    }
});
exports.getByIdSubCategories = getByIdSubCategories;
const getAllSubCategories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const subCategories = yield (0, pagination_1.paginate)(req, prisma.subCategory, {
            include: {
                categoryInformation: true,
            },
        });
        return response_1.default.success(res, 'Fetched all sub-categories successfully.', subCategories);
    }
    catch (error) {
        return response_1.default.serverError(res, error.message || 'Failed to fetch sub-categories.');
    }
});
exports.getAllSubCategories = getAllSubCategories;
const deleteSubCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID formate');
        }
        const deletedSubCategory = yield prisma.subCategory.delete({
            where: { id: id },
        });
        response_1.default.success(res, 'Sub-Category Deleted successfully!', null);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.deleteSubCategory = deleteSubCategory;
//# sourceMappingURL=subcategory.controller.js.map