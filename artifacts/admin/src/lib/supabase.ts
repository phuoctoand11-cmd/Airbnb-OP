import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  throw new Error(
    "[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Set both secrets in Replit and restart the workflow.",
  );
}

// eslint-disable-next-line no-console
console.info(
  "[supabase] init",
  JSON.stringify({
    url: supabaseUrl,
    anonKeyLoaded: Boolean(supabaseAnonKey),
    anonKeyLength: supabaseAnonKey.length,
  }),
);

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "airbnb-ops-admin-auth",
    },
  },
);

export const SUPABASE_URL_FOR_DEBUG = supabaseUrl;
export const SUPABASE_ANON_KEY_LOADED = Boolean(supabaseAnonKey);

export type AppRole =
  | "admin"
  | "manager"
  | "accountant"
  | "sales"
  | "maintenance"
  | "cleaner"
  | "staff";

export const ROLES: AppRole[] = [
  "admin",
  "manager",
  "accountant",
  "sales",
  "maintenance",
  "cleaner",
  "staff",
];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  accountant: "Accountant",
  sales: "Sales",
  maintenance: "Maintenance",
  cleaner: "Cleaner",
  staff: "Staff",
};

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  // Joined relations from the public.users query
  role: { name: string } | null;
  team: { id: string; name: string } | null;
}

export interface Listing {
  id: string;
  title: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  bedrooms: number;
  bathrooms: number;
  max_guests: number;
  /** Omitted for sales/maintenance/cleaner/staff — always guard with canViewPrices() before rendering */
  base_price?: number;
  /** Omitted for sales/maintenance/cleaner/staff — always guard with canViewPrices() before rendering */
  cleaning_fee?: number;
  status: "active" | "inactive" | "maintenance";
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListingImage {
  id: string;
  listing_id: string;
  url: string;
  storage_path: string;
  position: number;
  created_at: string;
}

export interface Amenity {
  id: string;
  name: string;
  icon: string | null;
  category: string | null;
}

export interface ListingAmenity {
  listing_id: string;
  amenity_id: string;
}

export interface CalendarEntry {
  id: string;
  listing_id: string;
  date: string;
  is_available: boolean;
  price_override: number | null;
  note: string | null;
}

export interface PricingRule {
  id: string;
  listing_id: string;
  name: string;
  rule_type: "weekend" | "seasonal" | "length_of_stay" | "minimum_stay";
  start_date: string | null;
  end_date: string | null;
  adjustment_type: "percentage" | "fixed" | "absolute";
  adjustment_value: number;
  min_nights: number | null;
  active: boolean;
}

export interface Booking {
  id: string;
  listing_id: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  guests: number;
  total_amount: number;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  source: string | null;
  notes: string | null;
  created_at: string;
}

export type TaskType =
  | "cleaning"
  | "maintenance"
  | "inspection"
  | "guest_support"
  | "checkin_prepare"
  | "checkout_check";

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  cleaning: "Cleaning",
  maintenance: "Maintenance",
  inspection: "Inspection",
  guest_support: "Guest Support",
  checkin_prepare: "Check-in Prep",
  checkout_check: "Checkout Check",
};

/** Single checklist item stored inside tasks.checklist (JSONB array). */
export interface ChecklistItem {
  id: string;
  title: string;
  checked: boolean;
}

export interface Task {
  id: string;
  listing_id: string | null;
  booking_id: string | null;
  task_type: TaskType | null;
  title: string;
  description: string | null;
  notes: string | null;
  assignee_id: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done" | "cancelled";
  checklist: ChecklistItem[];
  photos: string[];
  created_at: string;
}

export interface Revenue {
  id: string;
  listing_id: string | null;
  booking_id: string | null;
  amount: number;
  category: string;
  description: string | null;
  received_at: string;
}

export interface Expense {
  id: string;
  listing_id: string | null;
  amount: number;
  category: string;
  description: string | null;
  vendor: string | null;
  spent_at: string;
}

export const LISTINGS_BUCKET = "listing-images";

// ── HR / Recruitment types ────────────────────────────────────────

export type EmployeeStatus =
  | "candidate"
  | "interviewing"
  | "probation"
  | "active"
  | "inactive"
  | "resigned"
  | "terminated"
  | "rejected";

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "freelancer"
  | "probation"
  | "intern";

export type GenderType = "male" | "female" | "other" | "prefer_not_to_say";

export interface Department {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  gender: GenderType | null;
  address: string | null;
  emergency_contact: string | null;
  department_id: string;
  position_id: string;
  team_id: string | null;
  role: string | null;
  employment_type: EmploymentType;
  start_date: string | null;
  end_date: string | null;
  /** Only present for admin. null for manager/accountant (querying employee_basic_view). */
  salary_base: number | null;
  status: EmployeeStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Chat types ----

export interface ChatGroup {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface ChatGroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface ChatMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: Pick<UserProfile, "id" | "full_name" | "email">;
}

export interface ChatMessageRead {
  message_id: string;
  user_id: string;
  read_at: string;
}
