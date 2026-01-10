import { google } from 'googleapis';
import { db } from './db';
import { userGmailConnections } from '@shared/schema';
import { eq } from 'drizzle-orm';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
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

export function getAuthUrl(userId: string): string {
  const oauth2Client = getOAuth2Client();
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    state: userId,
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

export async function getUserGmailMessages(userId: string, labelId: string = 'INBOX', maxResults: number = 50) {
  const gmail = await getGmailClientForUser(userId);
  
  const response = await gmail.users.messages.list({
    userId: 'me',
    labelIds: [labelId],
    maxResults,
  });
  
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
        for (const part of payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body = Buffer.from(part.body.data, 'base64').toString('utf8');
            break;
          }
          if (part.mimeType === 'text/html' && part.body?.data && !body) {
            body = Buffer.from(part.body.data, 'base64').toString('utf8');
          }
        }
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
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf8');
        break;
      }
      if (part.mimeType === 'text/html' && part.body?.data && !body) {
        body = Buffer.from(part.body.data, 'base64').toString('utf8');
      }
    }
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
