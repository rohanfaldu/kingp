// import jwt, { JwtPayload } from 'jsonwebtoken';
// import { Request, Response, NextFunction } from 'express';

// const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

// export interface TokenPayload extends JwtPayload {
//   id: string;
//   email?: string;
//   role?: string;
// }

// export const authenticateToken = (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): void => {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader?.split(' ')[1];

//   if (!token) {
//     res.status(401).json({ message: 'Access token missing' });
//     return;
//   }

//   jwt.verify(token, JWT_SECRET, (err, decoded) => {
//     if (err || !decoded) {
//       res.status(403).json({ message: 'Invalid or expired token' });
//       return;
//     }

//     req.user = decoded as TokenPayload;
//     next();
//   });
// };


import jwt, { JwtPayload } from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

export interface TokenPayload extends JwtPayload {
  userId: string;
  email?: string;
}

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'Access token missing' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

    // ✅ Check if the token matches the one in DB
    const stored = await prisma.userAuthToken.findUnique({
      where: { userId: decoded.userId },
    });

    if (!stored || stored.UserAuthToken !== token) {
      res.status(401).json({ message: 'Session expired or token invalid' });
      return;
    }

    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ message: 'Invalid or expired token' });
  }
};
