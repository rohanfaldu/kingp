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
exports.editState = exports.createState = void 0;
const client_1 = require("@prisma/client");
const response_1 = __importDefault(require("../utils/response"));
const uuid_1 = require("uuid");
const prisma = new client_1.PrismaClient();
const createState = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stateData = req.body;
        const stateFields = __rest(stateData, []);
        const newState = yield prisma.state.create({
            data: Object.assign({}, stateFields),
        });
        response_1.default.success(res, 'Country Created successfully!', newState);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.createState = createState;
const editState = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const stateData = req.body;
        const stateFields = __rest(stateData, []);
        if (!(0, uuid_1.validate)(id)) {
            response_1.default.error(res, 'Invalid UUID format');
        }
        const updateState = yield prisma.state.update({
            where: { id: id },
            data: Object.assign({}, stateFields),
            include: {
                countryKey: true,
            },
        });
        response_1.default.success(res, 'Country Updated successfully!', updateState);
    }
    catch (error) {
        response_1.default.error(res, error.message);
    }
});
exports.editState = editState;
// export const getByIdCountry = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const {id} = req.params;
//         if (!isUuid(id)) {
//             response.error(res, 'Invalid UUID format');
//         }
//         const country = await prisma.country.findUnique({
//             where: { id: id },
//         });
//         response.success(res, 'Country Get successfully!', country);
//     } catch (error: any) {
//         response.error(res, error.message);
//     }
// }
// export const getAllCountry = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const countries = await paginate(req, prisma.country, {}, "countries");
//         // const countries = await prisma.country.findMany ();
//         if(!countries || countries.countries.length === 0){
//             throw new Error("Country not Found");    
//         }
//         response.success(res, 'Get All Countries successfully!', countries);
//     } catch (error: any) {
//         response.error(res, error.message);
//     }
// }
// export const deleteCountry = async (req: Request, res: Response): Promise<any> => {
//     try {
//         const {id} = req.params;
//         if (!isUuid(id)) {
//             response.error(res, 'Invalid UUID formate')
//         }
//         const deletedCountry = await prisma.country.delete({
//             where: {id: id},
//         });
//         response.success(res, 'Country Deleted successfully!',null);
//     } catch (error: any) {
//         response.error(res, error.message);
//     }
// }
//# sourceMappingURL=state.controller.js.map