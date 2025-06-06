import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { IOrder } from '../interfaces/order.interface';
import { parse } from 'date-fns';
import response from '../utils/response';
import { resolveStatus } from '../utils/commonFunction'
import { validate as isUuid } from 'uuid';
import { paginate } from '../utils/pagination';
import { calculateProfileCompletion, calculateBusinessProfileCompletion } from '../utils/calculateProfileCompletion';
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { omit } from 'lodash';
import { Resend } from 'resend';
import { Role } from '@prisma/client';
import { RequestStatus } from '@prisma/client';



const prisma = new PrismaClient();



// export const createOrder = async (req: Request, res: Response) => {
//   try {
//     const {
//       groupId,
//       influencerId,
//       businessId,
//       title,
//       description,
//       attachment,
//       status,
//       transactionId,
//       totalAmount,
//       discountAmount,
//       finalAmount,
//       paymentStatus,
//       completionDate
//     } = req.body;

//     // Convert completionDate days (e.g., 7) into a future date
//     const futureDate = new Date();
//     if (completionDate && typeof completionDate === 'number') {
//       futureDate.setDate(futureDate.getDate() + completionDate);
//     }

//     // Create order
//     const newOrder = await prisma.orders.create({
//       data: {
//         groupId,
//         influencerId,
//         businessId,
//         title,
//         description,
//         attachment,
//         status: status || 'PENDING',
//         transactionId,
//         totalAmount,
//         discountAmount,
//         finalAmount,
//         paymentStatus: paymentStatus || 'PENDING',
//         completionDate: futureDate
//       },
//       include: {
//         groupOrderData: {
//           include: {
//             groupUsersList: {
//               include: {
//                 invitedUser: {
//                   include: {
//                     countryData: true,
//                     stateData: true,
//                     cityData: true,
//                     socialMediaPlatforms: true,
//                     brandData: true
//                   }
//                 }
//               }
//             },
//             groupUsers: {
//               where: {
//                 isAdmin: true
//               },
//               include: {
//                 user: {
//                   include: {
//                     countryData: true,
//                     stateData: true,
//                     cityData: true,
//                     socialMediaPlatforms: true,
//                     brandData: true
//                   }
//                 }
//               }
//             }
//           }
//         },
//         influencerOrderData: {
//           include: {
//             countryData: true,
//             stateData: true,
//             cityData: true,
//             socialMediaPlatforms: true,
//             brandData: true
//           }
//         },
//         businessOrderData: {
//           include: {
//             countryData: true,
//             stateData: true,
//             cityData: true,
//             socialMediaPlatforms: true,
//             brandData: true
//           }
//         }
//       }
//     });

//     // Extract and rename adminUser
//     const groupData = newOrder.groupOrderData;
//     const adminEntry = groupData?.groupUsers?.[0];
//     const adminUser = adminEntry?.user || null;

//     const formattedGroupOrderData = {
//       ...groupData,
//       adminUser,
//       groupUsersList: groupData?.groupUsersList || []
//     };

//     // Final response
//     return res.status(200).json({
//       status: true,
//       message: 'Order created successfully',
//       data: {
//         ...newOrder,
//         groupOrderData: formattedGroupOrderData
//       }
//     });
//   } catch (error: any) {
//     console.error('Error creating order:', error);
//     return res.status(500).json({
//       status: false,
//       message: error.message || 'Something went wrong',
//       data: null
//     });
//   }
// };



export const createOrder = async (req: Request, res: Response) => {
    // try {
        const orderData = req.body;

        const {
            businessId,
            influencerId,
            completionDate,
            completionInDays, // <-- optional number of days
            ...restFields
        } = orderData;

        if (!businessId) {
            return res.status(400).json({ error: 'businessId is required' });
        }

        let parsedCompletionDate: Date | undefined = undefined;

        
        if (completionDate) {
            parsedCompletionDate = new Date(completionDate);
        } else if (completionInDays && typeof completionInDays === 'number') {
            parsedCompletionDate = addDays(new Date(), completionInDays);
        }

        const newOrder = await prisma.orders.create({
            data: {
                ...restFields,
                businessId,
                influencerId,
                completionDate: parsedCompletionDate,
            },
            include: {
                groupOrderData: {},
                influencerOrderData: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    }
                },
                businessOrderData: {
                    include: {
                        socialMediaPlatforms: true,
                        brandData: true,
                        countryData: true,
                        stateData: true,
                        cityData: true,
                    }
                }
            }
        });

        const formatUser = async (user: any) => {
            if (!user) return null;

            const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

            return {
                ...user,
                categories: userCategoriesWithSubcategories,
                countryName: user.countryData?.name ?? null,
                stateName: user.stateData?.name ?? null,
                cityName: user.cityData?.name ?? null,
            };
        };

        const responseData = {
            ...newOrder,
            influencerOrderData: await formatUser(newOrder.influencerOrderData),
            businessOrderData: await formatUser(newOrder.businessOrderData),
            groupOrderData: await formatUser(newOrder.groupOrderData),
        };

        return response.success(res, 'Order created successfully!', responseData);
    // } catch (error: any) {
    //     return response.error(res, error.message);
    // }
};








// export const createOrder = async (req: Request, res: Response) => {
//   try {
//     const orderData: IOrder = req.body;

//     const { completionDate, businessId, influencerId, ...restFields } = orderData;

//     if (!businessId) {
//       return res.status(400).json({ error: 'businessId is required' });
//     }

//     let parsedCompletionDate: Date | undefined = undefined;
//     if (completionDate) {
//       try {
//         parsedCompletionDate = parse(completionDate, 'dd/MM/yyyy', new Date());
//         if (isNaN(parsedCompletionDate.getTime())) {
//           return response.error(res, 'Invalid completionDate format. Use DD/MM/YYYY');
//         }
//       } catch {
//         return response.error(res, 'Invalid completionDate format. Use DD/MM/YYYY');
//       }
//     }

//     // Create the order including relations
//     const newOrder = await prisma.orders.create({
//       data: {
//         ...restFields,
//         businessId,
//         influencerId,
//         completionDate: parsedCompletionDate,
//       },
//       include: {
//         groupOrderData: true,
//         influencerOrderData: {
//           include: {
//             socialMediaPlatforms: true,
//             brandData: true,
//             countryData: true,
//             stateData: true,
//             cityData: true,
//           },
//         },
//         businessOrderData: {
//           include: {
//             socialMediaPlatforms: true,
//             brandData: true,
//             countryData: true,
//             stateData: true,
//             cityData: true,
//           },
//         },
//       },
//     });

//     // Make formatUser async and await categories fetching
//     async function formatUser(user: any) {
//       if (!user) return null;

//       // Await the async fetching here
//       const userCategoriesWithSubcategories = await getUserCategoriesWithSubcategories(user.id);

//       return {
//         ...user,
//         categories: userCategoriesWithSubcategories,
//         countryName: user.countryData?.name ?? null,
//         stateName: user.stateData?.name ?? null,
//         cityName: user.cityData?.name ?? null,
//       };
//     }

//     // Await formatted influencer and business user data
//     const formattedInfluencer = await formatUser(newOrder.influencerOrderData);
//     const formattedBusiness = await formatUser(newOrder.businessOrderData);

//     const responseData = {
//       ...newOrder,
//       influencerOrderData: formattedInfluencer,
//       businessOrderData: formattedBusiness,
//       // groupOrderData stays untouched
//     };

//     return response.success(res, 'Order created successfully!', responseData);

//   } catch (error: any) {
//     return response.error(res, error.message);
//   }
// };






