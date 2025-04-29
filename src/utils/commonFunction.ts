
export const resolveStatus = (status: boolean | null | undefined): boolean => {
    return status === null || status === undefined ? true : status;
};


