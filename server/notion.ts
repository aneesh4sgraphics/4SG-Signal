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
        
        // Extract common property names
        const getName = () => {
          const nameField = properties['Name'] || properties['Title'] || properties['name'] || properties['title'] || properties['Product Name'] || properties['SKU'];
          if (nameField?.title?.[0]?.plain_text) return nameField.title[0].plain_text;
          if (nameField?.rich_text?.[0]?.plain_text) return nameField.rich_text[0].plain_text;
          return 'Untitled';
        };
        
        const getSku = () => {
          const skuField = properties['SKU'] || properties['sku'] || properties['Product SKU'] || properties['Code'];
          if (skuField?.rich_text?.[0]?.plain_text) return skuField.rich_text[0].plain_text;
          if (skuField?.title?.[0]?.plain_text) return skuField.title[0].plain_text;
          return '';
        };
        
        const getDescription = () => {
          const descField = properties['Description'] || properties['description'] || properties['Notes'];
          if (descField?.rich_text?.[0]?.plain_text) return descField.rich_text[0].plain_text;
          return '';
        };
        
        return {
          id: page.id,
          name: getName(),
          sku: getSku(),
          description: getDescription(),
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
        return {
          id: page.id,
          name: properties['Name']?.title?.[0]?.plain_text || 'Untitled',
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
