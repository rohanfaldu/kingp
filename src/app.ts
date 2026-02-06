import dotenv from 'dotenv';
import express, { Application, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

// ------------------ main routes --------------------- //
import authRoutes from './routes/auth.routes';
import countryRoutes from './routes/country.routes';
import imageRoutes from './routes/image.routes';
import categoryRoutes from './routes/category.routes';
import subcategoryRoutes from './routes/subcategory.routes';
import passwordRoutes from './routes/password.routes';
import stateRoutes from './routes/state.routes';
import cityRoutes from './routes/city.routes';
import brandTypeRoutes from './routes/brandType.routes';
import socialMediaRoutes from './routes/socialMedia.routes';
import groupRoutes from './routes/group.routes';
import locationRoutes from './routes/location.routes';
import VersionControleRoutes from './routes/versionControl.routes';
import BadgesRoutes from './routes/badges.routes';
import OrderRoutes from './routes/order.routes';
import MediaRoutes from './routes/media.routes';
import DashboardRoutes from './routes/dashboard.routes';
import RatingsRoutes from './routes/rating.routes';
import NotificationRoutes from './routes/notification.routes';
import ContactRoutes from './routes/contact.routes';
import TipsRoutes from './routes/tips.routes';
import BankDetailsRoutes from './routes/bankDetail.routes';
import AbuseReportRoutes from './routes/abuseReport.routes';
import WorkPostRoutes from './routes/workPost.routes';
import productRoutes from './routes/product.routes';
import mailRoutes from './routes/mail.routes';

// ------------------ v1 routes --------------------- //
import authRoutesv1 from './routes/v1/auth.routes';
import countryRoutesv1 from './routes/v1/country.routes';
import imageRoutesv1 from './routes/v1/image.routes';
import categoryRoutesv1 from './routes/v1/category.routes';
import subcategoryRoutesv1 from './routes/v1/subcategory.routes';
import passwordRoutesv1 from './routes/v1/password.routes';
import stateRoutesv1 from './routes/v1/state.routes';
import cityRoutesv1 from './routes/v1/city.routes';
import brandTypeRoutesv1 from './routes/v1/brandType.routes';
import socialMediaRoutesv1 from './routes/v1/socialMedia.routes';
import groupRoutesv1 from './routes/v1/group.routes';
import locationRoutesv1 from './routes/v1/location.routes';
import VersionControleRoutesv1 from './routes/v1/versionControl.routes';
import BadgesRoutesv1 from './routes/v1/badges.routes';
import OrderRoutesv1 from './routes/v1/order.routes';
import MediaRoutesv1 from './routes/v1/media.routes';
import DashboardRoutesv1 from './routes/v1/dashboard.routes';
import RatingsRoutesv1 from './routes/v1/rating.routes';
import NotificationRoutesv1 from './routes/v1/notification.routes';
import ContactRoutesv1 from './routes/v1/contact.routes';
import TipsRoutesv1 from './routes/v1/tips.routes';
import BankDetailsRoutesv1 from './routes/v1/bankDetail.routes';
import AbuseReportRoutesv1 from './routes/v1/abuseReport.routes';
import WorkPostRoutesv1 from './routes/v1/workPost.routes';
import productRoutesv1 from './routes/v1/product.routes';
import mailRoutesv1 from './routes/v1/mail.routes';



import path from 'path';
import cors from 'cors';

dotenv.config();
// const app: Application = express();
const prisma = new PrismaClient();
const app = express();
console.log(process.env.FRONT_URL,'>>>>>>>>>>>> process');

app.use(express.json({ limit: '1024mb' }));
app.use(express.urlencoded({ extended: true, limit: '1024mb' }));


const allowedOrigins = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://staging.admin.kringp.com',
  'http://192.241.131.97:3001'
];

app.use(cors({
  origin: (origin, callback) => {
    // allow Postman / curl / server-to-server
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log('❌ CORS blocked:', origin);
    return callback(null, false); // 🔥 DO NOT throw error
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
}));

// MUST be before routes
//app.options('*', cors());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());

// Basic error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.use((req, res, next) => {
  console.log('➡️', req.method, req.url, req.headers.origin);
  next();
});


app.get('/api/get', (req, res) => {
  res.json({ message: 'Hello, Welcome to KingP!' });
});

// --------------- main routes --------------------- //
app.use('/api', authRoutes);
app.use('/api/country', countryRoutes);
app.use('/api/upload', imageRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/sub-categories', subcategoryRoutes);
app.use('/api', passwordRoutes);
app.use('/api/state', stateRoutes);
app.use('/api/city', cityRoutes);
app.use('/api/brand-type', brandTypeRoutes);
app.use('/api/social-media', socialMediaRoutes);
app.use('/api/group', groupRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/app-data', VersionControleRoutes);
app.use('/api/badges', BadgesRoutes);
app.use('/api/order', OrderRoutes);
app.use('/api/media', MediaRoutes);
app.use('/api/dashboard', DashboardRoutes);
app.use('/api/ratings', RatingsRoutes);
app.use('/api/notification', NotificationRoutes);
app.use('/api/contact', ContactRoutes);
app.use('/api/tips', TipsRoutes);
app.use('/api/bank', BankDetailsRoutes);
app.use('/api/report', AbuseReportRoutes);
app.use('/api/work-post', WorkPostRoutes);
app.use('/api/product', productRoutes);
app.use('/api/mail', mailRoutes);

// ------------------ v1 routes --------------------- //
app.use('/api/v1', authRoutesv1);
app.use('/api/v1/country', countryRoutesv1);
app.use('/api/v1/upload', imageRoutes);
app.use('/api/v1/categories', categoryRoutesv1);
app.use('/api/v1/sub-categories', subcategoryRoutesv1);
app.use('/api/v1', passwordRoutesv1);
app.use('/api/v1/state', stateRoutesv1);
app.use('/api/v1/city', cityRoutesv1);
app.use('/api/v1/brand-type', brandTypeRoutesv1);
app.use('/api/v1/social-media', socialMediaRoutesv1);
app.use('/api/v1/group', groupRoutesv1);
app.use('/api/v1/location', locationRoutesv1);
app.use('/api/v1/app-data', VersionControleRoutesv1);
app.use('/api/v1/badges', BadgesRoutesv1);
app.use('/api/v1/order', OrderRoutesv1);
app.use('/api/v1/media', MediaRoutesv1);
app.use('/api/v1/dashboard', DashboardRoutesv1);
app.use('/api/v1/ratings', RatingsRoutesv1);
app.use('/api/v1/notification', NotificationRoutesv1);
app.use('/api/v1/contact', ContactRoutesv1);
app.use('/api/v1/tips', TipsRoutesv1);
app.use('/api/v1/bank', BankDetailsRoutesv1);
app.use('/api/v1/report', AbuseReportRoutesv1);
app.use('/api/v1/work-post', WorkPostRoutesv1);
app.use('/api/v1/product', productRoutesv1);
app.use('/api/v1/mail', mailRoutesv1);
app.use('/api/v1/mail', authRoutesv1);

// const PORT = process.env.PORT || 3001;

// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });

// -------------------- SERVER CONFIG --------------------
const PORT = Number(process.env.PORT) || 3001; // ✅ convert to number
const HOST = process.env.HOST || '0.0.0.0'; // use 0.0.0.0 for external access

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});



export { app, prisma };