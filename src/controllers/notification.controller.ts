import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';
import { paginate } from '../utils/pagination';
import response from '../utils/response';
import { title } from 'process';
import { calculateProfileCompletion } from '../utils/calculateProfileCompletion';
// Initialize Firebase Admin only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const prisma = new PrismaClient();

export const sendNotification = async (
  req: Request,
  res: Response
): Promise<any> => {
  const { userId, message, type, fcmToken, title, orderId } = req.body;

  if (!userId || !message || !fcmToken) {
    return res.status(400).json({
      status: false,
      message: 'Missing userId, message, or fcmToken',
      date: null,
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
// export const listNotifications = async (req: Request, res: Response): Promise<any> => {
//     const userId = req.user?.id || req.user?.userId || req.userId;

//     if (!userId) {
//         return res.status(401).json({
//             status: false,
//             message: 'Unauthorized: Missing user ID',
//             data: null,
//         });
//     }

//     try {
//         // Get pagination params
//         const page = parseInt(req.query.page as string) || 1;
//         const limit = parseInt(req.query.limit as string) || 50;
//         const skip = (page - 1) * limit;

//         console.log('Fetching notifications for userId:', userId);

//         // Get total count for this user only
//         const total = await prisma.notification.count({
//             where: { userId: userId }
//         });

//         // Get notifications for this user only
//         const notifications = await prisma.notification.findMany({
//             where: {
//                 userId: userId,
//                 status: {
//                     not: 'FAILED',
//                 },
//             },
//             skip,
//             take: limit,
//             orderBy: { createdAt: 'desc' }
//         });

//         console.log(`Found ${notifications.length} notifications for user ${userId}`);

//         const result = {
//             pagination: {
//                 total,
//                 page,
//                 limit,
//                 totalPages: Math.ceil(total / limit)
//             },
//             notifications
//         };

//         // Return empty array if no notifications, don't treat as error
//         if (!notifications || notifications.length === 0) {
//             return response.success(res, 'No notifications found', result);
//         }

//         response.success(res, 'Notifications fetched successfully', result);

//     } catch (error: any) {
//         console.error('Error fetching notifications:', error);
//         response.error(res, error.message || 'Failed to fetch notifications');
//     }
// };

export const listNotifications = async (
  req: Request,
  res: Response
): Promise<any> => {
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

    // Common where condition (excluding FAILED)
    const whereCondition = {
      userId: userId,
      status: {
        not: 'FAILED',
      },
    };

    // Get total count (excluding FAILED)
    const total = await prisma.notification.count({
      where: whereCondition,
    });

    // Get notifications (excluding FAILED)
    const notifications = await prisma.notification.findMany({
      where: whereCondition,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(
      `Found ${notifications.length} notifications for user ${userId}`
    );

    const result = {
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      notifications,
    };

    const message =
      notifications.length === 0
        ? 'No notifications found'
        : 'Notifications fetched successfully';

    return response.success(res, message, result);
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return response.error(
      res,
      error.message || 'Failed to fetch notifications'
    );
  }
};

export const sendNotificationtoAllUser = async (): Promise<any> => {
  const notificationsList = [
    {
      title: "Today's Surprise Gift! 🎁",
      body: 'Open the app and claim your reward before it expires!',
    },
    {
      title: 'Sync & Start Fresh!',
      body: 'Open the app to refresh your updates for today.',
    },
    {
      title: 'Your Daily Bonus Is Ready!',
      body: 'Tap now to unlock today’s bonus and stay updated! ✨',
    },
    {
      title: "Don't Miss Your Reward!",
      body: 'A new surprise is waiting for you inside the app.',
    },
    {
      title: 'Daily Refresh Complete!',
      body: 'Open the app to view your updated info.',
    },
    {
      title: 'Start Your Day with a Gift!',
      body: 'A fresh surprise awaits — tap to open the app!',
    },
    {
      title: 'Open & Sync Now!',
      body: 'Your daily updates are ready. Refresh now!',
    },
    {
      title: "Today's Update Is Ready!",
      body: 'Tap to see what’s new for you today.',
    },
  ];

  const getRandomNotification = () => {
    return notificationsList[
      Math.floor(Math.random() * notificationsList.length)
    ];
  };

  // Send to topic instead of token
  const randomNote = getRandomNotification();
  console.log(randomNote, 'Selected Notification');

  const notificationPayload = {
    notification: {
      title: randomNote.title,
      body: randomNote.body,
    },
    data: {
      title: randomNote.title,
      body: randomNote.body,
      type: 'INFO',
      orderId: '',
    },
    topic: 'daily_update',
  };
  try {
    const response = await admin.messaging().send(notificationPayload);
    console.log('FCM sent successfully:', response);
  } catch (error: any) {
    console.error('Error sending FCM:', error);
  }
};

export const sendNotificationToUser = async (): Promise<any> => {
  try {
    // Fetch users WITHOUT any includes
    const users = await prisma.user.findMany();

    for (const user of users) {
      const completion = calculateProfileCompletion(user);

      console.log(`User: ${user.id} - Profile Completion: ${completion}%`);

      // Notify if profile < 70% (your condition)
      if (completion < 70) {
        const notificationPayload = {
          notification: {
            title: 'Complete Your Profile!',
            body: 'Finish setting up your profile to get started!',
          },
          data: {
            title: 'Complete Your Profile!',
            body: 'Finish setting up your profile to get started!',
            type: 'INFO',
            orderId: '',
          },
          topic: 'incomplete_profile', // 🔥 TOPIC
        };

        const response = await admin.messaging().send(notificationPayload);
        if (response) {
          console.log('Notification sent successfully:', response);
        } else {
          console.log('No notification response received');
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending notifications:', error);
    return { success: false, error };
  }

  // console.log(getRandomNotification(), 'getRandomNotification');
  // // Send to topic instead of token
  // const randomNote = getRandomNotification();

  // const notificationPayload = {
  //   notification: {
  //     title: randomNote.title,
  //     body: randomNote.body,
  //   },
  //   data: {
  //     title: randomNote.title,
  //     body: randomNote.body,
  //     type: 'INFO',
  //     orderId: '',
  //   },
  //   topic: 'daily_update', // 🔥 TOPIC
  // };
  // try {
  //   // Send FCM
  //   const response = await admin.messaging().send(notificationPayload);
  //   if (response) {
  //     console.log('FCM sent successfully:', response);
  //   } else {
  //     console.log('No FCM response received');
  //   }
  // } catch (error: any) {
  //   console.error('Error sending FCM:', error);
  // }
};
