import { google } from 'googleapis';
import { db } from './db';
import { userGmailConnections } from '@shared/schema';
import { eq } from 'drizzle-orm';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getRedirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  
  // Production: use REPLIT_DEPLOYMENT_URL or REPLIT_APP_URL
  if (process.env.REPLIT_DEPLOYMENT_URL) {
    return `${process.env.REPLIT_DEPLOYMENT_URL}/api/gmail-oauth/callback`;
  }
  
  // Development: use REPLIT_DEV_DOMAIN
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/gmail-oauth/callback`;
  }
  
  // Fallback to localhost
  return 'http://localhost:5000/api/gmail-oauth/callback';
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getRedirectUri();
  
  console.log('[Gmail OAuth] Redirect URI:', redirectUri);
  
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)');
  }
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(nonce: string): string {
  const oauth2Client = getOAuth2Client();
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    state: nonce,
  });
}

export async function handleCallback(code: string, userId: string): Promise<{ email: string }> {
  const oauth2Client = getOAuth2Client();
  
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email;
  
  if (!email) {
    throw new Error('Could not retrieve email from Google');
  }
  
  const existingConnection = await db.select().from(userGmailConnections).where(eq(userGmailConnections.userId, userId));
  
  if (existingConnection.length > 0) {
    await db.update(userGmailConnections)
      .set({
        gmailAddress: email,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || existingConnection[0].refreshToken,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope || GMAIL_SCOPES.join(' '),
        isActive: true,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(userGmailConnections.userId, userId));
  } else {
    await db.insert(userGmailConnections).values({
      userId,
      gmailAddress: email,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scope: tokens.scope || GMAIL_SCOPES.join(' '),
      isActive: true,
    });
  }
  
  return { email };
}

export async function getUserGmailConnection(userId: string) {
  const [connection] = await db.select().from(userGmailConnections).where(eq(userGmailConnections.userId, userId));
  return connection || null;
}

export async function disconnectUserGmail(userId: string): Promise<void> {
  await db.delete(userGmailConnections).where(eq(userGmailConnections.userId, userId));
}

export async function getGmailClientForUser(userId: string) {
  const connection = await getUserGmailConnection(userId);
  
  if (!connection || !connection.isActive) {
    throw new Error('Gmail not connected. Please connect your Gmail account first.');
  }
  
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.tokenExpiry?.getTime(),
  });
  
  if (connection.tokenExpiry && connection.tokenExpiry.getTime() < Date.now()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      await db.update(userGmailConnections)
        .set({
          accessToken: credentials.access_token!,
          tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
          updatedAt: new Date(),
        })
        .where(eq(userGmailConnections.userId, userId));
      
      oauth2Client.setCredentials(credentials);
    } catch (error: any) {
      await db.update(userGmailConnections)
        .set({
          isActive: false,
          lastError: 'Token refresh failed: ' + error.message,
          updatedAt: new Date(),
        })
        .where(eq(userGmailConnections.userId, userId));
      throw new Error('Gmail connection expired. Please reconnect your Gmail account.');
    }
  }
  
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// Recursively extract text body from nested email parts
function extractBodyFromParts(parts: any[], preferPlainText: boolean = true): string {
  let plainText = '';
  let htmlText = '';
  
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plainText = Buffer.from(part.body.data, 'base64').toString('utf8');
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      htmlText = Buffer.from(part.body.data, 'base64').toString('utf8');
    } else if (part.parts) {
      // Recursively search nested parts
      const nested = extractBodyFromParts(part.parts, preferPlainText);
      if (nested && !plainText) {
        plainText = nested;
      }
    }
  }
  
  return plainText || htmlText;
}

export async function getUserGmailMessages(userId: string, labelId: string = 'INBOX', maxResults: number = 50, afterDate?: Date) {
  const gmail = await getGmailClientForUser(userId);

  const params: any = {
    userId: 'me',
    labelIds: [labelId],
    maxResults,
  };
  if (afterDate) {
    const y = afterDate.getUTCFullYear();
    const m = String(afterDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(afterDate.getUTCDate()).padStart(2, '0');
    params.q = `after:${y}/${m}/${d}`;
  }
  
  const response = await gmail.users.messages.list(params);
  
  if (!response.data.messages) {
    return [];
  }
  
  const messages = await Promise.all(
    response.data.messages.map(async (msg) => {
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });
      
      const headers = fullMessage.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
      
      let body = '';
      const payload = fullMessage.data.payload;
      if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf8');
      } else if (payload?.parts) {
        body = extractBodyFromParts(payload.parts);
      }
      
      return {
        id: msg.id,
        threadId: fullMessage.data.threadId,
        snippet: fullMessage.data.snippet,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        body,
        labelIds: fullMessage.data.labelIds || [],
      };
    })
  );
  
  return messages;
}

export async function getUserGmailMessage(userId: string, messageId: string) {
  const gmail = await getGmailClientForUser(userId);
  
  const fullMessage = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });
  
  const headers = fullMessage.data.payload?.headers || [];
  const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
  
  let body = '';
  const payload = fullMessage.data.payload;
  if (payload?.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf8');
  } else if (payload?.parts) {
    body = extractBodyFromParts(payload.parts);
  }
  
  return {
    id: messageId,
    threadId: fullMessage.data.threadId,
    snippet: fullMessage.data.snippet,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    body,
    labelIds: fullMessage.data.labelIds || [],
  };
}

// Send email using the user's own Gmail connection
export async function sendEmailAsUser(userId: string, to: string, subject: string, body: string, htmlBody?: string, fromName?: string) {
  const connection = await getUserGmailConnection(userId);
  
  if (!connection || !connection.isActive) {
    throw new Error('Gmail not connected. Please reconnect your Gmail account to send emails.');
  }
  
  // Check if scope includes send permission
  const hasWriteScope = connection.scope?.includes('gmail.send') || 
                        connection.scope?.includes('mail.google.com');
  
  if (!hasWriteScope) {
    throw new Error('Gmail connection does not have send permission. Please reconnect your Gmail with updated permissions.');
  }
  
  const gmail = await getGmailClientForUser(userId);
  
  const senderEmail = connection.gmailAddress;
  const displayName = fromName || '4S Graphics';
  
  // Generate unique Message-ID
  const domain = senderEmail ? senderEmail.split('@')[1] : '4sgraphics.com';
  const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@${domain}>`;
  
  // Format date in RFC 2822 format
  const dateStr = new Date().toUTCString().replace('GMT', '+0000');
  
  // Build email headers
  const emailLines: string[] = [];
  emailLines.push(`From: "${displayName}" <${senderEmail}>`);
  emailLines.push(`To: ${to}`);
  emailLines.push(`Subject: ${subject}`);
  emailLines.push(`Date: ${dateStr}`);
  emailLines.push(`Message-ID: ${messageId}`);
  emailLines.push(`Reply-To: ${senderEmail}`);
  emailLines.push('MIME-Version: 1.0');
  emailLines.push('Content-Type: text/html; charset=utf-8');
  emailLines.push('X-Mailer: 4SG-QuoteSystem/1.0');
  emailLines.push('');
  emailLines.push(htmlBody || body.replace(/\n/g, '<br>'));
  
  const email = emailLines.join('\r\n');
  const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
  console.log('[User Gmail] Sending email from:', senderEmail, 'to:', to, 'Subject:', subject);
  
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedEmail
    }
  });
  
  console.log('[User Gmail] Email sent successfully, messageId:', result.data.id);
  
  // Explicitly ensure the email has SENT label (some OAuth configurations may not do this automatically)
  if (result.data.id) {
    try {
      // Check if SENT label is already present
      const messageDetails = await gmail.users.messages.get({
        userId: 'me',
        id: result.data.id!
      });
      
      const currentLabels = messageDetails.data.labelIds || [];
      if (!currentLabels.includes('SENT')) {
        await gmail.users.messages.modify({
          userId: 'me',
          id: result.data.id!,
          requestBody: {
            addLabelIds: ['SENT']
          }
        });
        console.log('[User Gmail] Added SENT label to message:', result.data.id);
      }
    } catch (labelError) {
      // Non-critical - just log the error, email was still sent successfully
      console.warn('[User Gmail] Could not verify/add SENT label:', labelError);
    }
  }
  
  return result.data;
}
