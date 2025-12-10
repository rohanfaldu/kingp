const calculateProfileCompletion = (user: any): number => {
    let completedFields = 0;
    const totalFields = 16;

    // Helper to check if string field is valid (not empty, null, or undefined)
    const isValidString = (value: any): boolean => {
        return value !== null && value !== undefined && typeof value === 'string' && value.trim() !== '';
    };

    if (user.type) completedFields++;
    if (isValidString(user.name)) completedFields++;
    if (isValidString(user.emailAddress)) completedFields++;
    if (user.countryId) completedFields++;
    if (user.stateId) completedFields++;
    if (user.cityId) completedFields++;
    // Check for userSubCategories (array of objects with subCategoryId) OR categories structure
    if (user.userSubCategories && Array.isArray(user.userSubCategories) && user.userSubCategories.length > 0) {
        completedFields++;
    } else if (user.categories && Array.isArray(user.categories) && user.categories.length > 0 && user.categories.some((cat: any) => cat.subcategories && cat.subcategories.length > 0)) {
        completedFields++;
    }
    if (isValidString(user.userImage)) completedFields++;
    if (isValidString(user.contactPersonName)) completedFields++;
    if (user.socialMediaPlatforms && Array.isArray(user.socialMediaPlatforms) && user.socialMediaPlatforms.length > 0) completedFields++;
    if (user.birthDate) completedFields++;
    if (user.gender) completedFields++;
    if (isValidString(user.sampleWorkLink)) completedFields++;
    if (isValidString(user.aboutYou)) completedFields++;
    if (user.bankDetails === true) completedFields++;
    if (user.paypalDetails === true) completedFields++;

    return Math.round((completedFields / totalFields) * 100);
};

export { calculateProfileCompletion };




const calculateBusinessProfileCompletion = (user: any, loginType: string): number => {
    let completedFields = 0;
    const totalFields = 13;

    // Helper to check if string field is valid (not empty, null, or undefined)
    const isValidString = (value: any): boolean => {
        return value !== null && value !== undefined && typeof value === 'string' && value.trim() !== '';
    };

    if (user.type) completedFields++;
    if (isValidString(user.name)) completedFields++;
    if (isValidString(user.emailAddress)) completedFields++;
    if (user.countryId) completedFields++;
    if (user.stateId) completedFields++;
    if (user.cityId) completedFields++;
    if (user.brandTypeId) completedFields++;
    if (isValidString(user.userImage)) completedFields++;
    if (isValidString(user.applicationLink)) completedFields++;
    // Check for subCategories (array) OR userSubCategories (array of objects) OR categories structure
    if (user.subCategories && Array.isArray(user.subCategories) && user.subCategories.length > 0) {
        completedFields++;
    } else if (user.userSubCategories && Array.isArray(user.userSubCategories) && user.userSubCategories.length > 0) {
        completedFields++;
    } else if (user.categories && Array.isArray(user.categories) && user.categories.length > 0 && user.categories.some((cat: any) => cat.subcategories && cat.subcategories.length > 0)) {
        completedFields++;
    }
    if (isValidString(user.description)) completedFields++;
    if (isValidString(user.contactPersonName)) completedFields++;
    if (isValidString(user.gstNumber)) completedFields++;

    return Math.round((completedFields / totalFields) * 100);
};
export { calculateBusinessProfileCompletion };



export const getProfileCompletionSuggestions = (user: any): string[] => {
    const suggestions: string[] = [];
    
    // Helper to check if string field is valid (not empty, null, or undefined)
    const isValidString = (value: any): boolean => {
        return value !== null && value !== undefined && typeof value === 'string' && value.trim() !== '';
    };

    if (!user.type) suggestions.push('Please select your user type');
    if (!isValidString(user.name)) suggestions.push('Add your name for youp Profile Completion');
    if (!isValidString(user.emailAddress)) suggestions.push('Add your email address for youp Profile Completion');
    if (!user.countryId) suggestions.push('Please select your country');
    if (!user.stateId) suggestions.push('Please select your state');
    if (!user.cityId) suggestions.push('Please select your city');
 
    if ((!user.userSubCategories || !Array.isArray(user.userSubCategories) || user.userSubCategories.length === 0) && 
        (!user.categories || !Array.isArray(user.categories) || user.categories.length === 0 || !user.categories.some((cat: any) => cat.subcategories && cat.subcategories.length > 0))) {
        suggestions.push('Choose at least one sub-category');
    }
    if (!isValidString(user.userImage)) suggestions.push('Please upload a profile image');
    if (!isValidString(user.contactPersonName)) suggestions.push('Add a contact person name');
    if (!user.socialMediaPlatforms || !Array.isArray(user.socialMediaPlatforms) || user.socialMediaPlatforms.length === 0) suggestions.push('Add your social media platforms for your Profile Completion');
    if (!user.birthDate) suggestions.push('Set your birth date');
    if (!user.gender) suggestions.push('Select your gender');
    if (!isValidString(user.sampleWorkLink)) suggestions.push('Add your sample work link');
    if (!isValidString(user.aboutYou)) suggestions.push('Write something about yourself for your Profile Completion');

    if (user.bankDetails !== true) suggestions.push('Add your bank account details');
    if (user.paypalDetails !== true) suggestions.push('Add your PayPal account details');

    return suggestions;
};
