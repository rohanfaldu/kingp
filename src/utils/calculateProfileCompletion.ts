const calculateProfileCompletion = (user: any): number => {
    let completedFields = 0;
    const totalFields = 16;

    if (user.type) completedFields++;
    if (user.name) completedFields++;
    if (user.emailAddress) completedFields++;
    if (user.password && user.password !== 'SOCIAL_LOGIN') completedFields++;
    if (user.countryId) completedFields++;
    if (user.stateId) completedFields++;
    if (user.cityId) completedFields++;
    if (user.subcategoriesId && user.subcategoriesId.length > 0) completedFields++;
    if (user.referralCode) completedFields++;
    if (user.userImage) completedFields++;
    if (user.contactPersonName) completedFields++;
    if (user.socialMediaPlatforms && user.socialMediaPlatforms.length > 0) completedFields++;
    if (user.birthDate) completedFields++;
    if (user.gender) completedFields++;
    if (user.sampleWorkLink) completedFields++;
    if (user.aboutYou) completedFields++;

    return Math.round((completedFields / totalFields) * 100);
};

export { calculateProfileCompletion };


const calculateBusinessProfileCompletion = (user: any, loginType: string): number => {
    let completedFields = 0;
    const totalFields = 16;

    if (user.type) completedFields++;
    if (user.name) completedFields++;
    if (user.emailAddress) completedFields++;
    if (user.password && user.password !== 'SOCIAL_LOGIN') completedFields++;
    if (user.countryId) completedFields++;
    if (user.stateId) completedFields++;
    if (user.cityId) completedFields++;
    if (user.brandTypeId) completedFields++;
    if (user.referralCode) completedFields++;
    if (user.userImage) completedFields++;
    if (user.applicationLink) completedFields++;
    if (Array.isArray(user.subcategoriesId) && user.subcategoriesId.length > 0) completedFields++;
    if (user.description) completedFields++;
    if (user.contactPersonName) completedFields++;
    if (user.contactPersonPhoneNumber) completedFields++;
    if (user.gstNumber) completedFields++;

    return Math.round((completedFields / totalFields) * 100);
};
export { calculateBusinessProfileCompletion };