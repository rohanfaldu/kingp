import { Platform } from '../enums/userType.enum'; 

export interface ISocialMediaPlatform {
    image?: string;
    userId: string;
    platform?: Platform;
    userName?: string;
    followerCount?: number;
    engagementRate?: number;
    averageLikes?: number;
    averageComments?: number;
    averageShares?: number;
    viewCount?: number;
    price?: number;
    status?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}