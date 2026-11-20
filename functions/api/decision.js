import {
  DECISION_MODEL,
  executeDecisionAction
} from '../../server/decisionHandler.js';

export async function onRequestGet({ env }) {
  const apiKey = env?.GEMINI_API_KEY || '';
  return Response.json(
    {
      configured: Boolean(apiKey),
      model: DECISION_MODEL
    },
    { status: 200 }
  );
}

export async function onRequestPost({ request, env }) {
  const apiKey = env?.GEMINI_API_KEY || '';
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: 'JSON inválido' },
      { status: 400 }
    );
  }

  const outcome = await executeDecisionAction({
    action: body?.action,
    payload: body?.payload || {},
    apiKey
  });

  return Response.json(outcome, {
    status: outcome.status || (outcome.ok ? 200 : 400)
  });
}
