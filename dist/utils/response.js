"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const response = {
    // success response
    success: (res, message, data) => {
        return res.status(200).json({
            status: true,
            message,
            data,
        });
    },
    // error response (generic)
    error: (res, message) => {
        return res.status(200).json({
            status: false,
            message,
            data: null,
        });
    },
    // server error response
    serverError: (res, message) => {
        return res.status(400).json({
            status: false,
            message,
            data: null,
        });
    },
    // authentication error response
    authError: (res, message) => {
        return res.status(401).json({
            status: false,
            message,
            data: null,
        });
    },
};
exports.default = response;
//# sourceMappingURL=response.js.map