import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AccountDetail {
  id: string;
  name: string;
  email: string;
  company: string | null;
  betterauthUserId: string;
  signupMethod: string;
  signupPathType: string;
  attrChannel: string | null;
  attrChannelDrilldown1: string | null;
  attrChannelDrilldown2: string | null;
  attrChannelDrilldown3: string | null;
  attrChannelDrilldown4: string | null;
  attrLandingPage: string | null;
  attrLandingPageGroup: string | null;
  attrNumVisits: number | null;
  attrTimeToConversion: string | null;
  toolsSelectedAt: string | null;
  planSelectedAt: string | null;
  trialStartedAt: string | null;
  trialConvertedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountUser {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSubscription {
  id: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planId: string;
  planName: string;
  planPriceCents: number;
  planCurrency: string;
  status: string;
  trialType: string | null;
  trialEndsAt: string | null;
  siteLimit: number;
  leadLimit: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  delinquentSince: string | null;
  cancellationReason: string | null;
  cancellationFeedback: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSite {
  id: string;
  name: string;
  domain: string | null;
  websiteUrl: string | null;
  cms: string | null;
  formTool: string | null;
  crm: string | null;
  isDefault: boolean;
  status: string;
  createdAt: string;
  cmsOther: string | null;
  formToolOther: string | null;
  crmOther: string | null;
}

export interface AccountEnrichment {
  id: string;
  accountId: string;
  industry: string | null;
  subIndustry: string | null;
  companySize: string | null;
  signupPath: string | null;
  jobTitle: string | null;
  jobDescription: string | null;
  confidenceIndustry: number | null;
  confidenceSize: number | null;
  confidencePath: number | null;
  enrichedAt: string | null;
}

export interface EventLogEntry {
  id: string;
  accountId: string | null;
  eventType: string;
  eventSubtype: string | null;
  metadata: Record<string, unknown> | null;
  source: string;
  createdAt: string;
}

export async function getAccountById(id: string): Promise<AccountDetail | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    company: data.company,
    betterauthUserId: data.betterauth_user_id,
    signupMethod: data.signup_method,
    signupPathType: data.signup_path_type,
    attrChannel: data.attr_channel,
    attrChannelDrilldown1: data.attr_channel_drilldown1,
    attrChannelDrilldown2: data.attr_channel_drilldown2,
    attrChannelDrilldown3: data.attr_channel_drilldown3,
    attrChannelDrilldown4: data.attr_channel_drilldown4,
    attrLandingPage: data.attr_landing_page,
    attrLandingPageGroup: data.attr_landing_page_group,
    attrNumVisits: data.attr_num_visits,
    attrTimeToConversion: data.attr_time_to_conversion,
    toolsSelectedAt: data.tools_selected_at,
    planSelectedAt: data.plan_selected_at,
    trialStartedAt: data.trial_started_at,
    trialConvertedAt: data.trial_converted_at,
    cancelledAt: data.cancelled_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getAccountEnrichment(accountId: string): Promise<AccountEnrichment | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("account_enrichment")
    .select("*")
    .eq("account_id", accountId)
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    accountId: data.account_id,
    industry: data.industry,
    subIndustry: data.sub_industry,
    companySize: data.company_size,
    signupPath: data.signup_path,
    jobTitle: data.job_title,
    jobDescription: data.job_description,
    confidenceIndustry: data.confidence_industry,
    confidenceSize: data.confidence_size,
    confidencePath: data.confidence_path,
    enrichedAt: data.enriched_at,
  };
}

export async function getAccountUsers(accountId: string): Promise<AccountUser[]> {
  const supabase = createSupabaseAdminClient();

  // Query the users profile table (has first_name/last_name) and join with BetterAuth user table (has email/verified)
  const { data: profiles } = await supabase
    .from("users")
    .select("id, betterauth_user_id, first_name, last_name, role, created_at, updated_at")
    .eq("account_id", accountId);

  if (!profiles || profiles.length === 0) return [];

  // Get the BetterAuth user records for email/verified status
  const userIds = profiles.map((p) => p.betterauth_user_id);
  const { data: authUsers } = await supabase
    .from("user")
    .select("id, email, email_verified")
    .in("id", userIds);

  const authUserMap = new Map((authUsers ?? []).map((u) => [u.id, u]));

  return profiles.map((p) => {
    const authUser = authUserMap.get(p.betterauth_user_id);
    return {
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      firstName: p.first_name,
      lastName: p.last_name,
      email: authUser?.email ?? "",
      emailVerified: authUser?.email_verified ?? false,
      role: p.role,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  });
}

export async function getAccountSubscription(accountId: string): Promise<AccountSubscription | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;
  return {
    id: data.id,
    stripeCustomerId: data.stripe_customer_id,
    stripeSubscriptionId: data.stripe_subscription_id,
    planId: data.plan_id,
    planName: data.plan_name,
    planPriceCents: data.plan_price_cents,
    planCurrency: data.plan_currency,
    status: data.status,
    trialType: data.trial_type,
    trialEndsAt: data.trial_ends_at,
    siteLimit: data.site_limit,
    leadLimit: data.lead_limit,
    currentPeriodStart: data.current_period_start,
    currentPeriodEnd: data.current_period_end,
    delinquentSince: data.delinquent_since,
    cancellationReason: data.cancellation_reason,
    cancellationFeedback: data.cancellation_feedback,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getAccountSites(accountId: string): Promise<AccountSite[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("sites")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    websiteUrl: s.website_url,
    cms: s.cms,
    formTool: s.form_tool,
    crm: s.crm,
    isDefault: s.is_default,
    status: s.status,
    createdAt: s.created_at,
    cmsOther: s.cms_other,
    formToolOther: s.form_tool_other,
    crmOther: s.crm_other,
  }));
}

export async function getAccountEvents(
  accountId: string,
  limit = 20,
  offset = 0
): Promise<EventLogEntry[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("event_log")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return (data ?? []).map((e) => ({
    id: e.id,
    accountId: e.account_id,
    eventType: e.event_type,
    eventSubtype: e.event_subtype,
    metadata: e.metadata as Record<string, unknown> | null,
    source: e.source,
    createdAt: e.created_at,
  }));
}

export async function getSiteEvents(
  siteId: string,
  limit = 20
): Promise<EventLogEntry[]> {
  const supabase = createSupabaseAdminClient();
  // Lead events for a specific site
  const { data } = await supabase
    .from("lead_events")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((e) => ({
    id: e.id,
    accountId: null,
    eventType: e.event_type,
    eventSubtype: null,
    metadata: e.metadata as Record<string, unknown> | null,
    source: "site",
    createdAt: e.created_at,
  }));
}
