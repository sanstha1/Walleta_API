const { canUseAI, canUseVoice, canUseExport, canUseAnalytics, upgradePrompt } = require('../utils/subscription');

function requireAI(req, res, next) {
  if (canUseAI(req.user)) return next();
  const prompt = upgradePrompt(req.user);
  return res.status(402).json({ ok: false, upgrade: true, message: prompt.message });
}

function requireVoice(req, res, next) {
  if (canUseVoice(req.user)) return next();
  const prompt = upgradePrompt(req.user);
  return res.status(402).json({ ok: false, upgrade: true, message: prompt.message });
}

function requireExport(req, res, next) {
  if (canUseExport(req.user)) return next();
  const prompt = upgradePrompt(req.user);
  return res.status(402).json({ ok: false, upgrade: true, message: prompt.message });
}

function requireAnalytics(req, res, next) {
  if (canUseAnalytics(req.user)) return next();          // ← fixed: uses helper, not raw field
  const prompt = upgradePrompt(req.user);
  return res.status(402).json({ ok: false, upgrade: true, message: prompt.message });
}

module.exports = {
  requireAI,
  requireVoice,
  requireExport,
  requireAnalytics,
};