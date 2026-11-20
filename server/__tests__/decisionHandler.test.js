import { describe, expect, it, vi } from 'vitest';
import {
  buildDecisionRequest,
  executeDecisionAction,
  formatDecisionResult
} from '../decisionHandler';

describe('decisionHandler (Google Gemini Decision 1)', () => {
  it('builds and formats analyze_whatsapp_message payloads cleanly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        answers: {
          message_intent: { type: 'choice', choice: 'pedido', confidence: 0.96 },
          urgency: { type: 'choice', choice: 'urgente', confidence: 0.98 },
          mentions_credit: { type: 'noul', noul: 0.82 },
          needs_human_review: { type: 'noul', noul: 0.12 }
        },
        usage: { total_input_tokens: 150, total_output_tokens: 0 }
      })
    });

    const outcome = await executeDecisionAction({
      action: 'analyze_whatsapp_message',
      payload: { text: 'Mándame 50 fuego urgente, te pago el viernes' },
      apiKey: 'test-key',
      fetchImpl: mockFetch
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/decisions');
    expect(init.headers['x-goog-api-key']).toBe('test-key');

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toEqual({
      intent: 'pedido',
      intentLabel: 'Es un pedido',
      intentConfidencePct: 96,
      urgency: 'urgente',
      urgencyLabel: 'Urgente (para hoy)',
      urgencyConfidencePct: 98,
      mentionsCredit: true,
      mentionsCreditPct: 82,
      needsHumanReview: false,
      needsHumanReviewPct: 12
    });
  });

  it('evaluates credit risk levels from score rubric', () => {
    const req = buildDecisionRequest('evaluate_credit_risk', {
      clientName: 'Tienda Don Pepe',
      currentBalance: 1200,
      totalCredit: 2000,
      totalPaid: 800,
      requestedCredit: 1000,
      salesCount: 4
    });

    expect(req.model).toBe('gemini-decision-1');
    expect(req.questions.credit_risk.type).toBe('score');

    const high = formatDecisionResult('evaluate_credit_risk', {
      answers: {
        credit_risk: { type: 'score', score: 1.65, confidence: 0.7 },
        suggest_partial_payment: { type: 'noul', noul: 0.9 }
      }
    });
    expect(high.level).toBe('alto');
    expect(high.suggestPartialPayment).toBe(true);

    const low = formatDecisionResult('evaluate_credit_risk', {
      answers: {
        credit_risk: { type: 'score', score: 0.25, confidence: 0.91 },
        suggest_partial_payment: { type: 'noul', noul: 0.1 }
      }
    });
    expect(low.level).toBe('bajo');
    expect(low.suggestPartialPayment).toBe(false);
  });

  it('builds multimodal image payload for verify_transfer_receipt and inspect_damage_photo', () => {
    const receiptReq = buildDecisionRequest('verify_transfer_receipt', {
      imageBase64: 'data:image/jpeg;base64,/9j/4AAQ',
      mimeType: 'image/jpeg',
      expectedAmount: 1200,
      clientName: 'Don Pepe'
    });

    expect(receiptReq.input[0]).toEqual({
      type: 'image',
      data: '/9j/4AAQ',
      mime_type: 'image/jpeg',
      resolution: 'medium'
    });
    expect(receiptReq.questions.amount_matches.type).toBe('noul');

    const damageReq = buildDecisionRequest('inspect_damage_photo', {
      imageBase64: '/9j/4AAQ',
      mimeType: 'image/jpeg',
      productName: 'Fuego'
    });

    expect(damageReq.questions.damage_cause.type).toBe('choice');
    const formattedDamage = formatDecisionResult('inspect_damage_photo', {
      answers: {
        damage_cause: { type: 'choice', choice: 'paqueteria', confidence: 0.88 },
        claimable_carrier: { type: 'noul', noul: 0.91 }
      }
    });
    expect(formattedDamage.cause).toBe('paqueteria');
    expect(formattedDamage.claimableCarrier).toBe(true);
  });

  it('rejects disallowed actions and missing API key cleanly', async () => {
    const missingKey = await executeDecisionAction({
      action: 'analyze_whatsapp_message',
      payload: { text: 'hola' },
      apiKey: ''
    });
    expect(missingKey.ok).toBe(false);
    expect(missingKey.status).toBe(503);

    const badAction = await executeDecisionAction({
      action: 'arbitrary_prompt',
      payload: { text: 'hola' },
      apiKey: 'test-key'
    });
    expect(badAction.ok).toBe(false);
    expect(badAction.status).toBe(400);
  });
});
