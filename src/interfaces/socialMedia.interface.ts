export interface ISocialMediaPlatform {
    image?: string;
    userId?: string;
    platform: string;
    userName: string;
    countryId?: string;
    brandTypeId?: string;
    referralCode?: string;
    userImage?: string;
    applicationLink?: string;
    description?: string;
    contactPersonName?: string;
    contactPersonPhoneNumber?: string;
    gstNumber?: string;
    workEmail?: string;
    socialMediaPlatform?: string[];
    birthDate?: Date;
    stateId?: string;
    status: boolean;
    createdAt: Date;
    updatedAt: Date;
}