export interface ValidationErrors {
  title?: string;
  startDate?: string;
  endDate?: string;
}

export interface EventFormValues {
  title: string;
  startDate: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:mm' (ignored when allDay)
  endDate: string; // 'YYYY-MM-DD'
  endTime: string; // 'HH:mm' (ignored when allDay)
  allDay: boolean;
}

export function validateEvent(form: EventFormValues): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!form.title.trim()) errors.title = 'Title is required';
  if (!form.startDate) errors.startDate = 'Start date is required';
  if (!form.endDate) errors.endDate = 'End date is required';
  if (form.startDate && form.endDate) {
    const start = new Date(`${form.startDate}T${form.allDay ? '00:00' : form.startTime || '00:00'}`);
    const end = new Date(`${form.endDate}T${form.allDay ? '00:00' : form.endTime || '00:00'}`);
    if (end < start) errors.endDate = 'End date/time must be after start date/time';
  }
  return errors;
}
