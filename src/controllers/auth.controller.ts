import { chatViewCount } from './dashboard.controller';
import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { IUser } from '../interfaces/user.interface';
import * as bcrypt from 'bcryptjs';
import { UserType, Gender, LoginType, AvailabilityType } from '../enums/userType.enum';
import response from '../utils/response';
import { resolveStatus } from '../utils/commonFunction'
import jwt from 'jsonwebtoken';
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';
import { calculateProfileCompletion, calculateBusinessProfileCompletion } from '../utils/calculateProfileCompletion';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { omit } from 'lodash';
import { Resend } from 'resend';
import { Role } from '@prisma/client';
import { RequestStatus } from '@prisma/client';
import { contains } from "class-validator/types";
import { generateUniqueReferralCode } from '../utils/referral';
import { CoinType } from '@prisma/client';
import { subMonths } from 'date-fns';



const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

export const formatBirthDate = (birthDate: string): Date | null => {
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
        referralCode,
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
        const message =
            existingUser.loginType === 'NONE'
                ? 'Email already registered with email & password.'
                : `Email already registered via ${existingUser.loginType}.`;

        return response.error(res, message);
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
        const userSubCategories = (req.body.subcategoriesId || []).map((id: string) => ({
            subCategoryId: id
        }));

        calculatedProfileCompletion = calculateProfileCompletion({
            ...req.body,
            userSubCategories,
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
            referralCode: generateUniqueReferralCode(userFields.name ?? 'USER'),
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
                    viewCount: platform.viewCount,
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

    //Create UserSubCategory relations if any
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

    // 👉 Signup Reward: create CoinTransaction + update ReferralCoinSummary
    await prisma.coinTransaction.create({
        data: {
            userId: newUser.id,
            amount: 50,
            type: CoinType.SIGNUP,
            status: 'LOCKED',
        },
    });

    // If 2 or more accounts, assign badge type 1
    if (socialMediaPlatform.length >= 2) {
        const badge = await prisma.badges.findFirst({
            where: { type: '1' }, // Adjust field name if it's called something else
            select: { id: true },
        });

        if (badge) {
            await prisma.userBadges.create({
                data: {
                    userId: newUser.id,
                    badgeId: badge.id,
                },
            });
        }
    }

    const signupSummary = await prisma.referralCoinSummary.findUnique({ where: { userId: newUser.id } });
    if (signupSummary) {
        await prisma.referralCoinSummary.update({
            where: { userId: newUser.id },
            data: { totalAmount: (signupSummary.totalAmount ?? 0) + 50 },
        });
    } else {
        await prisma.referralCoinSummary.create({
            data: { userId: newUser.id, totalAmount: 50 },
        });
    }

    // 👉 Profile Completion Reward if 100%
    if (calculatedProfileCompletion === 100) {
        await prisma.coinTransaction.create({
            data: {
                userId: newUser.id,
                amount: 50,
                type: CoinType.PROFILE_COMPLETION,
                status: 'LOCKED',
            },
        });

        const profileSummary = await prisma.referralCoinSummary.findUnique({ where: { userId: newUser.id } });
        if (profileSummary) {
            await prisma.referralCoinSummary.update({
                where: { userId: newUser.id },
                data: { totalAmount: (profileSummary.totalAmount ?? 0) + 50 },
            });
        } else {
            await prisma.referralCoinSummary.create({
                data: { userId: newUser.id, totalAmount: 50 },
            });
        }
    }

    // 👉 Referral reward for referrer (if referralCode present)
    if (referralCode) {
        const referrer = await prisma.user.findFirst({ where: { referralCode } });
        if (referrer) {
            await prisma.referral.create({
                data: {
                    referrerId: referrer.id,
                    referredUserId: newUser.id,
                },
            });

            await prisma.coinTransaction.create({
                data: {
                    userId: referrer.id,
                    amount: 50,
                    type: CoinType.REFERRAL,
                    status: 'LOCKED',
                },
            });

            const referralSummary = await prisma.referralCoinSummary.findUnique({ where: { userId: referrer.id } });
            if (referralSummary) {
                await prisma.referralCoinSummary.update({
                    where: { userId: referrer.id },
                    data: { totalAmount: (referralSummary.totalAmount ?? 0) + 50 },
                });
            } else {
                await prisma.referralCoinSummary.create({
                    data: { userId: referrer.id, totalAmount: 50 },
                });
            }
        }
    }

    //  const { password: _, socialMediaPlatform: __, ...newUsers } = newUser as any;
    const newUsers = omit(newUser, ['password', 'socialMediaPlatform']);

    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(newUser.id);
    const userResponse = {
        ...newUsers,
        socialMediaPlatforms: newUser.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
        categories: userCategoriesWithSubcategories,
        countryName: newUser.countryData?.name ?? null,
        stateName: newUser.stateData?.name ?? null,
        cityName: newUser.cityData?.name ?? null,

    };


    const token = jwt.sign(
        { userId: newUser.id, email: newUser.emailAddress },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    if (loginType === 'GOOGLE' || loginType === 'APPLE') {
        await prisma.userAuthToken.upsert({
            where: { userId: newUser.id },
            update: { UserAuthToken: token },
            create: {
                userId: newUser.id,
                UserAuthToken: token,
            },
        });
    }


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
        badges: [],

    });
};






export const login = async (req: Request, res: Response): Promise<any> => {
    try {
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

        // ✅ Store token in `UserAuthToken` table (upsert = create if not exists)
        await prisma.userAuthToken.upsert({
            where: { userId: user.id },
            update: { UserAuthToken: token },
            create: {
                userId: user.id,
                UserAuthToken: token,
            },
        });


        // Build user response and replace IDs with names
        const { password: _, socialMediaPlatform: __, ...userWithoutPassword } = user as any;

        const userResponse = {
            ...userWithoutPassword,
            socialMediaPlatforms: userWithoutPassword.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
            categories: userCategoriesWithSubcategories,
            countryName: country?.name ?? null,
            stateName: state?.name ?? null,
            cityName: city?.name ?? null,

            // socialMediaPlatforms: user.socialMediaPlatforms ?? [],
        };
        const userBadges = await prisma.userBadges.findMany({
            where: { userId: user.id },
            include: {
                userBadgeTitleData: true,
            },
        });


        // Final response
        return response.success(res, 'Login successful!', {
            user: userResponse,
            token,
            badges: userBadges.map(b => b.userBadgeTitleData),
        });

    } catch (error: any) {
        return response.serverError(res, error.message || 'Login failed.');
    }
};




export const getByIdUser = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.body;
        const loginUserId = req.user?.userId; // Assuming you have the logged-in user's ID in req.user

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        // Check if the viewed user is different from the logged-in user
        if (loginUserId && loginUserId !== id) {
            const existingView = await prisma.recentView.findFirst({
                where: {
                    loginUserId,
                    recentViewUserId: id
                }
            });

            if (existingView) {
                // ✅ Update viewCount and updatedAt
                await prisma.recentView.update({
                    where: { id: existingView.id },
                    data: {
                        updatedAt: new Date(),
                        viewCount: { increment: 1 } // Will work if viewCount has a default (0)
                    }
                });
            } else {
                // ✅ Create new view entry with viewCount 1
                console.log(loginUserId, '>>>>>>>>>> loginUserId');
                await prisma.recentView.create({
                    data: {
                        loginUserId,
                        recentViewUserId: id,
                        viewCount: 1
                    }
                });
            }
        }


        // ✅ Increment total view count on user's profile
        await prisma.user.update({
            where: { id },
            data: {
                viewCount: { increment: 1 }
            }
        });



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

        const country = user.countryId
            ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } })
            : null;
        const state = user.stateId
            ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } })
            : null;
        const city = user.cityId
            ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } })
            : null;

        // Fetch user stats
        const userStats = await prisma.userStats.findFirst({
            where: { userId: user.id },
            select: {
                totalEarnings: true,
                totalExpenses: true,
                totalWithdraw: true,
                totalDeals: true,
                averageValue: true,
                repeatClient: true,
                level: true,
                onTimeDelivery: true,
            },
        });

        const formattedUserStats = userStats
            ? {
                ...userStats,
                totalEarnings: userStats.totalEarnings
                    ? Number(userStats.totalEarnings).toFixed(2)
                    : "0.00",
                totalExpenses: userStats.totalExpenses
                    ? Number(userStats.totalExpenses).toFixed(2)
                    : "0.00",
                totalWithdraw: userStats.totalWithdraw
                    ? Number(userStats.totalWithdraw).toFixed(2)
                    : "0.00",
                totalDeals: userStats.totalDeals
                    ? Number(userStats.totalDeals).toFixed(2)
                    : "0.00",
                averageValue: userStats.averageValue
                    ? Number(userStats.averageValue).toFixed(2)
                    : "0.00",
                repeatClient: userStats.repeatClient
                    ? Number(userStats.repeatClient).toFixed(2)
                    : "0.00",
                level: userStats.level
                    ? Number(userStats.level).toFixed(2)
                    : "0.00",
                onTimeDelivery: userStats.onTimeDelivery
                    ? Number(userStats.onTimeDelivery).toFixed(2)
                    : "0.00",
                netEarning: (
                    (userStats.totalEarnings?.toNumber?.() ?? 0) -
                    (userStats.totalWithdraw?.toNumber?.() ?? 0)
                ).toFixed(2),
            }
            :
            {
                totalEarnings: "0.00",
                totalExpenses: "0.00",
                totalWithdraw: "0.00",
                totalDeals: "0.00",
                averageValue: "0.00",
                repeatClient: "0.00",
                level: "0.00",
                onTimeDelivery: "0.00",
                netEarning: "0.00"
            };

        const { password: _, socialMediaPlatform: __, ...users } = user as any;

        const responseUser = {
            ...users,
            socialMediaPlatforms: users.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
            categories: userCategoriesWithSubcategories,
            countryName: country?.name ?? null,
            stateName: state?.name ?? null,
            cityName: city?.name ?? null,
            userStats: formattedUserStats,
        };

        const threeMonthsAgo = subMonths(new Date(), 3);

        const recentViews = await prisma.recentView.findMany({
            where: {
                recentViewUserId: id,
                updatedAt: {
                    gte: threeMonthsAgo,
                },
            },
            select: {
                id: true,
                loginUserId: true,
                viewCount: true,
                updatedAt: true,
                recentViewLoginUser: {
                    select: {
                        id: true,
                        name: true,
                        userImage: true,
                    },
                },
            },
        });
        const totalViewCount = await prisma.recentView.aggregate({
            where: {
                recentViewUserId: id,
                updatedAt: {
                    gte: threeMonthsAgo,
                },
            },
            _sum: {
                viewCount: true,
            },
        });

        const analytics = {
            totalViewCount: totalViewCount._sum.viewCount || 0,
            recentViews,
        };

        /******************************/

        // 1. Fetch recent views
        const recentChatViews = await prisma.recentChatView.findMany({
            where: {
                loginUserId: id, // people who viewed this user
                updatedAt: {
                    gte: threeMonthsAgo,
                },
            },
            select: {
                id: true,
                loginUserId: true,
                chatCount: true,
                updatedAt: true,
                recentChatViewLoginUser: {
                    select: {
                        id: true,
                        name: true,
                        userImage: true,
                    },
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        // 2. Aggregate total chat view count
        const totalChatViewCount = await prisma.recentChatView.aggregate({
            where: {
                loginUserId: id,
                updatedAt: {
                    gte: threeMonthsAgo,
                },
            },
            _sum: {
                chatCount: true,
            },
        });

        const analyticsChat = {
            totalChatViewCount: totalChatViewCount._sum.chatCount || 0,
            recentViews: recentChatViews.map(view => ({
                id: view.id,
                chatCount: view.chatCount,
                updatedAt: view.updatedAt,
                viewer: view.recentChatViewLoginUser, // viewer info (name, image, id)
            })),
        };

        const analyticSummary = {
            viewCountData: analytics,
            chatCountData: analyticsChat,
        };

        const transactionSum = await prisma.coinTransaction.aggregate({
            where: { userId: id },
            _sum: {
                amount: true,
            },
        });

        const totalAmount = transactionSum._sum.amount ?? 0;


        const transactions = await prisma.coinTransaction.findMany({
            where: { userId: id },
            orderBy: { createdAt: 'desc' },
        });

        const rewards = {
            count: totalAmount,
            data: transactions,
        };

        const userStatss = await prisma.userStats.findFirst({
            where: { userId: id },
            select: {
                totalEarnings: true,
                totalWithdraw: true,
                totalExpenses: true,
            },
        });

        const totalEarnings = Number(userStats?.totalEarnings ?? 0);
        const totalWithdraw = Number(userStats?.totalWithdraw ?? 0);
        const totalExpenses = Number(userStats?.totalExpenses ?? 0);
        const netEarning = totalEarnings - totalWithdraw;

        const earningsSummary = {
            totalEarnings,
            totalWithdraw,
            totalExpenses,
            netEarning,
        };
        console.log("Fetching token for userId:", id);

        const token = await prisma.userAuthToken.findUnique({
            where: { userId: loginUserId },
            select: {
                UserAuthToken: true,
            },
        });

        const userBadges = await prisma.userBadges.findMany({
            where: { userId: user.id },
            include: {
                userBadgeTitleData: true,
            },
        });

        return response.success(res, 'User fetched successfully!', {
            user: responseUser,
            token: token?.UserAuthToken,
            badges: userBadges.map(b => b.userBadgeTitleData),
            analyticSummary,
            rewards,
            earningsSummary
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
            minPrice,
            maxPrice,
            badgeType,
        } = req.body;

        const allowedPlatforms = ['INSTAGRAM', 'TWITTER', 'YOUTUBE', 'FACEBOOK'];
        const allowedGender = ['MALE', 'FEMALE', 'OTHER'];
        const allowedInfluencerTypes = ['PRO', 'NORMAL'];
        const allowedBadgeTypes = ['1', '2', '3', '4', '5', '6', '7', '8'];
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

        // Price filter (based on SocialMediaPlatform.price)
        if (minPrice || maxPrice) {
            const priceConditions: any = {};

            if (minPrice) {
                const parsedMinPrice = parseFloat(minPrice.toString());
                if (isNaN(parsedMinPrice) || parsedMinPrice < 0) {
                    return response.error(res, 'Invalid minPrice. Must be a non-negative number.');
                }
                priceConditions.gte = parsedMinPrice;
            }

            if (maxPrice) {
                const parsedMaxPrice = parseFloat(maxPrice.toString());
                if (isNaN(parsedMaxPrice) || parsedMaxPrice < 0) {
                    return response.error(res, 'Invalid maxPrice. Must be a non-negative number.');
                }
                priceConditions.lte = parsedMaxPrice;
            }

            andFilters.push({
                socialMediaPlatforms: {
                    some: {
                        price: priceConditions,
                    },
                },
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
            const types = Array.isArray(influencerType)
                ? influencerType.map((t: string) => t.toUpperCase())
                : [influencerType.toString().toUpperCase()];

            const invalidTypes = types.filter(t => !['PRO', 'NORMAL'].includes(t));
            if (invalidTypes.length > 0) {
                return response.error(res, `Invalid influencer type(s): ${invalidTypes.join(', ')}. Allowed: PRO, NORMAL`);
            }

            // Build OR logic for both PRO and NORMAL (NORMAL includes null)
            andFilters.push({
                OR: types.map(t => {
                    if (t === 'PRO') return { influencerType: 'PRO' };
                    if (t === 'NORMAL') return {
                        OR: [
                            { influencerType: 'NORMAL' },
                            { influencerType: null },
                        ],
                    };
                }),
            });
        }

        // Status filter (optional)
        if (status !== undefined) {
            if (status === 'true' || status === 'false') {
                filter.status = status === 'true';
            } else {
                return response.error(res, 'Invalid status value. Use true or false.');
            }
        }

        // Badge Type filter (NEW)
        if (badgeType) {
            const badges = Array.isArray(badgeType) ? badgeType.map(b => b.toString()) : [badgeType.toString()];
            const invalidBadges = badges.filter(b => !allowedBadgeTypes.includes(b));

            if (invalidBadges.length > 0) {
                return response.error(
                    res,
                    `Invalid badge type(s): ${invalidBadges.join(', ')}. Allowed: 1-8 (1: Verified, 2: Rising Star, 3: Top Influencer, 4: Creative Genius, 5: On-Time Pro, 6: Engagement Champion, 7: Collaboration Hero, 8: Eco-Conscious Creator)`
                );
            }

            andFilters.push({
                userBadgeData: {
                    some: {
                        userBadgeTitleData: {
                            type: { in: badges },
                        },
                    },
                },
            });
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
                const userBadges = await prisma.userBadges.findMany({
                    where: { userId: userData.id },
                    include: {
                        userBadgeTitleData: true,
                    },
                });

                return {
                    ...userData,
                    socialMediaPlatforms: userData.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
                    categories: userCategoriesWithSubcategories,
                    countryName: userData.countryData?.name ?? null,
                    stateName: userData.stateData?.name ?? null,
                    cityName: userData.cityData?.name ?? null,
                    badges: userBadges.map(b => b.userBadgeTitleData),
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
};




export const getAllUsersAndGroup = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            platform, type, countryId, stateId, cityId, status,
            subCategoryId, ratings, gender, minAge, maxAge, minPrice, maxPrice,
            badgeType, search, subtype, minViewCount, maxViewCount, page = 1, limit = 10,
        } = req.body;

        // const currentUserId = req.user?.id || req.userId; 
        //const currentUserId = '016fe38e-fe2a-4080-85b5-a3aa14b86717';
        const currentUserId = req.user?.userId;

        // console.log(req.user, '>>>>>>>>>>>>>>>currentUserId');
        const currentPage = parseInt(page.toString()) || 1;
        const itemsPerPage = parseInt(limit.toString()) || 10;
        const skip = (currentPage - 1) * itemsPerPage;

        const allowedPlatforms = ['INSTAGRAM', 'TWITTER', 'YOUTUBE', 'FACEBOOK'];
        const allowedGender = ['MALE', 'FEMALE', 'OTHER'];
        const allowedInfluencerTypes = ['PRO', 'NORMAL'];
        const allowedBadgeTypes = ['1', '2', '3', '4', '5', '6', '7', '8'];
        const allowedTypes = ["BUSINESS", "INFLUENCER"]; // allowed values for type
        const allowedSubtypes = [0, 1, 2]; // 0: all, 1: influencer only, 2: group only

        // Validate subtype parameter
        const parsedSubtype = subtype !== undefined ? parseInt(subtype.toString()) : 0;
        if (!allowedSubtypes.includes(parsedSubtype)) {
            return response.error(res, 'Invalid subtype. Allowed values: 0 (all data), 1 (influencer only), 2 (group only)');
        }

        const andFilters: any[] = [];
        const filter: any = {};

        // Exclude current logged-in user from results
        if (currentUserId) {
            filter.id = { not: currentUserId };
        }

        if (type) {
            const types = Array.isArray(type) ? type.map(t => t.toUpperCase()) : [type.toString().toUpperCase()];
            const invalidTypes = types.filter(t => !allowedTypes.includes(t));
            if (invalidTypes.length > 0) {
                return response.error(res, `Invalid type(s): ${invalidTypes.join(', ')}. Allowed: BUSINESS, INFLUENCER`);
            }

            andFilters.push({
                OR: types.map(t => ({
                    type: t,
                })),
            });
        }

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

        // Price filter (based on SocialMediaPlatform.price)
        if (minPrice || maxPrice) {
            const priceConditions: any = {};

            if (minPrice) {
                const parsedMinPrice = parseFloat(minPrice.toString());
                if (isNaN(parsedMinPrice) || parsedMinPrice < 0) {
                    return response.error(res, 'Invalid minPrice. Must be a non-negative number.');
                }
                priceConditions.gte = parsedMinPrice;
            }

            if (maxPrice) {
                const parsedMaxPrice = parseFloat(maxPrice.toString());
                if (isNaN(parsedMaxPrice) || parsedMaxPrice < 0) {
                    return response.error(res, 'Invalid maxPrice. Must be a non-negative number.');
                }
                priceConditions.lte = parsedMaxPrice;
            }

            andFilters.push({
                socialMediaPlatforms: {
                    some: {
                        price: priceConditions,
                    },
                },
            });
        }


        if (minViewCount || maxViewCount) {
            const viewCountConditions: any = {};

            if (minViewCount) {
                const parsedMinViewCount = parseInt(minViewCount.toString());
                if (isNaN(parsedMinViewCount) || parsedMinViewCount < 0) {
                    return response.error(res, 'Invalid minViewCount. Must be a non-negative number.');
                }
                viewCountConditions.gte = parsedMinViewCount;
            }

            if (maxViewCount) {
                const parsedMaxViewCount = parseInt(maxViewCount.toString());
                if (isNaN(parsedMaxViewCount) || parsedMaxViewCount < 0) {
                    return response.error(res, 'Invalid maxViewCount. Must be a non-negative number.');
                }
                viewCountConditions.lte = parsedMaxViewCount;
            }

            andFilters.push({
                socialMediaPlatforms: {
                    some: {
                        viewCount: viewCountConditions,
                    },
                },
            });
            console.log(viewCountConditions, '>>>>>>>>>>>>>>>>> andFilters');

        }

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
            if (Object.values(Role).includes(normalizedType as Role)) {
                filter.type = normalizedType as Role;
            } else {
                return response.error(res, 'Invalid user type, allowed: BUSINESS, INFLUENCER');
            }
        }

        // Badge Type filter (NEW)
        if (badgeType) {
            const badges = Array.isArray(badgeType) ? badgeType.map(b => b.toString()) : [badgeType.toString()];
            const invalidBadges = badges.filter(b => !allowedBadgeTypes.includes(b));

            if (invalidBadges.length > 0) {
                return response.error(
                    res,
                    `Invalid badge type(s): ${invalidBadges.join(', ')}. Allowed: 1-8 (1: Verified, 2: Rising Star, 3: Top Influencer, 4: Creative Genius, 5: On-Time Pro, 6: Engagement Champion, 7: Collaboration Hero, 8: Eco-Conscious Creator)`
                );
            }

            andFilters.push({
                userBadgeData: {
                    some: {
                        userBadgeTitleData: {
                            type: { in: badges },
                        },
                    },
                },
            });
        }

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

        if (status !== undefined) {
            if (status === 'true' || status === 'false') {
                const availability = (status) ? "ONLINE" : "OFFLINE";
                filter.availability = availability;

            } else {
                return response.error(res, 'Invalid status value. Use true or false.');
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


        const whereFilter: any = { ...filter };
        if (andFilters.length > 0) whereFilter.AND = andFilters;
        if (search) {
            whereFilter.name = { contains: search, mode: 'insensitive' };
        }

        // Determine what data to fetch based on subtype
        let usersResult: any = [[], 0];
        let groupsResult: any = [[], 0];

        if (parsedSubtype === 0 || parsedSubtype === 1) {
            // Fetch users (influencers) when subtype is 0 (all) or 1 (influencer only)
            usersResult = await Promise.all([
                prisma.user.findMany({
                    where: whereFilter,
                    include: {
                        // socialMediaPlatforms: true,
                        socialMediaPlatforms: {
                            select: {
                                id: true,
                                image: true,
                                userId: true,
                                platform: true,
                                userName: true,
                                followerCount: true,
                                engagementRate: true,
                                averageLikes: true,
                                averageComments: true,
                                averageShares: true,
                                price: true,
                                status: true,
                                createsAt: true,
                                updatedAt: true,
                            }
                        },
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                    orderBy: { createsAt: 'desc' },
                }),
                prisma.user.count({ where: whereFilter })
            ]);
        }
        const newgroupWhereFilter: any[] = [];
        if (parsedSubtype === 0 || parsedSubtype === 2) {
            // Fetch groups when subtype is 0 (all) or 2 (group only)
            // Also exclude groups where the current user is the admin
            const groupWhereFilter: any = {};

            // Exclude groups where current user is admin
            if (currentUserId) {
                groupWhereFilter.groupData = {
                    // none: {
                    //     adminUserId: currentUserId,

                    // }
                };
            }

            const matchedGroupIds = await prisma.groupUsersList.findMany({
                where: {
                    OR: [
                        { adminUser: { name: { contains: search || '', mode: 'insensitive' } } },
                        { invitedUser: { name: { contains: search || '', mode: 'insensitive' } } },
                    ]
                },
                select: { groupId: true }
            });

            const matchedGroupIdSet = [...new Set(matchedGroupIds.map(e => e.groupId))];

            // console.log(subCategoryId, '>>>>>>>>> subCategoryId');
            // Combine search filters with current user exclusion
            const finalGroupFilter = {
                AND: [
                    groupWhereFilter,
                    {
                        OR: [
                            { groupName: { contains: search || '', mode: 'insensitive' } },
                            { groupBio: { contains: search || '', mode: 'insensitive' } },
                            { id: { in: matchedGroupIdSet } }
                        ]
                    },
                    subCategoryId?.length
                        ? { subCategoryId: { hasSome: subCategoryId } }
                        : undefined,
                ].filter(Boolean)
            };



            if (minViewCount || maxViewCount) {
                const viewCountConditions: any = {};

                if (minViewCount) {
                    const parsedMinViewCount = parseInt(minViewCount.toString());
                    if (isNaN(parsedMinViewCount) || parsedMinViewCount < 0) {
                        return response.error(res, 'Invalid minViewCount. Must be a non-negative number.');
                    }
                    viewCountConditions.gte = parsedMinViewCount;
                }


                if (maxViewCount) {
                    const parsedMaxViewCount = parseInt(maxViewCount.toString());
                    if (isNaN(parsedMaxViewCount) || parsedMaxViewCount < 0) {
                        return response.error(res, 'Invalid maxViewCount. Must be a non-negative number.');
                    }
                    viewCountConditions.lte = parsedMaxViewCount;
                }

                newgroupWhereFilter.push({
                    groupUsersList: {
                        some: {
                            OR: [
                                {
                                    adminUser: {
                                        socialMediaPlatforms: {
                                            some: {
                                                viewCount: viewCountConditions,
                                            },
                                        },
                                    },
                                },
                                {
                                    invitedUser: {
                                        socialMediaPlatforms: {
                                            some: {
                                                viewCount: viewCountConditions,
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                });
            }

            const newfinalGroupFilter = {
                AND: [finalGroupFilter, ...newgroupWhereFilter]
            };
            groupsResult = await Promise.all([
                prisma.group.findMany({
                    where: newfinalGroupFilter,
                    include: {
                        groupData: {
                            include: {
                                groupUserData: {
                                    include: {
                                        // socialMediaPlatforms: true,
                                        socialMediaPlatforms: {
                                            select: {
                                                id: true,
                                                image: true,
                                                userId: true,
                                                platform: true,
                                                userName: true,
                                                followerCount: true,
                                                engagementRate: true,
                                                averageLikes: true,
                                                averageComments: true,
                                                averageShares: true,
                                                price: true,
                                                status: true,
                                                createsAt: true,
                                                updatedAt: true,
                                                viewCount: true
                                            }
                                        },
                                        brandData: true,
                                        countryData: true,
                                        stateData: true,
                                        cityData: true,
                                        UserDetail: true
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { createsAt: 'desc' },
                }),
                prisma.group.count({
                    where: newfinalGroupFilter
                })
            ]);
        }

        const [users, usersCount] = usersResult;
        const [groups, groupsCount] = groupsResult;
        // console.log('2222');
        const formattedUsers = await Promise.all(users.map(async (user: any) => {
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            return {
                ...user,
                socialMediaPlatforms: user.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
                categories: userCategoriesWithSubcategories,
                countryName: user.countryData?.name ?? null,
                stateName: user.stateData?.name ?? null,
                cityName: user.cityData?.name ?? null,
                groupInfo: null,
                isGroup: false
            };
        }));

        const formattedGroups = await Promise.all(groups.map(async (group: any) => {
            const subCategoriesWithCategory = group.subCategoryId?.length
                ? await prisma.subCategory.findMany({
                    where: { id: { in: group.subCategoryId } },
                    include: { categoryInformation: true }
                })
                : [];
            // console.log('33');
            const formattedGroupData = await Promise.all(
                group.groupData.map(async (groupUser: any) => {
                    const adminUser = groupUser.groupUserData;

                    // Also exclude the current user from invited users list
                    const acceptedInvites = await prisma.groupUsersList.findMany({
                        where: {
                            groupId: group.id,
                            invitedUserId: {
                                not: currentUserId // Assuming you have the current user's ID
                            },
                            requestAccept: RequestStatus.ACCEPTED,  // Only users who accepted the invitation
                            // Exclude current user from invited users
                        },
                        select: { invitedUserId: true },
                        distinct: ['invitedUserId']  // Avoid duplicates
                    });

                    // console.log(acceptedInvites, '> acceptedInvites');
                    const acceptedInvitedUserIds = acceptedInvites.map(invite => invite.invitedUserId);
                    // console.log('44 >>>>>>>>>', acceptedInvitedUserIds);
                    const invitedUsers = acceptedInvitedUserIds.length > 0
                        ? await prisma.user.findMany({
                            where: { id: { in: acceptedInvitedUserIds } },
                            include: {
                                UserDetail: true,
                                // socialMediaPlatforms: true,
                                socialMediaPlatforms: {
                                    select: {
                                        id: true,
                                        image: true,
                                        userId: true,
                                        platform: true,
                                        userName: true,
                                        followerCount: true,
                                        engagementRate: true,
                                        averageLikes: true,
                                        averageComments: true,
                                        averageShares: true,
                                        price: true,
                                        status: true,
                                        createsAt: true,
                                        updatedAt: true,
                                    }
                                },
                                brandData: true,
                                countryData: true,
                                stateData: true,
                                cityData: true,
                            },
                        })
                        : [];

                    const formattedAdminUser = adminUser ? {
                        ...adminUser,
                        categories: await getUserCategoriesWithSubcategories(adminUser.id),
                        countryName: adminUser.countryData?.name ?? null,
                        stateName: adminUser.stateData?.name ?? null,
                        cityName: adminUser.cityData?.name ?? null,
                    } : null;

                    const formattedInvitedUsers = await Promise.all(invitedUsers.map(async (user: any) => ({
                        ...user,
                        categories: await getUserCategoriesWithSubcategories(user.id),
                        countryName: user.countryData?.name ?? null,
                        stateName: user.stateData?.name ?? null,
                        cityName: user.cityData?.name ?? null,
                    })));

                    const { groupUserData, ...restGroupUser } = groupUser;
                    return {
                        ...restGroupUser,
                        adminUser: formattedAdminUser,
                        invitedUsers: formattedInvitedUsers,
                    };

                })
            );

            const adminUserData = formattedGroupData[0]?.adminUser || null;
            // console.log(adminUserData, '>>>>>>>>>>> adminUserData');
            // console.log(parsedSubtype, '>>>>>>>>>>> parsedSubtype');
            // Return different structure based on subtype
            const groupDataItem = formattedGroupData[0];
            if (parsedSubtype === 2) {
                // For subtype = 2, return group information directly
                const groupInfoData = {
                    groupImage: group.groupImage,
                    groupName: group.groupName,
                    groupBio: group.groupBio,
                    socialMediaPlatform: group.socialMediaPlatform,
                    Visibility: group.Visibility,
                }
                return {
                    ...groupInfoData,
                    ...groupDataItem,
                    subCategoryId: subCategoriesWithCategory,
                    isGroup: true
                };
            } else {
                const groupInfoData = {
                    groupImage: group.groupImage,
                    groupName: group.groupName,
                    groupBio: group.groupBio,
                    socialMediaPlatform: group.socialMediaPlatform,
                    Visibility: group.Visibility,
                }
                // For subtype = 0 or 1, return in user data structure
                return {
                    ...adminUserData,
                    isGroup: true,
                    groupInfo: {
                        ...groupInfoData,
                        ...groupDataItem,
                        subCategoryId: subCategoriesWithCategory,
                    }
                };
            }
        }));

        const allResults = [...formattedUsers, ...formattedGroups];
        const totalCount = usersCount + groupsCount;

        const paginatedResults = allResults.slice(skip, skip + itemsPerPage);

        if (paginatedResults.length === 0) {
            throw new Error("No users or groups found matching the criteria.");
        }

        return response.success(res, 'Users and groups fetched successfully!', {
            pagination: {
                total: totalCount,
                page: currentPage,
                limit: itemsPerPage,
                totalPages: Math.ceil(totalCount / itemsPerPage),
            },
            users: paginatedResults
        });

    } catch (error: any) {
        return response.error(res, error.message);
    }
};


// Helper function to format user data (if you want to extract it)
const formatUserData = async (user: any) => {
    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
    const { password: _, ...userData } = user;

    return {
        ...userData,
        categories: userCategoriesWithSubcategories,
        countryName: user.countryData?.name ?? null,
        stateName: user.stateData?.name ?? null,
        cityName: user.cityData?.name ?? null,
    };
};



// Alternative approach: Separate pagination for users and groups
export const getAllUsersAlternative = async (req: Request, res: Response): Promise<any> => {
    try {
        const { search, page = 1, limit = 10 } = req.body;
        const currentPage = parseInt(page.toString()) || 1;
        const itemsPerPage = parseInt(limit.toString()) || 10;

        // Calculate items per type (split evenly or customize as needed)
        const usersPerPage = Math.ceil(itemsPerPage / 2);
        const groupsPerPage = itemsPerPage - usersPerPage;

        const [usersData, groupsData] = await Promise.all([
            // Users with pagination
            Promise.all([
                prisma.user.findMany({
                    where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
                    skip: (currentPage - 1) * usersPerPage,
                    take: usersPerPage,
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                    orderBy: { createsAt: 'desc' },
                }),
                prisma.user.count({
                    where: search ? { name: { contains: search, mode: 'insensitive' } } : {}
                })
            ]),

            // Groups with pagination
            search ? Promise.all([
                prisma.group.findMany({
                    where: {
                        OR: [
                            { groupName: { contains: search, mode: 'insensitive' } },
                            { groupBio: { contains: search, mode: 'insensitive' } },
                        ]
                    },
                    skip: (currentPage - 1) * groupsPerPage,
                    take: groupsPerPage,
                    include: { groupData: { include: { groupUserData: true } } },
                    orderBy: { createsAt: 'desc' },
                }),
                prisma.group.count({
                    where: {
                        OR: [
                            { groupName: { contains: search, mode: 'insensitive' } },
                            { groupBio: { contains: search, mode: 'insensitive' } },
                        ]
                    }
                })
            ]) : [[], 0]
        ]);

        const [users, usersCount] = usersData;
        const [groups, groupsCount] = groupsData;

        // Format results...
        // (formatting logic same as above)

        return response.success(res, 'Results fetched successfully!', {
            pagination: {
                currentPage,
                totalUsers: usersCount,
                totalGroups: groupsCount,
                usersOnPage: users.length,
                groupsOnPage: groups.length,
            },
            users: [], // formatted users
            groups: [], // formatted groups
        });

    } catch (error: any) {
        response.error(res, error.message);
    }
};



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
            prisma.referralCoinSummary.deleteMany({
                where: { userId: id },
            }),
            prisma.referral.deleteMany({
                where: {
                    OR: [
                        { referrerId: id },
                        { referredUserId: id }
                    ]
                }
            }),
            prisma.coinTransaction.deleteMany({
                where: { userId: id },
            }),
            prisma.userAuthToken.deleteMany({
                where: { userId: id },
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
        emailAddress, password, subcategoriesId = [], stateId, cityId, countryId, brandTypeId, status, gender, referralCode, ...updatableFields
    } = userData;

    const finalUpdateData: any = {};

    if (status !== undefined) {
        finalUpdateData.status = resolveStatus(status);
    }

    if (gender !== undefined) {
        finalUpdateData.gender = gender as unknown as any;
    }

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

    Object.keys(updatableFields).forEach(key => {
        if (updatableFields[key] !== undefined) {
            finalUpdateData[key] = updatableFields[key];
        }
    });

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

        await prisma.userSubCategory.deleteMany({ where: { userId: id } });

        await prisma.userSubCategory.createMany({
            data: validIds.map(subCategoryId => ({
                userId: id,
                subCategoryId
            })),
            skipDuplicates: true
        });
    } else {
        updatedSubcategories = existingUser.subCategories.map(sc => sc.subCategory.id);
    }

    try {
        const profileCompletionData = {
            ...existingUser,
            ...userData,
            subcategoriesId: updatedSubcategories
        };


        let calculatedProfileCompletion = 0;

        if (existingUser.type === UserType.INFLUENCER) {
            const userSubCategories = (updatedSubcategories || []).map((id: string) => ({
                subCategoryId: id
            }));

            calculatedProfileCompletion = calculateProfileCompletion({
                ...profileCompletionData,
                userSubCategories,
            });
        } else {
            calculatedProfileCompletion = calculateBusinessProfileCompletion(profileCompletionData, existingUser.loginType);
        }



        finalUpdateData.profileCompletion = calculatedProfileCompletion;

        // 👉 If profile is 100% complete, add PROFILE_COMPLETE reward (LOCKED)
        if (calculatedProfileCompletion === 100) {
            await prisma.coinTransaction.create({
                data: {
                    userId: existingUser.id,
                    amount: 50,
                    type: CoinType.PROFILE_COMPLETION,
                    status: 'LOCKED',
                },
            });

            const profileSummary = await prisma.referralCoinSummary.findUnique({
                where: { userId: existingUser.id },
            });

            if (profileSummary) {
                await prisma.referralCoinSummary.update({
                    where: { userId: existingUser.id },
                    data: { totalAmount: (profileSummary.totalAmount ?? 0) + 50 },
                });
            } else {
                await prisma.referralCoinSummary.create({
                    data: { userId: existingUser.id, totalAmount: 50 },
                });
            }
        }



        const token = req.headers.authorization?.split(' ')[1] || req.token;

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

        const country = editedUser.countryId ? await prisma.country.findUnique({ where: { id: editedUser.countryId }, select: { name: true } }) : null;
        const state = editedUser.stateId ? await prisma.state.findUnique({ where: { id: editedUser.stateId }, select: { name: true } }) : null;
        const city = editedUser.cityId ? await prisma.city.findUnique({ where: { id: editedUser.cityId }, select: { name: true } }) : null;

        const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(editedUser.id);

        const newUsers = omit(editedUser, ['password', 'socialMediaPlatform']);
        const userResponse = {
            ...newUsers,
            socialMediaPlatforms: newUsers.socialMediaPlatforms.map(({ viewCount, ...rest }) => rest),
            categories: userCategoriesWithSubcategories,
            countryName: country?.name ?? null,
            stateName: state?.name ?? null,
            cityName: city?.name ?? null,
        };

        const userBadges = await prisma.userBadges.findMany({
            where: { userId: newUsers.id },
            include: {
                userBadgeTitleData: true,
            },
        });

        return response.success(res, 'User profile updated successfully!', {
            user: userResponse,
            token,
            badges: userBadges.map(b => b.userBadgeTitleData),
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
        const loginUserId = req.user?.id;

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

        if (loginUserId && loginUserId !== id) {
            const existingView = await prisma.recentView.findFirst({
                where: {
                    loginUserId,
                    recentViewUserId: id,
                },
            });

            if (existingView) {
                // increment existing viewCount
                await prisma.recentView.update({
                    where: { id: existingView.id },
                    data: {
                        viewCount: { increment: 1 },
                        updatedAt: new Date(),
                    },
                });
            } else {
                // create new RecentView
                await prisma.recentView.create({
                    data: {
                        loginUserId,
                        recentViewUserId: id,
                        viewCount: 1,
                    },
                });
            }
        }


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

        // Find user by socialId (include socialMediaPlatforms for response)
        let user = await prisma.user.findFirst({
            where: { socialId },
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            },
        });

        // If user doesn't exist, create one
        if (!user) {
            if (emailAddress) {
                const existingEmailUser = await prisma.user.findUnique({ where: { emailAddress } });
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
                    type: 'INFLUENCER',
                    status: true,
                    profileCompletion: 0,
                },
                include: {
                    socialMediaPlatforms: true,
                    brandData: true,
                    countryData: true,
                    stateData: true,
                    cityData: true,
                },
            });
        }

        // Token handling (optional)
        const token = jwt.sign(
            { userId: user.id, email: user.emailAddress },
            process.env.JWT_SECRET || 'default_secret',
            { expiresIn: '7d' }
        );

        // Get formatted user categories
        const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

        // Format user object
        const { password, socialMediaPlatforms, ...userWithoutSensitive } = user as any;

        const userResponse = {
            ...userWithoutSensitive,
            countryName: user.countryData?.name || null,
            stateName: user.stateData?.name || null,
            cityName: user.cityData?.name || null,
            categories: userCategoriesWithSubcategories,
        };



        return response.success(res, 'Social login successful!', {
            user: userResponse,
            token,
        });

    } catch (error: any) {
        console.error('Social login error:', error);
        return response.error(res, error.message || 'Social login failed.');
    }
};

