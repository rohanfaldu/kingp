import express, { Application, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.routes';
import countryRoutes from './routes/country.routes';
import imageRoutes from './routes/image.routes';
import categoryRoutes from './routes/category.routes';
import subcategoryRoutes from './routes/subcategory.routes';


import path from 'path';


// const app: Application = express();
const prisma = new PrismaClient();
const app = express();

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







const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export { app, prisma };