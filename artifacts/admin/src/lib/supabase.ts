import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Auth and data calls will fail until they are set."
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "airbnb-ops-admin-auth",
    },
  }
);

export type AppRole = "admin" | "manager" | "staff" | "accountant";

export const ROLES: AppRole[] = ["admin", "manager", "staff", "accountant"];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
  accountant: "Accountant",
};

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  avatar_url: string | null;
  created_at: string;
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
  base_price: number;
  cleaning_fee: number;
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

export interface Task {
  id: string;
  listing_id: string | null;
  booking_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done" | "cancelled";
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
