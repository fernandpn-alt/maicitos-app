import {
  DECISION_MODEL,
  executeDecisionAction
} from '../server/decisionHandler.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '6mb'
    }
  }
};

export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY || '';

  if (req.method === 'GET') {
    return res.status(200).json({
      configured: Boolean(apiKey),
      model: DECISION_MODEL
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: 'JSON inválido' });
    }
  }

  const outcome = await executeDecisionAction({
    action: body?.action,
    payload: body?.payload || {},
    apiKey
  });

  return res.status(outcome.status || (outcome.ok ? 200 : 400)).json(outcome);
}
