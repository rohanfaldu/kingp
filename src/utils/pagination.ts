
import { Request, Response } from "express";

export const paginate = async (
  req: Request,
  model: any,
  findArgs: any = {},
  resultKey: string = "items"
) => {

const page = parseInt((req.body.page || req.query.page as string) || "1", 10);
const limit = parseInt((req.body.limit || req.query.limit as string) || "10", 10);
const skip = (page - 1) * limit;

const { take = 10, where, include, orderBy } = findArgs;

// Ensure orderBy is properly included in the query
const queryArgs: any = {
  skip,
  take: limit,
  where,
  include
};

// Only add orderBy if it exists to avoid undefined issues
if (orderBy) {
  queryArgs.orderBy = orderBy;
}

console.log('Query Args:', JSON.stringify(queryArgs, null, 2));

const [data, total] = await Promise.all([
  model.findMany(queryArgs),
  model.count({ where }),
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
