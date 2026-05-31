const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isActive(user) {
  if (!user) return false;
  if (user.plan === 'free') return false;
  if (!user.planExpiryDate) return true;
  return new Date() < new Date(user.planExpiryDate);
}

function featuresForPlan(planKey) {
  const key = String(planKey || '').toLowerCase();
  switch (key) {
    case 'trial':
      return { aiAccess: true, alerts: true, analytics: true, export: true, unlimitedVoice: true };
    case 'monthly':
    case 'elite':
      return { aiAccess: true, alerts: true, analytics: false, export: false, unlimitedVoice: true };
    case 'quarterly':
    case 'royal':
      return { aiAccess: true, alerts: true, analytics: true, export: false, unlimitedVoice: true };
    case 'lifetime':
    case 'unlimited':
      return { aiAccess: true, alerts: true, analytics: true, export: true, unlimitedVoice: true };
    default:
      return { aiAccess: false, alerts: false, analytics: false, export: false, unlimitedVoice: false };
  }
}

function remainingDays(user) {
  if (!user || !user.planExpiryDate) return 0;
  const diff = new Date(user.planExpiryDate) - new Date();
  return Math.max(0, Math.ceil(diff / MS_PER_DAY));
}

function canUseAI(user) {
  if (!user) return false;
  return featuresForPlan(user.plan).aiAccess && isActive(user);
}

function canUseVoice(user) {
  if (!user) return false;
  if (featuresForPlan(user.plan).unlimitedVoice && isActive(user)) return true;
  const used  = user.usage?.voiceCallsThisPeriod || 0;
  const limit = user.usage?.voiceLimitPerMonth   || 0;
  return used < limit;
}

function canUseExport(user) {
  if (!user) return false;
  return featuresForPlan(user.plan).export && isActive(user);
}

function canUseAnalytics(user) {
  if (!user) return false;
  return featuresForPlan(user.plan).analytics && isActive(user);
}

function incrementVoiceUsage(user, amount = 1) {
  user.usage = user.usage || {};
  user.usage.voiceCallsThisPeriod = (user.usage.voiceCallsThisPeriod || 0) + amount;
  return user.save();
}

function incrementAiUsage(user, amount = 1) {
  user.usage = user.usage || {};
  user.usage.aiCallsThisPeriod = (user.usage.aiCallsThisPeriod || 0) + amount;
  return user.save();
}

function upgradePrompt(user) {
  if (!user) return { upgrade: true, message: 'Please subscribe to access this feature.' };
  if (isActive(user)) return { upgrade: false };
  const msg = user.plan === 'trial'
    ? 'Your trial has ended. Upgrade to continue full access.'
    : 'Feature requires a higher plan. Upgrade to access.';
  return { upgrade: true, message: msg };
}

module.exports = {
  isActive,
  featuresForPlan,
  remainingDays,
  canUseAI,
  canUseVoice,
  canUseExport,
  canUseAnalytics,
  incrementVoiceUsage,
  incrementAiUsage,
  upgradePrompt,
};