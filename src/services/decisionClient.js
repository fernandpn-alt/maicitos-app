export async function checkDecisionApiStatus() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { configured: false, reachable: false, offline: true, model: 'gemini-decision-1' };
  }

  try {
    const res = await fetch('/api/decision', { method: 'GET' });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return { configured: false, reachable: false, model: 'gemini-decision-1' };
    }
    const data = await res.json();
    return {
      configured: Boolean(data?.configured),
      reachable: true,
      model: data?.model || 'gemini-decision-1'
    };
  } catch {
    return { configured: false, reachable: false, model: 'gemini-decision-1' };
  }
}

export function compressImageToBase64(file, maxDimension = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No se seleccionó ninguna imagen.'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const commaIdx = dataUrl.indexOf(',');
        const imageBase64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;

        URL.revokeObjectURL(objectUrl);
        resolve({ imageBase64, mimeType: 'image/jpeg' });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen seleccionada.'));
    };

    img.src = objectUrl;
  });
}

async function postDecision(action, payload) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      error: 'Sin señal de internet en este momento. Puedes seguir trabajando normal sin la ayuda de IA.'
    };
  }

  try {
    const res = await fetch('/api/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        error: 'El asistente de IA solo funciona cuando la app está conectada al servidor o en la nube.'
      };
    }

    const data = await res.json();
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        error: data?.error || 'No se pudo completar el análisis con IA.'
      };
    }

    return data;
  } catch {
    return {
      ok: false,
      error: 'No hubo conexión con el servicio de IA. Puedes continuar de forma manual.'
    };
  }
}

export async function analyzeWhatsAppMessage(text) {
  return postDecision('analyze_whatsapp_message', { text });
}

export async function evaluateCreditRisk(clientStats) {
  return postDecision('evaluate_credit_risk', clientStats);
}

export async function verifyTransferReceipt({ file, expectedAmount, clientName }) {
  const { imageBase64, mimeType } = await compressImageToBase64(file);
  return postDecision('verify_transfer_receipt', {
    imageBase64,
    mimeType,
    expectedAmount,
    clientName
  });
}

export async function inspectDamagePhoto({ file, productName }) {
  const { imageBase64, mimeType } = await compressImageToBase64(file);
  return postDecision('inspect_damage_photo', {
    imageBase64,
    mimeType,
    productName
  });
}
