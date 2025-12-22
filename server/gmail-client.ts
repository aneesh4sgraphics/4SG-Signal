// Gmail Integration - using Replit's Gmail connection
import { google } from 'googleapis';

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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

export async function getGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function sendEmail(to: string, subject: string, body: string, htmlBody?: string) {
  const gmail = await getGmailClient();
  
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody || body
  ];
  
  const email = emailLines.join('\r\n');
  const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedEmail
    }
  });
  
  return result.data;
}

export async function getLabels() {
  const gmail = await getGmailClient();
  const response = await gmail.users.labels.list({ userId: 'me' });
  return response.data.labels || [];
}

export async function getMessages(labelId: string = 'INBOX', maxResults: number = 20) {
  const gmail = await getGmailClient();
  
  const messagesResponse = await gmail.users.messages.list({
    userId: 'me',
    labelIds: [labelId],
    maxResults
  });
  
  if (!messagesResponse.data.messages) {
    return [];
  }
  
  const messages = await Promise.all(
    messagesResponse.data.messages.map(async (msg) => {
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date']
      });
      
      const headers = fullMessage.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';
      
      return {
        id: msg.id,
        threadId: msg.threadId,
        snippet: fullMessage.data.snippet,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        labelIds: fullMessage.data.labelIds || []
      };
    })
  );
  
  return messages;
}

export async function getMessage(messageId: string) {
  const gmail = await getGmailClient();
  
  const message = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });
  
  const headers = message.data.payload?.headers || [];
  const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';
  
  let body = '';
  const payload = message.data.payload;
  
  if (payload?.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
  } else if (payload?.parts) {
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
    const part = htmlPart || textPart;
    if (part?.body?.data) {
      body = Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
  }
  
  return {
    id: message.data.id,
    threadId: message.data.threadId,
    snippet: message.data.snippet,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    labelIds: message.data.labelIds || [],
    body
  };
}
