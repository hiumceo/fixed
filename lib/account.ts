export type Tier = "NOVICE" | "AMATEUR" | "PRO";

export type FeatureKey = "browser" | "signals" | "extractors" | "evidence" | "sources" | "checker";

export type Preferences = Record<FeatureKey, boolean>;

export type AccountProfile = {
  name: string;
  email: string;
  avatar: string;
  createdAt: string;
};

export type AccountState = {
  tier: Tier;
  profile: AccountProfile;
  preferences: Preferences;
  stats: { workspacesCreated: number };
  testerLevel: number | null;
  rating: number | null;
};

export const DEFAULT_ACCOUNT_STATE: AccountState = {
  tier: "PRO",
  profile: {
    name: "v1124 User",
    email: "user@example.com",
    avatar: "",
    createdAt: new Date().toISOString(),
  },
  stats: { workspacesCreated: 0 },
  testerLevel: null,
  rating: null,
  preferences: {
    browser: true,
    signals: true,
    extractors: true,
    evidence: true,
    sources: true,
    checker: true,
  },
};

export const TIER_LABELS: Record<Tier, string> = {
  NOVICE: "Novice",
  AMATEUR: "Amateur",
  PRO: "Pro",
};

export const ACCOUNT_TIER_LABELS: Record<Tier, string> = {
  NOVICE: "Novice Tester",
  AMATEUR: "Amateur Tester",
  PRO: "Professional Tester",
};

const TIER_PERMISSIONS: Record<Tier, Record<FeatureKey, boolean>> = {
  NOVICE: {
    browser: true,
    signals: false,
    extractors: true,
    evidence: true,
    sources: true,
    checker: false,
  },
  AMATEUR: {
    browser: true,
    signals: true,
    extractors: true,
    evidence: true,
    sources: true,
    checker: true,
  },
  PRO: {
    browser: true,
    signals: true,
    extractors: true,
    evidence: true,
    sources: true,
    checker: true,
  },
};

export function hasTierPermission(tier: Tier, feature: FeatureKey) {
  return TIER_PERMISSIONS[tier][feature];
}

export function canShowFeature(account: AccountState, feature: FeatureKey) {
  return hasTierPermission(account.tier, feature) && account.preferences[feature];
}

export function tierPermissions(tier: Tier) {
  return { ...TIER_PERMISSIONS[tier] };
}

export function normalizeAccountState(input: Partial<AccountState> | null | undefined): AccountState {
  const tier = input?.tier === "NOVICE" || input?.tier === "AMATEUR" || input?.tier === "PRO" ? input.tier : DEFAULT_ACCOUNT_STATE.tier;
  const profile = { ...DEFAULT_ACCOUNT_STATE.profile, ...(input?.profile || {}) };
  const preferences = { ...DEFAULT_ACCOUNT_STATE.preferences, ...(input?.preferences || {}) };
  const stats = { ...DEFAULT_ACCOUNT_STATE.stats, ...(input?.stats || {}) };
  const testerLevel = typeof input?.testerLevel === "number" && input.testerLevel >= 1 && input.testerLevel <= 5 ? input.testerLevel : DEFAULT_ACCOUNT_STATE.testerLevel;
  const rating = typeof input?.rating === "number" ? input.rating : DEFAULT_ACCOUNT_STATE.rating;
  return { tier, profile, preferences, stats, testerLevel, rating };
}
