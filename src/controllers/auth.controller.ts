import { Category } from './../../node_modules/.prisma/client/index.d';
import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
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
const formatBirthDate = (birthDate: string): Date | null => {
    // Check if the birthDate is in DD/MM/YYYY format
    const regexDDMMYYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    // Check if the birthDate is in YYYY-MM-DD format
    const regexYYYYMMDD = /^(\d{4})-(\d{2})-(\d{2})$/;

    if (regexDDMMYYYY.test(birthDate)) {
        const match = birthDate.match(regexDDMMYYYY);
        if (match) {
            const day = parseInt(match[1]);
            const month = parseInt(match[2]) - 1;  // Adjust for zero-based month
            const year = parseInt(match[3]);
            const date = new Date(year, month, day);
            return date;
        }
    } else if (regexYYYYMMDD.test(birthDate)) {
        return new Date(birthDate);  // Directly return the date if it's already in YYYY-MM-DD format
    }

    return null;  // Return null if format is invalid
};

export const signup = async (req: Request, res: Response): Promise<any> => {

    //try {
        const userData: IUser = req.body;

        // Validate user input
        validateUser(userData);
        const hashedPassword = await bcrypt.hash(userData.password, 10);

        // const { countryId, password, emailAddress, brandTypeId, subcategoriesId = [], socialMediaPlatform = [], ...userFields } = userData;
        const {
            socialMediaPlatform = [],
            password,
            emailAddress,
            countryId,
            brandTypeId,
            cityId,
            stateId,
            birthDate,
            subcategoriesId = [],
            ...userFields
        } = req.body;

        if (!countryId) {
            return response.error(res, 'countryId is required.');
        }

        const existingUser = await prisma.user.findUnique({
            where: { emailAddress },
        });

        if (existingUser) {
            return response.error(res, 'A user with this email already exists.');
        }

        const isValidDate = (dateString: string): boolean => {
            if (validateDateFormatDDMMYYYY(dateString)) {
                const [day, month, year] = dateString.split('-').map(Number);
                const date = new Date(year, month - 1, day);  // Adjust month for zero-indexed months
                return date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
            }
        
            if (validateDateFormatYYYYMMDD(dateString)) {
                const [year, month, day] = dateString.split('-').map(Number);
                const date = new Date(year, month - 1, day);  // Adjust month for zero-indexed months
                return date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
            }
        
            return false;  // Return false if neither format is matched
        };
        // Validate birthDate if it is provided
        const formattedBirthDate = birthDate ? formatBirthDate(birthDate) : null;
        if (birthDate && !formattedBirthDate) {
            return response.error(res, 'Invalid birthDate format. Allowed formats: DD/MM/YYYY or YYYY/MM/DD');
        }
        if (stateId) {
            const state = await prisma.state.findUnique({ where: { id: stateId } });
            if (!state) return response.error(res, 'Invalid stateId');
            if (state.countryId !== countryId) {
                return response.error(res, 'State does not belong to provided country');
            }
        }
        if (cityId) {
            const city = await prisma.city.findUnique({ where: { id: cityId } });
            if (!city) return response.error(res, 'Invalid cityId');
            if (city.stateId !== stateId) {
                return response.error(res, 'City does not belong to provided State');
            }
        }

        // console.log(req.body, '>>>>>>>>Request Data:' ); 
        const status = resolveStatus(userData.status);
        const gender = (userData.gender ?? Gender.MALE) as unknown as any;

        // Create user
        const newUser = await prisma.user.create({
            data: {
                ...userFields,
                password: hashedPassword,
                emailAddress,
                status,
                gender,
                birthDate: formattedBirthDate,
                type: userData.type ?? UserType.BUSINESS,
                CountryData: {
                    connect: { id: countryId }
                },
                ...(stateId && {
                    StateData: {
                        connect: { id: stateId }
                    }
                }),
                ...(cityId && {
                    CityData: {
                        connect: { id: cityId }
                    }
                }),
                ...(brandTypeId && {
                    brandData: {
                        connect: { id: brandTypeId }
                    }
                }),
                socialMediaPlatforms: {
                    create: userData.socialMediaPlatform.map((platform: any) => ({
                        platform: platform.platform,
                        userName: platform.userName,
                        image: platform.image,
                        followerCount: platform.followerCount,
                        engagementRate: platform.engagementRate,
                        averageLikes: platform.averageLikes,
                        averageComments: platform.averageComments,
                        averageShares: platform.averageShares,
                        price: platform.price,
                        status: platform.status,
                    }))
                }

            },
            include: {
                CountryData: false,
                socialMediaPlatforms: true,
            }

        });

        if (socialMediaPlatform.length > 0) {
            const platformsToInsert = socialMediaPlatform.map((platform: any) => ({
                ...platform,
                userId: newUser.id,
                price: new Prisma.Decimal(platform.price) // 👈 This now works
            }));

            await prisma.socialMediaPlatform.createMany({
                data: platformsToInsert,
                skipDuplicates: true,
            });
        }

        // Validate and create UserSubCategory relations
        if (Array.isArray(subcategoriesId) && subcategoriesId.length > 0) {
            const validSubCategories = await prisma.subCategory.findMany({
                where: {
                    id: { in: subcategoriesId }
                },
                select: { id: true }
            });

            const validIds = validSubCategories.map(sub => sub.id);
            const invalidIds = subcategoriesId.filter(id => !validIds.includes(id));

            if (invalidIds.length > 0) {
                return response.error(res, `Invalid subCategoryId(s): ${invalidIds.join(', ')}`);
            }

            await prisma.userSubCategory.createMany({
                data: validIds.map(subCategoryId => ({
                    userId: newUser.id,
                    subCategoryId
                })),
                skipDuplicates: true
            });
        }

        // Return success response with the newly created user
        return response.success(res, 'Sign Up successfully!', newUser);
    // } catch (error: any) {
    //     console.error('Error during signup:', error);  // Log the error for debugging
    //     return response.serverError(res, error.message || 'Internal server error');
    // }
};









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
        const { id } = req.body;
        if (!isUuid(id)) {
            response.error(res, 'Invalid UUID format');
        }

        const user = await prisma.user.findUnique({
            where: { id: id },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                subCategories: {
                    include: {
                        subCategory: {
                            include: {
                                categoryInformation: true,
                            },
                        },
                    },
                },
                CountryData: true,
                StateData: true,
                CityData: true,
            },
        });
        response.success(res, 'User Fetch successfully!', user);
    } catch (error: any) {
        response.error(res, error.message);
    }
}

export const getAllUsers = async (req: Request, res: Response): Promise<any> => {
    try {
        const { platform } = req.body;
        const { type } = req.body;
        // const { countryId } = req.body;

        const allowedPlatforms = ['INSTAGRAM', 'TWITTER', 'YOUTUBE', 'TIKTOK'];

        const filter: any = {};

        // Validate and apply platform filter
        if (platform) {
            const platformValue = platform.toString().toUpperCase();
            if (!allowedPlatforms.includes(platformValue)) {
                return response.error(res, 'Invalid platform value. Allowed: INSTAGRAM, TWITTER, YOUTUBE, TIKTOK');
            }

            filter.socialMediaPlatforms = {
                some: {
                    platform: platformValue, // must match enum value
                },
            };
        }

        // type of user business or influencer
        if (type && typeof type === 'string') {
            const normalizedType = type.toUpperCase();
            if (['BUSINESS', 'INFLUENCER'].includes(normalizedType)) {
                filter.type = normalizedType;
            } else {
                return response.error(res, 'Invalid user type, Allowed: BUSINESS, INFLUENCER');
            }
        }

        // if (countryId) {
        //     filter.CountryData = {
        //         some: { id: countryId }  // Ensure CountryData contains the given countryId
        //     };
        // } else {
        //     return response.error(res, 'countryId is required.');
        // }

        const users = await paginate(
            req,
            prisma.user,
            {
                where: filter,
                include: {
                    socialMediaPlatforms: true,
                    brandData: true,
                    subCategories: {
                        include: {
                            subCategory: {
                                include: {
                                    categoryInformation: true,
                                },
                            },
                        },
                    },
                    CountryData: true,
                    StateData: true,
                    CityData: true,
                },
            },
            "Users"
        );

        if (!users || users.length === 0) {
            throw new Error("User not Found");
        }

        response.success(res, 'Get All Users successfully!', users);
    } catch (error: any) {
        console.error("Error in getAllUsers:", error);
        response.error(res, error.message);
    }
};




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
    const { id } = req.params;
    const userData: IUser = req.body;

    if (!id || !isUuid(id)) {
        return response.error(res, 'Invalid UUID format');
    }

    const {
        emailAddress, password, subcategoriesId = [], stateId, cityId, countryId, brandTypeId, status, gender, ...updatableFields
    } = userData;

    // Optional: Normalize or validate status
    if (status !== undefined) {
        updatableFields.status = resolveStatus(status);
    }

    if (gender !== undefined) {
        updatableFields.gender = gender as unknown as any;
    }

    // Location and brand handling only if provided
    if (stateId) {
        const state = await prisma.state.findUnique({ where: { id: stateId } });
        if (!state) return response.error(res, 'Invalid stateId');
        if (countryId && state.countryId !== countryId) {
            return response.error(res, 'State does not belong to provided country');
        }
        updatableFields.StateData = { connect: { id: stateId } };
    }

    if (cityId) {
        const city = await prisma.city.findUnique({ where: { id: cityId } });
        if (!city) return response.error(res, 'Invalid cityId');
        if (stateId && city.stateId !== stateId) {
            return response.error(res, 'City does not belong to provided State');
        }
        updatableFields.CityData = { connect: { id: cityId } };
    }

    if (countryId) {
        updatableFields.CountryData = { connect: { id: countryId } };
    }

    if (brandTypeId) {
        updatableFields.brandData = { connect: { id: brandTypeId } };
    }

    // Subcategories handling
    if (Array.isArray(subcategoriesId) && subcategoriesId.length > 0) {
        const validSubCategories = await prisma.subCategory.findMany({
            where: { id: { in: subcategoriesId.filter(Boolean) } },
            select: { id: true }
        });

        const validIds = validSubCategories.map(sub => sub.id);
        const invalidIds = subcategoriesId.filter(id => !validIds.includes(id));

        if (invalidIds.length > 0) {
            return response.error(res, `Invalid subCategoryId(s): ${invalidIds.join(', ')}`);
        }

        await prisma.userSubCategory.deleteMany({
            where: { userId: id }
        });

        await prisma.userSubCategory.createMany({
            data: validIds.map(subCategoryId => ({
                userId: id,
                subCategoryId
            })),
            skipDuplicates: true
        });
    }

    // Remove any undefined fields to avoid Prisma trying to set them to undefined or null
    const finalUpdateData = {};
    for (const [key, value] of Object.entries(updatableFields)) {
        if (value !== undefined) {
            finalUpdateData[key] = value;
        }
    }

    try {
        // Perform update only if there are fields to update
        const editedUser = await prisma.user.update({
            where: { id },
            data: finalUpdateData, // Ensure only fields with values are included
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                CountryData: true,
                StateData: true,
                CityData: true,
                subCategories: {
                    include: {
                        subCategory: {
                            include: {
                                categoryInformation: true
                            }
                        }
                    }
                }
            }
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
        const { id } = req.body;

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
