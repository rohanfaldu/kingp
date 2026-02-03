import { Request, Response } from 'express';
import { PrismaClient, PurchaseStatus } from '@prisma/client';
import response from '../../utils/response';
import { validate as isUuid } from 'uuid';
import { paginate } from '../../utils/pagination';
import { resolveStatus } from '../../utils/commonFunction';
import { CoinType, CoinStatus } from '@prisma/client';

const prisma = new PrismaClient();
// const userId = req.user?.userId;

// FUNCTION: Auto-generate PRODUCT-XXXX
async function generateProductCode() {
  const lastProduct = await prisma.product.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  let lastNumber = 1000;
  if (lastProduct?.productCode) {
    lastNumber = parseInt(lastProduct.productCode.split('-')[1]);
  }

  return `PRODUCT-${lastNumber + 1}`;
}

/* =========================================
    CREATE PRODUCT
========================================= */
export const createProduct = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const productData = req.body;

    const userId = req.user?.userId;
    if (!userId) {
      return response.error(res, 'Unauthorized: User ID not found from token');
    }

    if (!productData.title) {
      return response.error(res, 'Product title required');
    }

    if (!productData.images || !Array.isArray(productData.images)) {
      return response.error(res, 'Images must be an array');
    }

    const productCode = await generateProductCode();
    const status = resolveStatus(productData.status);

    const newProduct = await prisma.product.create({
      data: {
        title: productData.title,
        images: productData.images,
        description: productData.description ?? null,
        coins: parseFloat(productData.coins), // store as decimal
        status,
        productCode,
        createdBy: userId,
      },
    });

    // Return coins as a fixed 2-decimal string
    const formattedProduct = {
      ...newProduct,
      coins: Number(newProduct.coins).toFixed(2),
    };

    return response.success(
      res,
      'Product created successfully!',
      formattedProduct
    );
  } catch (error: any) {
    return response.error(res, error.message);
  }
};

/* =========================================
    EDIT PRODUCT
========================================= */
export const editProduct = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id } = req.params;
    const productData = req.body;

    if (!isUuid(id)) return response.error(res, 'Invalid UUID format');

    if (!productData.title)
      return response.error(res, 'Product title required');

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        title: productData.title,
        images: productData.images,
        description: productData.description ?? null,
        coins: productData.coins ? parseFloat(productData.coins) : undefined,
        status:
          productData.status !== undefined
            ? resolveStatus(productData.status)
            : undefined,
        updatedBy: req.user?.userId ?? null,
      },
    });

    // Format coins as "10.00"
    const formattedProduct = {
      ...updatedProduct,
      coins: Number(updatedProduct.coins).toFixed(2),
    };

    return response.success(
      res,
      'Product updated successfully!',
      formattedProduct
    );
  } catch (error: any) {
    return response.error(res, error.message);
  }
};

/* =========================================
    GET PRODUCT BY ID
========================================= */
export const getProductById = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) return response.error(res, 'Invalid UUID format');

    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) return response.error(res, 'Product not found');

    const formattedProduct = {
      ...product,
      coins: Number(product.coins).toFixed(2),
    };

    return response.success(
      res,
      'Product fetched successfully!',
      formattedProduct
    );
  } catch (error: any) {
    return response.error(res, error.message);
  }
};

/* =========================================
    GET ALL PRODUCTS (Paginated + Filter + Search)
========================================= */
export const getAllProducts = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    // Pagination params
    const page = req.body.page ? parseInt(req.body.page as string) : 1;
    const limit = req.body.limit ? parseInt(req.body.limit as string) : 10;
    const skip = (page - 1) * limit;

    // Filters
    const { minCoins, maxCoins, search } = req.body;

    // Build where clause dynamically
    const whereClause: any = {};

    if (minCoins !== null && minCoins !== undefined && minCoins !== '') {
      whereClause.coins = { ...whereClause.coins, gte: parseFloat(minCoins) };
    }

    if (maxCoins !== null && maxCoins !== undefined && maxCoins !== '') {
      whereClause.coins = { ...whereClause.coins, lte: parseFloat(maxCoins) };
    }

    if (search !== null && search !== undefined && search.trim() !== '') {
      whereClause.title = { contains: search.trim(), mode: 'insensitive' };
    }

    // Total count for pagination
    const totalRecords = await prisma.product.count({ where: whereClause });

    // Fetch products with pagination
    const products = await prisma.product.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    // Format coins as string with 2 decimals
    const formattedProducts = products.map((p) => ({
      ...p,
      coins: Number(p.coins).toFixed(2),
    }));

    // Response with pagination info
    const responseData = {
      pagination: {
        total: totalRecords,
        page,
        limit,
        totalPages: Math.ceil(totalRecords / limit),
      },
      products: formattedProducts,
    };

    return response.success(
      res,
      'All products fetched successfully!',
      responseData
    );
  } catch (error: any) {
    return response.error(res, error.message);
  }
};

/* =========================================
    DELETE PRODUCT
========================================= */
export const deleteProduct = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) return response.error(res, 'Invalid UUID format');

    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) {
      return response.error(res, 'No product found with this id');
    }

    await prisma.product.delete({ where: { id } });

    return response.success(res, 'Product deleted successfully!', null);
  } catch (error: any) {
    return response.error(res, error.message);
  }
};

/* ======== CREATE PURCHASE ============= */

// export const createPurchase = async (req: Request, res: Response): Promise<any> => {
//   try {
//     const userId = req.user?.userId; // From token
//     if (!userId) return response.error(res, "Unauthorized");

//     const {
//       productId,
//       addressLine1,
//       addressLine2,
//       city,
//       state,
//       zipCode,
//       country,
//     } = req.body;

//     // Validate required fields
//     if (!productId || !addressLine1) {
//       return response.error(
//         res,
//         "productId and addressLine1 are required"
//       );
//     }

//     // Get product details
//     const product = await prisma.product.findUnique({ where: { id: productId } });
//     if (!product) return response.error(res, "Product not found");

//     // Create purchase
//     const newPurchase = await prisma.productPurchase.create({
//       data: {
//         productId,
//         userId,
//         coins: product.coins,  // coins at purchase time
//         addressLine1,
//         addressLine2: addressLine2 ?? null,
//         city: city ?? null,
//         state: state ?? null,
//         zipCode: zipCode ?? null,
//         country: country ?? null,
//         status: PurchaseStatus.PENDING,
//       },
//       include: {
//         userProduct: true,
//         userProductDetail: true,
//       },
//     });

//     // Format coins as string with 2 decimals
//     const formattedPurchase = {
//       ...newPurchase,
//       coins: Number(newPurchase.coins).toFixed(2),
//     };

//     return response.success(
//       res,
//       "Purchase created successfully!",
//       formattedPurchase
//     );
//   } catch (error: any) {
//     return response.error(res, error.message);
//   }
// };

export const createPurchase = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const userId = req.user?.userId; // From token
    if (!userId) return response.error(res, 'Unauthorized');

    const {
      productId,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      country,
    } = req.body;

    // Validate required fields
    if (!productId || !addressLine1) {
      return response.error(res, 'productId and addressLine1 are required');
    }

    // 1️⃣ Get product details
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) return response.error(res, 'Product not found');

    const productCoins = Number(product.coins || 0);

    // 2️⃣ Get referral summary (netAmount)
    const referralSummary = await prisma.referralCoinSummary.findUnique({
      where: { userId },
    });

    if (!referralSummary) {
      return response.error(res, 'User referral summary not found');
    }

    const userNetCoins = Number(referralSummary.netAmount || 0);
    const userWithdrawn = Number(referralSummary.withdrawAmount || 0);

    // 3️⃣ Check balance
    if (userNetCoins < productCoins) {
      return response.error(
        res,
        `Insufficient balance. You have ${userNetCoins.toFixed(2)}, but product requires ${productCoins.toFixed(2)} coins.`
      );
    }

    // 4️⃣ Create Purchase Record
    const newPurchase = await prisma.productPurchase.create({
      data: {
        productId,
        userId,
        coins: Number(productCoins.toFixed(2)), // store in DB as 2 decimals
        addressLine1,
        addressLine2: addressLine2 ?? null,
        city: city ?? null,
        state: state ?? null,
        zipCode: zipCode ?? null,
        country: country ?? null,
        status: PurchaseStatus.PENDING,
      },
      include: {
        userProduct: true,
        userProductDetail: true,
      },
    });

    // 5️⃣ Deduct coins from user's referral summary
    const updatedSummary = await prisma.referralCoinSummary.update({
      where: { userId },
      data: {
        withdrawAmount: Number((userWithdrawn + productCoins).toFixed(2)),
        netAmount: Number((userNetCoins - productCoins).toFixed(2)),
      },
    });

    if (Number(updatedSummary.netAmount) < 3500) {
      await prisma.referralCoinSummary.update({
        where: { userId },
        data: {
          redeemEmailSent: false,
        },
      });
    }

    await prisma.coinTransaction.create({
      data: {
        userId,
        amount: -productCoins, 
        type: CoinType.PURCHASE, 
        status: CoinStatus.UNLOCKED,
      },
    });


    // Format response
    const formattedPurchase = {
      ...newPurchase,
      coins: productCoins.toFixed(2),
    };

    const formattedSummary = {
      ...updatedSummary,
      withdrawAmount: Number(updatedSummary.withdrawAmount).toFixed(2),
      netAmount: Number(updatedSummary.netAmount).toFixed(2),
      totalAmount: Number(updatedSummary.totalAmount).toFixed(2),
    };

    return response.success(res, 'Purchase created successfully!', {
      purchase: formattedPurchase,
      updatedSummary: formattedSummary,
    });
  } catch (error: any) {
    console.error('Purchase Error:', error);
    return response.error(res, error.message);
  }
};

export const getPurchases = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const userId = req.user?.userId; // from token
    if (!userId) return response.error(res, 'Unauthorized');

    // Pagination
    const page = req.body.page ? parseInt(req.body.page as string) : 1;
    const limit = req.body.limit ? parseInt(req.body.limit as string) : 10;
    const skip = (page - 1) * limit;

    // Optional filter by status
    const { status } = req.body;

    const whereClause: any = { userId };
    if (status && Object.values(PurchaseStatus).includes(status)) {
      whereClause.status = status;
    }

    const totalRecords = await prisma.productPurchase.count({
      where: whereClause,
    });

    const purchases = await prisma.productPurchase.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        userProduct: true, // product details
        userProductDetail: true, // user details
      },
    });

    // Format coins as string with 2 decimals
    const formattedPurchases = purchases.map((p) => ({
      ...p,
      coins: Number(p.coins).toFixed(2),
    }));

    const responseData = {
      pagination: {
        total: totalRecords,
        page,
        limit,
        totalPages: Math.ceil(totalRecords / limit),
      },
      purchases: formattedPurchases,
    };

    return response.success(
      res,
      'Purchases fetched successfully!',
      responseData
    );
  } catch (error: any) {
    return response.error(res, error.message);
  }
};

export const updatePurchaseStatus = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isUuid(id)) return response.error(res, 'Invalid UUID format');

    // Validate status
    if (!status || !Object.values(PurchaseStatus).includes(status)) {
      return response.error(
        res,
        'Invalid status. Allowed: PENDING, ONTHEWAY, DELIVERED'
      );
    }

    // Check if purchase exists
    const existingPurchase = await prisma.productPurchase.findUnique({
      where: { id },
      include: {
        userProduct: true,
        userProductDetail: true,
      },
    });

    if (!existingPurchase) return response.error(res, 'Purchase not found');

    // Update status
    const updatedPurchase = await prisma.productPurchase.update({
      where: { id },
      data: { status },
      include: {
        userProduct: true,
        userProductDetail: true,
      },
    });

    // Format coins as string with 2 decimals
    const formattedPurchase = {
      ...updatedPurchase,
      coins: Number(updatedPurchase.coins).toFixed(2),
    };

    return response.success(
      res,
      'Purchase status updated successfully!',
      formattedPurchase
    );
  } catch (error: any) {
    return response.error(res, error.message);
  }
};

export const getPurchasesByProduct = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id: productId } = req.params;
    const { status, page, limit } = req.body;

    if (!isUuid(productId))
      return response.error(res, 'Invalid productId format');

    // Pagination
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : null;
    const skip = limitNum ? (pageNum - 1) * limitNum : undefined;

    // Build where clause
    const whereClause: any = { productId };

    if (status) {
      if (!Object.values(PurchaseStatus).includes(status)) {
        return response.error(res, 'Invalid status filter');
      }
      whereClause.status = status;
    }

    const total = await prisma.productPurchase.count({ where: whereClause });

    const purchases = await prisma.productPurchase.findMany({
      where: whereClause,
      skip,
      take: limitNum || undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        userProduct: true, // product details
        userProductDetail: true, // user details
      },
    });

    // Format coins
    const formattedPurchases = purchases.map((p) => ({
      ...p,
      coins: Number(p.coins).toFixed(2),
    }));

    const responseData = {
      pagination: {
        total,
        page: pageNum,
        limit: limitNum || total,
        totalPages: limitNum ? Math.ceil(total / limitNum) : 1,
      },
      purchases: formattedPurchases,
    };

    return response.success(
      res,
      'Product purchase list fetched!',
      responseData
    );
  } catch (error: any) {
    return response.error(res, error.message);
  }
};

export const getAllProductPurchases = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { status, page, limit, userId } = req.body;

    // Pagination
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : null;
    const skip = limitNum ? (pageNum - 1) * limitNum : undefined;

    // Build filter
    const whereClause: any = {};

    // Filter by status
    if (status) {
      if (!Object.values(PurchaseStatus).includes(status)) {
        return response.error(res, 'Invalid status filter');
      }
      whereClause.status = status;
    }

    // Filter by userId
    if (userId) {
      whereClause.userId = userId;
    }

    // Total count
    const total = await prisma.productPurchase.count({ where: whereClause });

    // Fetch purchases with product & user details
    const purchases = await prisma.productPurchase.findMany({
      where: whereClause,
      skip,
      take: limitNum || undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        userProduct: true,
        userProductDetail: true,
      },
    });

    // Format coins
    const formattedPurchases = purchases.map((p) => ({
      ...p,
      coins: Number(p.coins).toFixed(2),
    }));

    // Response with pagination
    const responseData = {
      pagination: {
        total,
        page: pageNum,
        limit: limitNum || total,
        totalPages: limitNum ? Math.ceil(total / limitNum) : 1,
      },
      purchases: formattedPurchases,
    };

    return response.success(
      res,
      'All product purchases fetched successfully!',
      responseData
    );
  } catch (error: any) {
    return response.error(res, error.message);
  }
};
