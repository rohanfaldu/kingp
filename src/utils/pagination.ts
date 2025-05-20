import { Request } from "express";

export const paginate = async (
  req: Request,
  model: any,
  findArgs: any = {},
  resultKey: string = "items"
) => {
  const page = parseInt((req.body.page || req.query.page as string) || "1", 10);
  const limit = parseInt((req.body.limit || req.query.limit as string) || "10", 10);
  const skip = (page - 1) * limit;
  // const orderBy = findArgs.orderBy || { createdAt: 'desc' };

  const orderBy = findArgs.orderBy || [
  { updatedAt: 'desc' },
  { createdAt: 'desc' },
  { updatesAt: 'desc' },
];

  const [data, total] = await Promise.all([
    model.findMany({ skip, take: limit, ...findArgs }),
    model.count({ where: findArgs.where }),
  ]);

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    [resultKey]: data,
  };
};
