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
exports.deleteCountry = exports.getAllCountry = exports.getByIdCountry = exports.editCountry = exports.createCountry = void 0;
const client_1 = require("@prisma/client");
const response_1 = __importDefault(require("../utils/response"));
const uuid_1 = require("uuid");
const pagination_1 = require("../utils/pagination");
const commonFunction_1 = require("../utils/commonFunction");
const prisma = new client_1.PrismaClient();
const createCountry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const countryData = req.body;
        const status = (0, commonFunction_1.resolveStatus)(countryData.status);
        const countryFields = __rest(countryData, []);
        const newCountry = yield prisma.country.create({
            data: Object.assign({}, countryFields),
        });
        response_1.default.success(res, 'Country Created successfully!', newCountry);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.createCountry = createCountry;
const editCountry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const categoryData = req.body;
        const countryFields = __rest(categoryData, []);
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID format');
        }
        const updateCountry = yield prisma.country.update({
            where: { id: id },
            data: Object.assign({}, countryFields),
        });
        response_1.default.success(res, 'Country Updated successfully!', updateCountry);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.editCountry = editCountry;
const getByIdCountry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID format');
        }
        const country = yield prisma.country.findUnique({
            where: { id: id },
        });
        response_1.default.success(res, 'Country Get successfully!', country);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.getByIdCountry = getByIdCountry;
const getAllCountry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const countries = yield (0, pagination_1.paginate)(req, prisma.country, {}, "countries");
        // const countries = await prisma.country.findMany ();
        if (!countries || countries.countries.length === 0) {
            throw new Error("Country not Found");
        }
        response_1.default.success(res, 'Get All Countries successfully!', countries);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.getAllCountry = getAllCountry;
const deleteCountry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID formate');
        }
        const deletedCountry = yield prisma.country.delete({
            where: { id: id },
        });
        response_1.default.success(res, 'Country Deleted successfully!', null);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.deleteCountry = deleteCountry;
//# sourceMappingURL=country.controller.js.map