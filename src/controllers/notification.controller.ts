import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';
import { paginate } from '../utils/pagination';
import response from '../utils/response';



// Initialize Firebase Admin only once
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

        }),
    });
}

const prisma = new PrismaClient();

export const sendNotification = async (req: Request, res: Response): Promise<any> => {
    const { userId, message, type, fcmToken, title, orderId  } = req.body;

    if (!userId || !message || !fcmToken) {
        return res.status(400).json({
            status: false,
            message: 'Missing userId, message, or fcmToken',
            date: null
        });
    }

    const notificationPayload = {
        notification: {
            title: title || 'Notification Title',
            body: message,
        },
        data: {
            title: title || 'Notification Title',
            body: message,
            type: type || 'INFO',
            orderId: orderId || '',
        },
        token: fcmToken,
    };

    try {
        const response = await admin.messaging().send(notificationPayload);

        const notification = await prisma.notification.create({
            data: {
                userId,
                title: title || 'Notification Title',
                message,
                type: type || 'INFO',
                status: 'SENT',
                orderId,
            },
        });

        return res.json({
            status: true,
            message: 'Notification sent via FCM',
            data: response,
            notification,
        });
    } catch (error: any) {
        console.error('Error sending FCM message:', error);

        await prisma.notification.create({
            data: {
                userId,
                title: title || 'Notification Title',
                message,
                type: type || 'INFO',
                status: 'FAILED',
                error: error.message,
                orderId,
            },
        });

        return res.status(500).json({
            status: false,
            message: 'Failed to send FCM notification',
            data: error.message,
        });
    }
};




// GET List notifications
export const listNotifications = async (req: Request, res: Response): Promise<any> => {
    const userId = req.user?.id || req.user?.userId || req.userId;

    if (!userId) {
        return res.status(401).json({
            status: false,
            message: 'Unauthorized: Missing user ID',
            data: null,
        });
    }

    try {
        // Get pagination params
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const skip = (page - 1) * limit;

        console.log('Fetching notifications for userId:', userId);

        // Get total count for this user only
        const total = await prisma.notification.count({
            where: { userId: userId }
        });

        // Get notifications for this user only
        const notifications = await prisma.notification.findMany({
            where: { userId: userId },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' }
        });

        console.log(`Found ${notifications.length} notifications for user ${userId}`);

        const result = {
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            notifications
        };

        // Return empty array if no notifications, don't treat as error
        if (!notifications || notifications.length === 0) {
            return response.success(res, 'No notifications found', result);
        }

        response.success(res, 'Notifications fetched successfully', result);

    } catch (error: any) {
        console.error('Error fetching notifications:', error);
        response.error(res, error.message || 'Failed to fetch notifications');
    }
};


