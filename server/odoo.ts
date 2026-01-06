import axios, { AxiosInstance } from 'axios';

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DATABASE = process.env.ODOO_DATABASE;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY = process.env.ODOO_API_KEY;

interface OdooConfig {
  url: string;
  database: string;
  username: string;
  apiKey: string;
}

interface OdooCallParams {
  model: string;
  method: string;
  args?: any[];
  kwargs?: Record<string, any>;
}

interface OdooPartner {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  street?: string;
  street2?: string;
  city?: string;
  state_id?: [number, string] | false;
  zip?: string;
  country_id?: [number, string] | false;
  is_company: boolean;
  company_type?: string;
  parent_id?: [number, string] | false;
  child_ids?: number[];
  user_id?: [number, string] | false;
  category_id?: number[];
  comment?: string;
  website?: string;
  function?: string;
  title?: [number, string] | false;
  property_product_pricelist?: [number, string] | false;
  type?: string; // 'contact', 'invoice', 'delivery', 'other', 'private'
  parent_name?: string; // Parent company name (resolved)
}

interface OdooProduct {
  id: number;
  name: string;
  default_code?: string;
  list_price: number;
  standard_price?: number;
  categ_id?: [number, string];
  type: string;
  description?: string;
  description_sale?: string;
  uom_id?: [number, string];
  active: boolean;
}

interface OdooPricelist {
  id: number;
  name: string;
  active: boolean;
  currency_id?: [number, string];
  item_ids?: number[];
}

interface OdooSaleOrder {
  id: number;
  name: string;
  partner_id: [number, string];
  state: string;
  date_order: string;
  amount_total: number;
  amount_untaxed: number;
  order_line?: number[];
  user_id?: [number, string] | false;
  note?: string;
}

class OdooClient {
  private config: OdooConfig | null = null;
  private uid: number | null = null;
  private axiosInstance: AxiosInstance;
  private isConnected: boolean = false;
  private lastError: string | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 120000, // 2 minutes timeout for large data fetches
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private getConfig(): OdooConfig {
    if (!ODOO_URL || !ODOO_DATABASE || !ODOO_USERNAME || !ODOO_API_KEY) {
      throw new Error('Odoo configuration missing. Please set ODOO_URL, ODOO_DATABASE, ODOO_USERNAME, and ODOO_API_KEY environment variables.');
    }
    return {
      url: ODOO_URL.replace(/\/$/, ''),
      database: ODOO_DATABASE,
      username: ODOO_USERNAME,
      apiKey: ODOO_API_KEY,
    };
  }

  async authenticate(): Promise<number> {
    const config = this.getConfig();
    this.config = config;

    try {
      const response = await this.axiosInstance.post(`${config.url}/jsonrpc`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'common',
          method: 'authenticate',
          args: [config.database, config.username, config.apiKey, {}],
        },
        id: Math.floor(Math.random() * 100000),
      });

      if (response.data.error) {
        this.lastError = response.data.error.message || 'Authentication failed';
        this.isConnected = false;
        throw new Error(this.lastError || 'Authentication failed');
      }

      const uid = response.data.result;
      if (!uid || uid === false) {
        this.lastError = 'Invalid credentials or database';
        this.isConnected = false;
        throw new Error(this.lastError);
      }

      this.uid = uid;
      this.isConnected = true;
      this.lastError = null;
      console.log(`[Odoo] Authenticated successfully. User ID: ${uid}`);
      return uid;
    } catch (error: any) {
      this.isConnected = false;
      this.lastError = error.message || 'Connection failed';
      console.error('[Odoo] Authentication error:', error.message);
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string; uid?: number }> {
    try {
      const uid = await this.authenticate();
      const version = await this.getServerVersion();
      return {
        success: true,
        message: `Connected to Odoo ${version}. User ID: ${uid}`,
        uid,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Connection failed',
      };
    }
  }

  async getServerVersion(): Promise<string> {
    const config = this.getConfig();
    try {
      const response = await this.axiosInstance.post(`${config.url}/jsonrpc`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'common',
          method: 'version',
          args: [],
        },
        id: Math.floor(Math.random() * 100000),
      });

      if (response.data.result) {
        return response.data.result.server_version || 'Unknown';
      }
      return 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.uid || !this.config) {
      await this.authenticate();
    }
  }

  private async executeWithRetry(params: OdooCallParams, retryCount = 0): Promise<any> {
    try {
      return await this.executeInternal(params);
    } catch (error: any) {
      if (retryCount < 1 && (error.message?.includes('session') || error.message?.includes('expired') || error.message?.includes('Access Denied'))) {
        console.log('[Odoo] Session may have expired, reauthenticating...');
        this.uid = null;
        await this.authenticate();
        return this.executeWithRetry(params, retryCount + 1);
      }
      throw error;
    }
  }

  private async executeInternal(params: OdooCallParams): Promise<any> {
    const config = this.config!;
    const { model, method, args = [], kwargs = {} } = params;

    const response = await this.axiosInstance.post(`${config.url}/jsonrpc`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [config.database, this.uid, config.apiKey, model, method, args, kwargs],
      },
      id: Math.floor(Math.random() * 100000),
    });

    if (response.data.error) {
      const errorMsg = response.data.error.data?.message || response.data.error.message || 'Odoo API error';
      throw new Error(errorMsg);
    }

    return response.data.result;
  }

  async execute(params: OdooCallParams): Promise<any> {
    await this.ensureAuthenticated();
    
    try {
      return await this.executeWithRetry(params);
    } catch (error: any) {
      console.error(`[Odoo] Execute error (${params.model}.${params.method}):`, error.message);
      throw error;
    }
  }

  async searchRead(
    model: string,
    domain: any[] = [],
    fields: string[] = [],
    options: { limit?: number; offset?: number; order?: string } = {}
  ): Promise<any[]> {
    return this.execute({
      model,
      method: 'search_read',
      args: [domain],
      kwargs: {
        fields,
        limit: options.limit,
        offset: options.offset,
        order: options.order,
      },
    });
  }

  async search(model: string, domain: any[] = [], options: { limit?: number; offset?: number; order?: string } = {}): Promise<number[]> {
    return this.execute({
      model,
      method: 'search',
      args: [domain],
      kwargs: options,
    });
  }

  async read(model: string, ids: number[], fields: string[] = []): Promise<any[]> {
    return this.execute({
      model,
      method: 'read',
      args: [ids],
      kwargs: { fields },
    });
  }

  async create(model: string, values: Record<string, any>): Promise<number> {
    return this.execute({
      model,
      method: 'create',
      args: [values],
    });
  }

  async write(model: string, ids: number[], values: Record<string, any>): Promise<boolean> {
    return this.execute({
      model,
      method: 'write',
      args: [ids, values],
    });
  }

  async unlink(model: string, ids: number[]): Promise<boolean> {
    return this.execute({
      model,
      method: 'unlink',
      args: [ids],
    });
  }

  async searchCount(model: string, domain: any[] = []): Promise<number> {
    return this.execute({
      model,
      method: 'search_count',
      args: [domain],
    });
  }

  getConnectionStatus(): { connected: boolean; error: string | null } {
    return {
      connected: this.isConnected,
      error: this.lastError,
    };
  }

  async getPartners(options: { limit?: number; offset?: number; domain?: any[]; isCompany?: boolean } = {}): Promise<OdooPartner[]> {
    const domain = options.domain || [];
    if (options.isCompany !== undefined) {
      domain.push(['is_company', '=', options.isCompany]);
    }

    return this.searchRead('res.partner', domain, [
      'id', 'name', 'email', 'phone', 'street', 'street2', 'city',
      'state_id', 'zip', 'country_id', 'is_company', 'company_type', 'parent_id',
      'child_ids', 'user_id', 'category_id', 'comment', 'website', 'function',
      'property_product_pricelist', 'type',
    ], { limit: options.limit || 100, offset: options.offset || 0 });
  }

  async getPartnerById(id: number): Promise<OdooPartner | null> {
    const partners = await this.read('res.partner', [id], [
      'id', 'name', 'email', 'phone', 'street', 'street2', 'city',
      'state_id', 'zip', 'country_id', 'is_company', 'company_type', 'parent_id',
      'child_ids', 'user_id', 'category_id', 'comment', 'website', 'function',
      'property_product_pricelist', 'type',
    ]);
    return partners.length > 0 ? partners[0] : null;
  }

  async createPartner(values: Partial<OdooPartner>): Promise<number> {
    return this.create('res.partner', values);
  }

  async updatePartner(id: number, values: Partial<OdooPartner>): Promise<boolean> {
    return this.write('res.partner', [id], values);
  }

  async getProducts(options: { limit?: number; offset?: number; domain?: any[] } = {}): Promise<OdooProduct[]> {
    return this.searchRead('product.template', options.domain || [], [
      'id', 'name', 'default_code', 'list_price', 'standard_price', 'categ_id',
      'type', 'description', 'description_sale', 'uom_id', 'active',
    ], { limit: options.limit || 100, offset: options.offset || 0 });
  }

  async getProductById(id: number): Promise<OdooProduct | null> {
    const products = await this.read('product.template', [id], [
      'id', 'name', 'default_code', 'list_price', 'standard_price', 'categ_id',
      'type', 'description', 'description_sale', 'uom_id', 'active',
    ]);
    return products.length > 0 ? products[0] : null;
  }

  async updateProductPrice(productId: number, listPrice: number): Promise<boolean> {
    return this.write('product.template', [productId], { list_price: listPrice });
  }

  async getAllProducts(): Promise<OdooProduct[]> {
    const allProducts: OdooProduct[] = [];
    const batchSize = 500;
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const batch = await this.getProducts({ limit: batchSize, offset });
      allProducts.push(...batch);
      
      if (batch.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
      }
    }
    
    return allProducts;
  }

  // Get product variants (product.product) - these often have the actual internal reference codes
  async getProductVariants(options: { limit?: number; offset?: number; domain?: any[] } = {}): Promise<any[]> {
    return this.searchRead('product.product', options.domain || [['active', '=', true]], [
      'id', 'name', 'default_code', 'list_price', 'standard_price', 
      'product_tmpl_id', 'active', 'barcode',
    ], { limit: options.limit || 100, offset: options.offset || 0 });
  }

  // Get ALL product variants with pagination - this is where Item Codes usually live in Odoo
  async getAllProductVariants(): Promise<any[]> {
    const allVariants: any[] = [];
    const batchSize = 500;
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const batch = await this.getProductVariants({ limit: batchSize, offset });
      allVariants.push(...batch);
      
      if (batch.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
      }
    }
    
    return allVariants;
  }

  // Get combined products: templates + variants, prioritizing variant default_code
  // Optimized: fetch variants first (where Item Codes usually are), then templates
  async getAllProductsWithVariants(): Promise<any[]> {
    // First, try to get all variants - this is usually where Item Codes are stored
    const variants = await this.getAllProductVariants();
    
    const combined: any[] = [];
    const seenCodes = new Set<string>();
    
    // Add all variants with their codes
    for (const variant of variants) {
      // Odoo can return false instead of null for empty fields
      const rawCode = variant.default_code;
      const code = (typeof rawCode === 'string') ? rawCode.trim() : null;
      if (code && !seenCodes.has(code)) {
        combined.push({
          id: variant.id,
          name: variant.name,
          default_code: code,
          list_price: variant.list_price,
          product_tmpl_id: variant.product_tmpl_id?.[0],
          is_variant: true,
        });
        seenCodes.add(code);
      }
    }
    
    // If we found enough variants with codes, skip templates for speed
    // Only fetch templates if we didn't find many variant codes
    if (combined.length < 50) {
      const templates = await this.getAllProducts();
      for (const template of templates) {
        // Odoo can return false instead of null for empty fields
        const rawCode = template.default_code;
        const code = (typeof rawCode === 'string') ? rawCode.trim() : null;
        if (code && !seenCodes.has(code)) {
          combined.push({
            id: template.id,
            name: template.name,
            default_code: code,
            list_price: template.list_price,
            is_variant: false,
          });
          seenCodes.add(code);
        }
      }
    }
    
    return combined;
  }

  async getPricelists(options: { limit?: number; offset?: number } = {}): Promise<OdooPricelist[]> {
    return this.searchRead('product.pricelist', [['active', '=', true]], [
      'id', 'name', 'active', 'currency_id', 'item_ids',
    ], { limit: options.limit || 50, offset: options.offset || 0 });
  }

  async getSaleOrders(options: { limit?: number; offset?: number; domain?: any[]; state?: string } = {}): Promise<OdooSaleOrder[]> {
    const domain = options.domain || [];
    if (options.state) {
      domain.push(['state', '=', options.state]);
    }

    return this.searchRead('sale.order', domain, [
      'id', 'name', 'partner_id', 'state', 'date_order', 'amount_total',
      'amount_untaxed', 'order_line', 'user_id', 'note',
    ], { limit: options.limit || 100, offset: options.offset || 0, order: 'date_order desc' });
  }

  async createSaleOrder(values: {
    partner_id: number;
    order_line?: Array<[number, number, { product_id: number; product_uom_qty: number; price_unit?: number }]>;
    note?: string;
  }): Promise<number> {
    return this.create('sale.order', values);
  }

  async getUsers(): Promise<Array<{ id: number; name: string; email: string; login: string }>> {
    // Filter to only internal users (not portal/public users)
    // share=false means internal user, share=true means portal/external user
    return this.searchRead('res.users', [['active', '=', true], ['share', '=', false]], [
      'id', 'name', 'email', 'login',
    ], { limit: 200 });
  }

  async getAllPartners(): Promise<OdooPartner[]> {
    // Fetch all partners using pagination
    const allPartners: OdooPartner[] = [];
    const batchSize = 500;
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const batch = await this.getPartners({ limit: batchSize, offset });
      allPartners.push(...batch);
      
      if (batch.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
      }
    }
    
    return allPartners;
  }

  async getActivities(options: { userId?: number; limit?: number } = {}): Promise<any[]> {
    const domain: any[] = [];
    if (options.userId) {
      domain.push(['user_id', '=', options.userId]);
    }

    return this.searchRead('mail.activity', domain, [
      'id', 'res_id', 'res_model', 'activity_type_id', 'summary', 'note',
      'date_deadline', 'user_id', 'state',
    ], { limit: options.limit || 100, order: 'date_deadline asc' });
  }

  async createActivity(values: {
    res_id: number;
    res_model: string;
    activity_type_id: number;
    summary?: string;
    note?: string;
    date_deadline: string;
    user_id: number;
  }): Promise<number> {
    return this.create('mail.activity', values);
  }

  async getQuotesByPartner(partnerId: number): Promise<OdooSaleOrder[]> {
    // Get sale orders in 'draft' or 'sent' state (quotes)
    return this.searchRead('sale.order', [
      ['partner_id', '=', partnerId],
      ['state', 'in', ['draft', 'sent']]
    ], [
      'id', 'name', 'partner_id', 'state', 'date_order', 'amount_total',
      'amount_untaxed', 'order_line', 'user_id', 'note', 'validity_date',
    ], { limit: 100, order: 'date_order desc' });
  }

  async getSaleOrdersByPartner(partnerId: number): Promise<OdooSaleOrder[]> {
    // Get confirmed sale orders (not quotes)
    return this.searchRead('sale.order', [
      ['partner_id', '=', partnerId],
      ['state', 'in', ['sale', 'done']]
    ], [
      'id', 'name', 'partner_id', 'state', 'date_order', 'amount_total',
      'amount_untaxed', 'order_line', 'user_id', 'note',
    ], { limit: 100, order: 'date_order desc' });
  }

  async getInvoicesByPartner(partnerId: number): Promise<any[]> {
    // Get customer invoices from account.move
    return this.searchRead('account.move', [
      ['partner_id', '=', partnerId],
      ['move_type', 'in', ['out_invoice', 'out_refund']]
    ], [
      'id', 'name', 'partner_id', 'state', 'invoice_date', 'amount_total',
      'amount_residual', 'payment_state', 'invoice_origin', 'ref',
    ], { limit: 100, order: 'invoice_date desc' });
  }
}

export const odooClient = new OdooClient();

export type { OdooPartner, OdooProduct, OdooPricelist, OdooSaleOrder };
