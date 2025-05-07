import { Category } from './../../node_modules/.prisma/client/index.d';
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { IUser } from '../interfaces/user.interface';
import { validateUser } from '../utils/userValidation';
import * as bcrypt from 'bcryptjs';
import { UserType, Gender } from '../enums/userType.enum';
import response from '../utils/response';
import { resolveStatus } from '../utils/commonFunction'
import { isEmail } from 'class-validator/types';
import jwt from 'jsonwebtoken';
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';
import { connect } from "http2";



const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

export const signup = async (req: Request, res: Response): Promise<any> => {
    try {
        const userData: IUser = req.body;

        validateUser(userData);
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const { countryId, password, emailAddress, brandTypeId, subcategoriesId = [], ...userFields } = userData;

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
        const gender = (userData.gender ?? Gender.MALE) as unknown as any;

        const newUser = await prisma.user.create({
            data: {
                ...userFields,
                password: hashedPassword,
                type: userData.type ?? UserType.BUSINESS,
                status: status,
                emailAddress,
                CountryData: {
                    connect: { id: countryId }
                },
                ...(userData.brandTypeId && {
                    brandData: {
                        connect: { id: userData.brandTypeId }
                    }
                }),
            },
            include: {
                CountryData: false // Include country in response if needed
            }
        });

        // Validate subcategoriesId if provided
        if (subcategoriesId.length > 0) {
            const validSubCategories = await prisma.subCategory.findMany({
                where: {
                    id: { in: subcategoriesId }
                },
                select: { id: true }
            });

            const validIds = validSubCategories.map((sub) => sub.id);
            const invalidIds = subcategoriesId.filter(id => !validIds.includes(id));

            if (invalidIds.length > 0) {
                return response.error(res, `Invalid subCategoryId(s): ${invalidIds.join(', ')}`);
            }

            // Insert into UserSubCategory only if all IDs are valid
            await prisma.userSubCategory.createMany({
                data: subcategoriesId.map((subCategoryId) => ({
                    userId: newUser.id,
                    subCategoryId
                })),
                skipDuplicates: true
            });
        }

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
        const users = await paginate(req, prisma.user, {}, "categories");

        if (!users || users.length === 0) {
            throw new Error("User not Found");

        }
        response.success(res, 'Get All User successfully!', users);

    } catch (error: any) {
        response.error(res, error.message);
    }
}


export const deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.body;
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

        if (!id || !isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const { emailAddress, password, subcategoriesId = [], ...updatableFields } = userData;

        // Optional: Normalize or validate status
        if ('status' in userData) {
            updatableFields.status = resolveStatus(userData.status);
        }

        if ('gender' in userData) {
            updatableFields.gender = userData.gender as unknown as any;
        }

        // Validate subcategoriesId if provided
        if (subcategoriesId.length > 0) {
            const validSubCategories = await prisma.subCategory.findMany({
                where: { id: { in: subcategoriesId.filter(Boolean) } }, // Filter out empty/null
                select: { id: true }
            });

            const validIds = validSubCategories.map(sub => sub.id);
            const invalidIds = subcategoriesId.filter(id => !validIds.includes(id));

            if (invalidIds.length > 0) {
                return response.error(res, `Invalid subCategoryId(s): ${invalidIds.join(', ')}`);
            }

            // Step 1: Delete existing subcategory links
            await prisma.userSubCategory.deleteMany({
                where: { userId: id }
            });

            // Step 2: Create new subcategory links
            await prisma.userSubCategory.createMany({
                data: validIds.map(subCategoryId => ({
                    userId: id,
                    subCategoryId
                })),
                skipDuplicates: true
            });
        }

        // Step 3: Update user profile
        const editedUser = await prisma.user.update({
            where: { id },
            data: updatableFields,
        });

        return response.success(res, 'User profile updated successfully!', editedUser);

    } catch (error: any) {
        return response.error(res, error.message || 'Failed to update user profile');
    }
};




export const getUsersWithType = async (req: Request, res: Response): Promise<any> => {
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

        const users = await paginate(req, prisma.user, {
            where: filter,
            orderBy: {
                createsAt: 'desc',
            }
        }, 'Users data');

        response.success(res, 'Get All Users successfully!', users);
    } catch (error: any) {
        response.error(res, error.message);
    }
};


export const incrementInfluencerClick = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({
            where: { id },
        });

        if (!user) {
            return response.error(res, 'Influencer not found.');
        }

        if (user.type !== 'INFLUENCER') {
            return response.error(res, 'User is not an influencer.');
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                viewCount: { increment: 1 },
            },
        });

        return response.success(res, 'Click count updated.', { clickCount: updatedUser.viewCount });
    } catch (error: any) {
        return response.error(res, error.message);
    }
};
