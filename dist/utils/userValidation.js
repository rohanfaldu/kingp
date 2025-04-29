"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUser = validateUser;
function validateUser(user) {
    if (!user.emailAddress || !user.password) {
        throw new Error('Both emailAddress and password are required.');
    }
    return true;
}
//# sourceMappingURL=userValidation.js.map