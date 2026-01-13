// Google Calendar Integration Client
// Uses Replit's google-calendar connector for OAuth
import { google, calendar_v3 } from 'googleapis';

let connectionSettings: any;

async function getAccessToken(): Promise<string> {
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

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  source: 'google' | 'app';
  sourceId?: string;
  colorId?: string;
  status?: string;
  location?: string;
  attendees?: string[];
}

export interface CreateEventParams {
  title: string;
  description?: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
  location?: string;
  attendees?: string[];
}

export async function isGoogleCalendarConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

export async function getEventsInRange(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient();
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 500,
    });

    const events = response.data.items || [];
    
    return events.map(event => ({
      id: event.id || '',
      title: event.summary || 'Untitled Event',
      description: event.description || undefined,
      start: event.start?.dateTime 
        ? new Date(event.start.dateTime)
        : event.start?.date 
          ? new Date(event.start.date + 'T00:00:00')
          : new Date(),
      end: event.end?.dateTime 
        ? new Date(event.end.dateTime)
        : event.end?.date 
          ? new Date(event.end.date + 'T23:59:59')
          : new Date(),
      allDay: !event.start?.dateTime,
      source: 'google' as const,
      sourceId: event.id || undefined,
      colorId: event.colorId || undefined,
      status: event.status || undefined,
      location: event.location || undefined,
      attendees: event.attendees?.map(a => a.email || '').filter(Boolean),
    }));
  } catch (error) {
    console.error('[Google Calendar] Error fetching events:', error);
    return [];
  }
}

export async function createCalendarEvent(params: CreateEventParams): Promise<CalendarEvent | null> {
  try {
    const calendar = await getCalendarClient();
    
    const endTime = params.end || new Date(params.start.getTime() + 60 * 60 * 1000);
    
    const event: calendar_v3.Schema$Event = {
      summary: params.title,
      description: params.description,
      location: params.location,
      start: params.allDay 
        ? { date: params.start.toISOString().split('T')[0] }
        : { dateTime: params.start.toISOString() },
      end: params.allDay
        ? { date: endTime.toISOString().split('T')[0] }
        : { dateTime: endTime.toISOString() },
      attendees: params.attendees?.map(email => ({ email })),
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    const created = response.data;
    
    return {
      id: created.id || '',
      title: created.summary || params.title,
      description: created.description || undefined,
      start: params.start,
      end: endTime,
      allDay: params.allDay || false,
      source: 'google',
      sourceId: created.id || undefined,
    };
  } catch (error) {
    console.error('[Google Calendar] Error creating event:', error);
    return null;
  }
}

export async function updateCalendarEvent(eventId: string, params: Partial<CreateEventParams>): Promise<boolean> {
  try {
    const calendar = await getCalendarClient();
    
    const existingEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId,
    });
    
    const event: calendar_v3.Schema$Event = {
      ...existingEvent.data,
      summary: params.title ?? existingEvent.data.summary,
      description: params.description ?? existingEvent.data.description,
      location: params.location ?? existingEvent.data.location,
    };
    
    if (params.start) {
      event.start = params.allDay 
        ? { date: params.start.toISOString().split('T')[0] }
        : { dateTime: params.start.toISOString() };
    }
    
    if (params.end) {
      event.end = params.allDay
        ? { date: params.end.toISOString().split('T')[0] }
        : { dateTime: params.end.toISOString() };
    }

    await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: event,
    });
    
    return true;
  } catch (error) {
    console.error('[Google Calendar] Error updating event:', error);
    return false;
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  try {
    const calendar = await getCalendarClient();
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });
    
    return true;
  } catch (error) {
    console.error('[Google Calendar] Error deleting event:', error);
    return false;
  }
}

export async function syncTaskToCalendar(task: {
  id: number;
  title: string;
  description?: string | null;
  dueDate: Date;
  calendarEventId?: string | null;
}): Promise<string | null> {
  try {
    if (task.calendarEventId) {
      const updated = await updateCalendarEvent(task.calendarEventId, {
        title: task.title,
        description: task.description || undefined,
        start: task.dueDate,
      });
      return updated ? task.calendarEventId : null;
    } else {
      const created = await createCalendarEvent({
        title: task.title,
        description: task.description || undefined,
        start: task.dueDate,
      });
      return created?.id || null;
    }
  } catch (error) {
    console.error('[Google Calendar] Error syncing task:', error);
    return null;
  }
}
