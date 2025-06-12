export interface IRating {
    orderId?: string;
    groupId?: string;
    ratedToUserId?: string;
    rating?: number;
    review?: string;
}

export interface IRatingUpdate {
    ratings?: number;
    review?: string;
}