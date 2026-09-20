export type AppRole = "super_admin" | "gym_owner" | "receptionist" | "trainer" | "member";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "suspended";
export type MemberStatus = "active" | "inactive" | "expired" | "frozen" | "cancelled";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  logo_url: string | null;
  primary_color: string;
  subscription_plan: string;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  feature_flags: Record<string, boolean>;
  billing_email: string | null;
  is_white_label: boolean;
  custom_domain: string | null;
  created_at: string;
  updated_at: string;
}

export interface Gym {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  gps_checkin_radius_meters: number;
  opening_hours: Record<string, unknown>;
  is_active: boolean;
  manager_id: string | null;
  monthly_revenue_target: number | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string | null;
  gym_id: string | null;
  role: AppRole;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  two_factor_enabled: boolean;
  must_reset_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = "paid" | "partial" | "pending" | "refunded";
export type Gender = "male" | "female" | "other" | "prefer_not_to_say";
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown";

export interface MembershipPlan {
  id: string;
  gym_id: string;
  name: string;
  duration_days: number;
  price: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberDetails {
  profile_id: string;
  gym_id: string;
  date_of_birth: string | null;
  gender: Gender | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  blood_group: BloodGroup;
  medical_conditions: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  joining_date: string;
  assigned_trainer_id: string | null;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

/** Lifecycle state of a single membership period (migration 0025). */
export type MembershipPeriodStatus = "active" | "expired" | "cancelled";

export interface MemberMembership {
  id: string;
  member_id: string;
  gym_id: string;
  plan_id: string | null;
  start_date: string;
  end_date: string;
  /** Lifecycle state. Flipped to 'expired' by expire_due_memberships(). */
  status: MembershipPeriodStatus;
  activated_at: string | null;
  expired_at: string | null;
  amount: number;
  discount_amount: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  trainer_id: string | null;
  is_current: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SUBSCRIPTION NOTIFICATION LEDGER (migration 0025)
//
// The persistent idempotency record behind the WhatsApp subscription alerts.
// One row per (membership_id, kind, channel), enforced by a unique index.
// ============================================================================

export type SubscriptionNotificationKind = "activation" | "expiry";
export type SubscriptionNotificationStatus = "pending" | "sent" | "failed" | "skipped";

export interface SubscriptionNotification {
  id: string;
  membership_id: string;
  gym_id: string;
  member_id: string;
  kind: SubscriptionNotificationKind;
  channel: string;
  status: SubscriptionNotificationStatus;
  recipient_phone: string | null;
  /** Meta's wamid.* identifier for a successful send. */
  provider_message_id: string | null;
  /** Latest delivery status reported by the Meta webhook (sent/delivered/read/failed). */
  provider_status: string | null;
  attempts: number;
  max_attempts: number;
  last_error_code: string | null;
  last_error: string | null;
  first_attempt_at: string | null;
  last_attempt_at: string | null;
  /** Doubles as the retry schedule and the claim lease. */
  next_attempt_at: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpireDueMembershipRow {
  membership_id: string;
  member_id: string;
  gym_id: string;
  /** False when the member already holds a newer period covering today. */
  should_notify: boolean;
}

export interface DueSubscriptionNotificationRow {
  id: string;
  membership_id: string;
  kind: SubscriptionNotificationKind;
  channel: string;
  attempts: number;
}

export interface MemberDocument {
  id: string;
  member_id: string;
  gym_id: string;
  doc_type: string;
  cloudinary_public_id: string;
  url: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface MembersOverviewRow {
  profile_id: string;
  tenant_id: string | null;
  gym_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  date_of_birth: string | null;
  gender: Gender | null;
  status: MemberStatus | null;
  joining_date: string | null;
  assigned_trainer_id: string | null;
  trainer_name: string | null;
  membership_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  start_date: string | null;
  end_date: string | null;
  payment_status: PaymentStatus | null;
  amount: number | null;
  amount_paid: number | null;
  days_until_expiry: number | null;
}

export type PaymentMethod = "cash" | "upi" | "card" | "bank" | "split";
export type InstallmentStatus = "pending" | "paid" | "overdue" | "waived";
export type ReminderType =
  | "before_30d" | "before_15d" | "before_7d" | "before_3d" | "before_1d"
  | "on_expiry"
  | "after_1d" | "after_3d" | "after_7d" | "after_30d";

export interface Payment {
  id: string;
  gym_id: string;
  member_id: string;
  membership_id: string | null;
  amount: number;
  gst_rate: number;
  gst_amount: number;
  total_amount: number;
  method: PaymentMethod;
  transaction_reference: string | null;
  invoice_number: string;
  receipt_number: string;
  notes: string | null;
  is_refunded: boolean;
  created_by: string | null;
  created_at: string;
}

export interface PaymentSplit {
  id: string;
  payment_id: string;
  method: PaymentMethod;
  amount: number;
  transaction_reference: string | null;
}

export interface Refund {
  id: string;
  payment_id: string;
  gym_id: string;
  amount: number;
  reason: string;
  refunded_by: string | null;
  created_at: string;
}

export interface EmiInstallment {
  id: string;
  membership_id: string;
  gym_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  status: InstallmentStatus;
  paid_payment_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface PaymentsOverviewRow {
  id: string;
  gym_id: string;
  member_id: string;
  member_name: string;
  membership_id: string | null;
  plan_name: string | null;
  amount: number;
  gst_rate: number;
  gst_amount: number;
  total_amount: number;
  method: PaymentMethod;
  invoice_number: string;
  receipt_number: string;
  is_refunded: boolean;
  created_at: string;
}

export type PlanFrequency = "daily" | "weekly" | "monthly";
export type MealType = "breakfast" | "lunch" | "dinner" | "snacks";

export interface WorkoutPlan {
  id: string;
  gym_id: string;
  member_id: string;
  trainer_id: string;
  title: string;
  frequency: PlanFrequency;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkoutDay {
  id: string;
  workout_plan_id: string;
  day_label: string;
  day_order: number;
  notes: string | null;
}

export interface WorkoutExercise {
  id: string;
  workout_day_id: string;
  exercise_name: string;
  sets: number | null;
  reps: string | null;
  weight_kg: number | null;
  video_url: string | null;
  notes: string | null;
  order_index: number;
}

export interface DietPlan {
  id: string;
  gym_id: string;
  member_id: string;
  trainer_id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  daily_calorie_target: number | null;
  daily_protein_g: number | null;
  daily_carbs_g: number | null;
  daily_fat_g: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DietMeal {
  id: string;
  diet_plan_id: string;
  meal_type: MealType;
  items: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  order_index: number;
}

// ============================================================================
// NUTRITION MODULE (v2) — structured food database + automatic macro calc
// ============================================================================
export type FoodCategory = "protein" | "carbs" | "legumes" | "fruits" | "vegetables" | "dairy" | "supplements" | "other";
export type FoodState = "raw" | "cooked" | "dry" | "prepared" | "drained" | "na";
export type NutritionBasis = "per_100g" | "per_100ml" | "per_piece" | "per_serving";
export type FoodUnit = "g" | "kg" | "ml" | "l" | "piece" | "egg" | "scoop" | "serving";

export interface Food {
  id: string;
  name: string;
  category: FoodCategory;
  state: FoodState;
  default_unit: FoodUnit;
  basis_quantity: number;
  is_custom: boolean;
  gym_id: string | null;
  created_by: string | null;
  source: string;
  created_at: string;
}

export interface FoodNutrition {
  food_id: string;
  basis: NutritionBasis;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  source: string;
}

/** A food joined with its nutrition row — what the app reads/writes in practice. */
export interface FoodWithNutrition extends Food {
  nutrition: FoodNutrition;
}

export interface NutritionPlan {
  id: string;
  gym_id: string;
  member_id: string;
  trainer_id: string;
  name: string;
  start_date: string;
  duration_days: number;
  calorie_target: number | null;
  protein_target_g: number | null;
  carb_target_g: number | null;
  fat_target_g: number | null;
  fiber_target_g: number | null;
  water_target_ml: number | null;
  meal_frequency: number | null;
  notes: string | null;
  is_active: boolean;
  version: number;
  parent_plan_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NutritionMeal {
  id: string;
  nutrition_plan_id: string;
  name: string;
  order_index: number;
}

export interface NutritionMealItem {
  id: string;
  meal_id: string;
  food_id: string;
  quantity: number;
  unit: FoodUnit;
  order_index: number;
  created_at: string;
}

export interface TrainerFavoriteFood {
  id: string;
  trainer_id: string;
  food_id: string;
  default_quantity: number;
  default_unit: FoodUnit;
  order_index: number;
  created_at: string;
}

export interface TrainerFoodUsage {
  id: string;
  trainer_id: string;
  food_id: string;
  usage_count: number;
  last_quantity: number;
  last_unit: FoodUnit;
  last_used_at: string;
}

/** Grams/ml/kcal/macros for a food quantity, a meal, or a whole day. */
export interface NutritionValues {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface MemberProgress {
  id: string;
  gym_id: string;
  member_id: string;
  recorded_at: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  arms_cm: number | null;
  thighs_cm: number | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

export type LeadStatus = "new" | "contacted" | "trial_scheduled" | "trial_completed" | "converted" | "lost";
export type LeadSource = "walk_in" | "referral" | "online" | "phone" | "social" | "other";
export type LeadActivityType = "call" | "whatsapp" | "email" | "note" | "status_change" | "trial_scheduled";

export interface Lead {
  id: string;
  gym_id: string;
  name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  interested_plan_id: string | null;
  assigned_to: string | null;
  trial_date: string | null;
  follow_up_date: string | null;
  notes: string | null;
  converted_member_id: string | null;
  lost_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  gym_id: string;
  activity_type: LeadActivityType;
  description: string;
  created_by: string | null;
  created_at: string;
}

export interface LeadsOverviewRow {
  id: string;
  gym_id: string;
  name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  interested_plan_id: string | null;
  plan_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  trial_date: string | null;
  follow_up_date: string | null;
  notes: string | null;
  converted_member_id: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type AiChatRole = "user" | "assistant";
export type RiskLevel = "low" | "medium" | "high";

export interface AiChatMessage {
  id: string;
  gym_id: string;
  member_id: string;
  role: AiChatRole;
  content: string;
  created_at: string;
}

export interface MemberRiskScore {
  member_id: string;
  gym_id: string;
  risk_score: number;
  risk_level: RiskLevel;
  factors: { label: string; detail: string }[];
  ai_narrative: string | null;
  computed_at: string;
}

export interface RevenueForecast {
  id: string;
  gym_id: string;
  forecast_month: string;
  projected_revenue: number;
  confidence: "low" | "medium" | "high";
  ai_narrative: string | null;
  computed_at: string;
}

export type InventoryCategory = "equipment" | "supplement" | "accessory" | "other";
export type InventoryTxnType = "restock" | "sale" | "adjustment" | "damage";
export type PayslipStatus = "draft" | "finalized" | "paid";

export interface InventoryItem {
  id: string;
  gym_id: string;
  name: string;
  category: InventoryCategory;
  barcode: string | null;
  quantity: number;
  unit: string;
  cost_price: number | null;
  sell_price: number | null;
  low_stock_threshold: number;
  expiry_date: string | null;
  supplier: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryOverviewRow extends InventoryItem {
  is_low_stock: boolean;
  is_expiring_soon: boolean;
}

export interface InventoryTransaction {
  id: string;
  item_id: string;
  gym_id: string;
  type: InventoryTxnType;
  quantity_change: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface StaffSalaryConfig {
  id: string;
  staff_id: string;
  gym_id: string;
  base_salary: number;
  commission_rate: number;
  effective_from: string;
  created_at: string;
}

export interface Payslip {
  id: string;
  gym_id: string;
  staff_id: string;
  month: string;
  base_salary: number;
  commission_amount: number;
  bonus_amount: number;
  deductions_amount: number;
  present_days: number | null;
  total_working_days: number | null;
  net_pay: number;
  status: PayslipStatus;
  notes: string | null;
  generated_by: string | null;
  generated_at: string;
  paid_at: string | null;
}

export type CampaignChannel = "email" | "whatsapp" | "both";
export type CampaignAudienceType =
  | "all_members" | "active_members" | "expired_members" | "expiring_soon"
  | "frozen_members" | "leads" | "custom_selection";
export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "failed" | "cancelled";
export type CampaignTrigger = "manual" | "birthday" | "festival" | "renewal_expiring" | "welcome";
export type CouponDiscountType = "percentage" | "flat";
export type ReferralStatus = "pending" | "converted" | "rewarded" | "expired";

export interface MarketingCampaign {
  id: string;
  gym_id: string;
  name: string;
  channel: CampaignChannel;
  audience_type: CampaignAudienceType;
  audience_member_ids: string[] | null;
  subject: string | null;
  message_body: string;
  image_url: string | null;
  trigger_type: CampaignTrigger;
  status: CampaignStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  recipients_total: number;
  recipients_sent: number;
  recipients_failed: number;
  opens_count: number;
  clicks_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignAnalyticsRow extends MarketingCampaign {
  open_rate: number;
  click_rate: number;
  delivery_rate: number;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  gym_id: string;
  member_id: string | null;
  lead_id: string | null;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  channel: CampaignChannel;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
}

export interface Coupon {
  id: string;
  gym_id: string;
  code: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  min_purchase_amount: number;
  applicable_plan_ids: string[] | null;
  usage_limit: number | null;
  usage_limit_per_member: number;
  times_used: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CouponOverviewRow extends Coupon {
  is_expired: boolean;
  is_exhausted: boolean;
}

export interface CouponRedemption {
  id: string;
  coupon_id: string;
  gym_id: string;
  member_id: string;
  payment_id: string | null;
  membership_id: string | null;
  discount_applied: number;
  redeemed_at: string;
}

export interface ReferralProgramConfig {
  gym_id: string;
  is_enabled: boolean;
  referrer_reward_type: CouponDiscountType;
  referrer_reward_value: number;
  referee_reward_type: CouponDiscountType;
  referee_reward_value: number;
  updated_at: string;
}

export interface Referral {
  id: string;
  gym_id: string;
  referrer_member_id: string;
  referral_code: string;
  referee_name: string | null;
  referee_phone: string | null;
  referee_member_id: string | null;
  status: ReferralStatus;
  referrer_reward_coupon_id: string | null;
  referee_reward_coupon_id: string | null;
  converted_at: string | null;
  rewarded_at: string | null;
  created_at: string;
}

export interface ReferralsOverviewRow {
  id: string;
  gym_id: string;
  referrer_member_id: string;
  referrer_name: string;
  referral_code: string;
  referee_name: string | null;
  referee_phone: string | null;
  referee_member_id: string | null;
  referee_actual_name: string | null;
  status: ReferralStatus;
  referrer_reward_coupon_id: string | null;
  referee_reward_coupon_id: string | null;
  converted_at: string | null;
  rewarded_at: string | null;
  created_at: string;
}

export interface AudienceSegment {
  id: string;
  gym_id: string;
  name: string;
  audience_type: CampaignAudienceType;
  filters: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface FestivalOffer {
  id: string;
  gym_id: string;
  name: string;
  occurs_on: string;
  message_template: string;
  channel: CampaignChannel;
  coupon_id: string | null;
  is_active: boolean;
  last_sent_year: number | null;
  created_at: string;
  updated_at: string;
}

export interface BirthdayCampaignConfig {
  gym_id: string;
  is_enabled: boolean;
  channel: CampaignChannel;
  message_template: string;
  coupon_id: string | null;
  updated_at: string;
}

export type CheckinMethod = "qr" | "manual";

export interface AttendanceRecord {
  id: string;
  gym_id: string;
  member_id: string;
  check_in_at: string;
  check_out_at: string | null;
  duration_minutes: number | null;
  method: CheckinMethod;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_verified: boolean;
  checked_in_by: string | null;
  created_at: string;
}

export interface AttendanceTodayRow {
  id: string;
  gym_id: string;
  member_id: string;
  member_name: string;
  avatar_url: string | null;
  check_in_at: string;
  check_out_at: string | null;
  duration_minutes: number | null;
  method: CheckinMethod;
  gps_verified: boolean;
}

// ============================================================================
// Part 11 — Reports & Analytics
// ============================================================================

export type ExpenseCategory =
  | "rent" | "utilities" | "salaries" | "equipment" | "marketing" | "maintenance" | "other";

export interface Expense {
  id: string;
  gym_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  vendor: string | null;
  expense_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RevenueReportRow {
  day: string;
  gross_amount: number;
  gst_amount: number;
  refund_amount: number;
  net_amount: number;
  transaction_count: number;
}

export interface MembershipSummaryRow {
  plan_name: string;
  active_count: number;
  expired_count: number;
  total_revenue: number;
}

export interface AttendanceReportRow {
  day: string;
  check_ins: number;
  unique_members: number;
  avg_duration_minutes: number;
}

export interface TrainerPerformanceRow {
  trainer_id: string;
  trainer_name: string;
  active_clients: number;
  revenue_generated: number;
  workout_plans_created: number;
  diet_plans_created: number;
  avg_client_checkins: number;
}

export interface InventoryReportRow {
  item_id: string;
  item_name: string;
  category: string;
  quantity: number;
  stock_value: number;
  units_sold_in_range: number;
  is_low_stock: boolean;
}

export interface PaymentsByMethodRow {
  method: string;
  transaction_count: number;
  total_amount: number;
}

export interface ProfitLossRow {
  month: string;
  revenue: number;
  refunds: number;
  manual_expenses: number;
  payroll_expenses: number;
  total_expenses: number;
  profit: number;
}

export interface GrowthAnalyticsRow {
  month: string;
  new_members: number;
  churned_members: number;
  net_growth: number;
  total_active_at_month_end: number;
}

export interface RenewalRateRow {
  month: string;
  expiring_count: number;
  renewed_count: number;
  renewal_rate: number;
}

export interface RetentionRow {
  cohort_months_ago: number;
  cohort_size: number;
  still_active: number;
  retention_rate: number;
}

// ============================================================================
// PART 12 — SUPER ADMIN CONSOLE
// ============================================================================

export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthly_price: number;
  annual_price: number;
  currency: string;
  max_gyms: number | null;
  max_members: number | null;
  max_staff: number | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformInvoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  plan_code: string | null;
  billing_period_start: string;
  billing_period_end: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureFlagCatalogEntry {
  key: string;
  label: string;
  description: string | null;
  default_enabled: boolean;
  category: string;
  created_at: string;
}

export interface PlatformSettings {
  id: true;
  platform_name: string;
  support_email: string | null;
  default_trial_days: number;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  allow_new_registrations: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  author_id: string;
  message: string;
  is_internal_note: boolean;
  created_at: string;
}

export interface TenantAdminAction {
  id: string;
  tenant_id: string;
  actor_id: string;
  action: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  tenant_id: string;
  created_by: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformOverviewStats {
  total_tenants: number;
  active_tenants: number;
  trialing_tenants: number;
  suspended_tenants: number;
  past_due_tenants: number;
  total_gyms: number;
  total_members: number;
  mrr: number;
}

export interface PlatformTenantGrowthRow {
  month: string;
  new_tenants: number;
  cumulative_tenants: number;
}

export interface TenantUsageSummary {
  gym_count: number;
  staff_count: number;
  member_count: number;
  active_member_count: number;
  total_revenue: number;
  last_activity_at: string | null;
}

export interface PlatformTicketStats {
  open_count: number;
  in_progress_count: number;
  resolved_count: number;
  closed_count: number;
  urgent_open_count: number;
}

/** A tenant row joined with its owner's contact info, for the Tenants table UI. */
export interface TenantOverviewRow extends Tenant {
  owner_full_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  gym_count: number;
  member_count: number;
}

// ============================================================================
// PART 13 — MULTI-BRANCH + REALTIME CHAT
// ============================================================================

/** One row per branch in a tenant's `tenant_branch_comparison()` result. */
export interface BranchComparisonRow {
  gym_id: string;
  gym_name: string;
  gym_code: string;
  is_active: boolean;
  member_count: number;
  active_member_count: number;
  staff_count: number;
  revenue: number;
  attendance_count: number;
  new_members: number;
}

/** Result of `tenant_combined_overview()` — tenant-wide KPIs across all branches. */
export interface TenantCombinedOverview {
  total_gyms: number;
  active_gyms: number;
  total_members: number;
  active_members: number;
  total_staff: number;
  revenue_this_month: number;
  revenue_last_month: number;
}

export type ChatChannelType = "direct" | "broadcast";
export type ChatBroadcastAudience = "all_members" | "all_staff" | "all_trainers" | "all_receptionists";
export type ChatAttachmentType = "image" | "voice" | "pdf";

export interface ChatChannel {
  id: string;
  tenant_id: string;
  gym_id: string | null;
  type: ChatChannelType;
  name: string | null;
  broadcast_audience: ChatBroadcastAudience | null;
  direct_key: string | null;
  created_by: string;
  last_message_at: string | null;
  created_at: string;
}

export interface ChatChannelMember {
  channel_id: string;
  profile_id: string;
  can_send: boolean;
  last_read_at: string | null;
  joined_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  body: string | null;
  attachment_url: string | null;
  attachment_type: ChatAttachmentType | null;
  attachment_public_id: string | null;
  created_at: string;
}

export interface ChatParticipant {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: AppRole;
}

/** Row from `chat_channels_overview` — one per (channel, viewer) — used to render the channel list. */
export interface ChatChannelOverviewRow {
  channel_id: string;
  tenant_id: string;
  gym_id: string | null;
  type: ChatChannelType;
  name: string | null;
  broadcast_audience: ChatBroadcastAudience | null;
  last_message_at: string | null;
  created_at: string;
  viewer_id: string;
  can_send: boolean;
  last_read_at: string | null;
  unread_count: number;
  last_message_preview: string | null;
  other_participants: ChatParticipant[] | null;
}

// ============================================================================
// PART 14 — STREAKS
// ============================================================================

export interface MemberStreak {
  member_id: string;
  gym_id: string;
  current_streak: number;
  longest_streak: number;
  last_checkin_date: string | null;
  grace_period_start: string | null;
  grace_used: boolean;
  updated_at: string;
}

export interface MemberStreakOverviewRow {
  member_id: string;
  gym_id: string;
  member_name: string;
  avatar_url: string | null;
  current_streak: number;
  longest_streak: number;
  last_checkin_date: string | null;
  grace_used: boolean;
  days_since_checkin: number;
}

/**
 * NOTE: This file is hand-authored for Part 1 (auth/tenancy core only).
 * Once every module's migration lands, regenerate the full types via:
 *   npm run db:types
 * which overwrites this file from the live Postgres schema — do not hand
 * maintain table types for members/payments/etc once that command has run.
 */
export interface Database {

  public: {
    Tables: {
      tenants: { Row: Tenant; Insert: Partial<Tenant>; Update: Partial<Tenant> };
      gyms: { Row: Gym; Insert: Partial<Gym>; Update: Partial<Gym> };
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      membership_plans: { Row: MembershipPlan; Insert: Partial<MembershipPlan>; Update: Partial<MembershipPlan> };
      member_details: { Row: MemberDetails; Insert: Partial<MemberDetails>; Update: Partial<MemberDetails> };
      member_memberships: { Row: MemberMembership; Insert: Partial<MemberMembership>; Update: Partial<MemberMembership> };
      member_documents: { Row: MemberDocument; Insert: Partial<MemberDocument>; Update: Partial<MemberDocument> };
      subscription_notifications: { Row: SubscriptionNotification; Insert: Partial<SubscriptionNotification>; Update: Partial<SubscriptionNotification> };
      payments: { Row: Payment; Insert: Partial<Payment>; Update: Partial<Payment> };
      payment_splits: { Row: PaymentSplit; Insert: Partial<PaymentSplit>; Update: Partial<PaymentSplit> };
      refunds: { Row: Refund; Insert: Partial<Refund>; Update: Partial<Refund> };
      emi_installments: { Row: EmiInstallment; Insert: Partial<EmiInstallment>; Update: Partial<EmiInstallment> };
      attendance_records: { Row: AttendanceRecord; Insert: Partial<AttendanceRecord>; Update: Partial<AttendanceRecord> };
      member_streaks: { Row: MemberStreak; Insert: Partial<MemberStreak>; Update: Partial<MemberStreak> };
      workout_plans: { Row: WorkoutPlan; Insert: Partial<WorkoutPlan>; Update: Partial<WorkoutPlan> };
      workout_days: { Row: WorkoutDay; Insert: Partial<WorkoutDay>; Update: Partial<WorkoutDay> };
      workout_exercises: { Row: WorkoutExercise; Insert: Partial<WorkoutExercise>; Update: Partial<WorkoutExercise> };
      diet_plans: { Row: DietPlan; Insert: Partial<DietPlan>; Update: Partial<DietPlan> };
      diet_meals: { Row: DietMeal; Insert: Partial<DietMeal>; Update: Partial<DietMeal> };
      foods: { Row: Food; Insert: Partial<Food>; Update: Partial<Food> };
      food_nutrition: { Row: FoodNutrition; Insert: Partial<FoodNutrition>; Update: Partial<FoodNutrition> };
      nutrition_plans: { Row: NutritionPlan; Insert: Partial<NutritionPlan>; Update: Partial<NutritionPlan> };
      nutrition_meals: { Row: NutritionMeal; Insert: Partial<NutritionMeal>; Update: Partial<NutritionMeal> };
      nutrition_meal_items: { Row: NutritionMealItem; Insert: Partial<NutritionMealItem>; Update: Partial<NutritionMealItem> };
      trainer_favorite_foods: { Row: TrainerFavoriteFood; Insert: Partial<TrainerFavoriteFood>; Update: Partial<TrainerFavoriteFood> };
      trainer_food_usage: { Row: TrainerFoodUsage; Insert: Partial<TrainerFoodUsage>; Update: Partial<TrainerFoodUsage> };
      member_progress: { Row: MemberProgress; Insert: Partial<MemberProgress>; Update: Partial<MemberProgress> };
      leads: { Row: Lead; Insert: Partial<Lead>; Update: Partial<Lead> };
      lead_activities: { Row: LeadActivity; Insert: Partial<LeadActivity>; Update: Partial<LeadActivity> };
      ai_chat_messages: { Row: AiChatMessage; Insert: Partial<AiChatMessage>; Update: Partial<AiChatMessage> };
      member_risk_scores: { Row: MemberRiskScore; Insert: Partial<MemberRiskScore>; Update: Partial<MemberRiskScore> };
      revenue_forecasts: { Row: RevenueForecast; Insert: Partial<RevenueForecast>; Update: Partial<RevenueForecast> };
      inventory_items: { Row: InventoryItem; Insert: Partial<InventoryItem>; Update: Partial<InventoryItem> };
      inventory_transactions: { Row: InventoryTransaction; Insert: Partial<InventoryTransaction>; Update: Partial<InventoryTransaction> };
      staff_salary_config: { Row: StaffSalaryConfig; Insert: Partial<StaffSalaryConfig>; Update: Partial<StaffSalaryConfig> };
      payslips: { Row: Payslip; Insert: Partial<Payslip>; Update: Partial<Payslip> };
      marketing_campaigns: { Row: MarketingCampaign; Insert: Partial<MarketingCampaign>; Update: Partial<MarketingCampaign> };
      campaign_recipients: { Row: CampaignRecipient; Insert: Partial<CampaignRecipient>; Update: Partial<CampaignRecipient> };
      coupons: { Row: Coupon; Insert: Partial<Coupon>; Update: Partial<Coupon> };
      coupon_redemptions: { Row: CouponRedemption; Insert: Partial<CouponRedemption>; Update: Partial<CouponRedemption> };
      referral_program_config: { Row: ReferralProgramConfig; Insert: Partial<ReferralProgramConfig>; Update: Partial<ReferralProgramConfig> };
      referrals: { Row: Referral; Insert: Partial<Referral>; Update: Partial<Referral> };
      audience_segments: { Row: AudienceSegment; Insert: Partial<AudienceSegment>; Update: Partial<AudienceSegment> };
      festival_offers: { Row: FestivalOffer; Insert: Partial<FestivalOffer>; Update: Partial<FestivalOffer> };
      birthday_campaign_config: { Row: BirthdayCampaignConfig; Insert: Partial<BirthdayCampaignConfig>; Update: Partial<BirthdayCampaignConfig> };
      expenses: { Row: Expense; Insert: Partial<Expense>; Update: Partial<Expense> };
      subscription_plans: { Row: SubscriptionPlan; Insert: Partial<SubscriptionPlan>; Update: Partial<SubscriptionPlan> };
      platform_invoices: { Row: PlatformInvoice; Insert: Partial<PlatformInvoice>; Update: Partial<PlatformInvoice> };
      feature_flag_catalog: { Row: FeatureFlagCatalogEntry; Insert: Partial<FeatureFlagCatalogEntry>; Update: Partial<FeatureFlagCatalogEntry> };
      platform_settings: { Row: PlatformSettings; Insert: Partial<PlatformSettings>; Update: Partial<PlatformSettings> };
      support_ticket_messages: { Row: SupportTicketMessage; Insert: Partial<SupportTicketMessage>; Update: Partial<SupportTicketMessage> };
      tenant_admin_actions: { Row: TenantAdminAction; Insert: Partial<TenantAdminAction>; Update: Partial<TenantAdminAction> };
      support_tickets: { Row: SupportTicket; Insert: Partial<SupportTicket>; Update: Partial<SupportTicket> };
      chat_channels: { Row: ChatChannel; Insert: Partial<ChatChannel>; Update: Partial<ChatChannel> };
      chat_channel_members: { Row: ChatChannelMember; Insert: Partial<ChatChannelMember>; Update: Partial<ChatChannelMember> };
      chat_messages: { Row: ChatMessage; Insert: Partial<ChatMessage>; Update: Partial<ChatMessage> };
    };
    Views: {
      members_overview: { Row: MembersOverviewRow };
      payments_overview: { Row: PaymentsOverviewRow };
      attendance_today: { Row: AttendanceTodayRow };
      member_streaks_overview: { Row: MemberStreakOverviewRow };
      leads_overview: { Row: LeadsOverviewRow };
      inventory_overview: { Row: InventoryOverviewRow };
      campaign_analytics: { Row: CampaignAnalyticsRow };
      referrals_overview: { Row: ReferralsOverviewRow };
      coupons_overview: { Row: CouponOverviewRow };
      tenants_overview: { Row: TenantOverviewRow };
      chat_channels_overview: { Row: ChatChannelOverviewRow };
    };
    Functions: {
      has_permission: { Args: { p_resource: string; p_action: string }; Returns: boolean };
      current_role: { Args: Record<string, never>; Returns: AppRole };
      current_tenant_id: { Args: Record<string, never>; Returns: string };
      current_gym_id: { Args: Record<string, never>; Returns: string };
      next_invoice_number: { Args: { p_gym_id: string }; Returns: string };
      // Subscription lifecycle RPCs (migration 0025). All are `returns setof`,
      // so an empty array means "refused" / "nothing due" — never a null row.
      claim_subscription_notification: {
        Args: { p_membership_id: string; p_kind: SubscriptionNotificationKind; p_channel?: string; p_lease_seconds?: number };
        Returns: SubscriptionNotification[];
      };
      complete_subscription_notification: {
        Args: {
          p_id: string;
          p_success: boolean;
          p_message_id?: string | null;
          p_recipient_phone?: string | null;
          p_error_code?: string | null;
          p_error?: string | null;
          p_retryable?: boolean;
        };
        Returns: SubscriptionNotification[];
      };
      expire_due_memberships: { Args: { p_limit?: number }; Returns: ExpireDueMembershipRow[] };
      due_subscription_notifications: { Args: { p_limit?: number }; Returns: DueSubscriptionNotificationRow[] };
      next_receipt_number: { Args: { p_gym_id: string }; Returns: string };
      validate_coupon: {
        Args: { p_gym_id: string; p_code: string; p_member_id: string; p_purchase_amount: number };
        Returns: { is_valid: boolean; reason: string | null; coupon_id: string | null; discount_type: CouponDiscountType | null; discount_value: number | null; max_discount_amount: number | null };
      };
      get_or_create_referral_code: { Args: { p_member_id: string; p_gym_id: string }; Returns: string };
      increment_campaign_counter: { Args: { p_campaign_id: string; p_column: string }; Returns: void };
      report_revenue: { Args: { p_gym_id: string; p_start: string; p_end: string }; Returns: RevenueReportRow[] };
      report_membership_summary: { Args: { p_gym_id: string }; Returns: MembershipSummaryRow[] };
      report_attendance: { Args: { p_gym_id: string; p_start: string; p_end: string }; Returns: AttendanceReportRow[] };
      report_trainer_performance: { Args: { p_gym_id: string; p_start: string; p_end: string }; Returns: TrainerPerformanceRow[] };
      report_inventory: { Args: { p_gym_id: string; p_start: string; p_end: string }; Returns: InventoryReportRow[] };
      report_payments_by_method: { Args: { p_gym_id: string; p_start: string; p_end: string }; Returns: PaymentsByMethodRow[] };
      report_profit_loss: { Args: { p_gym_id: string; p_start: string; p_end: string }; Returns: ProfitLossRow[] };
      analytics_growth: { Args: { p_gym_id: string; p_start: string; p_end: string }; Returns: GrowthAnalyticsRow[] };
      analytics_renewal_rate: { Args: { p_gym_id: string; p_start: string; p_end: string }; Returns: RenewalRateRow[] };
      analytics_retention: { Args: { p_gym_id: string }; Returns: RetentionRow[] };
      next_platform_invoice_number: { Args: Record<string, never>; Returns: string };
      platform_overview_stats: { Args: Record<string, never>; Returns: PlatformOverviewStats };
      platform_tenant_growth: { Args: { p_start: string; p_end: string }; Returns: PlatformTenantGrowthRow[] };
      tenant_usage_summary: { Args: { p_tenant_id: string }; Returns: TenantUsageSummary };
      platform_ticket_stats: { Args: Record<string, never>; Returns: PlatformTicketStats };
      suspend_tenant: { Args: { p_tenant_id: string; p_reason: string }; Returns: void };
      reactivate_tenant: { Args: { p_tenant_id: string }; Returns: void };
      switch_active_branch: { Args: { p_gym_id: string }; Returns: void };
      tenant_branch_comparison: { Args: { p_start: string; p_end: string }; Returns: BranchComparisonRow[] };
      tenant_combined_overview: { Args: Record<string, never>; Returns: TenantCombinedOverview };
      get_or_create_direct_channel: { Args: { p_other_profile_id: string }; Returns: string };
      create_broadcast_channel: { Args: { p_name: string; p_audience: ChatBroadcastAudience }; Returns: string };
    };
  };
}