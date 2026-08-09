import { z } from "zod";

/** Default seats from organisation_defaults; pilot may override (e.g. 8). */
export const DEFAULT_CUSTOMER_ORG_SEATS = 5;
export const MIN_CUSTOMER_ORG_SEATS = 1;
export const MAX_CUSTOMER_ORG_SEATS = 100;

export const createCustomerOrganisationSchema = z.object({
  name: z.string().trim().min(1, "Organisation name is required.").max(200),
  country: z.string().trim().min(1, "Country is required.").max(120),
  website: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform(value => {
      if (value === undefined || value === null) return null;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    }),
  ownerNotes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .nullable()
    .transform(value => {
      if (value === undefined || value === null) return null;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    }),
  seats: z
    .number()
    .int()
    .min(MIN_CUSTOMER_ORG_SEATS)
    .max(MAX_CUSTOMER_ORG_SEATS)
    .optional()
    .nullable(),
});

export type CreateCustomerOrganisationInput = z.infer<
  typeof createCustomerOrganisationSchema
>;
