// const calculateProfileCompletion = (user: any): number => {
//     let completedFields = 0;
//     const totalFields = 15;

//     if (user.type) completedFields++;
//     if (user.name) completedFields++;
//     if (user.emailAddress) completedFields++;
//     if (user.password && user.password !== 'SOCIAL_LOGIN') completedFields++;
//     if (user.countryId) completedFields++;
//     if (user.stateId) completedFields++;
//     if (user.cityId) completedFields++;
//     if (user.userSubCategories && user.userSubCategories.length > 0) completedFields++;
//     // if (user.referralCode) completedFields++;
//     if (user.userImage) completedFields++;
//     if (user.contactPersonName) completedFields++;
//     if (user.socialMediaPlatform && user.socialMediaPlatform.length > 0) completedFields++;
//     if (user.birthDate) completedFields++;
//     if (user.gender) completedFields++;
//     if (user.sampleWorkLink) completedFields++;
//     if (user.aboutYou) completedFields++;

//     return Math.round((completedFields / totalFields) * 100);
// };

// export { calculateProfileCompletion };

const calculateProfileCompletion = (user: any): number => {
    let completedFields = 0;
    const totalFields = 15;

    console.log("🔍 Starting profile completion calculation for user:", user.id || user.emailAddress || "unknown");

    if (user.type) {
        completedFields++;
        console.log("✅ type is filled");
    }

    if (user.name) {
        completedFields++;
        console.log("✅ name is filled");
    }

    if (user.emailAddress) {
        completedFields++;
        console.log("✅ emailAddress is filled");
    }

    if (user.password && user.password !== 'SOCIAL_LOGIN') {
        completedFields++;
        console.log("✅ password is filled and not SOCIAL_LOGIN");
    }

    if (user.countryId) {
        completedFields++;
        console.log("✅ countryId is filled");
    }

    if (user.stateId) {
        completedFields++;
        console.log("✅ stateId is filled");
    }

    if (user.cityId) {
        completedFields++;
        console.log("✅ cityId is filled");
    }

    if (user.userSubCategories && user.userSubCategories.length > 0) {
        completedFields++;
        console.log("✅ userSubCategories are filled");
    }

    if (user.userImage) {
        completedFields++;
        console.log("✅ userImage is filled");
    }

    if (user.contactPersonName) {
        completedFields++;
        console.log("✅ contactPersonName is filled");
    }

    if (user.socialMediaPlatform && user.socialMediaPlatform.length > 0) {
        completedFields++;
        console.log("✅ socialMediaPlatforms are filled");
    }

    if (user.birthDate) {
        completedFields++;
        console.log("✅ birthDate is filled");
    }

    if (user.gender) {
        completedFields++;
        console.log("✅ gender is filled");
    }

    if (user.sampleWorkLink) {
        completedFields++;
        console.log("✅ sampleWorkLink is filled");
    }

    if (user.aboutYou) {
        completedFields++;
        console.log("✅ aboutYou is filled");
    }

    const percentage = Math.round((completedFields / totalFields) * 100);
    console.log(`🎯 Completed Fields: ${completedFields}/${totalFields} (${percentage}%)`);

    return percentage;
};

export { calculateProfileCompletion };




const calculateBusinessProfileCompletion = (user: any, loginType: string): number => {
    let completedFields = 0;
    const totalFields = 15;

    if (user.type) completedFields++;
    if (user.name) completedFields++;
    if (user.emailAddress) completedFields++;
    if (user.password && user.password !== 'SOCIAL_LOGIN') completedFields++;
    if (user.countryId) completedFields++;
    if (user.stateId) completedFields++;
    if (user.cityId) completedFields++;
    if (user.brandTypeId) completedFields++;
    // if (user.referralCode) completedFields++;
    if (user.userImage) completedFields++;
    if (user.applicationLink) completedFields++;
    if (user.userSubCategories && user.userSubCategories.length > 0) completedFields++;
    if (user.description) completedFields++;
    if (user.contactPersonName) completedFields++;
    if (user.contactPersonPhoneNumber) completedFields++;
    if (user.gstNumber) completedFields++;

    return Math.round((completedFields / totalFields) * 100);
};
export { calculateBusinessProfileCompletion };



export const getProfileCompletionSuggestions = (user: any): string[] => {
    const suggestions: string[] = [];

    if (!user.type) suggestions.push('Please select your user type');
    if (!user.name) suggestions.push('Add your name for youp Profile Completion');
    if (!user.emailAddress) suggestions.push('Add your email address for youp Profile Completion');
    if (!user.password || user.password === 'SOCIAL_LOGIN') suggestions.push('Set a secure password');
    if (!user.countryId) suggestions.push('Please select your country');
    if (!user.stateId) suggestions.push('Please select your state');
    if (!user.cityId) suggestions.push('Please select your city');
    if (!Array.isArray(user.categories) || user.categories.length === 0 || !user.categories.some(cat => Array.isArray(cat.subcategories) && cat.subcategories.length > 0)) {
        suggestions.push('Choose at least one sub-category');
    }
    if (!user.userImage) suggestions.push('Please upload a profile image');
    if (!user.contactPersonName) suggestions.push('Add a contact person name');
    if (!user.socialMediaPlatforms || user.socialMediaPlatforms.length === 0) suggestions.push('Add your social media platforms for your Profile Completion');
    if (!user.birthDate) suggestions.push('Set your birth date');
    if (!user.gender) suggestions.push('Select your gender');
    if (!user.sampleWorkLink) suggestions.push('Add your sample work link');
    if (!user.aboutYou) suggestions.push('Write something about yourself for your Profile Completion');

    return suggestions;
};
