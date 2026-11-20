export const DECISION_MODEL = 'gemini-decision-1';
export const DECISIONS_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/decisions';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_ACTIONS = [
  'analyze_whatsapp_message',
  'evaluate_credit_risk',
  'verify_transfer_receipt',
  'inspect_damage_photo'
];

function stripDataUrlPrefix(base64Str) {
  const raw = String(base64Str || '').trim();
  const commaIdx = raw.indexOf(',');
  if (raw.startsWith('data:') && commaIdx !== -1) {
    return raw.slice(commaIdx + 1).trim();
  }
  return raw;
}

function estimateBase64Bytes(cleanBase64) {
  return Math.ceil((cleanBase64.length * 3) / 4);
}

function toPercent(prob) {
  const n = Number(prob);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

export function buildDecisionRequest(action, payload = {}) {
  if (!ALLOWED_ACTIONS.includes(action)) {
    throw new Error(`Acción no permitida: ${action}`);
  }

  if (action === 'analyze_whatsapp_message') {
    const text = String(payload.text || '').trim();
    if (!text) {
      throw new Error('Escribe o pega un mensaje de WhatsApp para analizar.');
    }

    return {
      model: DECISION_MODEL,
      input: text,
      questions: {
        message_intent: {
          type: 'choice',
          instructions:
            'Classify the main intent of this WhatsApp message from a snack wholesale customer.',
          criteria: {
            pedido: 'Customer is ordering or requesting product bags/boxes.',
            pago: 'Customer is confirming a payment, transfer, or balance payment.',
            reclamo: 'Customer reports damaged product, missing items, or a complaint.',
            consulta: 'General question about prices, availability, or delivery schedule.'
          }
        },
        urgency: {
          type: 'choice',
          instructions: 'How urgent is the delivery or response needed?',
          criteria: {
            urgente: 'Needs delivery today, right now, or explicitly says urgent.',
            media: 'Standard order for the regular route without explicit rush.',
            normal: 'Flexible timing, inquiry, or future order.'
          }
        },
        mentions_credit: {
          type: 'noul',
          instructions:
            'Does the customer ask for credit (fiado), paying later, or partial payment?'
        },
        needs_human_review: {
          type: 'noul',
          instructions:
            'Is the message ambiguous, missing exact quantities/flavors, or saying vague phrases like "lo de siempre" that a human should verify?'
        }
      }
    };
  }

  if (action === 'evaluate_credit_risk') {
    const clientName = String(payload.clientName || 'Cliente').trim();
    const currentBalance = Number(payload.currentBalance) || 0;
    const totalCredit = Number(payload.totalCredit) || 0;
    const totalPaid = Number(payload.totalPaid) || 0;
    const requestedCredit = Number(payload.requestedCredit) || 0;
    const salesCount = Number(payload.salesCount) || 0;

    const inputSummary = [
      `Cliente: ${clientName}.`,
      `Saldo pendiente actual antes de esta venta: $${currentBalance} MXN.`,
      `Crédito histórico otorgado: $${totalCredit} MXN.`,
      `Abonos pagados históricos: $${totalPaid} MXN.`,
      `Compras registradas: ${salesCount}.`,
      `Nuevo monto solicitado a crédito (fiado) hoy: $${requestedCredit} MXN.`,
      `Nuevo saldo proyectado si se aprueba: $${currentBalance + requestedCredit} MXN.`
    ].join(' ');

    return {
      model: DECISION_MODEL,
      input: inputSummary,
      questions: {
        credit_risk: {
          type: 'score',
          instructions:
            'Evaluate the credit risk of extending additional credit (fiado) to this store today.',
          criteria: [
            'Low risk: little or no pending balance, strong payment history relative to credit.',
            'Moderate risk: manageable pending debt or moderate increase; advisable to request a partial payment today.',
            'High risk: significant unpaid balance or low payment ratio compared to new credit requested; collect debt before extending more credit.'
          ]
        },
        suggest_partial_payment: {
          type: 'noul',
          instructions:
            'Should the driver ask for a partial cash or transfer payment today instead of 100% credit?'
        }
      }
    };
  }

  if (action === 'verify_transfer_receipt') {
    const cleanBase64 = stripDataUrlPrefix(payload.imageBase64);
    if (!cleanBase64) {
      throw new Error('Selecciona o toma una foto del comprobante de transferencia.');
    }
    if (estimateBase64Bytes(cleanBase64) > MAX_IMAGE_BYTES) {
      throw new Error('La imagen supera el tamaño máximo permitido (5 MB).');
    }

    const expectedAmount = Number(payload.expectedAmount) || 0;
    const clientName = String(payload.clientName || 'Cliente').trim();

    return {
      model: DECISION_MODEL,
      input: [
        {
          type: 'image',
          data: cleanBase64,
          mime_type: payload.mimeType || 'image/jpeg',
          resolution: 'medium'
        },
        {
          type: 'text',
          text: `Comprobante de transferencia enviado por ${clientName}. Monto esperado a verificar: $${expectedAmount} MXN.`
        }
      ],
      questions: {
        is_bank_receipt: {
          type: 'noul',
          instructions:
            'Does this image appear to be a genuine Mexican bank transfer or SPEI receipt screenshot?'
        },
        amount_matches: {
          type: 'noul',
          instructions: `Does the visible transfer amount on the receipt clearly match the expected amount of $${expectedAmount} MXN?`
        },
        looks_completed: {
          type: 'noul',
          instructions:
            'Does the transfer status look completed/successful (not pending, scheduled, failed, or cancelled)?'
        }
      }
    };
  }

  if (action === 'inspect_damage_photo') {
    const cleanBase64 = stripDataUrlPrefix(payload.imageBase64);
    if (!cleanBase64) {
      throw new Error('Toma o selecciona una foto de la caja o bolsa dañada.');
    }
    if (estimateBase64Bytes(cleanBase64) > MAX_IMAGE_BYTES) {
      throw new Error('La imagen supera el tamaño máximo permitido (5 MB).');
    }

    const productName = String(payload.productName || 'Maicitos en Frío').trim();

    return {
      model: DECISION_MODEL,
      input: [
        {
          type: 'image',
          data: cleanBase64,
          mime_type: payload.mimeType || 'image/jpeg',
          resolution: 'medium'
        },
        {
          type: 'text',
          text: `Foto tomada en bodega para producto: ${productName}. Determina el tipo de daño para inventario.`
        }
      ],
      questions: {
        damage_cause: {
          type: 'choice',
          instructions:
            'Classify the condition shown in this warehouse product photo.',
          criteria: {
            paqueteria:
              'Shipping box crushed, torn, wet, or damaged during carrier transit.',
            bolsa_rota:
              'Individual snack bag opened, burst, or defective inside without outer box carrier damage.',
            sin_dano:
              'Product and packaging appear intact with no visible damage.'
          }
        },
        claimable_carrier: {
          type: 'noul',
          instructions:
            'Does the damage justify documenting a shipping carrier claim (Estafeta/paquetería)?'
        }
      }
    };
  }

  throw new Error(`Acción no soportada: ${action}`);
}

export function formatDecisionResult(action, rawResponse = {}) {
  const answers = rawResponse.answers || {};

  if (action === 'analyze_whatsapp_message') {
    const intentAns = answers.message_intent || {};
    const urgencyAns = answers.urgency || {};
    const creditAns = answers.mentions_credit || {};
    const reviewAns = answers.needs_human_review || {};

    const intentLabels = {
      pedido: 'Es un pedido',
      pago: 'Aviso de pago',
      reclamo: 'Reclamo o duda de entrega',
      consulta: 'Consulta general'
    };
    const urgencyLabels = {
      urgente: 'Urgente (para hoy)',
      media: 'Prioridad media',
      normal: 'Prioridad normal'
    };

    const intent = intentAns.choice || 'pedido';
    const urgency = urgencyAns.choice || 'media';

    return {
      intent,
      intentLabel: intentLabels[intent] || intent,
      intentConfidencePct: toPercent(intentAns.confidence),
      urgency,
      urgencyLabel: urgencyLabels[urgency] || urgency,
      urgencyConfidencePct: toPercent(urgencyAns.confidence),
      mentionsCredit: (creditAns.noul ?? 0) >= 0.5,
      mentionsCreditPct: toPercent(creditAns.noul),
      needsHumanReview: (reviewAns.noul ?? 0) >= 0.5,
      needsHumanReviewPct: toPercent(reviewAns.noul)
    };
  }

  if (action === 'evaluate_credit_risk') {
    const riskAns = answers.credit_risk || {};
    const partialAns = answers.suggest_partial_payment || {};
    const score = Number(riskAns.score ?? 1);

    let level = 'medio';
    let label = '🟡 Pedir abono parcial hoy';
    if (score < 0.75) {
      level = 'bajo';
      label = '🟢 Cliente confiable para fiar';
    } else if (score >= 1.4) {
      level = 'alto';
      label = '🔴 Riesgo alto: cobrar antes de fiar más';
    }

    return {
      level,
      label,
      score: Number(score.toFixed(2)),
      confidencePct: toPercent(riskAns.confidence),
      suggestPartialPayment: (partialAns.noul ?? 0) >= 0.5,
      suggestPartialPaymentPct: toPercent(partialAns.noul)
    };
  }

  if (action === 'verify_transfer_receipt') {
    const bankAns = answers.is_bank_receipt || {};
    const amountAns = answers.amount_matches || {};
    const completedAns = answers.looks_completed || {};

    const isBankReceipt = (bankAns.noul ?? 0) >= 0.5;
    const amountMatches = (amountAns.noul ?? 0) >= 0.5;
    const looksCompleted = (completedAns.noul ?? 0) >= 0.5;

    return {
      isBankReceipt,
      isBankReceiptPct: toPercent(bankAns.noul),
      amountMatches,
      amountMatchesPct: toPercent(amountAns.noul),
      looksCompleted,
      looksCompletedPct: toPercent(completedAns.noul),
      allClear: isBankReceipt && amountMatches && looksCompleted
    };
  }

  if (action === 'inspect_damage_photo') {
    const causeAns = answers.damage_cause || {};
    const claimAns = answers.claimable_carrier || {};
    const cause = causeAns.choice || 'bolsa_rota';

    const causeLabels = {
      paqueteria: '📦 Daño en envío / paquetería',
      bolsa_rota: '💔 Bolsa rota o merma normal',
      sin_dano: '✅ Sin daño visible'
    };

    return {
      cause,
      causeLabel: causeLabels[cause] || cause,
      confidencePct: toPercent(causeAns.confidence),
      claimableCarrier: (claimAns.noul ?? 0) >= 0.5,
      claimableCarrierPct: toPercent(claimAns.noul)
    };
  }

  return answers;
}

export async function executeDecisionAction({
  action,
  payload = {},
  apiKey,
  fetchImpl = fetch
}) {
  if (!apiKey || !String(apiKey).trim()) {
    return {
      ok: false,
      status: 503,
      error: 'Falta configurar GEMINI_API_KEY en el servidor.'
    };
  }

  let requestBody;
  try {
    requestBody = buildDecisionRequest(action, payload);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: err?.message || 'Datos inválidos para analizar.'
    };
  }

  let response;
  try {
    response = await fetchImpl(DECISIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': String(apiKey).trim()
      },
      body: JSON.stringify(requestBody)
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `No se pudo conectar con Google Decision 1: ${err?.message || 'error de red'}`
    };
  }

  let rawJson = null;
  try {
    rawJson = await response.json();
  } catch {
    rawJson = null;
  }

  if (!response.ok) {
    const googleMessage =
      rawJson?.error?.message || `Error ${response.status} al consultar Google Decision 1`;
    return {
      ok: false,
      status: response.status,
      error: googleMessage
    };
  }

  return {
    ok: true,
    status: 200,
    action,
    model: DECISION_MODEL,
    result: formatDecisionResult(action, rawJson),
    usage: rawJson?.usage || null
  };
}
