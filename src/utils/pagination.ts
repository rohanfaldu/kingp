import { Request } from "express";

export const paginate = async (
  req: Request,
  model: any,
  findArgs: any = {},
  resultKey: string = "items"
) => {
  const page = parseInt(req.body.page) || 1;
  const limit = parseInt(req.body.limit) || 10;
  const skip = (page - 1) * limit;

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
