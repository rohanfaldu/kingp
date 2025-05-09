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
import path from 'path';
import cors from 'cors';

dotenv.config();
// const app: Application = express();
const prisma = new PrismaClient();
const app = express();
console.log(process.env.FRONT_URL,'>>>>>>>>>>>> process');

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export { app, prisma };