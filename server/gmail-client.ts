// Gmail Integration - using Replit's Gmail connection
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
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

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    console.error('Gmail connection settings:', connectionSettings);
    throw new Error('Gmail not connected - please reconnect in Integrations panel');
  }
  return accessToken;
}

async function getGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function checkGmailConnection(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch (error) {
    return false;
  }
}

// Get sender email from connection settings (avoids needing gmail.readonly scope)
export function getSenderEmailFromConnection(): string {
  // Try to get email from connection settings
  const email = connectionSettings?.settings?.email || 
                connectionSettings?.settings?.oauth?.email ||
                connectionSettings?.email ||
                '';
  return email;
}

export async function sendEmail(to: string, subject: string, body: string, htmlBody?: string, fromName?: string, replyTo?: string) {
  const gmail = await getGmailClient();
  
  // Get sender's email from connection settings (gmail.readonly scope not available)
  // Fall back to sending without explicit From if email not available - Gmail will use authenticated account
  let senderEmail = getSenderEmailFromConnection();
  const displayName = fromName || '4SG Quote System';
  
  // Generate unique Message-ID for proper threading and spam prevention
  const domain = senderEmail ? senderEmail.split('@')[1] : '4sgraphics.com';
  const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@${domain}>`;
  
  // Format date in RFC 2822 format
  const dateStr = new Date().toUTCString().replace('GMT', '+0000');
  
  // Build email headers - only include From/Reply-To if we have sender email
  const emailLines: string[] = [];
  if (senderEmail) {
    emailLines.push(`From: "${displayName}" <${senderEmail}>`);
  }
  emailLines.push(`To: ${to}`);
  emailLines.push(`Subject: ${subject}`);
  emailLines.push(`Date: ${dateStr}`);
  emailLines.push(`Message-ID: ${messageId}`);
  const effectiveReplyTo = replyTo || senderEmail;
  if (effectiveReplyTo) {
    emailLines.push(`Reply-To: ${effectiveReplyTo}`);
  }
  emailLines.push('MIME-Version: 1.0');
  emailLines.push('Content-Type: text/html; charset=utf-8');
  emailLines.push('X-Mailer: 4SG-QuoteSystem/1.0');
  emailLines.push('');
  emailLines.push(htmlBody || body.replace(/\n/g, '<br>'));
  
  const email = emailLines.join('\r\n');
  const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
  console.log('Sending email from:', senderEmail, 'to:', to, 'Subject:', subject);
  
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedEmail
    }
  });
  
  console.log('Email sent successfully, messageId:', result.data.id);
  
  // Explicitly ensure the email has SENT label (some OAuth configurations may not do this automatically)
  if (result.data.id) {
    try {
      // Add SENT label if not already present
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
        console.log('Added SENT label to message:', result.data.id);
      }
    } catch (labelError) {
      // Non-critical - just log the error, email was still sent successfully
      console.warn('Could not verify/add SENT label:', labelError);
    }
  }
  
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
