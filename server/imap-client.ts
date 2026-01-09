import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';

interface ImapCredentials {
  user: string;
  password?: string;
  accessToken?: string;
  host?: string;
  port?: number;
}

interface EmailMessage {
  id: string;
  threadId: string | null;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  labelIds: string[];
  body?: string;
}

let cachedClient: ImapFlow | null = null;
let cachedConnectionSettings: any = null;

async function getGmailOAuthCredentials(): Promise<ImapCredentials | null> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken || !hostname) {
      return null;
    }

    if (cachedConnectionSettings && cachedConnectionSettings.settings?.expires_at && 
        new Date(cachedConnectionSettings.settings.expires_at).getTime() > Date.now()) {
      const email = cachedConnectionSettings.settings?.email || cachedConnectionSettings.settings?.oauth?.email;
      const accessToken = cachedConnectionSettings.settings?.access_token || cachedConnectionSettings.settings?.oauth?.credentials?.access_token;
      if (email && accessToken) {
        return { user: email, accessToken, host: 'imap.gmail.com', port: 993 };
      }
    }

    cachedConnectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    const email = cachedConnectionSettings?.settings?.email || cachedConnectionSettings?.settings?.oauth?.email;
    const accessToken = cachedConnectionSettings?.settings?.access_token || cachedConnectionSettings?.settings?.oauth?.credentials?.access_token;

    if (email && accessToken) {
      console.log('[IMAP] Using OAuth credentials from Gmail connector for:', email);
      return { user: email, accessToken, host: 'imap.gmail.com', port: 993 };
    }
    return null;
  } catch (error) {
    console.error('[IMAP] Error getting OAuth credentials:', error);
    return null;
  }
}

function getAppPasswordCredentials(): ImapCredentials | null {
  const user = process.env.GMAIL_IMAP_USER;
  const password = process.env.GMAIL_IMAP_APP_PASSWORD;
  
  if (!user || !password) {
    return null;
  }
  
  return {
    user,
    password,
    host: process.env.GMAIL_IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.GMAIL_IMAP_PORT || '993', 10)
  };
}

export function hasImapCredentials(): boolean {
  return getAppPasswordCredentials() !== null;
}

export async function hasAnyImapCredentials(): Promise<boolean> {
  if (hasImapCredentials()) return true;
  const oauth = await getGmailOAuthCredentials();
  return oauth !== null;
}

async function getClient(): Promise<ImapFlow> {
  // First try OAuth from Gmail connector
  let credentials = await getGmailOAuthCredentials();
  
  // Fall back to app password
  if (!credentials) {
    credentials = getAppPasswordCredentials();
  }
  
  if (!credentials) {
    throw new Error('IMAP credentials not available. Gmail connector not connected or GMAIL_IMAP_USER/GMAIL_IMAP_APP_PASSWORD not set.');
  }
  
  // Close existing client if switching auth methods
  if (cachedClient && cachedClient.usable) {
    return cachedClient;
  }
  
  let client: ImapFlow;
  
  if (credentials.accessToken) {
    // Use OAuth2 XOAUTH2 authentication
    console.log('[IMAP] Connecting with OAuth2 XOAUTH2 for:', credentials.user);
    client = new ImapFlow({
      host: credentials.host || 'imap.gmail.com',
      port: credentials.port || 993,
      secure: true,
      auth: {
        user: credentials.user,
        accessToken: credentials.accessToken
      },
      logger: false
    });
  } else {
    // Use regular password authentication
    console.log('[IMAP] Connecting with app password for:', credentials.user);
    client = new ImapFlow({
      host: credentials.host || 'imap.gmail.com',
      port: credentials.port || 993,
      secure: true,
      auth: {
        user: credentials.user,
        pass: credentials.password!
      },
      logger: false
    });
  }
  
  await client.connect();
  cachedClient = client;
  
  return client;
}

export async function closeConnection(): Promise<void> {
  if (cachedClient) {
    try {
      await cachedClient.logout();
    } catch (e) {
    }
    cachedClient = null;
  }
}

function generateThreadId(headers: { messageId?: string; inReplyTo?: string; references?: string }): string {
  if (headers.inReplyTo) {
    return headers.inReplyTo.replace(/[<>]/g, '').substring(0, 32);
  }
  if (headers.references) {
    const refs = headers.references.split(/\s+/);
    if (refs.length > 0) {
      return refs[0].replace(/[<>]/g, '').substring(0, 32);
    }
  }
  if (headers.messageId) {
    return headers.messageId.replace(/[<>]/g, '').substring(0, 32);
  }
  return `thread-${Date.now()}`;
}

export async function getImapMessages(folder: 'INBOX' | 'SENT' = 'INBOX', maxResults: number = 50): Promise<EmailMessage[]> {
  const client = await getClient();
  
  const mailboxName = folder === 'SENT' ? '[Gmail]/Sent Mail' : 'INBOX';
  
  try {
    const lock = await client.getMailboxLock(mailboxName);
    
    try {
      const messages: EmailMessage[] = [];
      const mailbox = client.mailbox;
      
      if (!mailbox || mailbox.exists === 0) {
        return [];
      }
      
      const startSeq = Math.max(1, (mailbox.exists || 0) - maxResults + 1);
      const range = `${startSeq}:*`;
      
      for await (const message of client.fetch(range, {
        envelope: true,
        bodyStructure: true,
        uid: true
      })) {
        const envelope = message.envelope;
        if (!envelope) continue;
        
        const from = envelope.from?.[0];
        const to = envelope.to?.[0];
        
        const fromStr = from 
          ? (from.name ? `"${from.name}" <${from.address}>` : from.address || '')
          : '';
        const toStr = to 
          ? (to.name ? `"${to.name}" <${to.address}>` : to.address || '')
          : '';
        
        const threadId = generateThreadId({
          messageId: envelope.messageId || undefined,
          inReplyTo: envelope.inReplyTo || undefined
        });
        
        messages.push({
          id: `${folder}-${message.uid}`,
          threadId,
          snippet: envelope.subject?.substring(0, 100) || '',
          from: fromStr,
          to: toStr,
          subject: envelope.subject || '',
          date: envelope.date?.toISOString() || new Date().toISOString(),
          labelIds: [folder]
        });
      }
      
      return messages.reverse();
    } finally {
      lock.release();
    }
  } catch (error: any) {
    console.error(`[IMAP] Error fetching from ${mailboxName}:`, error.message);
    throw error;
  }
}

export async function getImapMessage(messageId: string): Promise<EmailMessage & { body: string }> {
  const client = await getClient();
  
  const [folder, uidStr] = messageId.split('-');
  const uid = parseInt(uidStr, 10);
  
  if (!folder || isNaN(uid)) {
    throw new Error(`Invalid message ID: ${messageId}`);
  }
  
  const mailboxName = folder === 'SENT' ? '[Gmail]/Sent Mail' : 'INBOX';
  
  try {
    const lock = await client.getMailboxLock(mailboxName);
    
    try {
      const message = await client.fetchOne(String(uid), {
        envelope: true,
        source: true,
        uid: true
      }, { uid: true });
      
      if (!message) {
        throw new Error(`Message not found: ${messageId}`);
      }
      
      const envelope = message.envelope;
      const source = message.source;
      
      let body = '';
      let subject = envelope?.subject || '';
      let fromStr = '';
      let toStr = '';
      let date = new Date().toISOString();
      
      if (source) {
        try {
          const parsed: ParsedMail = await simpleParser(source);
          body = parsed.text || parsed.html || '';
          subject = parsed.subject || subject;
          fromStr = parsed.from?.text || '';
          toStr = parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((t: AddressObject) => t.text).join(', ') : (parsed.to as AddressObject).text) : '';
          date = parsed.date?.toISOString() || date;
        } catch (parseError) {
          console.error('[IMAP] Error parsing message:', parseError);
          body = source.toString('utf-8').substring(0, 5000);
        }
      }
      
      if (!fromStr && envelope?.from?.[0]) {
        const from = envelope.from[0];
        fromStr = from.name ? `"${from.name}" <${from.address}>` : from.address || '';
      }
      if (!toStr && envelope?.to?.[0]) {
        const to = envelope.to[0];
        toStr = to.name ? `"${to.name}" <${to.address}>` : to.address || '';
      }
      
      const threadId = generateThreadId({
        messageId: envelope?.messageId || undefined,
        inReplyTo: envelope?.inReplyTo || undefined
      });
      
      return {
        id: messageId,
        threadId,
        snippet: body.substring(0, 200),
        from: fromStr,
        to: toStr,
        subject,
        date,
        labelIds: [folder],
        body
      };
    } finally {
      lock.release();
    }
  } catch (error: any) {
    console.error(`[IMAP] Error fetching message ${messageId}:`, error.message);
    throw error;
  }
}

export async function testImapConnection(): Promise<{ success: boolean; error?: string; email?: string }> {
  try {
    const credentials = getCredentials();
    if (!credentials) {
      return { success: false, error: 'IMAP credentials not configured' };
    }
    
    const client = await getClient();
    
    const mailbox = await client.mailboxOpen('INBOX');
    
    return { 
      success: true, 
      email: credentials.user 
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || 'Failed to connect to IMAP' 
    };
  }
}
