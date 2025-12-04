const calculateProfileCompletion = (user: any): number => {
    let completedFields = 0;
    const totalFields = 16;

    if (user.type) completedFields++;
    if (user.name) completedFields++;
    if (user.emailAddress) completedFields++;
    if (user.countryId) completedFields++;
    if (user.stateId) completedFields++;
    if (user.cityId) completedFields++;
    // if (user.userSubCategories && user.userSubCategories.length > 0) completedFields++;
    if ( user.categories && user.categories.length > 0 && user.categories.some(cat => cat.subcategories && cat.subcategories.length > 0)) { completedFields++;}
    if (user.userImage) completedFields++;
    if (user.contactPersonName) completedFields++;
    if (user.socialMediaPlatforms && user.socialMediaPlatforms.length > 0) completedFields++;
    if (user.birthDate) completedFields++;
    if (user.gender) completedFields++;
    if (user.sampleWorkLink) completedFields++;
    if (user.aboutYou) completedFields++;
    if (user.bankDetails === true) completedFields++;
    if (user.paypalDetails === true) completedFields++;
        

    return Math.round((completedFields / totalFields) * 100);
};

export { calculateProfileCompletion };




const calculateBusinessProfileCompletion = (user: any, loginType: string): number => {
    let completedFields = 0;
    const totalFields = 13;

    if (user.type) completedFields++;
    if (user.name) completedFields++;
    if (user.emailAddress) completedFields++;
    // if (user.password && user.password !== 'SOCIAL_LOGIN') completedFields++;
    if (user.countryId) completedFields++;
    if (user.stateId) completedFields++;
    if (user.cityId) completedFields++;
    if (user.brandTypeId) completedFields++;
    if (user.userImage) completedFields++;
    if (user.applicationLink) completedFields++;
    if (user.subCategories && user.subCategories.length > 0) completedFields++;
    if (user.description) completedFields++;
    if (user.contactPersonName) completedFields++;
    if (user.gstNumber) completedFields++;

    return Math.round((completedFields / totalFields) * 100);
};
export { calculateBusinessProfileCompletion };



export const getProfileCompletionSuggestions = (user: any): string[] => {
    const suggestions: string[] = [];
 //console.log(user, " >>>>>>>>>>>>> User Data 1111");
    if (!user.type) suggestions.push('Please select your user type');
    if (!user.name) suggestions.push('Add your name for youp Profile Completion');
    if (!user.emailAddress) suggestions.push('Add your email address for youp Profile Completion');
    if (!user.password || user.password === 'SOCIAL_LOGIN') suggestions.push('Set a secure password');
    if (!user.countryId) suggestions.push('Please select your country');
    if (!user.stateId) suggestions.push('Please select your state');
    if (!user.cityId) suggestions.push('Please select your city');
 
    if (!user.userSubCategories || user.userSubCategories.length === 0) suggestions.push('Choose at least one sub-category');
    if (!user.userImage) suggestions.push('Please upload a profile image');
    if (!user.contactPersonName) suggestions.push('Add a contact person name');
    if (!user.socialMediaPlatforms || user.socialMediaPlatforms.length === 0) suggestions.push('Add your social media platforms for your Profile Completion');
    if (!user.birthDate) suggestions.push('Set your birth date');
    if (!user.gender) suggestions.push('Select your gender');
    if (!user.sampleWorkLink) suggestions.push('Add your sample work link');
    if (!user.aboutYou) suggestions.push('Write something about yourself for your Profile Completion');

    if (!user.bankDetails) suggestions.push('Add your bank account details');

    return suggestions;
};
