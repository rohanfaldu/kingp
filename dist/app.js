"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const country_routes_1 = __importDefault(require("./routes/country.routes"));
const image_routes_1 = __importDefault(require("./routes/image.routes"));
const category_routes_1 = __importDefault(require("./routes/category.routes"));
const subcategory_routes_1 = __importDefault(require("./routes/subcategory.routes"));
const password_routes_1 = __importDefault(require("./routes/password.routes"));
const state_routes_1 = __importDefault(require("./routes/state.routes"));
const path_1 = __importDefault(require("path"));
// const app: Application = express();
const prisma = new client_1.PrismaClient();
exports.prisma = prisma;
const app = (0, express_1.default)();
exports.app = app;
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, 'uploads')));
app.use(express_1.default.json());
// Basic error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});
app.get('/api/get', (req, res) => {
    res.json({ message: 'Hello, Welcome to KingP!' });
});
app.use('/api', auth_routes_1.default);
app.use('/api/country', country_routes_1.default);
app.use('/api/upload', image_routes_1.default);
app.use('/api/categories', category_routes_1.default);
app.use('/api/sub-categories', subcategory_routes_1.default);
app.use('/api', password_routes_1.default);
app.use('/api/state', state_routes_1.default);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
//# sourceMappingURL=app.js.map