import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import response from '../utils/response';
import { RequestStatus, CoinType } from '@prisma/client';
import { startOfWeek, endOfWeek } from 'date-fns';
import { subMonths } from 'date-fns';
import { Role } from '@prisma/client';
import { paginate } from '../utils/pagination';
import { ReportedType } from '../enums/userType.enum';

const prisma = new PrismaClient();


export const createAbuseReport = async (req: Request, res: Response): Promise<any> => {
  try {
    const { reportedBy, reportedUserId, status } = req.body;

    if (!reportedBy || !reportedUserId || !status) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const validStatuses = ['INFLUENCER', 'BUSINESS', 'GROUP'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status type.' });
    }

    const newReport = await prisma.abuseReport.create({
      data: {
        reportedBy,
        reportedUserId,
        status: status as ReportedType,
      },
      include: {
        abuseReportedByData: {
          select: { id: true, name: true, emailAddress: true }
        },
        abuseReportedUserData: {
          select: { id: true, name: true, emailAddress: true }
        }
      }
    });

    return res.status(200).json({ status: true, data: newReport });
  } catch (error) {
    console.error('Error creating abuse report:', error);
    return res.status(500).json({ status: false, message: 'Internal server error.' });
  }
};