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
                    mediaType: mediaData.mediaType != null ? Number(mediaData.mediaType) : undefined,
                    videoThumbnail: mediaData.videoThumbnail,


                },
            });

            //  Fetch the related order to find businessId
            const order = await prisma.orders.findUnique({
                where: { id: mediaData.orderId },
                select: { businessId: true, title: true }
            });
            console.log(order, '>>>>>>>>>>>>>>>> order');

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
                            orderId: mediaData.orderId,
                        },
                    });

                    // Send push notification
                    if (businessUser?.fcmToken) {
                        await sendFCMNotificationToUsers(
                            [businessUser],
                            notifTitle,
                            notifMessage,
                            notifType,
                            mediaData.orderId
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
                            orderId: mediaData.orderId,
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

        const statusEnumValue = getCommonStatusName(status ?? 0);

        // Step 1: Update media
        const updated = await prisma.media.updateMany({
            where: { id },
            data: { status: statusEnumValue, reason: reason ?? null },
        });

        if (updated.count === 0) {
            return response.error(res, 'Media not found or status not updated');
        }

        // Step 2: Fetch updated media with related order
        const mediaData = await prisma.media.findUnique({
            where: { id },
            include: {
                OrderData: true,
            },
        });

        if (!mediaData?.OrderData) {
            return response.error(res, 'Order not found for this media');
        }

        const order = mediaData.OrderData;

        // Step 3: Prepare notification message
        const notifTitle = status === 1 ? 'Media Approved' : 'Media Rejected';
        const notifMessage = `${notifTitle} for order: ${order.title || mediaData.orderId}`;
        const notifType = 'MEDIA_STATUS_UPDATED';

        const recipients: { id: string; fcmToken: string }[] = [];

        // Step 4: Notify influencer (if influencer order)
        if (order.influencerId) {
            const influencer = await prisma.user.findUnique({
                where: { id: order.influencerId },
                select: { id: true, fcmToken: true },
            });

            if (influencer?.fcmToken) {
                recipients.push({ id: influencer.id, fcmToken: influencer.fcmToken });
            }
        }

        // Step 5: Notify group admin + accepted users (if group order)
        if (order.groupId) {
            // 5.1 Fetch group admin (GroupUsers.userId)
            const groupAdmin = await prisma.groupUsers.findFirst({
                where: {
                    groupId: order.groupId,
                    status: true,
                },
                include: {
                    groupUserData: {
                        select: { id: true, fcmToken: true },
                    },
                },
            });

            if (groupAdmin?.groupUserData?.fcmToken) {
                recipients.push({
                    id: groupAdmin.groupUserData.id,
                    fcmToken: groupAdmin.groupUserData.fcmToken,
                });
            }

            // 5.2 Fetch accepted invited users
            const acceptedUsers = await prisma.groupUsersList.findMany({
                where: {
                    groupId: order.groupId,
                    requestAccept: 'ACCEPTED',
                    status: true,
                },
                include: {
                    invitedUser: {
                        select: { id: true, fcmToken: true },
                    },
                },
            });

            acceptedUsers.forEach(entry => {
                const user = entry.invitedUser;
                if (user?.fcmToken) {
                    recipients.push({ id: user.id, fcmToken: user.fcmToken });
                }
            });
        }

        // Step 6: Send unique notifications
        const uniqueRecipients = Array.from(
            new Map(recipients.map(r => [r.fcmToken, r])).values()
        );

        if (uniqueRecipients.length > 0) {
            await sendFCMNotificationToUsers(
                uniqueRecipients,
                notifTitle,
                notifMessage,
                notifType,
                mediaData.orderId,
            );
        }

        return response.success(res, 'Status updated and notifications sent');
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