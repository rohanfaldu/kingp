import { VisibilityType, Platform } from '../enums/userType.enum'; 

export interface IGroup {
    groupImage?: string;
    groupName?: string;
    groupBio?: string;
    subCategoryId?: string[];
    socialMediaPlatform?: Platform;
    Visibility?: VisibilityType;
    userId: string;
    invitedUserId?: string[];
    status?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}