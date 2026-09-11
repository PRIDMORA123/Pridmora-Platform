export const CUSTOMER_LICENCE_PLANS = {
  Pilot: {
    name: "Pilot",
    managerCapacity: 15,
  },
  Core: {
    name: "Core",
    managerCapacity: 25,
  },
  Growth: {
    name: "Growth",
    managerCapacity: 50,
  },
  Scale: {
    name: "Scale",
    managerCapacity: 100,
  },
} as const;

export type CustomerLicencePlanName = keyof typeof CUSTOMER_LICENCE_PLANS;

export const CUSTOMER_LICENCE_PLAN_NAMES = Object.keys(
  CUSTOMER_LICENCE_PLANS
) as CustomerLicencePlanName[];

export function isCustomerLicencePlanName(
  value: string
): value is CustomerLicencePlanName {
  return value in CUSTOMER_LICENCE_PLANS;
}

export function managerCapacityForPlan(
  planName: CustomerLicencePlanName
): number {
  return CUSTOMER_LICENCE_PLANS[planName].managerCapacity;
}
