import { chatViewCount } from './dashboard.controller';
import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { IUser } from '../interfaces/user.interface';
import * as bcrypt from 'bcryptjs';
import { UserType, Gender, LoginType, AvailabilityType, PaymentStatus } from '../enums/userType.enum';
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
import { paymentRefund } from "../utils/commonFunction";



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
            const month = parseInt(match[2]) - 1;
            const year = parseInt(match[3]);
            const date = new Date(year, month, day);
            return date;
        }
    } else if (regexYYYYMMDD.test(birthDate)) {
        return new Date(birthDate);
    }
    return null;
};


// export const signup = async (req: Request, res: Response): Promise<any> => {
//     const {
//         socialMediaPlatform = [],
//         password,
//         emailAddress,
//         countryId,
//         brandTypeId,
//         cityId,
//         stateId,
//         birthDate,
//         loginType = LoginType.NONE,
//         availability = AvailabilityType,
//         referralCode,
//         subcategoriesId = [],
//         ...userFields
//     } = req.body;

//     const normalizedLoginType =
//         loginType === null || loginType === 'NULL' || loginType === undefined
//             ? LoginType.NONE
//             : loginType;

//     if (!emailAddress) return response.error(res, 'Email is required.');
//     if (normalizedLoginType === LoginType.NONE && !password) {
//         return response.error(res, 'Password is required for email-password signup.');
//     }

//     const existingUser = await prisma.user.findUnique({ where: { emailAddress } });
//     if (existingUser) {
//         const message =
//             existingUser.loginType === 'NONE'
//                 ? 'Email already registered with email & password.'
//                 : `Email already registered via ${existingUser.loginType}.`;


//         return response.error(res, message);
//     }

//     const hashedPassword = normalizedLoginType === LoginType.NONE ? await bcrypt.hash(password, 10) : undefined;
//     const formattedBirthDate = birthDate ? formatBirthDate(birthDate) : null;
//     if (birthDate && !formattedBirthDate) {
//         return response.error(res, 'Invalid birthDate format. Allowed formats: DD/MM/YYYY or YYYY/MM/DD');
//     }

//     if (stateId) {
//         const state = await prisma.state.findUnique({ where: { id: stateId } });
//         if (!state) return response.error(res, 'Invalid stateId');
//         if (state.countryId !== countryId) return response.error(res, 'State does not belong to provided country');
//     }

//     if (cityId) {
//         const city = await prisma.city.findUnique({ where: { id: cityId } });
//         if (!city) return response.error(res, 'Invalid cityId');
//         if (city.stateId !== stateId) return response.error(res, 'City does not belong to provided State');
//     }


//     let calculatedProfileCompletion = 0;

//     if (req.body.type === UserType.INFLUENCER) {
//         const userSubCategories = (req.body.subcategoriesId || []).map((id: string) => ({
//             subCategoryId: id
//         }));

//         calculatedProfileCompletion = calculateProfileCompletion({
//             ...req.body,
//             userSubCategories,
//             socialMediaPlatform: socialMediaPlatform,
//             socialMediaPlatformData: socialMediaPlatform,
//         });
//     } else {
//         calculatedProfileCompletion = calculateBusinessProfileCompletion(req.body, loginType);
//     }


//     const status = resolveStatus(userFields.status);
//     const gender = (userFields.gender ?? Gender.MALE) as any;

//     const newUser = await prisma.user.create({
//         data: {
//             ...userFields,
//             password: hashedPassword ?? 'null',
//             emailAddress,
//             status,
//             gender,
//             birthDate: formattedBirthDate,
//             loginType: normalizedLoginType,
//             availability,
//             profileCompletion: calculatedProfileCompletion,
//             type: userFields.type ?? UserType.BUSINESS,
//             referralCode: generateUniqueReferralCode(userFields.name ?? 'USER'),
//             ...(countryId && { countryData: { connect: { id: countryId } } }),
//             ...(stateId && { stateData: { connect: { id: stateId } } }),
//             ...(cityId && { cityData: { connect: { id: cityId } } }),
//             ...(brandTypeId && { brandData: { connect: { id: brandTypeId } } }),
//             socialMediaPlatforms: {
//                 create: socialMediaPlatform.map((platform: any) => ({
//                     platform: platform.platform,
//                     userName: platform.userName,
//                     image: platform.image,
//                     followerCount: platform.followerCount,
//                     engagementRate: platform.engagementRate,
//                     averageLikes: platform.averageLikes,
//                     averageComments: platform.averageComments,
//                     averageShares: platform.averageShares,
//                     viewCount: platform.viewCount,
//                     price: platform.price,
//                     status: platform.status,
//                 })),
//             },
//         },
//         include: {
//             socialMediaPlatforms: true,
//             brandData: true,
//             countryData: true,
//             stateData: true,
//             cityData: true,

//         },
//     });

//     await prisma.userDetail.create({
//         data: {
//             userId: newUser.id,
//             name: userFields.name || '', // fallback if name is optional
//             image: userFields.userImage || '', // or wherever the image comes from
//         }
//     });

//     //Create UserSubCategory relations if any
//     if (Array.isArray(subcategoriesId) && subcategoriesId.length > 0) {
//         const validSubCategories = await prisma.subCategory.findMany({
//             where: { id: { in: subcategoriesId } },
//             include: { categoryInformation: true },
//         });

//         const validIds = validSubCategories.map((sub) => sub.id);
//         const invalidIds = subcategoriesId.filter((id) => !validIds.includes(id));
//         if (invalidIds.length > 0) {
//             return response.error(res, `Invalid subCategoryId(s): ${invalidIds.join(', ')}`);
//         }

//         await prisma.userSubCategory.createMany({
//             data: validSubCategories.map((sub) => ({
//                 userId: newUser.id,
//                 subCategoryId: sub.id,
//                 categoryId: sub.categoryId,
//             })),
//             skipDuplicates: true,
//         });
//     }

//     // Signup Reward: create CoinTransaction + update ReferralCoinSummary
//     await prisma.coinTransaction.create({
//         data: {
//             userId: newUser.id,
//             amount: 50,
//             type: CoinType.SIGNUP,
//             status: 'LOCKED',
//         },
//     });

//     if (socialMediaPlatform.length >= 2) {
//         const badge = await prisma.badges.findFirst({
//             where: { type: '1' },
//             select: { id: true },
//         });

//         if (badge) {
//             await prisma.userBadges.create({
//                 data: {
//                     userId: newUser.id,
//                     badgeId: badge.id,
//                 },
//             });
//         }
//     }

//     const signupSummary = await prisma.referralCoinSummary.findUnique({ where: { userId: newUser.id } });
//     if (signupSummary) {
//         await prisma.referralCoinSummary.update({
//             where: { userId: newUser.id },
//             data: { totalAmount: (Number(signupSummary.totalAmount) || 0) + 50, },

//         });
//     } else {
//         await prisma.referralCoinSummary.create({
//             data: { userId: newUser.id, totalAmount: 50 },
//         });
//     }

//     //  Profile Completion Reward if 100%
//     if (calculatedProfileCompletion === 100) {
//         await prisma.coinTransaction.create({
//             data: {
//                 userId: newUser.id,
//                 amount: 50,
//                 type: CoinType.PROFILE_COMPLETION,
//                 status: 'LOCKED',
//             },
//         });

//         const profileSummary = await prisma.referralCoinSummary.findUnique({ where: { userId: newUser.id } });
//         if (profileSummary) {
//             await prisma.referralCoinSummary.update({
//                 where: { userId: newUser.id },
//                 data: { totalAmount: (Number(profileSummary.totalAmount) || 0) + 50, },
//             });
//         } else {
//             await prisma.referralCoinSummary.create({
//                 data: { userId: newUser.id, totalAmount: 50 },
//             });
//         }
//     }

//     // Referral reward for referrer (if referralCode present)
//     if (referralCode) {
//         const referrer = await prisma.user.findFirst({ where: { referralCode, status: true } });
//         if (referrer) {
//             await prisma.referral.create({
//                 data: {
//                     referrerId: referrer.id,
//                     referredUserId: newUser.id,
//                 },
//             });

//             await prisma.coinTransaction.create({
//                 data: {
//                     userId: referrer.id,
//                     amount: 50,
//                     type: CoinType.REFERRAL,
//                     status: 'LOCKED',
//                 },
//             });

//             const referralSummary = await prisma.referralCoinSummary.findUnique({ where: { userId: referrer.id } });
//             if (referralSummary) {
//                 await prisma.referralCoinSummary.update({
//                     where: { userId: referrer.id },
//                     data: { totalAmount: (Number(referralSummary.totalAmount) || 0) + 50, },
//                 });
//             } else {
//                 await prisma.referralCoinSummary.create({
//                     data: { userId: referrer.id, totalAmount: 50 },
//                 });
//             }
//         }
//     }

//     const newUsers = omit(newUser, ['password', 'socialMediaPlatform']);

//     const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(newUser.id);
//     const userResponse = {
//         ...newUsers,
//         categories: userCategoriesWithSubcategories,
//         countryName: newUser.countryData?.name ?? null,
//         stateName: newUser.stateData?.name ?? null,
//         cityName: newUser.cityData?.name ?? null,
//     };

//     const token = jwt.sign(
//         { userId: newUser.id, email: newUser.emailAddress },
//         JWT_SECRET,
//         { expiresIn: '7d' }
//     );

//     if (loginType === 'GOOGLE' || loginType === 'APPLE') {
//         await prisma.userAuthToken.upsert({
//             where: { userId: newUser.id },
//             update: { UserAuthToken: token },
//             create: {
//                 userId: newUser.id,
//                 UserAuthToken: token,
//             },
//         });
//     }

//     const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     const expireAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins from now

//     const existingOtp = await prisma.otpVerify.findFirst({
//         where: { emailAddress, otpType: 'SIGNUP' },
//     });

//     if (existingOtp) {
//         await prisma.otpVerify.update({
//             where: { id: existingOtp.id },
//             data: {
//                 otp,
//                 expireAt,
//                 verified: false,
//                 countMail: (existingOtp.countMail || 0) + 1,
//                 updatedAt: new Date(),
//             },
//         });
//     } else {
//         await prisma.otpVerify.create({
//             data: {
//                 emailAddress,
//                 otp,
//                 expireAt,
//                 verified: false,
//                 otpType: 'SIGNUP',
//                 countMail: 1,
//                 updatedAt: new Date(),
//             },
//         });
//     }
//     const resend = new Resend('re_FKsFJzvk_4L1x2111AwnSDMqGCYGsLJeH');

//     const user = await prisma.user.findUnique({
//         where: { emailAddress },
//         select: { name: true, status: true },
//     });

//     const htmlContent = `
//     <p>Hello ${user?.name || emailAddress},</p>
//     <p>Welcome to <strong>KringP</strong>! Thank you for signing up.</p>
//     <p>To verify your email address and complete your registration, please use the following One-Time Password (OTP):</p>
//     <p>Your OTP is: <strong>${otp}</strong></p>
//     <p>This OTP is valid for a limited time. Please do not share it with anyone for security reasons.</p>
//     <p>If you did not initiate this registration, please ignore this email.</p>
//   `;

//     const sendEmail = await resend.emails.send({
//         from: 'KringP <info@kringp.com>',
//         to: emailAddress,
//         subject: 'Hello from KringP',
//         html: htmlContent,
//     });

//     return response.success(res, 'Sign Up successful!', {
//         user: userResponse,
//         token,
//         badges: [],

//     });
// };


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

    // Check if user exists and has active status
    if (existingUser && existingUser.status === true) {
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
            socialMediaPlatform: socialMediaPlatform,
            socialMediaPlatformData: socialMediaPlatform,
        });
    } else {
        calculatedProfileCompletion = calculateBusinessProfileCompletion(req.body, loginType);
    }

    const status = resolveStatus(userFields.status);
    const gender = (userFields.gender ?? Gender.MALE) as any;

    let newUser;
    const isReSignup = existingUser && existingUser.status === false;

    if (isReSignup) {
        // Re-signup: Update existing user
        await prisma.$transaction(async (tx) => {
            // Update user data
            newUser = await tx.user.update({
                where: { id: existingUser.id },
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
                    updatedAt: new Date(),
                    ...(countryId && { countryData: { connect: { id: countryId } } }),
                    ...(stateId && { stateData: { connect: { id: stateId } } }),
                    ...(cityId && { cityData: { connect: { id: cityId } } }),
                    ...(brandTypeId && { brandData: { connect: { id: brandTypeId } } }),
                },
                include: {
                    socialMediaPlatforms: true,
                    brandData: true,
                    countryData: true,
                    stateData: true,
                    cityData: true,
                },
            });

            // Delete existing social media platforms and create new ones
            await tx.socialMediaPlatform.deleteMany({
                where: { userId: existingUser.id }
            });

            if (socialMediaPlatform.length > 0) {
                await tx.socialMediaPlatform.createMany({
                    data: socialMediaPlatform.map((platform: any) => ({
                        userId: existingUser.id,
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
                });
            }

            // Update user details
            const existingUserDetail = await tx.userDetail.findFirst({
                where: { userId: existingUser.id }
            });

            if (existingUserDetail) {
                await tx.userDetail.update({
                    where: { id: existingUserDetail.id },
                    data: {
                        name: userFields.name || '',
                        image: userFields.userImage || '',
                    }
                });
            } else {
                await tx.userDetail.create({
                    data: {
                        userId: existingUser.id,
                        name: userFields.name || '',
                        image: userFields.userImage || '',
                    }
                });
            }

            // Delete existing user subcategories and create new ones
            await tx.userSubCategory.deleteMany({
                where: { userId: existingUser.id }
            });

            if (Array.isArray(subcategoriesId) && subcategoriesId.length > 0) {
                const validSubCategories = await tx.subCategory.findMany({
                    where: { id: { in: subcategoriesId } },
                    include: { categoryInformation: true },
                });

                const validIds = validSubCategories.map((sub) => sub.id);
                const invalidIds = subcategoriesId.filter((id) => !validIds.includes(id));
                if (invalidIds.length > 0) {
                    throw new Error(`Invalid subCategoryId(s): ${invalidIds.join(', ')}`);
                }

                await tx.userSubCategory.createMany({
                    data: validSubCategories.map((sub) => ({
                        userId: existingUser.id,
                        subCategoryId: sub.id,
                        categoryId: sub.categoryId,
                    })),
                    skipDuplicates: true,
                });
            }

            // Clear existing coin transactions (except orders-related ones)
            await tx.coinTransaction.deleteMany({
                where: {
                    userId: existingUser.id,
                    type: { in: [CoinType.SIGNUP, CoinType.PROFILE_COMPLETION, CoinType.REFERRAL] }
                }
            });

            // Clear existing referral coin summary
            await tx.referralCoinSummary.deleteMany({
                where: { userId: existingUser.id }
            });

            // Clear existing referrals where user was referred
            await tx.referral.deleteMany({
                where: { referredUserId: existingUser.id }
            });

            // Clear existing user badges
            await tx.userBadges.deleteMany({
                where: { userId: existingUser.id }
            });

            // Clear existing auth tokens
            await tx.userAuthToken.deleteMany({
                where: { userId: existingUser.id }
            });

            // Clear existing OTP records
            await tx.otpVerify.deleteMany({
                where: { emailAddress: emailAddress }
            });
        });
    } else {
        // New signup: Create new user
        newUser = await prisma.user.create({
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

        await prisma.userDetail.create({
            data: {
                userId: newUser.id,
                name: userFields.name || '',
                image: userFields.userImage || '',
            }
        });

        // Create UserSubCategory relations if any
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
    }

    // Common logic for both new signup and re-signup
    // Signup Reward: create CoinTransaction + update ReferralCoinSummary
    await prisma.coinTransaction.create({
        data: {
            userId: newUser.id,
            amount: 50,
            type: CoinType.SIGNUP,
            status: 'UNLOCKED',
        },
    });

    if (socialMediaPlatform.length >= 2) {
        const badge = await prisma.badges.findFirst({
            where: { type: '1' },
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
            data: { totalAmount: (Number(signupSummary.totalAmount) || 0) + 50, },
        });
    } else {
        await prisma.referralCoinSummary.create({
            data: { userId: newUser.id, totalAmount: 50 },
        });
    }

    // Profile Completion Reward if 100%
    if (calculatedProfileCompletion === 100) {
        await prisma.coinTransaction.create({
            data: {
                userId: newUser.id,
                amount: 50,
                type: CoinType.PROFILE_COMPLETION,
                status: 'UNLOCKED',
            },
        });

        const profileSummary = await prisma.referralCoinSummary.findUnique({ where: { userId: newUser.id } });
        if (profileSummary) {
            await prisma.referralCoinSummary.update({
                where: { userId: newUser.id },
                data: { totalAmount: (Number(profileSummary.totalAmount) || 0) + 50, },
            });
        } else {
            await prisma.referralCoinSummary.create({
                data: { userId: newUser.id, totalAmount: 50 },
            });
        }
    }

    // Referral reward for referrer (if referralCode present)
    if (referralCode) {
        const referrer = await prisma.user.findFirst({ where: { referralCode, status: true } });
        if (referrer) {
            await prisma.referral.create({
                data: {
                    referrerId: referrer.id,
                    referredUserId: newUser.id,
                },
            });

            // await prisma.coinTransaction.create({
            //     data: {
            //         userId: referrer.id,
            //         amount: 50,
            //         type: CoinType.REFERRAL,
            //         status: 'LOCKED',
            //     },
            // });

            // const referralSummary = await prisma.referralCoinSummary.findUnique({ where: { userId: referrer.id } });
            // if (referralSummary) {
            //     await prisma.referralCoinSummary.update({
            //         where: { userId: referrer.id },
            //         data: { totalAmount: (Number(referralSummary.totalAmount) || 0) + 50, },
            //     });
            // } else {
            //     await prisma.referralCoinSummary.create({
            //         data: { userId: referrer.id, totalAmount: 50 },
            //     });
            // }
            // Create coin transaction (status: LOCKED)
            await prisma.coinTransaction.create({
                data: {
                    userId: referrer.id,
                    amount: 50,
                    type: CoinType.REFERRAL,
                    status: 'LOCKED', // or use enum if defined
                },
            });

            // Do NOT update referralCoinSummary if the transaction is LOCKED
            if ('LOCKED' !== 'LOCKED') {  // <-- This condition always false, so skip
                const referralSummary = await prisma.referralCoinSummary.findUnique({
                    where: { userId: referrer.id },
                });

                if (referralSummary) {
                    await prisma.referralCoinSummary.update({
                        where: { userId: referrer.id },
                        data: {
                            totalAmount: (Number(referralSummary.totalAmount) || 0) + 50,
                        },
                    });
                } else {
                    await prisma.referralCoinSummary.create({
                        data: {
                            userId: referrer.id,
                            totalAmount: 50,
                        },
                    });
                }
            }

        }
    }

    const newUsers = omit(newUser, ['password', 'socialMediaPlatform']);

    const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(newUser.id);
    const userResponse = {
        ...newUsers,
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

    const isThirdPartyLogin = loginType === 'GOOGLE' || loginType === 'APPLE';
    const verifiedStatus = isThirdPartyLogin ? true : false;

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
        select: { name: true, status: true },
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

    const successMessage = isReSignup ? 'Re-signup successful!' : 'Sign Up successful!';

    return response.success(res, successMessage, {
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
            where: { emailAddress, status: true },
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
                where: { id: user.id, status: true },
                data: { fcmToken },
            });
        }

        const country = user.countryId ? await prisma.country.findUnique({ where: { id: user.countryId }, select: { name: true } }) : null;
        const state = user.stateId ? await prisma.state.findUnique({ where: { id: user.stateId }, select: { name: true } }) : null;
        const city = user.cityId ? await prisma.city.findUnique({ where: { id: user.cityId }, select: { name: true } }) : null;

        // Get user categories
        const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

        const token = jwt.sign(
            { userId: user.id, email: user.emailAddress },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        await prisma.userAuthToken.upsert({
            where: { userId: user.id },
            update: { UserAuthToken: token },
            create: {
                userId: user.id,
                UserAuthToken: token,
            },
        });

        const { password: _, socialMediaPlatform: __, ...userWithoutPassword } = user as any;

        const userResponse = {
            ...userWithoutPassword,
            categories: userCategoriesWithSubcategories,
            countryName: country?.name ?? null,
            stateName: state?.name ?? null,
            cityName: city?.name ?? null,
        };
        const userBadges = await prisma.userBadges.findMany({
            where: { userId: user.id },
            include: {
                userBadgeTitleData: true,
            },
        });

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
        const loginUserId = req.user?.userId;

        if (!isUuid(id)) {
            return response.error(res, 'Invalid UUID format');
        }

        if (loginUserId && loginUserId !== id) {
            const existingView = await prisma.recentView.findFirst({
                where: {
                    loginUserId,
                    recentViewUserId: id
                }
            });

            if (existingView) {
                await prisma.recentView.update({
                    where: { id: existingView.id },
                    data: {
                        updatedAt: new Date(),
                        viewCount: { increment: 1 }
                    }
                });
            } else {
                await prisma.recentView.create({
                    data: {
                        loginUserId,
                        recentViewUserId: id,
                        viewCount: 1
                    }
                });
            }
        }

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
                    ? Number(userStats.totalDeals)
                    : 0,
                averageValue: userStats.averageValue
                    ? Number(userStats.averageValue).toFixed(2)
                    : "0.00",
                repeatClient: userStats.repeatClient
                    ? Number(userStats.repeatClient)
                    : 0,
                level: userStats.level
                    ? Number(userStats.level)
                    : 0,
                onTimeDelivery: userStats.onTimeDelivery
                    ? Number(userStats.onTimeDelivery)
                    : 0,
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
                totalDeals: 0,
                averageValue: "0.00",
                repeatClient: 0,
                level: 0,
                onTimeDelivery: 0,
                netEarning: "0.00"
            };

        const { password: _, socialMediaPlatform: __, ...users } = user as any;

        const responseUser = {
            ...users,
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

        // 1. Fetch recent views
        const recentChatViews = await prisma.recentChatView.findMany({
            where: {
                loginUserId: id,
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
                viewer: view.recentChatViewLoginUser,
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
            platform, type, countryId, stateId, cityId, influencerType, status, subCategoryId, ratings, gender, minAge, maxAge, minPrice, maxPrice, badgeType = [],
        } = req.body;

        const allowedPlatforms = ['INSTAGRAM', 'TWITTER', 'YOUTUBE', 'FACEBOOK'];
        const allowedGender = ['MALE', 'FEMALE', 'OTHER'];
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
                const ratingValues = ratings.map(r => parseInt(r.toString())).filter(r => !isNaN(r) && r >= 0);
                if (ratingValues.length === 0) {
                    return response.error(res, 'Invalid ratings array. All values must be non-negative numbers.');
                }
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
        if (badgeType.length != 0) {
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

        // const whereFilter: any = { ...filter, status: true, };
        const whereFilter: any = {
            ...filter,
            status: true,
            userData: {
                some: {
                    verified: true,
                }
            },
        };
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
            badgeType = [], search, subtype, minViewCount, maxViewCount, page, limit,
        } = req.body;

        const currentUserId = req.user?.userId;

        const currentPage = parseInt(page.toString()) || 1;
        const itemsPerPage = parseInt(limit.toString()) || 10;
        const skip = (currentPage - 1) * itemsPerPage;

        const allowedPlatforms = ['INSTAGRAM', 'TWITTER', 'YOUTUBE', 'FACEBOOK'];
        const allowedGender = ['MALE', 'FEMALE', 'OTHER'];
        const allowedBadgeTypes = ['1', '2', '3', '4', '5', '6', '7', '8'];
        const allowedTypes = ["BUSINESS", "INFLUENCER"];
        const allowedSubtypes = [0, 1, 2];

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
        if (badgeType.length != 0) {
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
            if (status === 'true' || status === true) {
                filter.availability = "ONLINE";
            } else if (status === 'false' || status === false) {
                filter.availability = "OFFLINE";
            } else if (status !== undefined) {
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


        // const whereFilter: any = { ...filter, status: true, };
        const whereFilter: any = {
            ...filter,
            status: true,
            userData: {
                some: {
                    verified: true,
                }
            },
        };
        if (andFilters.length > 0) whereFilter.AND = andFilters;
        if (search) {
            whereFilter.name = { startsWith: search, mode: 'insensitive' };
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
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    },
                    // orderBy: { createsAt: 'desc' },
                    orderBy: { ratings: 'desc', }
                }),
                prisma.user.count({ where: whereFilter })
            ]);
        }

        const newgroupWhereFilter: any[] = [];
        if (parsedSubtype === 0 || parsedSubtype === 2) {
            // Fetch groups when subtype is 0 (all) or 2 (group only)
            const groupWhereFilter: any = {};

            // Exclude groups where current user is admin
            if (currentUserId) {
                groupWhereFilter.groupData = {

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
                                        socialMediaPlatforms: true,
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



        const formattedUsers = await Promise.all(users.map(async (user: any) => {
            const usersBadges = await prisma.userBadges.findMany({
                where: { userId: user.id },
                include: {
                    userBadgeTitleData: true,
                },
            });
            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);
            return {
                ...user,
                categories: userCategoriesWithSubcategories,
                countryName: user.countryData?.name ?? null,
                stateName: user.stateData?.name ?? null,
                cityName: user.cityData?.name ?? null,
                badges: usersBadges.map(b => b.userBadgeTitleData),
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
            const formattedGroupData = await Promise.all(
                group.groupData.map(async (groupUser: any) => {
                    const adminUser = groupUser.groupUserData;

                    // Also exclude the current user from invited users list
                    const acceptedInvites = await prisma.groupUsersList.findMany({
                        where: {
                            groupId: group.id,
                            invitedUserId: {
                                not: currentUserId
                            },
                            requestAccept: RequestStatus.ACCEPTED,
                        },
                        select: { invitedUserId: true },
                        distinct: ['invitedUserId']  // Avoid duplicates
                    });

                    const acceptedInvitedUserIds = acceptedInvites.map(invite => invite.invitedUserId);
                    const invitedUsers = acceptedInvitedUserIds.length > 0
                        ? await prisma.user.findMany({
                            where: { id: { in: acceptedInvitedUserIds } },
                            include: {
                                UserDetail: true,
                                socialMediaPlatforms: true,
                                brandData: true,
                                countryData: true,
                                stateData: true,
                                cityData: true,
                            },
                        })
                        : [];

                    const adminBadges = await prisma.userBadges.findMany({
                        where: { userId: adminUser.id },
                        include: {
                            userBadgeTitleData: true,
                        },
                    });

                    const formattedAdminUser = adminUser ? {
                        ...adminUser,
                        categories: await getUserCategoriesWithSubcategories(adminUser.id),
                        countryName: adminUser.countryData?.name ?? null,
                        stateName: adminUser.stateData?.name ?? null,
                        cityName: adminUser.cityData?.name ?? null,
                        badges: adminBadges.map(b => b.userBadgeTitleData),
                    } : null;

                    const influencerBadges = await prisma.userBadges.findMany({
                        where: { userId: adminUser.id },
                        include: {
                            userBadgeTitleData: true,
                        },
                    });

                    const formattedInvitedUsers = await Promise.all(invitedUsers.map(async (user: any) => ({
                        ...user,
                        categories: await getUserCategoriesWithSubcategories(user.id),
                        countryName: user.countryData?.name ?? null,
                        stateName: user.stateData?.name ?? null,
                        cityName: user.cityData?.name ?? null,
                        badges: influencerBadges.map(b => b.userBadgeTitleData),
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
            const groupDataItem = formattedGroupData[0];

            const groupInfoData = {
                groupImage: group.groupImage,
                groupName: group.groupName,
                groupBio: group.groupBio,
                socialMediaPlatform: group.socialMediaPlatform,
                Visibility: group.Visibility,
            }

            // For both subtype = 0 and 2, return in user data structure with isGroup = true
            return {
                ...adminUserData,
                isGroup: true,
                groupInfo: {
                    ...groupInfoData,
                    ...groupDataItem,
                    subCategoryId: subCategoriesWithCategory,
                }
            };
        }));



        const allResults = [...formattedUsers, ...formattedGroups];
        const totalCount = usersCount + groupsCount;

        const paginatedResults = allResults.slice(skip, skip + itemsPerPage);

        const sortedResults = [...paginatedResults].sort((a, b) => b.ratings - a.ratings);

        if (sortedResults.length === 0) {
            throw new Error("No users or groups found matching the criteria.");
        }

        return response.success(res, 'Users and groups fetched successfully!', {
            pagination: {
                total: totalCount,
                page: currentPage,
                limit: itemsPerPage,
                totalPages: Math.ceil(totalCount / itemsPerPage),
            },
            users: sortedResults
        });
    } catch (error: any) {
        return response.error(res, error.message);
    }
};





export const deleteUser = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.body;

        if (!id || !isUuid(id)) {
            response.error(res, 'Invalid or missing UUID format');
            return;
        }

        // Check if user exists
        const nextAdminEntry = await prisma.groupUsers.findMany({
            where: {
                userId: id,
                status: true
            },
            orderBy: { updatedAt: 'asc' },
        });

        if (nextAdminEntry.length > 0) {
            for (const groupData of nextAdminEntry) {
                if (groupData.invitedUserId.length > 0) {
                    // Check if any invited user has ACCEPTED status
                    const acceptedGroupUser = await prisma.groupUsersList.findFirst({
                        where: {
                            groupId: groupData.groupId,
                            groupUserId: groupData.id,
                            adminUserId: groupData.userId,
                            requestAccept: "ACCEPTED"
                        },
                        orderBy: { updatedAt: 'asc' },
                    });
                    console.log(acceptedGroupUser, " >>>>> acceptedGroupUser");
                    if (acceptedGroupUser !== null) {
                        // Transfer admin rights to the accepted user
                        const updateUserId = acceptedGroupUser.invitedUserId;
                        const filtered = groupData.invitedUserId.filter(id => id !== updateUserId);
                        console.log(filtered, "Filtered invitedUserId list");

                        // Update admin in groupUsersList
                        await prisma.groupUsersList.updateMany({
                            where: {
                                groupId: groupData.groupId,
                                groupUserId: groupData.id,
                            },
                            data: {
                                adminUserId: acceptedGroupUser.invitedUserId
                            }
                        });

                        // Update group user with new admin
                        await prisma.groupUsers.updateMany({
                            where: {
                                id: groupData.id,
                            },
                            data: {
                                userId: acceptedGroupUser.invitedUserId,
                                invitedUserId: filtered
                            }
                        });

                        await prisma.groupUsersList.deleteMany({
                            where: {
                                groupId: groupData.groupId,
                                groupUserId: groupData.id,
                                invitedUserId: acceptedGroupUser.invitedUserId,
                            },
                        });
                    } else {
                        // Delete all group user list entries for this group
                        await prisma.groupUsersList.deleteMany({
                            where: {
                                groupId: groupData.groupId,
                                groupUserId: groupData.id,
                            },
                        });

                        // Delete the group user entry
                        await prisma.groupUsers.delete({
                            where: {
                                id: groupData.id,
                            }
                        });

                        // Set group status to false
                        await prisma.group.update({
                            where: {
                                id: groupData.groupId,
                            },
                            data: {
                                status: false
                            }
                        });

                        await prisma.orders.updateMany({
                            where: {
                                groupId: groupData.groupId,
                                NOT: {
                                    status: 'COMPLETED',
                                },
                            },
                            data: {
                                status: 'DECLINED',
                                reason: 'Order cancelled due to deletion of the associated group.'

                            },
                        });
                        const currentOrder = await prisma.orders.findMany({
                            where: { groupId: groupData.groupId, status: 'DECLINED' },
                        });
                        if (currentOrder.length > 0) {
                            currentOrder.map(async (orderInfo) => {
                                if (orderInfo.finalAmount) {
                                    const refundAmountInPaise = orderInfo.finalAmount;
                                    const razorpayPaymentId = orderInfo.transactionId;

                                    const paymentRefundResponse = await paymentRefund(razorpayPaymentId, refundAmountInPaise);
                                    if (paymentRefundResponse) {
                                        await prisma.orders.update({
                                            where: { id: orderInfo.id },
                                            data: {
                                                paymentStatus: PaymentStatus.REFUND
                                            }
                                        });
                                    } else {
                                        return response.error(res, `Refund failed for order ID: ${orderInfo.id}`);
                                    }

                                }

                            })
                        }
                    }
                } else {
                    // Delete the group user entry
                    await prisma.groupUsers.delete({
                        where: {
                            id: groupData.id,
                        }
                    });

                    // Set group status to false
                    await prisma.group.update({
                        where: {
                            id: groupData.groupId,
                        },
                        data: {
                            status: false
                        }
                    });

                    // Decline all non-completed orders for this group
                    await prisma.orders.updateMany({
                        where: {
                            groupId: groupData.groupId,
                            NOT: {
                                status: 'COMPLETED',
                            },
                        },
                        data: {
                            status: 'DECLINED',
                            reason: 'Order cancelled due to deletion of the associated group.'
                        },
                    });
                    const currentOrder = await prisma.orders.findMany({
                        where: { groupId: groupData.groupId, status: 'DECLINED' },
                    });

                    if (currentOrder.length > 0) {
                        currentOrder.map(async (orderInfo) => {
                            if (orderInfo.finalAmount) {
                                const refundAmountInPaise = orderInfo.finalAmount;
                                const razorpayPaymentId = orderInfo.transactionId;

                                const paymentRefundResponse = await paymentRefund(razorpayPaymentId, refundAmountInPaise);
                                if (paymentRefundResponse) {
                                    await prisma.orders.update({
                                        where: { id: orderInfo.id },
                                        data: {
                                            paymentStatus: PaymentStatus.REFUND
                                        }
                                    });
                                } else {
                                    return response.error(res, `Payment was not Decline`);
                                }

                            }

                        });
                    }
                }
            }

            // Handle user deletion
            const existingUser = await prisma.user.findUnique({
                where: { id, status: true },
                select: { emailAddress: true },
            });

            if (!existingUser) {
                response.error(res, 'User not found');
                return;
            }

            // Soft-delete the user
            await prisma.user.update({
                where: { id, status: true },
                data: {
                    status: false,
                },
            });

            // Decline all non-completed orders for this user
            await prisma.orders.updateMany({
                where: {
                    OR: [
                        { influencerId: id },
                        { businessId: id }
                    ],
                    status: {
                        not: 'COMPLETED',
                    },
                },
                data: {
                    status: 'DECLINED',
                    reason: 'Order cancelled due to deletion of the associated influencer.'
                },
            });
            const currentOrder = await prisma.orders.findMany({
                where: { influencerId: id },
            });

            if (currentOrder.length > 0) {
                currentOrder.map(async (orderInfo) => {
                    if (orderInfo.finalAmount) {
                        const refundAmountInPaise = orderInfo.finalAmount;
                        const razorpayPaymentId = orderInfo.transactionId;

                        const paymentRefundResponse = await paymentRefund(razorpayPaymentId, refundAmountInPaise);
                        if (paymentRefundResponse) {
                            await prisma.orders.update({
                                where: { id: orderInfo.id },
                                data: {
                                    paymentStatus: PaymentStatus.REFUND
                                }
                            });
                        } else {
                            return response.error(res, `Payment was not Decline`);
                        }

                    }

                });
            }
        } else {
            const groupUserEntry = await prisma.groupUsers.findMany({
                where: {
                    invitedUserId: {
                        has: id,
                    },
                },
            });

            if (groupUserEntry.length > 0) {
                groupUserEntry.map(async (groupUserData) => {
                    const updatedInvitedUserIds = groupUserData.invitedUserId.filter((list) => list !== id);
                    await prisma.groupUsers.update({
                        where: { id: groupUserData.id },
                        data: {
                            invitedUserId: updatedInvitedUserIds,
                        },
                    });
                    await prisma.groupUsersList.deleteMany({
                        where: {
                            groupUserId: groupUserData.id,
                            adminUserId: groupUserData.userId,
                            invitedUserId: id,
                        },
                    });
                })

            }

            const existingUser = await prisma.user.findUnique({
                where: { id, status: true },
                select: { emailAddress: true },
            });

            if (!existingUser) {
                response.error(res, 'User not found');
                return;
            }

            // Soft-delete the user
            await prisma.user.update({
                where: { id, status: true },
                data: {
                    status: false,
                },
            }),

                await prisma.orders.updateMany({
                    where: {
                        OR: [
                            { influencerId: id },
                            { businessId: id }
                        ],
                        status: {
                            not: 'COMPLETED',
                        },
                    },
                    data: {
                        status: 'DECLINED',
                        reason: 'Order cancelled due to deletion of the associated influencer.'
                    },
                });
            const currentOrder = await prisma.orders.findMany({
                where: { influencerId: id, status: 'DECLINED' },
            });
            if (currentOrder.length > 0) {
                currentOrder.map(async (orderInfo) => {
                    if (orderInfo.finalAmount) {
                        const refundAmountInPaise = orderInfo.finalAmount;
                        const razorpayPaymentId = orderInfo.transactionId;

                        const paymentRefundResponse = await paymentRefund(razorpayPaymentId, refundAmountInPaise);
                        if (paymentRefundResponse) {
                            await prisma.orders.update({
                                where: { id: orderInfo.id },
                                data: {
                                    paymentStatus: PaymentStatus.REFUND
                                }
                            });
                        } else {
                            return response.error(res, `Payment was not Decline`);
                        }

                    }

                });
            }
        }
        response.success(res, 'User Deleted successfully', null);

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
        where: { id, status: true },
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
        await prisma.userSubCategory.deleteMany({ where: { userId: id } });
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
            const userData = await prisma.user.findFirst({
                where: { id: id }
            });

            const userSubCategories = await prisma.userSubCategory.findMany({
                where: {
                    userId: id
                }
            })

            const socialMediaPlatforms = await prisma.socialMediaPlatform.findMany({
                where: {
                    userId: id
                }
            })

            // Step 3: Prepare user for profile calculation
            calculatedProfileCompletion = calculateProfileCompletion({
                ...userData,
                userSubCategories,
                socialMediaPlatforms
            });
        } else {
            calculatedProfileCompletion = calculateBusinessProfileCompletion(profileCompletionData, existingUser.loginType);
        }

        finalUpdateData.profileCompletion = calculatedProfileCompletion;

        //  If profile is 100% complete, add PROFILE_COMPLETE reward (LOCKED)
        if (calculatedProfileCompletion === 100) {
            await prisma.coinTransaction.create({
                data: {
                    userId: existingUser.id,
                    amount: 50,
                    type: CoinType.PROFILE_COMPLETION,
                    status: 'UNLOCKED',
                },
            });

            const profileSummary = await prisma.referralCoinSummary.findUnique({
                where: { userId: existingUser.id },
            });

            if (profileSummary) {
                await prisma.referralCoinSummary.update({
                    where: { userId: existingUser.id },
                    data: { totalAmount: (Number(profileSummary.totalAmount) || 0) + 50, },

                });
            } else {
                await prisma.referralCoinSummary.create({
                    data: { userId: existingUser.id, totalAmount: 50 },
                });
            }
        }

        const token = req.headers.authorization?.split(' ')[1] || req.token;

        const editedUser = await prisma.user.update({
            where: { id, status: true },
            data: finalUpdateData,
            include: {
                socialMediaPlatforms: true,
                brandData: true,
                countryData: true,
                stateData: true,
                cityData: true,
            }
        });

        const existingDetail = await prisma.userDetail.findFirst({
            where: { userId: editedUser.id },
        });

        if (existingDetail) {
            await prisma.userDetail.update({
                where: { id: existingDetail.id },
                data: {
                    name: editedUser.name || '',
                    image: editedUser.userImage || '',
                },
            });
        } else {
            await prisma.userDetail.create({
                data: {
                    userId: editedUser.id,
                    name: editedUser.name || '',
                    image: editedUser.userImage || '',
                },
            });
        }

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




export const socialLogin = async (req: Request, res: Response): Promise<any> => {
    try {
        const { socialId, name, emailAddress, userImage, loginType } = req.body;

        if (!socialId) {
            return response.error(res, 'socialId is required.');
        }

        // Check if user exists with this socialId (regardless of status)
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

        // If user exists with socialId
        if (user) {
            if (!user.status) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        name: name || user.name,
                        userImage: userImage || user.userImage,
                        ...(emailAddress && emailAddress !== user.emailAddress && { emailAddress }),
                        status: true, // Reactivate user
                        loginType: loginType || user.loginType,
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
        }
        else {
            // No user found with socialId, check if email is already taken
            if (emailAddress) {
                const existingEmailUser = await prisma.user.findFirst({
                    where: {
                        emailAddress,
                        status: true
                    }
                });

                if (existingEmailUser) {
                    return response.error(res, 'Email already registered with another account.');
                }
            }

            // Create new user with required fields
            const createData: any = {
                socialId,
                name: name || 'Social User',
                userImage: userImage || null,
                type: 'INFLUENCER',
                status: true,
                profileCompletion: 0,
                password: 'SOCIAL_LOGIN_NO_PASSWORD',
                loginType: loginType || 'GOOGLE',
            };

            if (emailAddress) {
                createData.emailAddress = emailAddress;
            }

            user = await prisma.user.create({
                data: createData,
                include: {
                    socialMediaPlatforms: true,
                    brandData: true,
                    countryData: true,
                    stateData: true,
                    cityData: true,
                },
            });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.emailAddress },
            process.env.JWT_SECRET || 'default_secret',
            { expiresIn: '7d' }
        );

        const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

        const { password, ...userWithoutSensitive } = user as any;

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

        if (error.code === 'P2002') {
            return response.error(res, 'Email address and socialId are already in used.');
        }

        return response.error(res, error.message || 'Social login failed.');
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
            where: { id, status: true },
        });

        if (!user) {
            return response.error(res, 'Influencer not found.');
        }

        if (user.type !== 'INFLUENCER') {
            return response.error(res, 'User is not an influencer.');
        }

        const updatedUser = await prisma.user.update({
            where: { id, status: true },
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



// Alternative approach: Separate pagination for users and groups
export const getAllUsersAlternative = async (req: Request, res: Response): Promise<any> => {
    try {
        const { search, page = 1, limit = 10 } = req.body;
        const currentPage = parseInt(page.toString()) || 1;
        const itemsPerPage = parseInt(limit.toString()) || 10;

        const usersPerPage = Math.ceil(itemsPerPage / 2);
        const groupsPerPage = itemsPerPage - usersPerPage;

        const [usersData, groupsData] = await Promise.all([
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

        return response.success(res, 'Results fetched successfully!', {
            pagination: {
                currentPage,
                totalUsers: usersCount,
                totalGroups: groupsCount,
                usersOnPage: users.length,
                groupsOnPage: groups.length,
            },
            users: [],
            groups: [],
        });

    } catch (error: any) {
        response.error(res, error.message);
    }
};



export const getAllInfo = async (req: Request, res: Response): Promise<any> => {
    try {
        const { platform, search } = req.body;
        const { type } = req.body;

        const allowedPlatforms = ['INSTAGRAM', 'TWITTER', 'YOUTUBE', 'TIKTOK'];

        const filter: any = {};

        // ✅ Search by name starting with
        if (search && typeof search === 'string') {
            filter.name = {
                startsWith: search,
                mode: 'insensitive', // Optional: case-insensitive search
            };
        }

        // Validate and apply platform filter
        if (platform) {
            const platformValue = platform.toString().toUpperCase();
            if (!allowedPlatforms.includes(platformValue)) {
                return response.error(res, 'Invalid platform value. Allowed: INSTAGRAM, TWITTER, YOUTUBE, TIKTOK');
            }

            filter.socialMediaPlatforms = {
                some: {
                    platform: platformValue,
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



export const updateUserBannerStatusByUserId = async (req: Request, res: Response): Promise<any> => {
    const { userId, status } = req.body;

    if (!userId || typeof status !== 'boolean') {
        return response.error(res, 'userId and boolean status are required');
    }

    try {
        const updated = await prisma.userDetail.updateMany({
            where: { userId },
            data: { status },
        });

        if (updated.count === 0) {
            return response.error(res, 'No UserDetail found for given userId');
        }

        return response.success(res, 'Status updated successfully', null);
    } catch (error: any) {
        console.error(error);
        return response.error(res, 'Error updating status');
    }
};


export const getRawUserDetailList = async (req: Request, res: Response): Promise<any> => {
    try {
        const userDetails = await prisma.userDetail.findMany({
            orderBy: {
                updatedAt: 'desc',
            },
            select: {
                id: true,
                userId: true,
                name: true,
                image: true,
                status: true,
                createsAt: true,
                updatedAt: true,
            },
        });

        return response.success(res, "Fetched raw user details successfully", userDetails);
    } catch (error: any) {
        console.error("Error fetching user details:", error);
        return response.error(res, "Failed to fetch user details");
    }
};


export const getUserBannerStatusByUserId = async (req: Request, res: Response): Promise<any> => {
    const { userId } = req.body;

    if (!userId) {
        return response.error(res, 'userId is required');
    }

    try {
        const userDetail = await prisma.userDetail.findFirst({
            where: { userId },
        });

        if (!userDetail) {
            return response.error(res, 'No UserDetail found for given userId');
        }

        return response.success(res, 'UserDetail fetched successfully', userDetail);
    } catch (error: any) {
        console.error(error);
        return response.error(res, 'Error fetching UserDetail');
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