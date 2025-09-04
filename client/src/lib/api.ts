export type Contact = {
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  email?: string;
  sourceHint?: string;
  confidence: number;
  rawSnippet?: string;
};

import { api } from "@/api/fetcher";

export async function fetchAndExtract(url: string): Promise<{
  primary: Contact;
  alternatives: Contact[];
  finalUrl: string;
}> {
  try {
    const data = await api<{
      main: { finalUrl: string; html: string };
      contact?: { finalUrl: string; html: string };
    }>("/api/fetch-url", {
      method: "POST",
      body: JSON.stringify({ url }),
    });

    const baseUrl = data?.main?.finalUrl || url;

    const parsed = await api<{
      primary: Contact;
      alternatives: Contact[];
    }>("/api/extract-contacts", {
      method: "POST",
      body: JSON.stringify({
        mainHtml: data?.main?.html,
        contactHtml: data?.contact?.html,
        baseUrl,
      }),
    });

    return { primary: parsed.primary, alternatives: parsed.alternatives, finalUrl: baseUrl };
  } catch (error: any) {
    // Enhance error message for better user experience
    const message = error.message || 'Failed to parse website';
    if (error.status === 404) {
      throw new Error('Website not found or unavailable');
    } else if (error.status >= 500) {
      throw new Error('Server error while processing website');
    } else if (error.status === 400) {
      throw new Error('Invalid website URL provided');
    }
    throw new Error(message);
  }
}