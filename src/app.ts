import dotenv from 'dotenv';
import express, { Application, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
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


import path from 'path';
import cors from 'cors';

dotenv.config();
// const app: Application = express();
const prisma = new PrismaClient();
const app = express();
console.log(process.env.FRONT_URL,'>>>>>>>>>>>> process');

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use(cors({
    origin: "*", 
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization', 'Access-Control-Allow-Methods'], // Add necessary headers
}));


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());

// Basic error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.get('/api/get', (req, res) => {
  res.json({ message: 'Hello, Welcome to KingP!' });
});

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



app.use('/api/mail', authRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export { app, prisma };