import { error } from 'console';
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { IUser } from '../interfaces/user.interface';
import { validateUser } from '../utils/userValidation';
import * as bcrypt from 'bcryptjs';
import { UserType, BrandType } from '../enums/userType.enum';
import response from '../utils/response';
import { resolveStatus } from '../utils/commonFunction'
import { isEmail } from 'class-validator/types';
import jwt from 'jsonwebtoken';
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';



const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

export const signupBusiness = async (req: Request, res: Response): Promise<any> => {
    try {
        const userData: IUser = req.body;

        validateUser(userData);
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const { countryId, password, emailAddress, ...userFields } = userData;

        if (!countryId) {
            return response.error(res, 'countryId is required.');
        }

        const existingUser = await prisma.user.findUnique({
            where: { emailAddress },
        });

        if (existingUser) {
            return response.error(res, 'A user with this email already exists.');
        }

        const status = resolveStatus(userData.status);
        const newUser = await prisma.user.create({
            data: {
                ...userFields,
                password: hashedPassword,
                type: userData.type ?? UserType.BUSINESS,
                brandType: userData.brandType ?? BrandType.STARTUP,
                status: status,
                emailAddress,
                CountryData: {
                    connect: { id: countryId }
                }
            },
            include: {
                CountryData: false // Include country in response if needed
            }
        });

        return response.success(res, 'Sign Up successfully!', newUser);

    } catch (error: any) {
        return response.serverError(res, error.message);
    }
}


export const login = async (req: Request, res: Response): Promise<any> => {
    try {
        const { emailAddress, password, fcmToken: fcmToken } = req.body;

        if (!emailAddress || !password) {
            return response.error(res, 'Email and password are required.');
        }

        let user = await prisma.user.findUnique({
            where: { emailAddress },
        });

        if (!user) {
            return response.error(res, 'Invalid email address.');
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return response.error(res, 'Invalid password.');
        }

        if (fcmToken) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: { fcmToken },
            });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.emailAddress },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const { password: _, ...userWithFcm } = user;

        return response.success(res, 'Login successful!', {
            user: userWithFcm,
            token,
        });

    } catch (error: any) {
        return response.serverError(res, error.message || 'Login failed.');
    }
};








export const getByIdUser = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const user = await prisma.user.findUnique({
            where: { id: id },
        });
        response.success(res, 'User Fetch successfully!', user);
    } catch (error: any) {
        response.error(res, error.message);
    }
}

export const getAllUsers = async (req: Request, res: Response): Promise<any> => {
    try {
        const { type } = req.body;
        const filter: any = {};
        if (type && typeof type === 'string') {
            const normalizedType = type.toUpperCase();
            if (['BUSINESS', 'INFLUENCER'].includes(normalizedType)) {
                filter.type = normalizedType;
            } else {
                return response.error(res, 'Invalid user type');
            }
        }

        const users = await paginate(req, prisma.user, { where: filter }, 'Users data');


        if (!users || users.length === 0) {
            throw new Error("Users not Found");

        }
        response.success(res, 'Get All Users successfully!', users);

    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID formate')
        }
        const deletedUser = await prisma.user.delete({
            where: { id: id },
        });
        response.success(res, 'User Deleted successfully!', null);

    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const editProfile = async (req: Request, res: Response): Promise<any> => {
    try {
      const { id } = req.params;
      const userData: IUser = req.body;
  
      if (!isUuid(id)) {
        return response.error(res, 'Invalid UUID format');
      }
  
      // Destructure to remove uneditable fields
      const { emailAddress, password, ...updatableFields } = userData;
  
      // Optional: Normalize or validate status
      if ('status' in userData) {
        updatableFields.status = resolveStatus(userData.status);
      }
  
      const editedUser = await prisma.user.update({
        where: { id },
        data: updatableFields,
      });
  
      return response.success(res, 'User profile updated successfully!', editedUser);
    } catch (error: any) {
      return response.error(res, error.message || 'Failed to update user profile');
    }
  }
  
