import { API_BASE, getAccessToken } from './auth';

// AI routes live on the Nest API (see AiController). Use API_BASE + Bearer token.

export const generateProductDescription = async (
  name: string,
  category: string,
  lang: 'en' | 'fr',
): Promise<string> => {
  try {
    const token = getAccessToken();
    const res = await fetch(`${API_BASE}/ai/generate-description`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        title: name,
        category,
        features: lang === 'fr' ? 'Description en français' : 'Description in English',
      }),
    });

    if (!res.ok) throw new Error('Backend failed');
    const data = await res.json();
    return data.text || '';
  } catch (error) {
    console.error('Error generating description:', error);
    return 'Failed to generate description.';
  }
};

/** Image editing is not exposed on the API yet — returns null so the UI can noop. */
export const editProductImage = async (
  _imageBase64: string,
  _instruction: string,
): Promise<string | null> => {
  console.warn('[AI] edit-image is not available on the API');
  return null;
};

/** Business analytics chat is not exposed on the API yet — local fallback message. */
export const analyzeBusinessData = async (
  _query: string,
  _contextData: string,
  lang: 'en' | 'fr',
): Promise<string> => {
  return lang === 'fr'
    ? 'Analyse IA indisponible pour le moment. Consultez le tableau de bord pour les chiffres clés.'
    : 'AI analysis is not available yet. Use the dashboard stats and charts for now.';
};
