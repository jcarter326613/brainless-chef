import { z } from "zod";

export const documentIdSchema = z.string().trim().min(1);
export const nameSchema = z.string().trim().min(1);
