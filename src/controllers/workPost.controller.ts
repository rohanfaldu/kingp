import { admin } from 'firebase-admin';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import response from '../utils/response';
import { sendFCMNotificationToUsers } from '../utils/notification';
import { validateLocation } from '../utils/commonFunction';

const prisma = new PrismaClient();

export const createWorkPost = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) return response.error(res, 'Unauthorized user');

    // ---------- Destructure request ----------
    const {
      title,
      description,
      totalAmount,
      subCategoryIds = [],
      deliverables = [],
      platforms = [],
      tags = [],
      attachments = [],
      startDate,
      endDate,
      submissionDeadline,
      isDraft,
      isGlobal,
      countryId,
      stateId,
      cityId = [],
    } = req.body;

    if (!title) return response.error(res, 'Title is required');
    if (!Array.isArray(subCategoryIds) || subCategoryIds.length === 0)
      return response.error(res, 'At least one subCategory is required');

    // ---------- Helper functions ----------
    const toArray = (val: any): string[] => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string' && val.trim() !== '')
        return val.split(',').map((v) => v.trim());
      return [];
    };

    const safeString = (val: any): string => (val ? String(val) : '');
    const safeBoolean = (val: any): boolean => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return false;
    };

    const finalIsGlobal = safeBoolean(isGlobal);
    const finalIsDraft = safeBoolean(isDraft);

    // ---------- Validate locations ----------
    try {
      await validateLocation(
        finalIsGlobal,
        countryId,
        stateId,
        toArray(cityId)
      );
    } catch (err: any) {
      return response.error(res, err.message);
    }

    // ---------- Validate SubCategories ----------
    const validSubCategories = await prisma.subCategory.findMany({
      where: { id: { in: subCategoryIds } },
      select: { id: true },
    });
    if (validSubCategories.length !== subCategoryIds.length) {
      return response.error(res, 'One or more subCategories are invalid');
    }

    // ---------- Create Work Post ----------
    const newPost = await prisma.workPosts.create({
      data: {
        businessId: userId,
        title: safeString(title),
        description: safeString(description),
        totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
        deliverables: toArray(deliverables),
        platforms: toArray(platforms),
        tags: toArray(tags),
        attachments: toArray(attachments),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        submissionDeadline: submissionDeadline
          ? new Date(submissionDeadline)
          : undefined,
        isDraft: finalIsDraft,
        isGlobal: finalIsGlobal,
        countryId: countryId ?? null,
        stateId: stateId ?? null,
        cityId: toArray(cityId),
        workPostCategory: {
          create: subCategoryIds.map((subCategoryId: string) => ({
            subCategoryId,
          })),
        },
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            emailAddress: true,
            userImage: true,
            brandData: { select: { id: true, name: true } },
            countryData: { select: { id: true, name: true } },
            stateData: { select: { id: true, name: true } },
            cityData: { select: { id: true, name: true } },
          },
        },
        workPostCategory: {
          include: {
            workSubCategory: {
              select: {
                id: true,
                name: true,
                categoryInformation: {
                  select: { id: true, name: true, image: true },
                },
              },
            },
          },
        },
      },
    });

    // ---------- Fetch Country, State, and Cities ----------
    const [country, state, cities] = await Promise.all([
      countryId
        ? prisma.country.findUnique({
            where: { id: countryId },
            select: { id: true, name: true },
          })
        : null,
      stateId
        ? prisma.state.findUnique({
            where: { id: stateId },
            select: { id: true, name: true },
          })
        : null,
      cityId.length > 0
        ? prisma.city.findMany({
            where: { id: { in: toArray(cityId) }, stateId },
            select: { id: true, name: true },
          })
        : [],
    ]);

    // ---------- Format response ----------
    const responseData = {
      ...newPost,
      totalAmount: newPost.totalAmount
        ? Number(newPost.totalAmount).toFixed(2)
        : '',
      isDraft: newPost.isDraft,
      isGlobal: newPost.isGlobal,
      country: country || null,
      state: state || null,
      cities,
    };

    return res.status(201).json({
      success: true,
      message: 'Work post created successfully',
      data: responseData,
    });
  } catch (error: any) {
    console.error('Error creating work post:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while creating work post',
      error: error.message,
    });
  }
};

export const getWorkPosts = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: 'Unauthorized user' });
    }

    const { page = 1, limit = 10, isDraft, isGlobal } = req.body;
    const pageNumber = parseInt(page as string);
    const pageSize = parseInt(limit as string);
    const skip = (pageNumber - 1) * pageSize;

    const whereCondition: any = { businessId: userId };
    if (typeof isDraft === 'boolean') { 
      whereCondition.isDraft = isDraft;
    }

    if (typeof isGlobal === 'boolean') {  
      whereCondition.isGlobal = isGlobal;
    }


    // ---------- Fetch work posts ----------
    const workPosts = await prisma.workPosts.findMany({
      where: whereCondition,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            emailAddress: true,
            userImage: true,
            brandData: { select: { id: true, name: true } },
            countryData: { select: { id: true, name: true } },
            stateData: { select: { id: true, name: true } },
            cityData: { select: { id: true, name: true } },
          },
        },
        workPostCountry: { select: { id: true, name: true } },
        workPostState: { select: { id: true, name: true } },
        workPostCategory: {
          include: {
            workSubCategory: {
              select: {
                id: true,
                name: true,
                categoryInformation: {
                  select: { id: true, name: true, image: true },
                },
              },
            },
          },
        },
      },
    });

    // ---------- Fetch city names in bulk ----------
    const allCityIds = workPosts.flatMap((post) => post.cityId || []);
    const uniqueCityIds = Array.from(new Set(allCityIds));

    const cities = uniqueCityIds.length
      ? await prisma.city.findMany({
          where: { id: { in: uniqueCityIds } },
          select: { id: true, name: true },
        })
      : [];

    const cityMap = Object.fromEntries(cities.map((c) => [c.id, c.name]));

    // ---------- Format response ----------
    const formattedPosts = workPosts.map((post) => ({
      id: post.id,
      title: post.title ?? '',
      description: post.description ?? '',
      totalAmount:
        post.totalAmount !== undefined && post.totalAmount !== null
          ? Number(post.totalAmount).toFixed(2)
          : '',
      deliverables: Array.isArray(post.deliverables) ? post.deliverables : [],
      platforms: Array.isArray(post.platforms) ? post.platforms : [],
      tags: Array.isArray(post.tags) ? post.tags : [],
      attachments: Array.isArray(post.attachments) ? post.attachments : [],
      startDate: post.startDate ?? '',
      endDate: post.endDate ?? '',
      submissionDeadline: post.submissionDeadline ?? '',
      isDraft: post.isDraft,
      isGlobal: post.isGlobal,
      business: post.business,
      workPostCategory: post.workPostCategory,
      country: post.workPostCountry || null,
      state: post.workPostState || null,
      cities: (post.cityId || []).map((cid) => ({
        id: cid,
        name: cityMap[cid] || '', // map ID → name
      })),
    }));

    const totalCount = await prisma.workPosts.count({ where: whereCondition });
    const totalPages = Math.ceil(totalCount / pageSize);

    return res.status(200).json({
      success: true,
      message: 'Work posts fetched successfully',
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: pageNumber,
        perPage: pageSize,
      },
      data: formattedPosts,
    });
  } catch (error: any) {
    console.error('Error fetching work posts:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while fetching work posts',
      error: error.message,
    });
  }
};

export const getWorkPostById = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id } = req.body;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: 'Work post ID is required' });
    }

    const workPost = await prisma.workPosts.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            emailAddress: true,
            userImage: true,
            brandData: { select: { id: true, name: true } },
            countryData: { select: { id: true, name: true } },
            stateData: { select: { id: true, name: true } },
            cityData: { select: { id: true, name: true } },
          },
        },
        workPostCountry: { select: { id: true, name: true } },
        workPostState: { select: { id: true, name: true } },
        workPostCategory: {
          include: {
            workSubCategory: {
              select: {
                id: true,
                name: true,
                categoryInformation: {
                  select: { id: true, name: true, image: true },
                },
              },
            },
          },
        },
      },
    });

    if (!workPost) {
      return res
        .status(404)
        .json({ success: false, message: 'Work post not found' });
    }

    // ---------- Fetch city names ----------
    const cities =
      workPost.cityId && workPost.cityId.length
        ? await prisma.city.findMany({
            where: { id: { in: workPost.cityId } },
            select: { id: true, name: true },
          })
        : [];

    // ---------- Format response ----------
    const formattedPost = {
      id: workPost.id,
      title: workPost.title ?? '',
      description: workPost.description ?? '',
      totalAmount:
        workPost.totalAmount !== undefined && workPost.totalAmount !== null
          ? Number(workPost.totalAmount).toFixed(2)
          : '',
      deliverables: Array.isArray(workPost.deliverables)
        ? workPost.deliverables
        : [],
      platforms: Array.isArray(workPost.platforms) ? workPost.platforms : [],
      tags: Array.isArray(workPost.tags) ? workPost.tags : [],
      attachments: Array.isArray(workPost.attachments)
        ? workPost.attachments
        : [],
      startDate: workPost.startDate ?? '',
      endDate: workPost.endDate ?? '',
      submissionDeadline: workPost.submissionDeadline ?? '',
      isDraft: workPost.isDraft ?? false,
      isGlobal: workPost.isGlobal ?? false,
      business: workPost.business,
      workPostCategory: workPost.workPostCategory,
      country: workPost.workPostCountry || null,
      state: workPost.workPostState || null,
      cities: cities.map((c) => ({ id: c.id, name: c.name ?? '' })),
      createdAt: workPost.createdAt ?? '',
      updatedAt: workPost.updatedAt ?? '',
    };

    return res.status(200).json({
      success: true,
      message: 'Work post fetched successfully',
      data: formattedPost,
    });
  } catch (error: any) {
    console.error('Error fetching work post by ID:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while fetching work post',
      error: error.message,
    });
  }
};

export const getAllWorkPosts = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const userId = req.user?.userId;

    const {
      subCategoryIds = [], // array of subcategory IDs
      countryId,
      stateId,
      cityIds = [], // array of city IDs
      search,
      page = 1,
      limit = 10,
    } = req.body;

    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const skip = (pageNumber - 1) * pageSize;

    // ---------- Build dynamic where condition ----------
    const whereCondition: any = { isDraft: false };

    if (countryId) whereCondition.countryId = countryId;
    if (stateId) whereCondition.stateId = stateId;
    if (cityIds.length > 0) whereCondition.cityId = { hasSome: cityIds };
    if (subCategoryIds.length > 0)
      whereCondition.workPostCategory = {
        some: { subCategoryId: { in: subCategoryIds } },
      };

    if (search) {
      whereCondition.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } },
        { deliverables: { hasSome: [String(search)] } },
        { tags: { hasSome: [String(search)] } },
      ];
    }

    // ---------- Fetch posts and count ----------
    const [posts, totalCount] = await Promise.all([
      prisma.workPosts.findMany({
        where: whereCondition,
        include: {
          business: {
            select: {
              id: true,
              name: true,
              emailAddress: true,
              userImage: true,
              brandData: { select: { id: true, name: true } },
              countryData: { select: { id: true, name: true } },
              stateData: { select: { id: true, name: true } },
              cityData: { select: { id: true, name: true } },
            },
          },
          workPostCountry: { select: { id: true, name: true } },
          workPostState: { select: { id: true, name: true } },
          workPostCategory: {
            include: {
              workSubCategory: {
                select: {
                  id: true,
                  name: true,
                  categoryInformation: {
                    select: { id: true, name: true, image: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.workPosts.count({ where: whereCondition }),
    ]);

    // ---------- Fetch all city names for mapping ----------
    const allCityIds = posts.flatMap((p) => p.cityId || []);
    const uniqueCityIds = Array.from(new Set(allCityIds));
    const cities = uniqueCityIds.length
      ? await prisma.city.findMany({
          where: { id: { in: uniqueCityIds } },
          select: { id: true, name: true },
        })
      : [];
    const cityMap = Object.fromEntries(cities.map((c) => [c.id, c.name]));

    // ---------- Fetch applications by current user ----------
    let userAppliedWorkPostIds: Set<string> = new Set();
    if (userId) {
      const applications = await prisma.workPostApplication.findMany({
        where: {
          workPostId: { in: posts.map((p) => p.id) },
          influencerId: userId,
        },
        select: { workPostId: true },
      });
      userAppliedWorkPostIds = new Set(applications.map((a) => a.workPostId));
    }

    // ---------- Format posts ----------
    const formattedPosts = posts.map((post) => ({
      id: post.id,
      title: post.title ?? '',
      description: post.description ?? '',
      totalAmount:
        post.totalAmount !== undefined && post.totalAmount !== null
          ? Number(post.totalAmount).toFixed(2)
          : '',
      deliverables: Array.isArray(post.deliverables) ? post.deliverables : [],
      platforms: Array.isArray(post.platforms) ? post.platforms : [],
      tags: Array.isArray(post.tags) ? post.tags : [],
      attachments: Array.isArray(post.attachments) ? post.attachments : [],
      startDate: post.startDate ?? '',
      endDate: post.endDate ?? '',
      submissionDeadline: post.submissionDeadline ?? '',
      isDraft: post.isDraft ?? false,
      isGlobal: post.isGlobal ?? false,
      createdAt: post.createdAt ?? '',
      updatedAt: post.updatedAt ?? '',
      business: post.business ?? {},
      workPostCategory: post.workPostCategory || [],
      country: post.workPostCountry || null,
      state: post.workPostState || null,
      cities: (post.cityId || []).map((cid) => ({
        id: cid,
        name: cityMap[cid] || '',
      })),
      applyWorkPost: userId ? userAppliedWorkPostIds.has(post.id) : false,
    }));

    return res.status(200).json({
      success: true,
      message: 'Work posts fetched successfully',
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: pageNumber,
        perPage: pageSize,
      },
      data: formattedPosts,
    });
  } catch (error: any) {
    console.error('Error fetching work posts:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while fetching work posts',
      error: error.message,
    });
  }
};

export const updateWorkPost = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return response.error(res, 'Unauthorized user');
    }

    const { id } = req.params;

    const {
      title,
      description,
      totalAmount,
      subCategoryIds = [],
      deliverables = [],
      platforms = [],
      tags = [],
      attachments = [],
      startDate,
      endDate,
      submissionDeadline,
      isDraft,
      isGlobal,
      countryId,
      stateId,
      cityId = [],
    } = req.body;

    // ---------- Check existing post ----------
    const existingPost = await prisma.workPosts.findUnique({
      where: { id },
      include: {
        workPostCategory: true, // include current categories
      },
    });

    if (!existingPost) {
      return response.error(res, 'Work post not found');
    }

    if (existingPost.businessId !== userId) {
      return response.error(
        res,
        'You are not authorized to edit this work post'
      );
    }

    if (!title) {
      return response.error(res, 'Title is required');
    }

    // ---------- Helper functions ----------
    const toArray = (val: any): string[] => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string' && val.trim() !== '')
        return val.split(',').map((v) => v.trim());
      return [];
    };

    const safeString = (val: any): string => (val ? String(val) : '');
    const safeBoolean = (val: any): boolean => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return false;
    };

    const finalIsGlobal = safeBoolean(isGlobal);
    const finalIsDraft = safeBoolean(isDraft);

    // ---------- Validate locations ----------
    try {
      await validateLocation(
        finalIsGlobal,
        countryId,
        stateId,
        toArray(cityId)
      );
    } catch (err: any) {
      return response.error(res, err.message);
    }

    // ---------- Validate SubCategories ----------
    if (subCategoryIds.length > 0) {
      const validSubCategories = await prisma.subCategory.findMany({
        where: { id: { in: subCategoryIds } },
        select: { id: true },
      });
      if (validSubCategories.length !== subCategoryIds.length) {
        return response.error(res, 'One or more subCategories are invalid');
      }
    }

    // ---------- Update Work Post ----------
    const updatedPost = await prisma.workPosts.update({
      where: { id },
      data: {
        title: safeString(title),
        description: safeString(description),
        totalAmount: totalAmount
          ? parseFloat(totalAmount)
          : existingPost.totalAmount,
        deliverables: toArray(deliverables),
        platforms: toArray(platforms),
        tags: toArray(tags),
        attachments: toArray(attachments),
        startDate: startDate ? new Date(startDate) : existingPost.startDate,
        endDate: endDate ? new Date(endDate) : existingPost.endDate,
        submissionDeadline: submissionDeadline
          ? new Date(submissionDeadline)
          : existingPost.submissionDeadline,
        isDraft: finalIsDraft,
        isGlobal: finalIsGlobal,
        countryId: countryId ?? existingPost.countryId,
        stateId: stateId ?? existingPost.stateId,
        cityId: toArray(cityId).length ? toArray(cityId) : existingPost.cityId,
        // Replace existing categories if new ones provided
        workPostCategory: subCategoryIds.length
          ? {
              deleteMany: {}, // remove old
              create: subCategoryIds.map((subCategoryId) => ({
                subCategoryId,
              })),
            }
          : undefined,
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            emailAddress: true,
            userImage: true,
            brandData: { select: { id: true, name: true } },
            countryData: { select: { id: true, name: true } },
            stateData: { select: { id: true, name: true } },
            cityData: { select: { id: true, name: true } },
          },
        },
        workPostCountry: { select: { id: true, name: true } },
        workPostState: { select: { id: true, name: true } },
        workPostCategory: {
          include: {
            workSubCategory: {
              select: {
                id: true,
                name: true,
                categoryInformation: {
                  select: { id: true, name: true, image: true },
                },
              },
            },
          },
        },
      },
    });

    // ---------- Format response ----------
    const responseData = {
      id: updatedPost.id,
      title: updatedPost.title ?? '',
      description: updatedPost.description ?? '',
      totalAmount: updatedPost.totalAmount
        ? Number(updatedPost.totalAmount).toFixed(2)
        : '',
      deliverables: updatedPost.deliverables || [],
      platforms: updatedPost.platforms || [],
      tags: updatedPost.tags || [],
      attachments: updatedPost.attachments || [],
      startDate: updatedPost.startDate ?? '',
      endDate: updatedPost.endDate ?? '',
      submissionDeadline: updatedPost.submissionDeadline ?? '',
      isDraft: updatedPost.isDraft,
      isGlobal: updatedPost.isGlobal,
      business: updatedPost.business,
      country: updatedPost.workPostCountry || null,
      state: updatedPost.workPostState || null,
      cities: (updatedPost.cityId || []).map((cid) => ({ id: cid, name: cid })),
      workPostCategory: updatedPost.workPostCategory,
      createdAt: updatedPost.createdAt ?? '',
      updatedAt: updatedPost.updatedAt ?? '',
    };

    return res.status(200).json({
      success: true,
      message: 'Work post updated successfully',
      data: responseData,
    });
  } catch (error: any) {
    console.error('Error updating work post:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while updating work post',
      error: error.message,
    });
  }
};

export const deleteWorkPost = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized user',
      });
    }

    const { id } = req.params; // work post ID from URL

    // ---------- Check if work post exists ----------
    const existingPost = await prisma.workPosts.findUnique({
      where: { id },
    });

    if (!existingPost) {
      return res.status(404).json({
        success: false,
        message: 'Work post not found',
      });
    }

    // ---------- Ensure only the creator can delete ----------
    if (existingPost.businessId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this work post',
      });
    }

    // ---------- Fetch counts for related data ----------
    const [applicationsCount, subCategoriesCount] = await Promise.all([
      prisma.WorkPostApplication.count({ where: { workPostId: id } }),
      prisma.workPostSubCategory.count({ where: { workPostId: id } }),
    ]);

    // ---------- Delete everything in a transaction ----------
    await prisma.$transaction([
      // Delete applications
      prisma.WorkPostApplication.deleteMany({ where: { workPostId: id } }),
      // Delete subcategories
      prisma.workPostSubCategory.deleteMany({ where: { workPostId: id } }),
      // Delete the work post itself
      prisma.workPosts.delete({ where: { id } }),
    ]);

    return res.status(200).json({
      success: true,
      message: `Work post deleted successfully${
        applicationsCount || subCategoriesCount
          ? ` (also deleted ${applicationsCount} application(s) and ${subCategoriesCount} subcategory link(s))`
          : ''
      }`,
    });
  } catch (error: any) {
    console.error('Error deleting work post:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while deleting work post',
      error: error.message,
    });
  }
};



// Post Applications

export const applyForWorkPost = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id: workPostId } = req.params;
    let { influencerId, groupId, offerAmount, message, attachments } = req.body;

    influencerId = influencerId?.trim() || null;
    groupId = groupId?.trim() || null;

    if (!workPostId) {
      return res.status(400).json({
        success: false,
        message: 'Work post ID is required',
      });
    }

    if (!influencerId && !groupId) {
      return res.status(400).json({
        success: false,
        message: 'Either influencerId or groupId is required',
      });
    }

    // ---------- Fetch work post ----------
    const workPost = await prisma.workPosts.findUnique({
      where: { id: workPostId },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            emailAddress: true,
          },
        },
        workPostCategory: {
          include: {
            workSubCategory: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!workPost) {
      return res.status(404).json({
        success: false,
        message: 'Work post not found',
      });
    }

    if (workPost.isDraft) {
      return res.status(400).json({
        success: false,
        message: 'Cannot apply to a draft work post',
      });
    }

    // ---------- Validate influencer ----------
    if (influencerId) {
      const influencerExists = await prisma.user.findUnique({
        where: { id: influencerId },
        select: { id: true },
      });

      if (!influencerExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid influencerId — user not found',
        });
      }
    }

    // ---------- Validate group ----------
    let groupData: any = null;
    if (groupId) {
      if (!influencerId) {
        return res.status(400).json({
          success: false,
          message: 'InfluencerId is required when applying as a group',
        });
      }

      const isMember = await prisma.groupUsers.findFirst({
        where: { groupId, userId: influencerId, status: true },
      });

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'You are not an Admin of this group',
        });
      }

      groupData = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          groupUsersList: {
            include: {
              adminUser: {
                select: {
                  id: true,
                  name: true,
                  emailAddress: true,
                  userImage: true,
                },
              },
              invitedUser: {
                select: {
                  id: true,
                  name: true,
                  emailAddress: true,
                  userImage: true,
                },
              },
            },
          },
        },
      });

      if (!groupData) {
        return res
          .status(404)
          .json({ success: false, message: 'Group not found' });
      }
    }

    // ---------- Prevent duplicate application ----------
    const existingApplication = await prisma.workPostApplication.findFirst({
      where: {
        workPostId,
        OR: [
          influencerId ? { influencerId } : undefined,
          groupId ? { groupId } : undefined,
        ].filter(Boolean) as any,
      },
    });

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: 'You have already applied for this work post',
      });
    }

    // ---------- Create new application ----------
    const newApplication = await prisma.workPostApplication.create({
      data: {
        workPostId,
        influencerId,
        groupId,
        businessId: workPost.businessId,
        offerAmount: offerAmount ? parseFloat(offerAmount) : null,
        message,
        attachments: attachments || [],
        status: 'PENDING',
      },
      include: {
        influencer: {
          select: { id: true, name: true, emailAddress: true, userImage: true },
        },
        group: {
          select: { id: true, groupName: true },
        },
      },
    });

    // ---------- Format category ----------
    const formattedCategory = workPost.workPostCategory.map((wc) => ({
      id: wc.workSubCategory.id,
      name: wc.workSubCategory.name,
    }));

    // ---------- Format group members ----------
    const formattedGroup =
      groupData &&
      ({
        id: groupData.id,
        groupName: groupData.groupName,
        groupImage: groupData.groupImage,
        groupBio: groupData.groupBio,
        members: groupData.groupUsersList
          .map((entry) => {
            const baseUser = entry.invitedUser || entry.adminUser;
            if (!baseUser) return null;
            return {
              ...baseUser,
              isAdmin: !!entry.adminUser && entry.adminUser.id === baseUser.id,
              requestAccept: entry.requestAccept,
            };
          })
          .filter(
            (user, index, self) =>
              user && index === self.findIndex((u) => u.id === user.id)
          ),
      } as any);

    // ---------- Build response ----------
    const responseData = {
      ...newApplication,
      workPost: {
        id: workPost.id,
        title: workPost.title,
        description: workPost.description,
        totalAmount: workPost.totalAmount,
        startDate: workPost.startDate ?? '',
        endDate: workPost.endDate ?? '',
        submissionDeadline: workPost.submissionDeadline ?? '',
        attachments: workPost.attachments ?? [],
        subcategory: formattedCategory,
        business: workPost.business,
        createdAt: workPost.createdAt,
        updatedAt: workPost.updatedAt,
      },
      ...(formattedGroup && { group: formattedGroup }),
    };

    // ---------- Send notification to business ----------
    try {
      const businessUser = await prisma.user.findUnique({
        where: { id: workPost.businessId },
        select: { id: true, fcmToken: true },
      });

      if (businessUser) {
        const applicantName =
          newApplication.group?.groupName ||
          newApplication.influencer?.name ||
          'Someone';

        await sendFCMNotificationToUsers(
          [businessUser],
          'New Application Received!',
          `${applicantName} applied to your work post`,
          'WORK_POST_APPLIED',
          workPost.id
        );
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      data: responseData,
    });
  } catch (error: any) {
    console.error('Error applying for work post:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while applying for work post',
      error: error.message,
    });
  }
};

export const getWorkPostApplications = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { influencerId, groupId, page = 1, limit = 10 } = req.body;

    if (!influencerId) {
      return res.status(400).json({
        success: false,
        message: 'influencerId is required',
      });
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    let filter: any = {};

    // Case 1: Only influencerId (fetch individual applications only)
    if (!groupId) {
      filter = {
        influencerId: influencerId as string,
        groupId: null,
      };
    }
    // Case 2: influencerId + groupId (fetch group applications)
    else {
      // Validate influencer is part of this group
      const isMember = await prisma.groupUsers.findFirst({
        where: {
          groupId: groupId as string,
          userId: influencerId as string,
          status: true,
        },
      });

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'Influencer is not part of the provided group',
        });
      }

      filter = { groupId: groupId as string };
    }

    // Total count
    const totalCount = await prisma.workPostApplication.count({
      where: filter,
    });

    // Fetch paginated applications
    const applications = await prisma.workPostApplication.findMany({
      where: filter,
      include: {
        influencer: {
          select: { id: true, name: true, emailAddress: true, userImage: true },
        },
        group: {
          include: {
            groupUsersList: {
              include: {
                adminUser: {
                  select: { id: true, name: true, emailAddress: true, userImage: true },
                },
                invitedUser: {
                  select: { id: true, name: true, emailAddress: true, userImage: true },
                },
              },
            },
          },
        },
        workPost: {
          include: {
            business: { select: { id: true, name: true, emailAddress: true } },
            workPostCategory: {
              include: {
                workSubCategory: { include: { categoryInformation: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    // Format each application
    const formatted = applications.map((app) => {
      const wp = app.workPost;

      // Format subcategories
      const formattedSubcategories = (wp.workPostCategory || []).map((wpc) => ({
        id: wpc.workPostId,
        subCategoryId: wpc.subCategoryId,
        subCategoryName: wpc.workSubCategory?.name ?? '',
        categoryInformation: wpc.workSubCategory?.categoryInformation
          ? {
              id: wpc.workSubCategory.categoryInformation.id,
              name: wpc.workSubCategory.categoryInformation.name ?? '',
              image: wpc.workSubCategory.categoryInformation.image ?? '',
            }
          : null,
      }));

      // Flatten group members
      let formattedGroup = null;
      if (app.group) {
        formattedGroup = {
          id: app.group.id,
          groupName: app.group.groupName,
          groupImage: app.group.groupImage,
          groupBio: app.group.groupBio,
          members: app.group.groupUsersList
            .map((entry) => {
              const baseUser = entry.invitedUser || entry.adminUser;
              if (!baseUser) return null;
              return {
                ...baseUser,
                isAdmin: !!entry.adminUser && entry.adminUser.id === baseUser.id,
                requestAccept: entry.requestAccept,
              };
            })
            .filter(
              (user, index, self) =>
                user && index === self.findIndex((u) => u.id === user.id)
            ),
        };
      }

      return {
        id: app.id,
        workPostId: wp.id,
        influencerId: app.influencerId,
        groupId: app.groupId,
        offerAmount: app.offerAmount ? Number(app.offerAmount).toFixed(2) : null,
        message: app.message ?? '',
        attachments: Array.isArray(app.attachments) ? app.attachments : [],
        status: app.status,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        influencer: app.influencer ?? null,
        ...(formattedGroup && { group: formattedGroup }),
        workPost: {
          id: wp.id,
          title: wp.title ?? '',
          description: wp.description ?? '',
          totalAmount:
            wp.totalAmount !== undefined && wp.totalAmount !== null
              ? Number(wp.totalAmount).toFixed(2)
              : '',
          startDate: wp.startDate ?? '',
          endDate: wp.endDate ?? '',
          submissionDeadline: wp.submissionDeadline ?? '',
          attachments: Array.isArray(wp.attachments) ? wp.attachments : [],
          subcategories: formattedSubcategories,
          business: wp.business ?? {},
          createdAt: wp.createdAt,
          updatedAt: wp.updatedAt,
        },
      };
    });

    return res.status(200).json({
      success: true,
      message: 'Applications fetched successfully',
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / Number(limit)),
        currentPage: Number(page),
        limit: Number(limit),
      },
      data: formatted,
    });
  } catch (error: any) {
    console.error('Error fetching applications:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while fetching applications',
      error: error.message,
    });
  }
};