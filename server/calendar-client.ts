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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

async function getCalendarClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export interface CalendarEventData {
  title: string;
  description?: string;
  dueDate: Date;
  customerId: string;
  customerName: string;
  taskType: string;
}

export async function createCalendarEvent(eventData: CalendarEventData): Promise<string | null> {
  try {
    const calendar = await getCalendarClient();
    
    const startTime = new Date(eventData.dueDate);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: eventData.title,
        description: `${eventData.description || ''}\n\nCustomer: ${eventData.customerName}\nTask Type: ${eventData.taskType}`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'America/New_York',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
            { method: 'email', minutes: 60 },
          ],
        },
      },
    });

    console.log('[Calendar] Event created:', event.data.id);
    return event.data.id || null;
  } catch (error) {
    console.error('[Calendar] Failed to create event:', error);
    return null;
  }
}

export async function updateCalendarEvent(eventId: string, eventData: Partial<CalendarEventData>): Promise<boolean> {
  try {
    const calendar = await getCalendarClient();
    
    const updateBody: any = {};
    
    if (eventData.title) {
      updateBody.summary = eventData.title;
    }
    
    if (eventData.dueDate) {
      const startTime = new Date(eventData.dueDate);
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
      updateBody.start = { dateTime: startTime.toISOString(), timeZone: 'America/New_York' };
      updateBody.end = { dateTime: endTime.toISOString(), timeZone: 'America/New_York' };
    }
    
    if (eventData.description || eventData.customerName || eventData.taskType) {
      updateBody.description = `${eventData.description || ''}\n\nCustomer: ${eventData.customerName || 'N/A'}\nTask Type: ${eventData.taskType || 'N/A'}`;
    }

    await calendar.events.patch({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: updateBody,
    });

    console.log('[Calendar] Event updated:', eventId);
    return true;
  } catch (error) {
    console.error('[Calendar] Failed to update event:', error);
    return false;
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  try {
    const calendar = await getCalendarClient();
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });

    console.log('[Calendar] Event deleted:', eventId);
    return true;
  } catch (error) {
    console.error('[Calendar] Failed to delete event:', error);
    return false;
  }
}
