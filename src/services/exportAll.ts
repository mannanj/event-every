import { eventStorage } from './storage';

export interface ExportResult {
  success: boolean;
  error?: string;
}

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

export const exportAllEvents = async (): Promise<ExportResult> => {
  try {
    const JSZip = (await import('jszip')).default;

    const result = eventStorage.getAllEvents();

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || 'Failed to load events for export',
      };
    }

    const events = result.data;

    if (events.length === 0) {
      return {
        success: false,
        error: 'No events to export',
      };
    }

    const zip = new JSZip();

    const eventsData = events.map((event) => ({
      id: event.id,
      title: event.title,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      location: event.location,
      description: event.description,
      url: event.url,
      allDay: event.allDay,
      timezone: event.timezone,
      created: event.created.toISOString(),
      source: event.source,
      originalInput: event.originalInput,
      attachments: event.attachments?.map((att) => ({
        id: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        type: att.type,
        size: att.size,
      })),
    }));

    zip.file('events.json', JSON.stringify(eventsData, null, 2));

    const attachmentsFolder = zip.folder('attachments');

    if (attachmentsFolder) {
      for (const event of events) {
        if (event.attachments && event.attachments.length > 0) {
          const eventFolder = attachmentsFolder.folder(event.id);

          if (eventFolder) {
            for (const attachment of event.attachments) {
              try {
                const blob = base64ToBlob(attachment.data, attachment.mimeType);
                eventFolder.file(attachment.filename, blob);
              } catch (error) {
                console.error(`Failed to process attachment ${attachment.filename}:`, error);
              }
            }
          }
        }
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `event-every-export-${timestamp}.zip`;

    downloadBlob(zipBlob, filename);

    return { success: true };
  } catch (error) {
    console.error('Export error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export events',
    };
  }
};
