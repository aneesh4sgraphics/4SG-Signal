// Notion client integration - using Replit Notion connection
import { Client } from '@notionhq/client';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=notion',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Notion not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getUncachableNotionClient() {
  const accessToken = await getAccessToken();
  return new Client({ auth: accessToken });
}

// Extract text from any Notion property type
function extractTextFromProperty(prop: any): string {
  if (!prop) return '';
  
  // Title type
  if (prop.title && Array.isArray(prop.title)) {
    return prop.title.map((t: any) => t.plain_text || '').join('');
  }
  
  // Rich text type
  if (prop.rich_text && Array.isArray(prop.rich_text)) {
    return prop.rich_text.map((t: any) => t.plain_text || '').join('');
  }
  
  // Select type
  if (prop.select?.name) {
    return prop.select.name;
  }
  
  // Multi-select type
  if (prop.multi_select && Array.isArray(prop.multi_select)) {
    return prop.multi_select.map((s: any) => s.name).join(', ');
  }
  
  // Number type
  if (typeof prop.number === 'number') {
    return String(prop.number);
  }
  
  // URL type
  if (prop.url) {
    return prop.url;
  }
  
  // Email type
  if (prop.email) {
    return prop.email;
  }
  
  return '';
}

// Search for products in a Notion database
export async function searchNotionProducts(query: string, databaseId?: string): Promise<any[]> {
  try {
    const notion = await getUncachableNotionClient();
    
    // If no database ID provided, search across all accessible databases
    if (!databaseId) {
      // Search pages that match the query
      const response = await notion.search({
        query: query,
        filter: {
          property: 'object',
          value: 'page'
        },
        page_size: 10
      });
      
      // Transform results to product format
      return response.results.map((page: any) => {
        const properties = page.properties || {};
        
        // Log properties for debugging (first result only)
        console.log('Notion page properties:', JSON.stringify(Object.keys(properties)));
        
        // Find the title property (it's the one with type "title")
        let name = '';
        let sku = '';
        let description = '';
        
        for (const [key, value] of Object.entries(properties)) {
          const prop = value as any;
          
          // The title property has type "title"
          if (prop.type === 'title') {
            name = extractTextFromProperty(prop);
          }
          
          // Look for SKU-like fields
          if (key.toLowerCase().includes('sku') || key.toLowerCase().includes('code') || key.toLowerCase().includes('id')) {
            if (!sku) sku = extractTextFromProperty(prop);
          }
          
          // Look for description fields
          if (key.toLowerCase().includes('desc') || key.toLowerCase().includes('note')) {
            if (!description) description = extractTextFromProperty(prop);
          }
        }
        
        // Fallback: if no title found, use first text property
        if (!name) {
          for (const [key, value] of Object.entries(properties)) {
            const text = extractTextFromProperty(value);
            if (text) {
              name = text;
              break;
            }
          }
        }
        
        return {
          id: page.id,
          productName: name || 'Untitled',
          name: name || 'Untitled',
          sku: sku,
          description: description,
          notionUrl: page.url
        };
      });
    } else {
      // Query specific database
      const response = await notion.databases.query({
        database_id: databaseId,
        filter: query ? {
          or: [
            {
              property: 'Name',
              title: {
                contains: query
              }
            },
            {
              property: 'SKU',
              rich_text: {
                contains: query
              }
            }
          ]
        } : undefined,
        page_size: 10
      });
      
      return response.results.map((page: any) => {
        const properties = page.properties || {};
        const name = properties['Name']?.title?.[0]?.plain_text || 'Untitled';
        return {
          id: page.id,
          productName: name,
          name: name,
          sku: properties['SKU']?.rich_text?.[0]?.plain_text || '',
          description: properties['Description']?.rich_text?.[0]?.plain_text || '',
          notionUrl: page.url
        };
      });
    }
  } catch (error) {
    console.error('Notion search error:', error);
    throw error;
  }
}
