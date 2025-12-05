import { admin } from 'firebase-admin';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import response from '../utils/response';

const prisma = new PrismaClient();

export const createWorkPost = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return response.error(res, 'Unauthorized user');
    }

    const {
      title,
      description,
      totalAmount,
      categoryId,
      deliverables = [],
      platforms = [],
      tags = [],
      attachments = [],
      startDate,
      endDate,
      submissionDeadline,
      isDraft,
    } = req.body;

    if (!title) {
      return response.error(res, 'Title is required');
    }

    if (!categoryId) {
      return response.error(res, 'Category ID is required');
    }
    console.log(categoryId,'>>>>>>>>>>>categoryId');

    // ✅ Validate category existence
    const categoryExists = await prisma.category.findUnique({
      where: { id: categoryId as any },
    });

    if (!categoryExists) {
      return response.error(
        res,
        `Invalid Category ID: ${categoryId} — category not found`
      );
    }

    // ✅ Safe conversions
    const toArray = (val: any): string[] => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string' && val.trim() !== '')
        return val.split(',').map((v) => v.trim());
      return [];
    };

    const safeString = (val: any): string => (val ? String(val) : '');

    // ✅ Create Work Post
    const newPost = await prisma.workPosts.create({
      data: {
        businessId: userId,
        title: safeString(title),
        description: safeString(description),
        totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
        categoryId,
        deliverables: toArray(deliverables),
        platforms: toArray(platforms),
        tags: toArray(tags),
        attachments: toArray(attachments),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        submissionDeadline: submissionDeadline
          ? new Date(submissionDeadline)
          : undefined,
        isDraft: isDraft ?? false,
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
        category: {
          include: {
            categoryInformation: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
    });

    // ✅ Transform response (replace null → "")
      const { category, ...restOfNewPost } = newPost;
    const responseData = {
      ...newPost,
      description: newPost.description ?? '',
      totalAmount: newPost.totalAmount
        ? Number(newPost.totalAmount).toFixed(2)
        : '',
      startDate: newPost.startDate ? newPost.startDate : '',
      endDate: newPost.endDate ? newPost.endDate : '',
      submissionDeadline: newPost.submissionDeadline
        ? newPost.submissionDeadline
        : '',
        category: category?.categoryInformation
        ? {
            id: category.id,
            name: category.name,
            image: category.image ?? '',
          }
        : null,
      // subcategory: category
      //   ? {
      //       id: category.id,
      //       name: category.name ?? '',
      //       image: category.image ?? '',
      //       status: category.status ?? '',
      //     }
      //   : null,
    };

    // delete (responseData as any).category;

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

    const { page = 1, limit = 10, isDraft } = req.body;

    const pageNumber = parseInt(page as string);
    const pageSize = parseInt(limit as string);
    const skip = (pageNumber - 1) * pageSize;

    // ✅ Build filter condition
    const whereCondition: any = { businessId: userId };
    if (typeof isDraft === 'boolean') {
      whereCondition.isDraft = isDraft;
    }

    // ✅ Count total posts
    const totalCount = await prisma.workPosts.count({
      where: whereCondition,
    });

    // ✅ Fetch posts with filters
    const workPosts = await prisma.workPosts.findMany({
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
        category: {
          include: {
            categoryInformation: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });

    const postIds = workPosts.map((p) => p.id);

    const applicantsCount = await prisma.workPostApplication.groupBy({
      by: ['workPostId'],
      where: { workPostId: { in: postIds } },
      _count: true,
    });

    const applicantsMap = Object.fromEntries(
      applicantsCount.map((g) => [g.workPostId, g._count])
    );

    // ✅ Format data (null → "")
    const formattedPosts = workPosts.map((post) => ({
      ...post,
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
      createdAt: post.createdAt ?? '',
      updatedAt: post.updatedAt ?? '',
      applicantsCount: applicantsMap[post.id] || 0,
      subcategory: post.category
        ? {
            id: post.category.id,
            name: post.category.name ?? '',
            image: post.category.image ?? '',
            status: post.category.status ?? '',
            category: post.category.categoryInformation
              ? {
                  id: post.category.categoryInformation.id,
                  name: post.category.categoryInformation.name ?? '',
                  image: post.category.categoryInformation.image ?? '',
                }
              : null,
          }
        : null,
    }));

    // ✅ Remove old category field
    formattedPosts.forEach((p: any) => delete p.category);

    // ✅ Pagination response
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
        // workPost: true,
        workPost: {
          include: {
            influencer: {
              select: {
                id: true,
                name: true,
                userImage: true,
                fcmToken: true,
              },
            },
          },
        },
        category: {
          include: {
            categoryInformation: {
              select: { id: true, name: true, image: true },
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

    // ✅ Format totalAmount with fallback
    const formattedTotalAmount =
      workPost.totalAmount !== undefined && workPost.totalAmount !== null
        ? Number(workPost.totalAmount).toFixed(2)
        : '';

    // ✅ Transform data and replace null with ""
    const responseData = {
      ...workPost,
      title: workPost.title ?? '',
      description: workPost.description ?? '',
      startDate: workPost.startDate ?? '',
      endDate: workPost.endDate ?? '',
      submissionDeadline: workPost.submissionDeadline ?? '',
      createdAt: workPost.createdAt ?? '',
      updatedAt: workPost.updatedAt ?? '',
      deliverables: Array.isArray(workPost.deliverables)
        ? workPost.deliverables
        : [],
      platforms: Array.isArray(workPost.platforms) ? workPost.platforms : [],
      tags: Array.isArray(workPost.tags) ? workPost.tags : [],
      attachments: Array.isArray(workPost.attachments)
        ? workPost.attachments
        : [],
      totalAmount: formattedTotalAmount,
      subcategory: workPost.category
        ? {
            id: workPost.category.id,
            name: workPost.category.name ?? '',
            image: workPost.category.image ?? '',
            status: workPost.category.status ?? '',
            category: workPost.category.categoryInformation
              ? {
                  id: workPost.category.categoryInformation.id,
                  name: workPost.category.categoryInformation.name ?? '',
                  image: workPost.category.categoryInformation.image ?? '',
                }
              : null,
          }
        : null,
    };

    delete (responseData as any).category;

    return res.status(200).json({
      success: true,
      message: 'Work post fetched successfully',
      data: responseData,
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
    const { categoryId, search, page = 1, limit = 10 } = req.body;

    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const skip = (pageNumber - 1) * pageSize;

    // ✅ Dynamic filter
    const whereCondition: any = { isDraft: false };

    if (categoryId) whereCondition.categoryId = String(categoryId);

    if (search) {
      whereCondition.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } },
        { deliverables: { hasSome: [String(search)] } },
        { tags: { hasSome: [String(search)] } },
      ];
    }

    // ✅ Fetch data and count in parallel
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
          category: {
            include: {
              categoryInformation: {
                select: { id: true, name: true, image: true },
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

    // ✅ Format response (replace null → "")
    const formattedPosts = posts.map((post) => ({
      id: post.id,
      businessId: post.businessId ?? '',
      title: post.title ?? '',
      description: post.description ?? '',
      status: post.status ?? '',
      totalAmount:
        post.totalAmount !== undefined && post.totalAmount !== null
          ? Number(post.totalAmount).toFixed(2)
          : '',
      categoryId: post.categoryId ?? '',
      deliverables: Array.isArray(post.deliverables) ? post.deliverables : [],
      platforms: Array.isArray(post.platforms) ? post.platforms : [],
      tags: Array.isArray(post.tags) ? post.tags : [],
      attachments: Array.isArray(post.attachments) ? post.attachments : [],
      startDate: post.startDate ?? '',
      endDate: post.endDate ?? '',
      submissionDeadline: post.submissionDeadline ?? '',
      isDraft: post.isDraft ?? false,
      createdAt: post.createdAt ?? '',
      updatedAt: post.updatedAt ?? '',
      business: post.business ?? {},
      subcategory: post.category
        ? {
            id: post.category.id,
            name: post.category.name ?? '',
            image: post.category.image ?? '',
            status: post.category.status ?? '',
            category: post.category.categoryInformation
              ? {
                  id: post.category.categoryInformation.id,
                  name: post.category.categoryInformation.name ?? '',
                  image: post.category.categoryInformation.image ?? '',
                }
              : '',
          }
        : '',
    }));

    // ✅ Final response
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

export const updateWorkPost = async (req: Request, res: Response): Promise<any> => {
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
      categoryId,
      deliverables = [],
      platforms = [],
      tags = [],
      attachments = [],
      startDate,
      endDate,
      submissionDeadline,
      isDraft,
    } = req.body;

    // Check existing post
    const existingPost = await prisma.workPosts.findUnique({
      where: { id },
    });

    if (!existingPost) {
      return response.error(res, 'Work post not found');
    }

    if (existingPost.businessId !== userId) {
      return response.error(res, 'You are not authorized to edit this work post');
    }

    if (!title) {
      return response.error(res, 'Title is required');
    }

    // 🔥 FIX — Validate category ONLY when changed
    let finalCategoryId = existingPost.categoryId;

    if (categoryId && categoryId !== existingPost.categoryId) {
      const categoryExists = await prisma.category.findUnique({
        where: { id: String(categoryId) },
      });

      if (!categoryExists) {
        return response.error(res, 'Invalid category ID — category not found');
      }

      finalCategoryId = categoryId;
    }

    // Array formatter
    const toArray = (val: any): string[] => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string' && val.trim() !== '')
        return val.split(',').map((v) => v.trim());
      return [];
    };

    const safeString = (val: any): string => (val ? String(val) : '');

    // Update
    const updatedPost = await prisma.workPosts.update({
      where: { id },
      data: {
        title: safeString(title),
        description: safeString(description),
        totalAmount:
          totalAmount !== undefined && totalAmount !== null
            ? parseFloat(totalAmount)
            : existingPost.totalAmount,

        categoryId: finalCategoryId,

        deliverables: toArray(deliverables),
        platforms: toArray(platforms),
        tags: toArray(tags),
        attachments: toArray(attachments),

        startDate: startDate ? new Date(startDate) : existingPost.startDate,
        endDate: endDate ? new Date(endDate) : existingPost.endDate,
        submissionDeadline: submissionDeadline
          ? new Date(submissionDeadline)
          : existingPost.submissionDeadline,

        isDraft: isDraft ?? existingPost.isDraft,
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
        category: {
          include: {
            categoryInformation: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
    });

    // Response structure
    return res.status(200).json({
      success: true,
      message: 'Work post updated successfully',
      data: {
        ...updatedPost,
        totalAmount: updatedPost.totalAmount
          ? Number(updatedPost.totalAmount).toFixed(2)
          : '',
        deliverables: updatedPost.deliverables || [],
        platforms: updatedPost.platforms || [],
        tags: updatedPost.tags || [],
        attachments: updatedPost.attachments || [],
        category: updatedPost.category?.categoryInformation
          ? {
              id: updatedPost.category.id,
              name: updatedPost.category.name,
              image: updatedPost.category.image ?? '',
            }
          : null,
      },
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


export const deleteWorkPost = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: 'Unauthorized user' });
    }

    const { id } = req.params; // work post ID from URL

    // ✅ Check if work post exists
    const existingPost = await prisma.workPosts.findUnique({
      where: { id },
    });

    if (!existingPost) {
      return res.status(404).json({
        success: false,
        message: 'Work post not found',
      });
    }

    // ✅ Ensure only the creator (business) can delete
    if (existingPost.businessId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this work post',
      });
    }

    // Check how many applications exist
    const applicationsCount = await prisma.workPostApplication.count({
      where: { workPostId: id },
    });

    // If applications exist → delete them first
    if (applicationsCount > 0) {
      await prisma.workPostApplication.deleteMany({
        where: { workPostId: id },
      });
    }

    // Now delete the work post
    await prisma.workPosts.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message:
        applicationsCount > 0
          ? "Work post and its applications deleted successfully"
          : "Work post deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting work post:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while deleting work post",
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
      return res
        .status(400)
        .json({ success: false, message: 'Work post ID is required' });
    }

    if (!influencerId && !groupId) {
      return res.status(400).json({
        success: false,
        message: 'Either influencerId or groupId is required',
      });
    }

    const workPost = await prisma.workPosts.findUnique({
      where: { id: workPostId },
      include: {
        category: { include: { categoryInformation: true } },
        business: { select: { id: true, name: true, emailAddress: true } },
      },
    });

    if (!workPost) {
      return res
        .status(404)
        .json({ success: false, message: 'Work post not found' });
    }

    if (workPost.isDraft) {
      return res
        .status(400)
        .json({ success: false, message: 'Cannot apply to a draft work post' });
    }

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

    let groupData = null;
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
          message: 'You are not a Admin of this group',
        });
      }

      // ✅ Fetch full group details (admin + invited users with requestAccept)
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
          select: {
            id: true,
            name: true,
            emailAddress: true,
            userImage: true,
          },
        },
        group: {
          select: {
            id: true,
            groupName: true,
          },
        },
      },
    });

    const formattedCategory = workPost.categoryId
      ? {
          id: workPost.categoryId,
          name: workPost.category?.name ?? '',
          image: workPost.category?.image ?? '',
          status: workPost.category?.status ?? '',
          category: workPost.category?.categoryInformation
            ? {
                id: workPost.category.categoryInformation.id,
                name: workPost.category.categoryInformation.name,
                image: workPost.category.categoryInformation.image ?? '',
              }
            : null,
        }
      : null;

    // ✅ Build unified group members (admin + invited users) with requestAccept
    const formattedGroup = groupData && {
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
        ), // remove duplicates
    };

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

// export const getWorkPostApplications = async (req: Request, res: Response): Promise<any> => {
//   try {
//     const { influencerId, groupId } = req.body;

//     if (!influencerId) {
//       return res.status(400).json({
//         success: false,
//         message: "influencerId is required",
//       });
//     }

//     let filter: any = { influencerId: influencerId as string };

//     // ✅ If groupId is passed, validate influencer is in the group
//     if (groupId) {
//       const isMember = await prisma.groupUsers.findFirst({
//         where: {
//           groupId: groupId as string,
//           userId: influencerId as string,
//           status: true,
//         },
//       });

//       if (!isMember) {
//         return res.status(403).json({
//           success: false,
//           message: "Influencer is not part of the provided group",
//         });
//       }

//       filter = { groupId: groupId as string };
//     }

//     // ✅ Fetch applications based on mode (influencer or group)
//     const applications = await prisma.workPostApplication.findMany({
//       where: filter,
//       include: {
//         influencer: {
//           select: { id: true, name: true, emailAddress: true, userImage: true },
//         },
//         group: {
//           include: {
//             groupUsersList: {
//               include: {
//                 adminUser: {
//                   select: {
//                     id: true,
//                     name: true,
//                     emailAddress: true,
//                     userImage: true,
//                   },
//                 },
//                 invitedUser: {
//                   select: {
//                     id: true,
//                     name: true,
//                     emailAddress: true,
//                     userImage: true,
//                   },
//                 },
//               },
//             },
//           },
//         },
//         workPost: {
//           include: {
//             category: {
//               include: { categoryInformation: true },
//             },
//             business: {
//               select: { id: true, name: true, emailAddress: true },
//             },
//           },
//         },
//       },
//       orderBy: { createdAt: "desc" },
//     });

//     // ✅ Format each application same as "applyForWorkPost" response
//     const formatted = applications.map((app) => {
//       const wp = app.workPost;

//       // Format category
//       const formattedCategory = wp.categoryId
//         ? {
//             id: wp.categoryId,
//             name: wp.category?.name ?? "",
//             image: wp.category?.image ?? "",
//             status: wp.category?.status ?? "",
//             category: wp.category?.categoryInformation
//               ? {
//                   id: wp.category.categoryInformation.id,
//                   name: wp.category.categoryInformation.name,
//                   image: wp.category.categoryInformation.image ?? "",
//                 }
//               : null,
//           }
//         : null;

//       // Format group members if group exists
//       let formattedGroup = null;
//       if (app.group) {
//         const adminUsers = new Map<string, any>();
//         const invitedUsers: any[] = [];

//         app.group.groupUsersList.forEach((g) => {
//           if (g.adminUser && !adminUsers.has(g.adminUser.id)) {
//             adminUsers.set(g.adminUser.id, {
//               ...g.adminUser,
//               requestAccept: g.requestAccept,
//             });
//           }
//           if (g.invitedUser) {
//             invitedUsers.push({
//               ...g.invitedUser,
//               requestAccept: g.requestAccept,
//             });
//           }
//         });

//         formattedGroup = {
//           id: app.group.id,
//           groupName: app.group.groupName,
//           groupImage: app.group.groupImage,
//           groupBio: app.group.groupBio,
//           members: {
//             admins: Array.from(adminUsers.values()),
//             invitedUsers,
//           },
//         };
//       }

//       return {
//         ...app,
//         workPost: {
//           id: wp.id,
//           title: wp.title,
//           description: wp.description,
//           totalAmount: wp.totalAmount,
//           startDate: wp.startDate ?? "",
//           endDate: wp.endDate ?? "",
//           submissionDeadline: wp.submissionDeadline ?? "",
//           attachments: wp.attachments ?? [],
//           subcategory: formattedCategory,
//           business: wp.business,
//           createdAt: wp.createdAt,
//           updatedAt: wp.updatedAt,
//         },
//         ...(formattedGroup && { group: formattedGroup }),
//       };
//     });

//     return res.status(200).json({
//       success: true,
//       message: "Applications fetched successfully",
//       data: formatted,
//     });
//   } catch (error: any) {
//     console.error("Error fetching applications:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Something went wrong while fetching applications",
//       error: error.message,
//     });
//   }
// };

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

    // ✅ Case 1: Only influencerId (fetch individual applications only)
    if (!groupId) {
      filter = {
        influencerId: influencerId as string,
        groupId: null, // exclude group applications
      };
    }

    // ✅ Case 2: influencerId + groupId (fetch group applications)
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

    // ✅ Get total count
    const totalCount = await prisma.workPostApplication.count({
      where: filter,
    });

    // ✅ Fetch paginated applications
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
        },
        workPost: {
          include: {
            category: {
              include: { categoryInformation: true },
            },
            business: {
              select: { id: true, name: true, emailAddress: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    // ✅ Format each application same as before
    const formatted = applications.map((app) => {
      const wp = app.workPost;

      // Format category
      const formattedCategory = wp.categoryId
        ? {
            id: wp.categoryId,
            name: wp.category?.name ?? '',
            image: wp.category?.image ?? '',
            status: wp.category?.status ?? '',
            category: wp.category?.categoryInformation
              ? {
                  id: wp.category.categoryInformation.id,
                  name: wp.category.categoryInformation.name,
                  image: wp.category.categoryInformation.image ?? '',
                }
              : null,
          }
        : null;

      // Format group members (admins + invited)
      let formattedGroup = null;
      if (app.group) {
        const adminUsers = new Map<string, any>();
        const invitedUsers: any[] = [];

        app.group.groupUsersList.forEach((g) => {
          if (g.adminUser && !adminUsers.has(g.adminUser.id)) {
            adminUsers.set(g.adminUser.id, {
              ...g.adminUser,
              requestAccept: g.requestAccept,
            });
          }
          if (g.invitedUser) {
            invitedUsers.push({
              ...g.invitedUser,
              requestAccept: g.requestAccept,
            });
          }
        });

        formattedGroup = {
          id: app.group.id,
          groupName: app.group.groupName,
          groupImage: app.group.groupImage,
          groupBio: app.group.groupBio,
          members: {
            admins: Array.from(adminUsers.values()),
            invitedUsers,
          },
        };
      }

      return {
        ...app,
        workPost: {
          id: wp.id,
          title: wp.title,
          description: wp.description,
          totalAmount: wp.totalAmount,
          startDate: wp.startDate ?? '',
          endDate: wp.endDate ?? '',
          submissionDeadline: wp.submissionDeadline ?? '',
          attachments: wp.attachments ?? [],
          subcategory: formattedCategory,
          business: wp.business,
          createdAt: wp.createdAt,
          updatedAt: wp.updatedAt,
        },
        ...(formattedGroup && { group: formattedGroup }),
      };
    });

    // ✅ Pagination meta
    const totalPages = Math.ceil(totalCount / Number(limit));

    return res.status(200).json({
      success: true,
      message: 'Applications fetched successfully',
      pagination: {
        totalCount,
        totalPages,
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
