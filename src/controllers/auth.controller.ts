import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { IUser } from '../interfaces/user.interface';
import { validateUser } from '../utils/userValidation';
import * as bcrypt from 'bcryptjs';
import { UserType, Gender, LoginType, AvailabilityType } from '../enums/userType.enum';
import response from '../utils/response';
import { resolveStatus } from '../utils/commonFunction'
import { isEmail } from 'class-validator/types';
import jwt from 'jsonwebtoken';
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';
import { connect } from "http2";
import { calculateProfileCompletion, calculateBusinessProfileCompletion } from '../utils/calculateProfileCompletion';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { mapUserWithLocationAndCategories } from '../utils/userResponseMapper';
import { omit } from 'lodash';
import { Resend } from 'resend';


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
    const {
        socialMediaPlatform = [],
        password,
        emailAddress,
        countryId,
        brandTypeId,
        cityId,
        stateId,
        birthDate,
        loginType = LoginType.NONE,
        availability = AvailabilityType,
        subcategoriesId = [],
        ...userFields
    } = req.body;

    const normalizedLoginType =
        loginType === null || loginType === 'NULL' || loginType === undefined
            ? LoginType.NONE
            : loginType;

    if (!emailAddress) return response.error(res, 'Email is required.');
    if (normalizedLoginType === LoginType.NONE && !password) {
        return response.error(res, 'Password is required for email-password signup.');
    }

    const existingUser = await prisma.user.findUnique({ where: { emailAddress } });
    if (existingUser) {
        return response.error(res, `Email already registered via ${existingUser.loginType}.`);
    }

    const hashedPassword = normalizedLoginType === LoginType.NONE ? await bcrypt.hash(password, 10) : undefined;
    const formattedBirthDate = birthDate ? formatBirthDate(birthDate) : null;
    if (birthDate && !formattedBirthDate) {
        return response.error(res, 'Invalid birthDate format. Allowed formats: DD/MM/YYYY or YYYY/MM/DD');
    }

    if (stateId) {
        const state = await prisma.state.findUnique({ where: { id: stateId } });
        if (!state) return response.error(res, 'Invalid stateId');
        if (state.countryId !== countryId) return response.error(res, 'State does not belong to provided country');
    }

    if (cityId) {
        const city = await prisma.city.findUnique({ where: { id: cityId } });
        if (!city) return response.error(res, 'Invalid cityId');
        if (city.stateId !== stateId) return response.error(res, 'City does not belong to provided State');
    }

    let calculatedProfileCompletion = 0;
    if (req.body.type === UserType.INFLUENCER) {
        calculatedProfileCompletion = calculateProfileCompletion({
            ...req.body,
            subcategoriesId,
            socialMediaPlatforms: socialMediaPlatform,
        });
    } else {
        calculatedProfileCompletion = calculateBusinessProfileCompletion(req.body, loginType);
    }

    const status = resolveStatus(userFields.status);
    const gender = (userFields.gender ?? Gender.MALE) as any;

    const newUser = await prisma.user.create({
        data: {
            ...userFields,
            password: hashedPassword ?? 'null',
            emailAddress,
            status,
            gender,
            birthDate: formattedBirthDate,
            loginType: normalizedLoginType,
            availability,
            profileCompletion: calculatedProfileCompletion,
            type: userFields.type ?? UserType.BUSINESS,
            ...(countryId && { countryData: { connect: { id: countryId } } }),
            ...(stateId && { stateData: { connect: { id: stateId } } }),
            ...(cityId && { cityData: { connect: { id: cityId } } }),
            ...(brandTypeId && { brandData: { connect: { id: brandTypeId } } }),
            socialMediaPlatforms: {
                create: socialMediaPlatform.map((platform: any) => ({
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
                })),
            },
        },
        include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,

        },
    });

    // ✅ Create UserSubCategory relations if any
    if (Array.isArray(subcategoriesId) && subcategoriesId.length > 0) {
        const validSubCategories = await prisma.subCategory.findMany({
            where: { id: { in: subcategoriesId } },
            include: { categoryInformation: true },
        });

        const validIds = validSubCategories.map((sub) => sub.id);
        const invalidIds = subcategoriesId.filter((id) => !validIds.includes(id));
        if (invalidIds.length > 0) {
            return response.error(res, `Invalid subCategoryId(s): ${invalidIds.join(', ')}`);
        }

        await prisma.userSubCategory.createMany({
            data: validSubCategories.map((sub) => ({
                userId: newUser.id,
                subCategoryId: sub.id,
                categoryId: sub.categoryId,
            })),
            skipDuplicates: true,
        });
    }

    const token = jwt.sign(
        { userId: newUser.id, email: newUser.emailAddress },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    //  const { password: _, socialMediaPlatform: __, ...newUsers } = newUser as any;
    const newUsers = omit(newUser, ['password', 'socialMediaPlatform']);

    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(newUser.id);
    const userResponse = {
        ...newUsers,
        categories: userCategoriesWithSubcategories,
        countryName: newUser.countryData?.name ?? null,
        stateName: newUser.stateData?.name ?? null,
        cityName: newUser.cityData?.name ?? null,

    };

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expireAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins from now

    const existingOtp = await prisma.otpVerify.findFirst({
        where: { emailAddress, otpType: 'SIGNUP' },
    });

    if (existingOtp) {
        await prisma.otpVerify.update({
            where: { id: existingOtp.id },
            data: {
                otp,
                expireAt,
                verified: false,
                countMail: (existingOtp.countMail || 0) + 1,
                updatedAt: new Date(),
            },
        });
    } else {
        await prisma.otpVerify.create({
            data: {
                emailAddress,
                otp,
                expireAt,
                verified: false,
                otpType: 'SIGNUP',
                countMail: 1,
                updatedAt: new Date(),
            },
        });
    }
    const resend = new Resend('re_FKsFJzvk_4L1x2111AwnSDMqGCYGsLJeH');

    const user = await prisma.user.findUnique({
        where: { emailAddress },
        select: { name: true },
    });

    const htmlContent = `
    <p>Hello ${user?.name || emailAddress},</p>
    <p>Welcome to <strong>KringP</strong>! Thank you for signing up.</p>
    <p>To verify your email address and complete your registration, please use the following One-Time Password (OTP):</p>
    <p>Your OTP is: <strong>${otp}</strong></p>
    <p>This OTP is valid for a limited time. Please do not share it with anyone for security reasons.</p>
    <p>If you did not initiate this registration, please ignore this email.</p>
    
  `;

    const sendEmail = await resend.emails.send({
        from: 'KringP <info@kringp.com>',
        to: emailAddress,
        subject: 'Hello from KringP',
        html: htmlContent,
    });

    return response.success(res, 'Sign Up successful!', {
        user: userResponse,
        token,
    });
};






export const login = async (req: Request, res: Response): Promise<any> => {
    // try {
    const { emailAddress, password, loginType, socialId, fcmToken } = req.body;


    if (!emailAddress) {
        return response.error(res, 'Email is required.');
    }

    let user = await prisma.user.findUnique({
        where: { emailAddress },
        include: {
            socialMediaPlatforms: true,
            brandData: true,
            countryData: true,
            stateData: true,
            cityData: true,
        },
    });

    if (!user) {
        return response.error(res, 'Invalid email address.');
    }

    const isAdmin = user.type === 'ADMIN';

    if ((!isAdmin) && (user.loginType === 'NONE')) {
        const verifiedOtp = await prisma.otpVerify.findFirst({
            where: {
                emailAddress,
                verified: true,
            },
        });

        if (!verifiedOtp) {
            return response.error(
                res,
                'Email is not verified. Please verify your email with the OTP sent during signup.'
            );
        }
    }


    // if (!verifiedOtp) {
    //     return response.error(res, 'Email is not verified. Please verify your email with the OTP sent during signup.');
    // }


    // Social login flow (GOOGLE or APPLE)
    if (loginType === LoginType.GOOGLE || loginType === LoginType.APPLE) {
        if (!socialId) {
            return response.error(res, 'socialId is required for social login.');
        }

        if (user.loginType === LoginType.NONE || !user.loginType) {
            return response.error(res, 'Please login with Email & Password.');
        }

        if (user.loginType !== loginType) {
            return response.error(res, `Please login using ${user.loginType}.`);
        }

        if (!user.socialId) {
            return response.error(res, 'No socialId registered for this user. Please contact support.');
        }

        if (user.socialId !== socialId) {
            return response.error(res, 'Invalid socialId provided.');
        }

    } else {
        if (user.loginType === LoginType.GOOGLE || user.loginType === LoginType.APPLE) {
            return response.error(res, `Please login using ${user.loginType}.`);
        }

        if (!password) {
            return response.error(res, 'Password is required for email/password login.');
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return response.error(res, 'Invalid password.');
        }
    }

    // Update FCM token if provided
    if (fcmToken) {
        await prisma.user.update({
            where: { id: user.id },
            data: { fcmToken },
        });
    }

    // Fetch country, state, city names
    const country = user.countryId ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } }) : null;
    const state = user.stateId ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } }) : null;
    const city = user.cityId ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } }) : null;

    // Get user categories
    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

    // Generate JWT token
    const token = jwt.sign(
        { userId: user.id, email: user.emailAddress },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    // Build user response and replace IDs with names
    const { password: _, socialMediaPlatform: __, ...userWithoutPassword } = user as any;

    const userResponse = {
        ...userWithoutPassword,
        categories: userCategoriesWithSubcategories,
        countryName: country?.name ?? null,
        stateName: state?.name ?? null,
        cityName: city?.name ?? null,

        // socialMediaPlatforms: user.socialMediaPlatforms ?? [],
    };

    // Final response
    return response.success(res, 'Login successful!', {
        user: userResponse,
        token,
    });

    // } catch (error: any) {
    //     return response.serverError(res, error.message || 'Login failed.');
    // }
};




export const getByIdUser = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.body;

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        const user = await prisma.user.findUnique({
            where: { id },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
        });

        if (!user) {
            return response.error(res, 'User not found');
        }

        const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

        const country = user.countryId ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } }) : null;
        const state = user.stateId ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } }) : null;
        const city = user.cityId ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } }) : null;

        const { password: _, socialMediaPlatform: __, ...users } = user as any;
        const responseUser = {
            ...users,
            categories: userCategoriesWithSubcategories,
            countryName: country?.name ?? null,
            stateName: state?.name ?? null,
            cityName: city?.name ?? null,
        };
        const token = jwt.sign(
            { userId: user.id, email: user.emailAddress },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        return response.success(res, 'User fetched successfully!', {
            user: responseUser,
            token,
        });
    } catch (error: any) {
        return response.error(res, error.message);
    }
};



export const getAllUsers = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            platform,
            type,
            countryId,
            stateId,
            cityId,
            influencerType,
            status,
            subCategoryId,
            ratings,
            gender,
            minAge,
            maxAge,
        } = req.body;

        const allowedPlatforms = ['INSTAGRAM', 'TWITTER', 'YOUTUBE', 'FACEBOOK'];
        const allowedGender = ['MALE', 'FEMALE', 'OTHER'];
        const allowedInfluencerTypes = ['PRO', 'NORMAL'];
        const andFilters: any[] = [];
        const filter: any = {};

        // Validate and apply platform filter
        if (platform) {
            const platforms = Array.isArray(platform) ? platform.map(p => p.toUpperCase()) : [platform.toString().toUpperCase()];
            const invalidPlatforms = platforms.filter(p => !allowedPlatforms.includes(p));
            if (invalidPlatforms.length > 0) {
                return response.error(res, `Invalid platform(s): ${invalidPlatforms.join(', ')}. Allowed: INSTAGRAM, TWITTER, YOUTUBE, FACEBOOK`);
            }

            andFilters.push({
                OR: platforms.map(p => ({
                    socialMediaPlatforms: {
                        some: { platform: p },
                    },
                })),
            });
        }

        // Validate and apply Gender filter
        if (gender) {
            const genders = Array.isArray(gender) ? gender.map(g => g.toUpperCase()) : [gender.toString().toUpperCase()];
            const invalidGenders = genders.filter(g => !allowedGender.includes(g));
            if (invalidGenders.length > 0) {
                return response.error(res, `Invalid gender(s): ${invalidGenders.join(', ')}. Allowed: MALE, FEMALE, OTHER`);
            }

            filter.gender = { in: genders };
        }


        // Age filter (based on birthDate)
        if (minAge) {
            const minAge = parseInt(req.body.minAge.toString());
            if (isNaN(minAge) || minAge <= 0) {
                return response.error(res, 'Invalid minAge. It must be a positive number.');
            }

            const today = new Date();
            const birthDateThreshold = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());

            filter.birthDate = {
                lte: birthDateThreshold,
            };
        }

        if (maxAge) {
            const maxAge = parseInt(req.body.maxAge.toString());
            if (isNaN(maxAge) || maxAge <= 0) {
                return response.error(res, 'Invalid maxAge. It must be a positive number.');
            }

            const today = new Date();
            const birthDateThreshold = new Date(today.getFullYear() - maxAge, today.getMonth(), today.getDate());

            filter.birthDate = {
                ...(filter.birthDate || {}),
                gte: birthDateThreshold,
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

        // COUNTRY filter with multiple values (simple equality on countryId array)
        if (countryId) {
            const countries = Array.isArray(countryId) ? countryId.map((id: any) => id.toString()) : [countryId.toString()];
            filter.countryId = { in: countries };
        }

        // STATE filter with multiple values
        if (stateId) {
            const states = Array.isArray(stateId) ? stateId.map((id: any) => id.toString()) : [stateId.toString()];
            filter.stateId = { in: states };
        }

        // CITY filter with multiple values
        if (cityId) {
            const cities = Array.isArray(cityId) ? cityId.map((id: any) => id.toString()) : [cityId.toString()];
            filter.cityId = { in: cities };
        }

        // Ratings filter (optional)
        if (ratings) {
            if (Array.isArray(ratings)) {
                // Convert all ratings to numbers and validate
                const ratingValues = ratings.map(r => parseInt(r.toString())).filter(r => !isNaN(r) && r >= 0);
                if (ratingValues.length === 0) {
                    return response.error(res, 'Invalid ratings array. All values must be non-negative numbers.');
                }
                // Filter users whose ratings field matches any of the given ratings
                filter.ratings = { in: ratingValues };
            } else {
                const minRating = parseInt(ratings.toString());
                if (isNaN(minRating) || minRating < 0) {
                    return response.error(res, 'Invalid ratings value. Must be a non-negative number.');
                }
                filter.ratings = { gte: minRating };
            }
        }


        // SubCategory filter (optional)
        if (subCategoryId) {
            const subCategoryIds = Array.isArray(subCategoryId) ? subCategoryId : [subCategoryId];
            andFilters.push({
                OR: subCategoryIds.map((id: string) => ({
                    subCategories: {
                        some: { subCategoryId: id.toString() },
                    },
                })),
            });
        }

        // Influencer Type filter with strict logic
        if (influencerType) {
            const inflType = influencerType.toString().toUpperCase();
            if (!['PRO', 'NORMAL'].includes(inflType)) {
                return response.error(res, 'Invalid influencer type. Allowed: PRO, NORMAL');
            }

            if (inflType === 'PRO') {
                andFilters.push({
                    influencerType: 'PRO',
                });
            }

            if (inflType === 'NORMAL') {
                andFilters.push({
                    OR: [
                        { influencerType: 'NORMAL' },
                        { influencerType: null },
                    ],
                });
            }
        }

        // Status filter (optional)
        if (status !== undefined) {
            if (status === 'true' || status === 'false') {
                filter.status = status === 'true';
            } else {
                return response.error(res, 'Invalid status value. Use true or false.');
            }
        }

        const whereFilter: any = { ...filter };
        if (andFilters.length > 0) {
            whereFilter.AND = andFilters;
        }

        const paginatedResult = await paginate(
            req,
            prisma.user,
            {
                where: whereFilter,
                include: {
                    socialMediaPlatforms: true,
                    brandData: true,
                    countryData: true,
                    stateData: true,
                    cityData: true,
                },
                orderBy: {
                    createsAt: 'desc',
                },
            },
            "User"
        );

        if (!paginatedResult.User || paginatedResult.User.length === 0) {
            throw new Error("No users found matching the criteria.");
        }

        // Format all users
        const formattedUsers = await Promise.all(
            paginatedResult.User.map(async (userData: any) => {
                const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(userData.id);

                return {
                    ...userData,
                    categories: userCategoriesWithSubcategories,
                    countryName: userData.countryData?.name ?? null,
                    stateName: userData.stateData?.name ?? null,
                    cityName: userData.cityData?.name ?? null,
                };
            })
        );
        return response.success(res, 'Users fetched successfully!', {
            pagination: paginatedResult.pagination,
            users: formattedUsers,
        });
    } catch (error: any) {
        response.error(res, error.message);
    }
}




export const getAllInfo = async (req: Request, res: Response): Promise<any> => {
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
                    countryData: true,
                    stateData: true,
                    cityData: true,
                },
            },
            "Users"
        );

        if (!users || users.length === 0) {
            throw new Error("User not Found");
        }

        response.success(res, 'Get All Users successfully!', users);
    } catch (error: any) {
        response.error(res, error.message);
    }
};



export const deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.body;

        if (!id || !isUuid(id)) {
            response.error(res, 'Invalid or missing UUID format');
            return;
        }

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { id },
            select: { emailAddress: true },
        });

        if (!existingUser) {
            response.error(res, 'User not found');
            return;
        }

        // Perform transactional delete (force delete all dependencies first)
        await prisma.$transaction([
            prisma.userDetail.deleteMany({
                where: { userId: id },
            }),
            prisma.socialMediaPlatform.deleteMany({
                where: { userId: id },
            }),
            prisma.userSubCategory.deleteMany({
                where: { userId: id },
            }),
            prisma.otpVerify.deleteMany({
                where: { emailAddress: existingUser.emailAddress },
            }),
            prisma.user.delete({
                where: { id },
            }),
        ]);

        response.success(res, 'User and all related data deleted successfully', null);

    } catch (error: any) {
        response.error(res, error.message);
    }
};


export const editProfile = async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const userData: IUser = req.body;

    if (!id || !isUuid(id)) {
        return response.error(res, 'Invalid UUID format');
    }

    // First, fetch the existing user to preserve existing data
    const existingUser = await prisma.user.findUnique({
        where: { id },
        include: {
            socialMediaPlatforms: true,
            subCategories: {
                include: {
                    subCategory: true
                }
            }
        }
    });

    if (!existingUser) {
        return response.error(res, 'User not found');
    }

    const {
        emailAddress, password, subcategoriesId = [], stateId, cityId, countryId, brandTypeId, status, gender, ...updatableFields
    } = userData;

    // Prepare update data while preserving existing values
    const finalUpdateData: any = {};

    // Status handling
    if (status !== undefined) {
        finalUpdateData.status = resolveStatus(status);
    }

    // Gender handling
    if (gender !== undefined) {
        finalUpdateData.gender = gender as unknown as any;
    }

    // Location handling
    if (stateId) {
        const state = await prisma.state.findUnique({ where: { id: stateId } });
        if (!state) return response.error(res, 'Invalid stateId');
        if (countryId && state.countryId !== countryId) {
            return response.error(res, 'State does not belong to provided country');
        }
        finalUpdateData.stateData = { connect: { id: stateId } };
    }

    if (cityId) {
        const city = await prisma.city.findUnique({ where: { id: cityId } });
        if (!city) return response.error(res, 'Invalid cityId');
        if (stateId && city.stateId !== stateId) {
            return response.error(res, 'City does not belong to provided State');
        }
        finalUpdateData.cityData = { connect: { id: cityId } };
    }

    if (countryId) {
        finalUpdateData.countryData = { connect: { id: countryId } };
    }

    if (brandTypeId) {
        finalUpdateData.brandData = { connect: { id: brandTypeId } };
    }

    // Add other updatable fields, preserving existing values if not provided
    Object.keys(updatableFields).forEach(key => {
        if (updatableFields[key] !== undefined) {
            finalUpdateData[key] = updatableFields[key];
        }
    });

    // Subcategories handling
    let updatedSubcategories: string[] = [];
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

        updatedSubcategories = validIds;

        // Delete existing subcategories and create new ones
        await prisma.userSubCategory.deleteMany({
            where: { userId: id }
        });

        await prisma.userSubCategory.createMany({
            data: validIds.map(subCategoryId => ({
                userId: id,
                subCategoryId: subCategoryId
            })),
            skipDuplicates: true
        });
    } else {
        // If no subcategories provided, use existing ones
        updatedSubcategories = existingUser.subCategories.map(sc => sc.subCategory.id);
    }

    try {
        // Prepare data for profile completion calculation
        const profileCompletionData = {
            ...existingUser,
            ...userData,
            subcategoriesId: updatedSubcategories
        };

        // Calculate profile completion based on user type
        let calculatedProfileCompletion = 0;
        if (existingUser.type === UserType.INFLUENCER) {
            calculatedProfileCompletion = calculateProfileCompletion({
                ...profileCompletionData,
                subcategoriesId: updatedSubcategories
            });
        } else {
            calculatedProfileCompletion = calculateBusinessProfileCompletion(profileCompletionData, existingUser.loginType);
        }

        // Add profile completion to update data
        finalUpdateData.profileCompletion = calculatedProfileCompletion;

        const token = req.headers.authorization?.split(' ')[1] || req.token;

        // Perform update
        const editedUser = await prisma.user.update({
            where: { id },
            data: finalUpdateData,
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            }
        });


        // Fetch names for country, state, city
        const country = editedUser.countryId ? await prisma.country.findUnique({ where: { id: editedUser.countryId }, select: { name: true } }) : null;
        const state = editedUser.stateId ? await prisma.state.findUnique({ where: { id: editedUser.stateId }, select: { name: true } }) : null;
        const city = editedUser.cityId ? await prisma.city.findUnique({ where: { id: editedUser.cityId }, select: { name: true } }) : null;

        const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(editedUser.id);

        const newUsers = omit(editedUser, ['password', 'socialMediaPlatform']);
        const userResponse = {
            ...newUsers,
            categories: userCategoriesWithSubcategories,
            countryName: country?.name ?? null,
            stateName: state?.name ?? null,
            cityName: city?.name ?? null,
        };



        return response.success(res, 'User profile updated successfully!', {
            user: userResponse,
            token,
        });

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

export const socialLogin = async (req: Request, res: Response): Promise<any> => {
    try {
        const { socialId, name, emailAddress, userImage } = req.body;

        if (!socialId) {
            return response.error(res, 'socialId is required.');
        }

        // Find by socialId
        let user = await prisma.user.findFirst({
            where: { socialId },
        });

        // If user not exists → create user
        if (!user) {
            // Optional check: If email provided, make sure no existing user with email exists
            if (emailAddress) {
                const existingEmailUser = await prisma.user.findUnique({
                    where: { emailAddress },
                });
                if (existingEmailUser) {
                    return response.error(res, 'Email already registered with another account.');
                }
            }

            user = await prisma.user.create({
                data: {
                    socialId,
                    name: name || 'Social User',
                    emailAddress: emailAddress || null,
                    userImage: userImage || null,
                    type: 'INFLUENCER', // Or 'BUSINESS' as per your need
                    status: true,
                    profileCompletion: 0,
                },
            });
        }

        // Fetch country, state, city names
        const country = user.countryId ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } }) : null;
        const state = user.stateId ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } }) : null;
        const city = user.cityId ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } }) : null;

        // Get user categories
        const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, email: user.emailAddress },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Remove password if exists & override countryId etc. with names
        const { password, ...userWithoutPassword } = user as any;

        const userResponse = {
            ...userWithoutPassword,
            countryName: country?.name ?? null,
            stateName: state?.name ?? null,
            cityName: city?.name ?? null,
            categories: userCategoriesWithSubcategories,
        };

        return response.success(res, 'Social Login successful!', {
            user: userResponse,
            token,
        });

    } catch (error: any) {
        return res.status(200).json({
            status: false,
            message: error.message || 'Social login failed, User not found with this socialId.',
            data: null
        });
    }
};

