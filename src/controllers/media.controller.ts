import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import response from '../utils/response';
import { getStatusName, getCommonStatusName } from '../utils/commonFunction'
import { getUserCategoriesWithSubcategories } from '../utils/getUserCategoriesWithSubcategories';
import { IMediaType } from './../interfaces/media.interface';
import { sendFCMNotificationToUsers } from '../utils/notification';

const prisma = new PrismaClient();

export const createMedia = async (req: Request, res: Response): Promise<any> => {
    try {

        try {
            const mediaData: IMediaType = req.body;

            if (!mediaData.orderId) {
                return response.error(res, 'OrderId is required');
            }

            const statusEnumValue = getCommonStatusName(mediaData.status ?? 0);

            const createMedia = await prisma.media.create({
                data: {
                    orderId: mediaData.orderId,
                    mediaLink: mediaData.mediaLink || null,
                    status: statusEnumValue,
                    // mediaType: mediaData.mediaType,
                    mediaType: mediaData.mediaType != null ? Number(mediaData.mediaType) : undefined,
                    videoThumbnail: mediaData.videoThumbnail,


                },
            });

            // ✅ Fetch the related order to find businessId
            const order = await prisma.orders.findUnique({
                where: { id: mediaData.orderId },
                select: { businessId: true, title: true }
            });

            if (order?.businessId) {
                const businessUser = await prisma.user.findUnique({
                    where: { id: order.businessId },
                    select: { id: true, fcmToken: true, name: true }
                });

                const notifTitle = 'New Media Uploaded!';
                const notifMessage = `New media has been uploaded for order: ${order?.title || mediaData.orderId}`;
                const notifType = 'MEDIA_CREATED';

                try {
                    // Store notification record
                    await prisma.notification.create({
                        data: {
                            userId: businessUser?.id || null,
                            title: notifTitle,
                            message: notifMessage,
                            type: notifType,
                            status: businessUser?.fcmToken ? 'SENT' : 'ERROR',
                            error: businessUser?.fcmToken ? null : 'No FCM token found',
                        },
                    });

                    // Send push notification
                    if (businessUser?.fcmToken) {
                        await sendFCMNotificationToUsers(
                            [businessUser],
                            notifTitle,
                            notifMessage,
                            notifType
                        );
                    }
                } catch (error: any) {
                    console.error(`Failed to notify business user ${order.businessId}:`, error);
                    await prisma.notification.create({
                        data: {
                            userId: businessUser?.id || null,
                            title: notifTitle,
                            message: notifMessage,
                            type: notifType,
                            status: 'ERROR',
                            error: error.message || 'FCM failed',
                        },
                    });
                }
            }

            return response.success(res, 'Media created successfully!', createMedia);
        } catch (error: any) {
            return response.error(res, error.message);
        }
    } catch (error: any) {
        return response.error(res, error.message);
    }
};



export const getByIdMedia = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.body;

        if (!id) {
            return response.error(res, 'Id is required');
        }

        const getOrder = await prisma.media.findUnique({
            where: {
                id
            }
        });
        return response.success(res, 'Get Media Detail', getOrder);
    } catch (error: any) {
        return response.error(res, error.message);
    }
};


export const updateMediaStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id, status, reason } = req.body;

        if (typeof id !== 'string' || typeof status !== 'number') {
            return response.error(res, 'Both id (string) and status (number) are required');
        }

        // Map status code (number) to enum value

        const statusEnumValue = getCommonStatusName(status ?? 0);

        // Update the order
        const updated = await prisma.media.updateMany({
            where: { id },
            data: { status: statusEnumValue, reason: reason ?? null },
        });

        if (updated.count > 0) {
            return response.success(res, 'Successfully updated status', null);
        } else {
            return response.error(res, 'Media not found or status not updated');
        }
    } catch (error: any) {
        return response.error(res, error.message || 'Something went wrong');
    }
};




export const getAllMediaList = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status, orderId } = req.body;

        if (typeof orderId === null) {
            return response.error(res, 'Status is required');
        }

        //  const statusEnumValue = getCommonStatusName(status ?? 0);
        const getOrder = await prisma.media.findMany({
            where: {
                orderId: orderId
            }
        });
        return response.success(res, 'Get All media List', getOrder);

    } catch (error: any) {
        return response.error(res, error.message || 'Something went wrong');
    }
};