export enum UserType {
    BUSINESS = "BUSINESS",
    INFLUENCER = "INFLUENCER",
    ADMIN = "ADMIN",
}

export enum Gender {
    MALE = "MALE",
    FEMALE = "FEMALE",
    OTHER = "OTHER"
}

export enum Platform {
    INSTAGRAM = "INSTAGRAM",
    FACEBOOK = "FACEBOOK",
    TWITTER = "TWITTER",
    YOUTUBE = "YOUTUBE",
}

export enum LoginType {
    GOOGLE = 'GOOGLE',
    APPLE = 'APPLE',
    NONE = 'NONE',
}

export enum AvailabilityType {
    ONLINE = 'ONLINE',
    OFFLINE = 'OFFLINE',
}

export enum VisibilityType {
    PUBLIC = 'PUBLIC',
    PRIVATE = 'PRIVATE',
}

export enum RequestStatus{
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
    REJECTED = 'REJECTED',
}

export enum OfferStatus{
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
    CANCELED = 'CANCELED',
    ACTIVATED = 'ACTIVATED',
    ORDERSUBMITTED = 'ORDERSUBMITTED',
    COMPLETED = 'COMPLETED',
    DECLINED = 'DECLINED'
}

export enum PaymentStatus{
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED'
}

