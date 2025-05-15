import { PrismaClient, Prisma } from "@prisma/client";
const prisma = new PrismaClient();


export const mapUserWithLocationAndCategories = async (user: any): Promise<any> => {
    const [country, state, city] = await Promise.all([
        user.countryId ? prisma.country.findUnique({ where: { id: user.countryId } }) : null,
        user.stateId ? prisma.state.findUnique({ where: { id: user.stateId } }) : null,
        user.cityId ? prisma.city.findUnique({ where: { id: user.cityId } }) : null,
    ]);

    // const categories = await getUserCategoriesWithSubcategories(user.id);

    return {
        ...user,
        country: country ? { id: country.id, name: country.name } : null,
        state: state ? { id: state.id, name: state.name } : null,
        city: city ? { id: city.id, name: city.name } : null,
        // categories,
    };
};
