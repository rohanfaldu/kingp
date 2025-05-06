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
exports.paginate = void 0;
const paginate = (req_1, model_1, ...args_1) => __awaiter(void 0, [req_1, model_1, ...args_1], void 0, function* (req, model, findArgs = {}, resultKey = "items") {
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const skip = (page - 1) * limit;
    const [data, total] = yield Promise.all([
        model.findMany(Object.assign({ skip, take: limit }, findArgs)),
        model.count({ where: findArgs.where }),
    ]);
    return {
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
        [resultKey]: data,
    };
});
exports.paginate = paginate;
//# sourceMappingURL=pagination.js.map