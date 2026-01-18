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

  // Search product variants (product.product) - these often have the actual internal reference codes
  async searchProductVariants(options: { limit?: number; offset?: number; domain?: any[] } = {}): Promise<any[]> {
    return this.searchRead('product.product', options.domain || [['active', '=', true]], [
      'id', 'name', 'default_code', 'list_price', 'standard_price', 
      'product_tmpl_id', 'active', 'barcode', 'categ_id', 'type', 
      'description', 'description_sale', 'uom_id',
    ], { limit: options.limit || 100, offset: options.offset || 0 });
  }

  // Get a single product variant by ID with full details
  async getProductVariantById(id: number): Promise<any | null> {
    const products = await this.read('product.product', [id], [
      'id', 'name', 'default_code', 'list_price', 'standard_price', 'categ_id',
      'type', 'description', 'description_sale', 'uom_id', 'active',
      'product_tmpl_id', 'barcode', 'qty_available', 'virtual_available',
    ]);
    return products.length > 0 ? products[0] : null;
  }

  // Get ALL product variants with pagination - this is where Item Codes usually live in Odoo
  async getAllProductVariants(): Promise<any[]> {
    const allVariants: any[] = [];
    const batchSize = 500;
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const batch = await this.searchProductVariants({ limit: batchSize, offset });
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

  async getUserByEmail(email: string): Promise<{ id: number; name: string; email: string; login: string } | null> {
    // Find Odoo user by email (case-insensitive matching via ilike)
    const users = await this.searchRead('res.users', [
      ['active', '=', true],
      ['share', '=', false],
      '|',
      ['email', 'ilike', email],
      ['login', 'ilike', email],
    ], [
      'id', 'name', 'email', 'login',
    ], { limit: 1 });
    return users.length > 0 ? users[0] : null;
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

  async getProductInventory(itemCode: string): Promise<{ qtyAvailable: number; qtyReserved: number; qtyVirtual: number; productId: number | null }> {
    try {
      // First find the product by default_code (SKU)
      const products = await this.searchRead('product.product', [
        ['default_code', '=', itemCode]
      ], ['id', 'name', 'qty_available', 'virtual_available', 'outgoing_qty', 'incoming_qty'], { limit: 1 });

      if (!products || products.length === 0) {
        console.log(`[Odoo] Product not found for SKU: ${itemCode}`);
        return { qtyAvailable: 0, qtyReserved: 0, qtyVirtual: 0, productId: null };
      }

      const product = products[0];
      const qtyAvailable = product.qty_available || 0;
      const qtyVirtual = product.virtual_available || 0;
      const qtyReserved = product.outgoing_qty || 0;

      console.log(`[Odoo] Inventory for ${itemCode}: Available=${qtyAvailable}, Virtual=${qtyVirtual}, Reserved=${qtyReserved}`);
      
      return {
        qtyAvailable,
        qtyReserved,
        qtyVirtual,
        productId: product.id
      };
    } catch (error: any) {
      console.error(`[Odoo] Error fetching inventory for ${itemCode}:`, error.message);
      throw error;
    }
  }

  // Get partner categories (res.partner.category) - used for filtering Vendors
  async getPartnerCategories(): Promise<Array<{ id: number; name: string }>> {
    return this.searchRead('res.partner.category', [], ['id', 'name'], { limit: 500 });
  }

  // Get partner IDs that have a specific category/tag
  async getPartnerIdsByCategory(categoryName: string): Promise<number[]> {
    // First, find the category ID by name
    const categories = await this.searchRead('res.partner.category', [
      ['name', '=', categoryName]
    ], ['id'], { limit: 1 });
    
    if (categories.length === 0) {
      console.log(`[Odoo] Category not found: ${categoryName}`);
      return [];
    }
    
    const categoryId = categories[0].id;
    
    // Then, find all partners with that category - only return IDs for efficiency
    const partners = await this.searchRead('res.partner', [
      ['category_id', 'in', [categoryId]],
      ['is_company', '=', true]
    ], ['id'], { limit: 5000 });
    
    console.log(`[Odoo] Found ${partners.length} partners with category "${categoryName}" (ID: ${categoryId})`);
    return partners.map(p => p.id);
  }

  // Get the ID of the "Vendor" category - returns null if not found
  async getVendorCategoryId(): Promise<number | null> {
    try {
      const categories = await this.searchRead('res.partner.category', [
        ['name', 'ilike', 'vendor']
      ], ['id', 'name'], { limit: 10 });
      
      // Look for exact or close match
      for (const cat of categories) {
        if (cat.name.toLowerCase() === 'vendor' || cat.name.toLowerCase() === 'vendors') {
          console.log(`[Odoo] Found Vendor category ID: ${cat.id} (${cat.name})`);
          return cat.id;
        }
      }
      
      // If no exact match, return first ilike match
      if (categories.length > 0) {
        console.log(`[Odoo] Found Vendor category ID (partial match): ${categories[0].id} (${categories[0].name})`);
        return categories[0].id;
      }
      
      console.log('[Odoo] Vendor category not found');
      return null;
    } catch (error: any) {
      console.error('[Odoo] Error fetching Vendor category:', error.message);
      return null;
    }
  }

  // Check if a partner has the Vendor tag
  // Handles both simple arrays [1,2,3] and tuple-style arrays [[1,"Vendor"],[2,"Customer"]]
  hasVendorTag(partner: OdooPartner, vendorCategoryId: number): boolean {
    if (!partner.category_id || !Array.isArray(partner.category_id)) {
      return false;
    }
    
    // Check each category entry
    for (const category of partner.category_id) {
      // Handle simple number array: [1, 2, 3]
      if (typeof category === 'number' && category === vendorCategoryId) {
        return true;
      }
      // Handle tuple-style array: [[1, "Vendor"], [2, "Customer"]]
      if (Array.isArray(category) && category.length >= 1 && category[0] === vendorCategoryId) {
        return true;
      }
    }
    
    return false;
  }

  // Post a message to a partner's chatter (activity log)
  // This creates an email-like record in Odoo's contact page
  async postMessageToPartner(partnerId: number, options: {
    subject: string;
    body: string;
    messageType?: 'email' | 'comment' | 'notification';
    subtypeXmlid?: string;
  }): Promise<number | null> {
    try {
      // Use message_post method on res.partner model
      const messageId = await this.execute({
        model: 'res.partner',
        method: 'message_post',
        args: [partnerId],
        kwargs: {
          subject: options.subject,
          body: options.body,
          message_type: options.messageType || 'email',
          subtype_xmlid: options.subtypeXmlid || 'mail.mt_note',
        },
      });
      
      console.log(`[Odoo] Posted message to partner ${partnerId}, message ID: ${messageId}`);
      return messageId as number;
    } catch (error: any) {
      console.error(`[Odoo] Error posting message to partner ${partnerId}:`, error.message);
      return null;
    }
  }

  // Log an outbound email to Odoo's contact chatter (plain text format)
  async logEmailToPartner(partnerId: number, email: {
    to: string;
    subject: string;
    body: string;
    sentAt?: Date;
  }): Promise<number | null> {
    // Strip HTML tags and convert to plain text
    const stripHtml = (html: string): string => {
      return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    };

    const plainTextBody = stripHtml(email.body);
    const formattedBody = `To: ${email.to}
Date: ${(email.sentAt || new Date()).toLocaleString()}
Subject: ${email.subject}

${plainTextBody}`;

    return this.postMessageToPartner(partnerId, {
      subject: `Email: ${email.subject}`,
      body: formattedBody,
      messageType: 'email',
    });
  }

  // Get child contacts (people) for a company
  async getCompanyContacts(companyPartnerId: number): Promise<Array<{
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    function: string | null;
  }>> {
    try {
      const contacts = await this.searchRead('res.partner', [
        ['parent_id', '=', companyPartnerId],
        ['is_company', '=', false]
      ], ['id', 'name', 'email', 'phone', 'function'], { limit: 50 });

      return contacts.map((c: any) => ({
        id: c.id,
        name: c.name || '',
        email: c.email || null,
        phone: c.phone || null,
        function: c.function || null,
      }));
    } catch (error: any) {
      console.error(`[Odoo] Error fetching company contacts for partner ${companyPartnerId}:`, error.message);
      return [];
    }
  }

  // Get partner with extended business fields (payment terms, salesperson)
  async getPartnerBusinessDetails(partnerId: number): Promise<{
    salesPerson: string | null;
    paymentTerms: string | null;
    pricelist: string | null;
    creditLimit: number;
    totalReceivable: number;
    totalInvoiced: number;
  } | null> {
    try {
      const partners = await this.searchRead('res.partner', [['id', '=', partnerId]], [
        'id', 'name', 'user_id', 'property_payment_term_id', 'property_product_pricelist',
        'credit_limit', 'credit', 'debit', 'total_invoiced',
      ], { limit: 1 });

      if (!partners || partners.length === 0) {
        return null;
      }

      const partner = partners[0];
      return {
        salesPerson: partner.user_id ? partner.user_id[1] : null,
        paymentTerms: partner.property_payment_term_id ? partner.property_payment_term_id[1] : null,
        pricelist: partner.property_product_pricelist ? partner.property_product_pricelist[1] : null,
        creditLimit: partner.credit_limit || 0,
        totalReceivable: partner.credit || 0,
        totalInvoiced: partner.total_invoiced || 0,
      };
    } catch (error: any) {
      console.error(`[Odoo] Error fetching partner business details for ${partnerId}:`, error.message);
      return null;
    }
  }

  // Get sale order lines for a partner to find top products purchased
  async getSaleOrderLinesForPartner(partnerId: number): Promise<Array<{
    productId: number;
    productName: string;
    quantity: number;
    priceTotal: number;
    orderId: number;
    orderName: string;
  }>> {
    try {
      // First get all confirmed sale orders for this partner
      const orders = await this.searchRead('sale.order', [
        ['partner_id', '=', partnerId],
        ['state', 'in', ['sale', 'done']]
      ], ['id', 'name'], { limit: 500 });

      if (!orders || orders.length === 0) {
        return [];
      }

      const orderIds = orders.map(o => o.id);
      const orderMap = new Map(orders.map(o => [o.id, o.name]));

      // Get all sale order lines for these orders
      const lines = await this.searchRead('sale.order.line', [
        ['order_id', 'in', orderIds]
      ], [
        'id', 'product_id', 'product_uom_qty', 'price_subtotal', 'order_id',
      ], { limit: 2000 });

      return lines
        .filter((line: any) => line.product_id)
        .map((line: any) => ({
          productId: line.product_id[0],
          productName: line.product_id[1],
          quantity: line.product_uom_qty || 0,
          priceTotal: line.price_subtotal || 0,
          orderId: line.order_id[0],
          orderName: orderMap.get(line.order_id[0]) || '',
        }));
    } catch (error: any) {
      console.error(`[Odoo] Error fetching sale order lines for partner ${partnerId}:`, error.message);
      return [];
    }
  }

  // Get product costs from Odoo (standard_price field)
  async getProductCosts(productIds: number[]): Promise<Map<number, number>> {
    const costMap = new Map<number, number>();
    if (productIds.length === 0) return costMap;

    try {
      const products = await this.searchRead('product.product', [
        ['id', 'in', productIds]
      ], ['id', 'standard_price'], { limit: productIds.length });

      for (const product of products) {
        costMap.set(product.id, product.standard_price || 0);
      }
    } catch (error: any) {
      console.error(`[Odoo] Error fetching product costs:`, error.message);
    }
    return costMap;
  }

  // Get product categories for given product IDs
  async getProductCategories(productIds: number[]): Promise<Map<number, { categoryId: number; categoryName: string }>> {
    const categoryMap = new Map<number, { categoryId: number; categoryName: string }>();
    if (productIds.length === 0) return categoryMap;

    try {
      const products = await this.searchRead('product.product', [
        ['id', 'in', productIds]
      ], ['id', 'categ_id'], { limit: productIds.length });

      for (const product of products) {
        if (product.categ_id) {
          categoryMap.set(product.id, {
            categoryId: product.categ_id[0],
            categoryName: product.categ_id[1],
          });
        }
      }
    } catch (error: any) {
      console.error(`[Odoo] Error fetching product categories:`, error.message);
    }
    return categoryMap;
  }

  // Get all product categories from Odoo
  async getAllProductCategories(): Promise<Array<{ id: number; name: string }>> {
    try {
      const categories = await this.searchRead('product.category', [], ['id', 'name'], { limit: 500 });
      return categories.map((c: any) => ({ id: c.id, name: c.name }));
    } catch (error: any) {
      console.error(`[Odoo] Error fetching all product categories:`, error.message);
      return [];
    }
  }

  // Get comprehensive business metrics for a partner
  async getPartnerBusinessMetrics(partnerId: number): Promise<{
    salesPerson: string | null;
    paymentTerms: string | null;
    totalOutstanding: number;
    lifetimeSales: number;
    averageMargin: number;
    topProducts: Array<{ name: string; quantity: number; totalSpent: number }>;
    purchasedCategories: Array<{ id: number; name: string }>;
  } | null> {
    try {
      // Fetch data in parallel for speed
      const [partnerDetails, orderLines, allCategories] = await Promise.all([
        this.getPartnerBusinessDetails(partnerId),
        this.getSaleOrderLinesForPartner(partnerId),
        this.getAllProductCategories(),
      ]);

      if (!partnerDetails) {
        return null;
      }

      // Use Odoo's computed fields directly - matches what Odoo shows on contact page
      // totalInvoiced = "Invoiced" amount in Odoo
      // totalReceivable (credit) = "Due" amount in Odoo
      const lifetimeSales = partnerDetails.totalInvoiced;
      const totalOutstanding = partnerDetails.totalReceivable;

      // Aggregate products by product ID (SKU) to find top products
      const productAggregates = new Map<number, { name: string; quantity: number; totalSpent: number }>();
      for (const line of orderLines) {
        const existing = productAggregates.get(line.productId) || { name: line.productName, quantity: 0, totalSpent: 0 };
        existing.quantity += line.quantity;
        existing.totalSpent += line.priceTotal;
        productAggregates.set(line.productId, existing);
      }

      // Sort by total spent and take top 10
      const topProducts = Array.from(productAggregates.values())
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);

      // Get unique product IDs from order lines
      const productIds = Array.from(new Set(orderLines.map(line => line.productId)));
      
      // Calculate actual average margin using product costs from Odoo
      let averageMargin = 0;
      let purchasedCategoryIds = new Set<number>();
      
      if (productIds.length > 0) {
        const [productCosts, productCategoryMap] = await Promise.all([
          this.getProductCosts(productIds),
          this.getProductCategories(productIds),
        ]);

        // Calculate margin: (revenue - cost) / revenue * 100
        let totalRevenue = 0;
        let totalCost = 0;
        for (const line of orderLines) {
          const unitCost = productCosts.get(line.productId) || 0;
          totalRevenue += line.priceTotal;
          totalCost += unitCost * line.quantity;
        }

        if (totalRevenue > 0) {
          averageMargin = Math.round(((totalRevenue - totalCost) / totalRevenue) * 100);
        }

        // Collect purchased category IDs
        productCategoryMap.forEach((catInfo) => {
          purchasedCategoryIds.add(catInfo.categoryId);
        });
      }

      // Filter categories that have been purchased
      const purchasedCategories = allCategories.filter(c => purchasedCategoryIds.has(c.id));

      return {
        salesPerson: partnerDetails.salesPerson,
        paymentTerms: partnerDetails.paymentTerms,
        totalOutstanding,
        lifetimeSales,
        averageMargin,
        topProducts,
        purchasedCategories,
      };
    } catch (error: any) {
      console.error(`[Odoo] Error fetching business metrics for partner ${partnerId}:`, error.message);
      return null;
    }
  }

  // Get partner write_date for conflict detection before updating
  async getPartnerWriteDate(partnerId: number): Promise<Date | null> {
    try {
      const partners = await this.searchRead('res.partner', [['id', '=', partnerId]], ['write_date'], { limit: 1 });
      if (partners && partners.length > 0 && partners[0].write_date) {
        return new Date(partners[0].write_date);
      }
      return null;
    } catch (error: any) {
      console.error(`[Odoo] Error fetching write_date for partner ${partnerId}:`, error.message);
      return null;
    }
  }

  // Get full partner data for edit form
  async getPartnerForEdit(partnerId: number): Promise<{
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    street: string | null;
    street2: string | null;
    city: string | null;
    stateId: [number, string] | null;
    zip: string | null;
    countryId: [number, string] | null;
    website: string | null;
    comment: string | null;
    writeDate: Date | null;
  } | null> {
    try {
      const partners = await this.searchRead('res.partner', [['id', '=', partnerId]], [
        'id', 'name', 'email', 'phone', 'street', 'street2', 'city',
        'state_id', 'zip', 'country_id', 'website', 'comment', 'write_date',
      ], { limit: 1 });

      if (!partners || partners.length === 0) return null;

      const p = partners[0];
      return {
        id: p.id,
        name: p.name || '',
        email: p.email || null,
        phone: p.phone || null,
        street: p.street || null,
        street2: p.street2 || null,
        city: p.city || null,
        stateId: p.state_id || null,
        zip: p.zip || null,
        countryId: p.country_id || null,
        website: p.website || null,
        comment: p.comment || null,
        writeDate: p.write_date ? new Date(p.write_date) : null,
      };
    } catch (error: any) {
      console.error(`[Odoo] Error fetching partner for edit ${partnerId}:`, error.message);
      return null;
    }
  }

  // Update partner with conflict detection - returns { success, conflict, error }
  async updatePartnerWithConflictCheck(
    partnerId: number,
    values: Record<string, any>,
    lastKnownWriteDate?: Date
  ): Promise<{ success: boolean; conflict: boolean; error?: string; currentWriteDate?: Date }> {
    try {
      // Check current write_date if we have a previous one to compare
      if (lastKnownWriteDate) {
        const currentWriteDate = await this.getPartnerWriteDate(partnerId);
        if (currentWriteDate && currentWriteDate > lastKnownWriteDate) {
          return {
            success: false,
            conflict: true,
            error: 'Partner was modified in Odoo since last sync',
            currentWriteDate,
          };
        }
      }

      // Map CRM field names to Odoo field names
      const odooValues: Record<string, any> = {};
      const fieldMapping: Record<string, string> = {
        company: 'name',
        name: 'name',
        email: 'email',
        phone: 'phone',
        address1: 'street',
        address2: 'street2',
        city: 'city',
        zip: 'zip',
        website: 'website',
        note: 'comment',
      };

      for (const [crmField, value] of Object.entries(values)) {
        const odooField = fieldMapping[crmField] || crmField;
        odooValues[odooField] = value;
      }

      // Write to Odoo
      const result = await this.write('res.partner', [partnerId], odooValues);
      
      if (result) {
        const newWriteDate = await this.getPartnerWriteDate(partnerId);
        return { success: true, conflict: false, currentWriteDate: newWriteDate || undefined };
      } else {
        return { success: false, conflict: false, error: 'Odoo write returned false' };
      }
    } catch (error: any) {
      console.error(`[Odoo] Error updating partner ${partnerId}:`, error.message);
      return { success: false, conflict: false, error: error.message };
    }
  }

  // Get Odoo countries for dropdown
  async getCountries(): Promise<Array<{ id: number; name: string; code: string }>> {
    try {
      const countries = await this.searchRead('res.country', [], ['id', 'name', 'code'], { limit: 300 });
      return countries.map((c: any) => ({
        id: c.id,
        name: c.name,
        code: c.code,
      }));
    } catch (error: any) {
      console.error(`[Odoo] Error fetching countries:`, error.message);
      return [];
    }
  }

  // Get Odoo states for a country
  async getStates(countryId: number): Promise<Array<{ id: number; name: string; code: string }>> {
    try {
      const states = await this.searchRead('res.country.state', [['country_id', '=', countryId]], ['id', 'name', 'code'], { limit: 100 });
      return states.map((s: any) => ({
        id: s.id,
        name: s.name,
        code: s.code,
      }));
    } catch (error: any) {
      console.error(`[Odoo] Error fetching states for country ${countryId}:`, error.message);
      return [];
    }
  }

  // Get available payment terms from Odoo
  async getPaymentTerms(): Promise<Array<{ id: number; name: string }>> {
    try {
      const terms = await this.searchRead('account.payment.term', [['active', '=', true]], ['id', 'name'], { limit: 100 });
      return terms.map((t: any) => ({
        id: t.id,
        name: t.name,
      }));
    } catch (error: any) {
      console.error(`[Odoo] Error fetching payment terms:`, error.message);
      return [];
    }
  }

  // Update partner payment terms in Odoo
  async updatePartnerPaymentTerms(partnerId: number, paymentTermId: number | null): Promise<{ success: boolean; error?: string }> {
    try {
      await this.write('res.partner', [partnerId], {
        property_payment_term_id: paymentTermId || false,
      });
      return { success: true };
    } catch (error: any) {
      console.error(`[Odoo] Error updating payment terms for partner ${partnerId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Get single product template by ID with extended fields
  async getProductById(productId: number): Promise<OdooProduct | null> {
    try {
      const products = await this.searchRead('product.template', [
        ['id', '=', productId]
      ], [
        'id', 'name', 'default_code', 'list_price', 'standard_price',
        'categ_id', 'type', 'description', 'description_sale',
        'uom_id', 'active', 'product_variant_ids'
      ], { limit: 1 });
      
      if (!products || products.length === 0) {
        return null;
      }
      return products[0];
    } catch (error: any) {
      console.error(`[Odoo] Error fetching product ${productId}:`, error.message);
      throw error;
    }
  }

  // Get product variants for a template
  async getProductVariants(templateId: number): Promise<Array<{
    id: number;
    name: string;
    default_code: string;
    qty_available: number;
    virtual_available: number;
    incoming_qty: number;
    outgoing_qty: number;
    standard_price: number;
  }>> {
    try {
      const variants = await this.searchRead('product.product', [
        ['product_tmpl_id', '=', templateId]
      ], [
        'id', 'name', 'default_code', 'qty_available', 'virtual_available',
        'incoming_qty', 'outgoing_qty', 'standard_price'
      ], { limit: 100 });
      return variants;
    } catch (error: any) {
      console.error(`[Odoo] Error fetching variants for template ${templateId}:`, error.message);
      return [];
    }
  }

  // Get pricelist items for a product template (pricing tiers)
  async getPricelistItemsForProduct(productTemplateId: number): Promise<Array<{
    id: number;
    pricelist_id: [number, string];
    pricelist_name: string;
    fixed_price: number;
    min_quantity: number;
    compute_price: string;
    percent_price: number;
  }>> {
    try {
      // Get all pricelist items that apply to this product template
      const items = await this.searchRead('product.pricelist.item', [
        '|',
        ['product_tmpl_id', '=', productTemplateId],
        ['applied_on', '=', '3_global'] // Include global rules too
      ], [
        'id', 'pricelist_id', 'fixed_price', 'min_quantity',
        'compute_price', 'percent_price', 'applied_on', 'product_tmpl_id'
      ], { limit: 200 });

      // Filter to only include product-specific items or global items
      const relevantItems = items.filter((item: any) => {
        if (item.applied_on === '3_global') return true;
        if (item.product_tmpl_id && item.product_tmpl_id[0] === productTemplateId) return true;
        return false;
      });

      return relevantItems.map((item: any) => ({
        id: item.id,
        pricelist_id: item.pricelist_id,
        pricelist_name: item.pricelist_id ? item.pricelist_id[1] : 'Unknown',
        fixed_price: item.fixed_price || 0,
        min_quantity: item.min_quantity || 1,
        compute_price: item.compute_price || 'fixed',
        percent_price: item.percent_price || 0,
      }));
    } catch (error: any) {
      console.error(`[Odoo] Error fetching pricelist items for product ${productTemplateId}:`, error.message);
      return [];
    }
  }

  // Get purchase order lines for a product (on order quantities)
  async getProductPurchaseOrders(productTemplateId: number): Promise<Array<{
    id: number;
    order_id: [number, string];
    order_name: string;
    product_qty: number;
    qty_received: number;
    qty_remaining: number;
    price_unit: number;
    date_planned: string;
    state: string;
  }>> {
    try {
      // First get variant IDs for this template
      const variants = await this.searchRead('product.product', [
        ['product_tmpl_id', '=', productTemplateId]
      ], ['id'], { limit: 100 });
      
      if (variants.length === 0) return [];
      
      const variantIds = variants.map((v: any) => v.id);

      // Get purchase order lines for these variants (only pending/confirmed orders)
      const poLines = await this.searchRead('purchase.order.line', [
        ['product_id', 'in', variantIds],
        ['state', 'in', ['purchase', 'done']]
      ], [
        'id', 'order_id', 'product_qty', 'qty_received', 'price_unit', 'date_planned', 'state'
      ], { limit: 100, order: 'date_planned desc' });

      return poLines.map((line: any) => ({
        id: line.id,
        order_id: line.order_id,
        order_name: line.order_id ? line.order_id[1] : 'Unknown',
        product_qty: line.product_qty || 0,
        qty_received: line.qty_received || 0,
        qty_remaining: (line.product_qty || 0) - (line.qty_received || 0),
        price_unit: line.price_unit || 0,
        date_planned: line.date_planned || '',
        state: line.state || '',
      }));
    } catch (error: any) {
      console.error(`[Odoo] Error fetching PO lines for product ${productTemplateId}:`, error.message);
      return [];
    }
  }

  // Get customer purchase history for a product
  async getProductCustomerPurchases(productTemplateId: number): Promise<Array<{
    partner_id: number;
    partner_name: string;
    total_qty: number;
    total_revenue: number;
    order_count: number;
    last_order_date: string;
  }>> {
    try {
      // First get variant IDs for this template
      const variants = await this.searchRead('product.product', [
        ['product_tmpl_id', '=', productTemplateId]
      ], ['id'], { limit: 100 });
      
      if (variants.length === 0) return [];
      
      const variantIds = variants.map((v: any) => v.id);

      // Get sale order lines for confirmed/done orders
      const saleLines = await this.searchRead('sale.order.line', [
        ['product_id', 'in', variantIds],
        ['state', 'in', ['sale', 'done']]
      ], [
        'id', 'order_id', 'product_uom_qty', 'price_subtotal', 'order_partner_id'
      ], { limit: 1000 });

      // Aggregate by partner
      const customerMap = new Map<number, {
        partner_id: number;
        partner_name: string;
        total_qty: number;
        total_revenue: number;
        order_ids: Set<number>;
        last_order_date: string;
      }>();

      for (const line of saleLines) {
        const partnerId = line.order_partner_id?.[0];
        const partnerName = line.order_partner_id?.[1] || 'Unknown';
        
        if (!partnerId) continue;
        
        if (!customerMap.has(partnerId)) {
          customerMap.set(partnerId, {
            partner_id: partnerId,
            partner_name: partnerName,
            total_qty: 0,
            total_revenue: 0,
            order_ids: new Set(),
            last_order_date: '',
          });
        }
        
        const customer = customerMap.get(partnerId)!;
        customer.total_qty += line.product_uom_qty || 0;
        customer.total_revenue += line.price_subtotal || 0;
        if (line.order_id?.[0]) {
          customer.order_ids.add(line.order_id[0]);
        }
      }

      // Convert to array and sort by revenue
      const results = Array.from(customerMap.values()).map(c => ({
        partner_id: c.partner_id,
        partner_name: c.partner_name,
        total_qty: c.total_qty,
        total_revenue: c.total_revenue,
        order_count: c.order_ids.size,
        last_order_date: c.last_order_date,
      }));

      // Sort by total revenue descending
      results.sort((a, b) => b.total_revenue - a.total_revenue);
      
      return results.slice(0, 50); // Top 50 customers
    } catch (error: any) {
      console.error(`[Odoo] Error fetching customer purchases for product ${productTemplateId}:`, error.message);
      return [];
    }
  }

  // Get aggregated product inventory from all variants
  async getProductInventoryByTemplate(productTemplateId: number): Promise<{
    totalAvailable: number;
    totalVirtual: number;
    totalIncoming: number;
    totalOutgoing: number;
    variants: Array<{
      id: number;
      sku: string;
      available: number;
      virtual: number;
      incoming: number;
      outgoing: number;
    }>;
  }> {
    try {
      // Fetch variants by template ID with proper domain filter
      const variants = await this.searchRead('product.product', [
        ['product_tmpl_id', '=', productTemplateId]
      ], [
        'id', 'name', 'default_code', 'qty_available', 'virtual_available',
        'incoming_qty', 'outgoing_qty', 'standard_price'
      ], { limit: 100 });
      
      let totalAvailable = 0;
      let totalVirtual = 0;
      let totalIncoming = 0;
      let totalOutgoing = 0;
      
      const variantData = variants.map(v => {
        totalAvailable += v.qty_available || 0;
        totalVirtual += v.virtual_available || 0;
        totalIncoming += v.incoming_qty || 0;
        totalOutgoing += v.outgoing_qty || 0;
        
        return {
          id: v.id,
          sku: v.default_code || '',
          available: v.qty_available || 0,
          virtual: v.virtual_available || 0,
          incoming: v.incoming_qty || 0,
          outgoing: v.outgoing_qty || 0,
        };
      });
      
      return {
        totalAvailable,
        totalVirtual,
        totalIncoming,
        totalOutgoing,
        variants: variantData,
      };
    } catch (error: any) {
      console.error(`[Odoo] Error fetching inventory for template ${productTemplateId}:`, error.message);
      return {
        totalAvailable: 0,
        totalVirtual: 0,
        totalIncoming: 0,
        totalOutgoing: 0,
        variants: [],
      };
    }
  }
}

export const odooClient = new OdooClient();

export function isOdooConfigured(): boolean {
  return !!(ODOO_URL && ODOO_DATABASE && ODOO_USERNAME && ODOO_API_KEY);
}

export type { OdooPartner, OdooProduct, OdooPricelist, OdooSaleOrder };
