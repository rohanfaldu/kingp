// src/utils/notification.util.ts
import admin from 'firebase-admin';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Sends FCM notifications to an array of users and logs them in the database.
 * 
 * @param users - Array of users with at least { id, fcmToken }
 * @param title - Notification title
 * @param body - Notification message body
 * @param type - Notification type (e.g., 'GROUP_INVITE')
 */
export const sendFCMNotificationToUsers = async (
  users: { id: number, fcmToken?: string | null }[],
  title: string,
  body: string,
  type: string = 'INFO',
  orderId?: string,
) => {
  await Promise.all(users.map(async (user) => {
    if (!user.fcmToken) return;

    const message = {
      notification: {
        title,
        body,
      },
      data: {
        title,
        body,
        type,
        orderId: orderId?.toString() || '',
      },
      token: user.fcmToken,
    };

    try {
      await admin.messaging().send(message);

      await prisma.notification.create({
        data: {
          userId: user.id,
          title,
          message: body,
          type,
          status: 'SENT',
          orderId,
        },
      });
    } catch (error: any) {
      console.error(`Error sending FCM to user ${user.id}:`, error.message);

      await prisma.notification.create({
        data: {
          userId: user.id,
          title,
          message: body,
          type,
          status: 'FAILED',
          error: error.message,
          orderId,
        },
      });
    }
  }));
};
