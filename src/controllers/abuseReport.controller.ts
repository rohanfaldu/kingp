import { Request, Response } from 'express';
import { PrismaClient, Prisma } from "@prisma/client";
import { ReportedType, RequestStatus } from '../enums/userType.enum'; // your numeric enum
import response from '../utils/response';
import { paginate } from '../utils/pagination';


const prisma = new PrismaClient();


export const createAbuseReport = async (req: Request, res: Response): Promise<any> => {
    try {
        const { reportedBy, reportedUserId, reportedGroupId, status } = req.body;

        if (!reportedBy || status === undefined || status === null) {
            return response.error(res, 'Missing required fields: reportedBy and status.');
        }

        const statusMap: Record<ReportedType, 'INFLUENCER' | 'BUSINESS' | 'GROUP'> = {
            [ReportedType.INFLUENCER]: 'INFLUENCER',
            [ReportedType.BUSINESS]: 'BUSINESS',
            [ReportedType.GROUP]: 'GROUP',
        };

        const mappedStatus = statusMap[status as ReportedType];
        if (!mappedStatus) {
            return response.error(res, 'Invalid status value. Must be 1 (INFLUENCER), 2 (BUSINESS), or 3 (GROUP).');
        }

        // 🔍 Validate reportedBy user exists
        const reporter = await prisma.user.findUnique({ where: { id: reportedBy } });
        if (!reporter) return response.error(res, 'Invalid reporter (reportedBy) user ID.');

        // 🔍 Validate reportedUserId for influencer/business
        if ((mappedStatus === 'INFLUENCER' || mappedStatus === 'BUSINESS')) {
            if (!reportedUserId) return response.error(res, 'reportedUserId is required for INFLUENCER or BUSINESS.');
            const reportedUser = await prisma.user.findUnique({ where: { id: reportedUserId } });
            if (!reportedUser) return response.error(res, 'Invalid reportedUserId.');
        }

        // 🔍 Validate reportedGroupId for group
        if (mappedStatus === 'GROUP') {
            if (!reportedGroupId) return response.error(res, 'reportedGroupId is required for GROUP.');
            const reportedGroup = await prisma.group.findUnique({ where: { id: reportedGroupId } });
            if (!reportedGroup) return response.error(res, 'Invalid reportedGroupId.');
        }

        // ✅ Create abuse report
        const newReport = await prisma.abuseReport.create({
            data: {
                reportedBy,
                reportedUserId: mappedStatus !== 'GROUP' ? reportedUserId : undefined,
                reportedGroupId: mappedStatus === 'GROUP' ? reportedGroupId : undefined,
                status: mappedStatus,
            },
            include: {
                abuseReportedByData: {
                    select: { id: true, name: true, emailAddress: true },
                },
                abuseReportedUserData: {
                    select: { id: true, name: true, emailAddress: true },
                },
            },
        });

        // ✅ If group, fetch group info: admin + accepted users
        let groupDetails = null;

        if (mappedStatus === 'GROUP' && reportedGroupId) {
            const groupData = await prisma.group.findUnique({
                where: { id: reportedGroupId },
                select: {
                    id: true,
                    groupName: true,
                    groupData: {
                        select: {
                            groupUserData: {
                                select: {
                                    id: true,
                                    name: true,
                                    emailAddress: true,
                                },
                            },
                        },
                        take: 1, // Admin only
                    },
                    groupUsersList: {
                        where: { requestAccept: RequestStatus.ACCEPTED },
                        select: {
                            invitedUser: {
                                select: {
                                    id: true,
                                    name: true,
                                    emailAddress: true,
                                },
                            },
                        },
                    },
                },
            });

            const adminUser = groupData?.groupData?.[0]?.groupUserData || null;
            const acceptedUsers = groupData?.groupUsersList?.map(i => i.invitedUser) || [];

            groupDetails = {
                id: groupData?.id,
                groupName: groupData?.groupName,
                adminUser,
                acceptedInvitedUsers: acceptedUsers,
            };
        }

        return response.success(res, 'Abuse Report created successfully!', {
            ...newReport,
            abuseReportedGroupData: groupDetails,
        });
    } catch (error: any) {
        console.error('Error creating abuse report:', error);
        return response.error(res, error.message || 'Internal server error.');
    }
};



export const getAllAbuseReports = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status, page, limit } = req.body;

        const statusMap: Record<number, 'INFLUENCER' | 'BUSINESS' | 'GROUP'> = {
            1: 'INFLUENCER',
            2: 'BUSINESS',
            3: 'GROUP',
        };

        const whereClause: any = {};
        if (status !== null && status !== undefined && statusMap[status]) {
            whereClause.status = statusMap[status];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);

        const [reports, total] = await Promise.all([
            prisma.abuseReport.findMany({
                where: whereClause,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    abuseReportedByData: {
                        select: { id: true, name: true, emailAddress: true },
                    },
                    abuseReportedUserData: {
                        select: { id: true, name: true, emailAddress: true },
                    },
                },
            }),
            prisma.abuseReport.count({ where: whereClause }),
        ]);

        // Fetch group info (admin + accepted users) for GROUP reports
        const formattedReports = await Promise.all(
            reports.map(async (report) => {
                let groupDetails = null;

                if (report.status === 'GROUP' && report.reportedGroupId) {
                    const groupData = await prisma.group.findUnique({
                        where: { id: report.reportedGroupId },
                        select: {
                            id: true,
                            groupName: true,
                            groupData: {
                                select: {
                                    groupUserData: {
                                        select: {
                                            id: true,
                                            name: true,
                                            emailAddress: true,
                                        },
                                    },
                                },
                                take: 1, // Admin only
                            },
                            groupUsersList: {
                                where: { requestAccept: RequestStatus.ACCEPTED },
                                select: {
                                    invitedUser: {
                                        select: {
                                            id: true,
                                            name: true,
                                            emailAddress: true,
                                        },
                                    },
                                },
                            },
                        },
                    });

                    const adminUser = groupData?.groupData?.[0]?.groupUserData || null;
                    const acceptedUsers = groupData?.groupUsersList?.map(i => i.invitedUser) || [];

                    groupDetails = {
                        id: groupData?.id,
                        groupName: groupData?.groupName,
                        adminUser,
                        acceptedInvitedUsers: acceptedUsers,
                    };
                }

                return {
                    ...report,
                    abuseReportedGroupData: groupDetails,
                };
            })
        );

        return response.success(res, 'Abuse reports fetched successfully!', {
            total,
            page: Number(page),
            limit: take,
            totalPages: Math.ceil(total / limit),
            reports: formattedReports,
        });
    } catch (error: any) {
        console.error('Error fetching abuse reports:', error);
        return response.error(res, error.message || 'Internal server error.');
    }
};



export const getByIdAbuseReport = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.body;

        if (!id) return response.error(res, 'Abuse report ID is required.');

        const report = await prisma.abuseReport.findUnique({
            where: { id },
            include: {
                abuseReportedByData: {
                    select: { id: true, name: true, emailAddress: true },
                },
                abuseReportedUserData: {
                    select: { id: true, name: true, emailAddress: true },
                },
            },
        });

        if (!report) {
            return response.error(res, 'Abuse report not found.');
        }

        let groupDetails = null;

        if (report.status === 'GROUP' && report.reportedGroupId) {
            const groupData = await prisma.group.findUnique({
                where: { id: report.reportedGroupId },
                select: {
                    id: true,
                    groupName: true,
                    groupData: {
                        select: {
                            groupUserData: {
                                select: {
                                    id: true,
                                    name: true,
                                    emailAddress: true,
                                },
                            },
                        },
                        take: 1, // Admin only
                    },
                    groupUsersList: {
                        where: { requestAccept: RequestStatus.ACCEPTED },
                        select: {
                            invitedUser: {
                                select: {
                                    id: true,
                                    name: true,
                                    emailAddress: true,
                                },
                            },
                        },
                    },
                },
            });

            const adminUser = groupData?.groupData?.[0]?.groupUserData || null;
            const acceptedUsers = groupData?.groupUsersList?.map(i => i.invitedUser) || [];

            groupDetails = {
                id: groupData?.id,
                groupName: groupData?.groupName,
                adminUser,
                acceptedInvitedUsers: acceptedUsers,
            };
        }

        return response.success(res, 'Abuse report fetched successfully.', {
            ...report,
            abuseReportedGroupData: groupDetails,
        });
    } catch (error: any) {
        console.error('Error fetching abuse report by ID:', error);
        return response.error(res, error.message || 'Internal server error.');
    }
};
