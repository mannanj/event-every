'use client';

import { useState, useEffect } from 'react';
import { CalendarEvent } from '@/types/event';
import EditableField from './EditableField';
import { downloadAttachment } from '@/utils/downloadAttachment';

interface InlineEventEditorProps {
  event: CalendarEvent;
  onChange: (updatedEvent: CalendarEvent) => void;
  showAttachments?: boolean;
}

interface ValidationErrors {
  title?: string;
  startDate?: string;
  endDate?: string;
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeForInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDateTimeForInput(date: Date): string {
  return `${formatDateForInput(date)}T${formatTimeForInput(date)}`;
}

export default function InlineEventEditor({
  event,
  onChange,
  showAttachments = true,
}: InlineEventEditorProps) {
  const [formData, setFormData] = useState({
    title: event.title,
    startDate: formatDateForInput(event.startDate),
    startTime: formatTimeForInput(event.startDate),
    endDate: formatDateForInput(event.endDate),
    endTime: formatTimeForInput(event.endDate),
    location: event.location || '',
    description: event.description || '',
    allDay: event.allDay,
  });

  const [errors, setErrors] = useState<ValidationErrors>({});

  useEffect(() => {
    setFormData({
      title: event.title,
      startDate: formatDateForInput(event.startDate),
      startTime: formatTimeForInput(event.startDate),
      endDate: formatDateForInput(event.endDate),
      endTime: formatTimeForInput(event.endDate),
      location: event.location || '',
      description: event.description || '',
      allDay: event.allDay,
    });
  }, [event]);

  const validateAndUpdate = (
    field: string,
    value: string,
    updatedFormData?: typeof formData
  ): boolean => {
    const dataToValidate = updatedFormData || formData;
    const newErrors: ValidationErrors = {};

    if (field === 'title' || !field) {
      if (!dataToValidate.title.trim()) {
        newErrors.title = 'Title is required';
      }
    }

    if (field === 'startDate' || field === 'startTime' || !field) {
      if (!dataToValidate.startDate) {
        newErrors.startDate = 'Start date is required';
      }
    }

    if (field === 'endDate' || field === 'endTime' || !field) {
      if (!dataToValidate.endDate) {
        newErrors.endDate = 'End date is required';
      }
    }

    if (dataToValidate.startDate && dataToValidate.endDate) {
      const start = new Date(`${dataToValidate.startDate}T${dataToValidate.startTime || '00:00'}`);
      const end = new Date(`${dataToValidate.endDate}T${dataToValidate.endTime || '00:00'}`);

      if (end < start) {
        newErrors.endDate = 'End date/time must be after start date/time';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    const updatedFormData = { ...formData, [field]: value };
    setFormData(updatedFormData);

    if (validateAndUpdate(field, value, updatedFormData)) {
      const startDateTime = updatedFormData.allDay
        ? new Date(updatedFormData.startDate)
        : new Date(`${updatedFormData.startDate}T${updatedFormData.startTime}`);

      const endDateTime = updatedFormData.allDay
        ? new Date(updatedFormData.endDate)
        : new Date(`${updatedFormData.endDate}T${updatedFormData.endTime}`);

      const updatedEvent: CalendarEvent = {
        ...event,
        title: updatedFormData.title.trim(),
        startDate: startDateTime,
        endDate: endDateTime,
        location: updatedFormData.location.trim() || undefined,
        description: updatedFormData.description.trim() || undefined,
        allDay: updatedFormData.allDay,
      };

      onChange(updatedEvent);
    }
  };

  return (
    <div className="space-y-1 transition-all duration-200">
      <EditableField
        label="Title"
        value={formData.title}
        onChange={(value) => handleFieldChange('title', value)}
        placeholder="Event title"
        required
        error={errors.title}
      />

      <div className="grid grid-cols-2 gap-2 transition-all duration-200">
        <EditableField
          label="Start Date"
          value={formData.startDate}
          type="date"
          onChange={(value) => handleFieldChange('startDate', value)}
          required
          error={errors.startDate}
        />

        {!formData.allDay && (
          <EditableField
            label="Start Time"
            value={formData.startTime}
            type="time"
            onChange={(value) => handleFieldChange('startTime', value)}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 transition-all duration-200">
        <EditableField
          label="End Date"
          value={formData.endDate}
          type="date"
          onChange={(value) => handleFieldChange('endDate', value)}
          required
          error={errors.endDate}
        />

        {!formData.allDay && (
          <EditableField
            label="End Time"
            value={formData.endTime}
            type="time"
            onChange={(value) => handleFieldChange('endTime', value)}
          />
        )}
      </div>

      <EditableField
        label="Location"
        value={formData.location}
        onChange={(value) => handleFieldChange('location', value)}
        placeholder="Event location"
      />

      <EditableField
        label="Description"
        value={formData.description}
        onChange={(value) => handleFieldChange('description', value)}
        placeholder="Additional details"
        multiline
      />

      {showAttachments && event.attachments && event.attachments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 transition-all duration-200">
          <p className="text-xs font-semibold text-black mb-2">ATTACHMENTS</p>
          <div className="space-y-1">
            {event.attachments.map((attachment, index) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded transition-all duration-200 hover:bg-gray-100"
              >
                <span className="text-gray-700 truncate">
                  [{attachment.type === 'original-image' ? 'Image' : attachment.type === 'original-text' ? 'Text' : 'Metadata'} #{index + 1}] {attachment.filename} ({(attachment.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  onClick={() => downloadAttachment(attachment)}
                  className="ml-2 px-2 py-1 bg-black text-white text-xs hover:bg-gray-800 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-black"
                  aria-label={`Download ${attachment.filename}`}
                >
                  ↓
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
