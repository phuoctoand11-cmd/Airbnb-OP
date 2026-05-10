import type { AppRole } from "./supabase";

export const ROLE_PERMISSIONS = {
  manageListings: ["admin", "manager"] as AppRole[],
  manageAmenities: ["admin", "manager"] as AppRole[],
  manageCalendar: ["admin", "manager"] as AppRole[],
  managePricing: ["admin", "manager"] as AppRole[],
  manageBookings: ["admin", "manager", "sales", "accountant"] as AppRole[],
  manageTasks: ["admin", "manager", "maintenance", "cleaner", "cleaningstaff", "staff"] as AppRole[],
  manageFinance: ["admin", "accountant"] as AppRole[],
  manageUsers: ["admin"] as AppRole[],
  viewReports: ["admin", "manager", "accountant"] as AppRole[],
  viewHR: ["admin", "manager", "accountant"] as AppRole[],
  manageHR: ["admin", "manager"] as AppRole[],
  viewDashboard: ["admin", "manager"] as AppRole[],
  viewActivityLogs: ["admin", "manager"] as AppRole[],
} as const;

export type Permission = keyof typeof ROLE_PERMISSIONS;
