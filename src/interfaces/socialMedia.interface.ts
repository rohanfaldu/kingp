import { Platform } from '../enums/userType.enum'; 

export interface ISocialMediaPlatform {
    image?: string;
    userId: string;
    platform?: Platform;
    userName?: string;
    followerCount?: string;
    engagementRate?: string;
    averageLikes?: string;
    averageComments?: string;
    averageShares?: string;
    price?: number;
    status?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}