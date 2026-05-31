const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { requireAI, requireVoice } = require('../middleware/subscription.middleware');
const { incrementVoiceUsage, incrementAiUsage } = require('../utils/subscription');
const { requireExport, requireAnalytics } = require('../middleware/subscription.middleware');
const Transaction = require('../models/transaction.model');
const { Parser } = require('json2csv');

// Example AI endpoint — requires AI access
router.post('/ai/generate', protect, requireAI, async (req, res) => {
  try {
    // record usage (1 AI call)
    await incrementAiUsage(req.user);
    // TODO: call real AI service here
    return res.json({ ok: true, message: 'AI response (placeholder)' });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Failed to record AI usage' });
  }
});

// Example voice endpoint — requires voice quota or unlimited
router.post('/voice/transcribe', protect, requireVoice, async (req, res) => {
  try {
    // record usage (increment by 1 per transcription request)
    await incrementVoiceUsage(req.user, 1);
    // TODO: call real transcription service here
    return res.json({ ok: true, message: 'Transcription result (placeholder)' });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Failed to record voice usage' });
  }
});

// Export (CSV/Excel) — requires export feature
router.get('/export/transactions', protect, requireExport, async (req, res) => {
  try {
    const { email, from, to } = req.query;
    if (!email) return res.status(400).json({ message: 'Email required' });

    const q = { email: email.toLowerCase().trim() };
    if (from || to) q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(to);

    const txs = await Transaction.find(q).sort({ createdAt: -1 }).lean();
    const fields = [ 'title', 'amount', 'category', 'emoji', 'isIncome', 'email', 'createdAt' ];
    const parser = new Parser({ fields });
    const csv = parser.parse(txs);

    const filename = `transactions-${email.replace(/[@.]/g,'_')}-${Date.now()}.csv`;
    res.header('Content-Type', 'text/csv');
    res.attachment(filename);
    return res.send(csv);
  } catch (e) {
    console.error('[EXPORT] Error', e);
    return res.status(500).json({ ok: false, message: 'Export failed' });
  }
});

// Analytics endpoint — requires analytics feature
router.get('/analytics/summary', protect, requireAnalytics, async (req, res) => {
  try {
    const { email, months = 6 } = req.query;
    if (!email) return res.status(400).json({ message: 'Email required' });

    const since = new Date();
    since.setMonth(since.getMonth() - Number(months));

    const txs = await Transaction.find({ email: email.toLowerCase().trim(), createdAt: { $gte: since } }).lean();

    const totalExpense = txs.filter(t => !t.isIncome).reduce((s, t) => s + t.amount, 0);
    const totalIncome  = txs.filter(t => t.isIncome).reduce((s, t) => s + t.amount, 0);

    // by category
    const byCategory = {};
    txs.forEach(t => {
      const cat = t.category || 'Uncategorized';
      if (!byCategory[cat]) byCategory[cat] = { expense: 0, income: 0, count: 0 };
      if (t.isIncome) byCategory[cat].income += t.amount; else byCategory[cat].expense += t.amount;
      byCategory[cat].count += 1;
    });

    // monthly trend
    const trend = {};
    for (let i=0;i<Number(months);i++) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      trend[key] = { income: 0, expense: 0 };
    }
    txs.forEach(t => {
      const d = new Date(t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!trend[key]) trend[key] = { income:0, expense:0 };
      if (t.isIncome) trend[key].income += t.amount; else trend[key].expense += t.amount;
    });

    return res.json({ ok: true, data: { totalExpense, totalIncome, byCategory, trend } });
  } catch (e) {
    console.error('[ANALYTICS] Error', e);
    return res.status(500).json({ ok: false, message: 'Analytics failed' });
  }
});

module.exports = router;

