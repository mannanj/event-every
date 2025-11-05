'use client';

import { useState, useEffect } from 'react';
import { CalendarEvent } from '@/types/event';

interface EventEditorProps {
  event: CalendarEvent;
  onSave: (updatedEvent: CalendarEvent) => void;
  onCancel: () => void;
}

interface ValidationErrors {
  title?: string;
  startDate?: string;
  endDate?: string;
}

export default function EventEditor({ event, onSave, onCancel }: EventEditorProps) {
  const [formData, setFormData] = useState({
    title: event.title,
    startDate: formatDateForInput(event.startDate),
    startTime: formatTimeForInput(event.startDate),
    endDate: formatDateForInput(event.endDate),
    endTime: formatTimeForInput(event.endDate),
    location: event.location || '',
    description: event.description || '',
    allDay: event.allDay,
    attachments: event.attachments || [],
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

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

  function validateForm(): boolean {
    const newErrors: ValidationErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    }

    if (!formData.endDate) {
      newErrors.endDate = 'End date is required';
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(`${formData.startDate}T${formData.startTime || '00:00'}`);
      const end = new Date(`${formData.endDate}T${formData.endTime || '00:00'}`);

      if (end < start) {
        newErrors.endDate = 'End date/time must be after start date/time';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  const handleBlur = (field: string) => {
    setTouched({ ...touched, [field]: true });
    validateForm();
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData({ ...formData, [field]: value });
    if (touched[field]) {
      validateForm();
    }
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setFormData({
      ...formData,
      attachments: formData.attachments.filter((att) => att.id !== attachmentId),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    setTouched({
      title: true,
      startDate: true,
      endDate: true,
    });

    if (!validateForm()) {
      return;
    }

    const startDateTime = formData.allDay
      ? new Date(formData.startDate)
      : new Date(`${formData.startDate}T${formData.startTime}`);

    const endDateTime = formData.allDay
      ? new Date(formData.endDate)
      : new Date(`${formData.endDate}T${formData.endTime}`);

    const updatedEvent: CalendarEvent = {
      ...event,
      title: formData.title.trim(),
      startDate: startDateTime,
      endDate: endDateTime,
      location: formData.location.trim() || undefined,
      description: formData.description.trim() || undefined,
      allDay: formData.allDay,
      attachments: formData.attachments.length > 0 ? formData.attachments : undefined,
    };

    onSave(updatedEvent);
  };

  return (
    <div className="bg-white border-2 border-black p-6">
      <div className="border-b-2 border-black pb-4 mb-6">
        <h2 className="text-2xl font-bold text-black mb-1">Edit Event</h2>
        <p className="text-sm text-gray-600">Modify any details below</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="title" className="block text-xs font-medium text-black mb-2">
            TITLE *
          </label>
          <input
            id="title"
            type="text"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            onBlur={() => handleBlur('title')}
            className={`w-full px-4 py-3 border-2 ${
              touched.title && errors.title ? 'border-red-600' : 'border-black'
            } focus:outline-none focus:ring-2 focus:ring-black text-black`}
            placeholder="Event title"
            aria-invalid={touched.title && !!errors.title}
            aria-describedby={touched.title && errors.title ? 'title-error' : undefined}
          />
          {touched.title && errors.title && (
            <p id="title-error" className="mt-1 text-sm text-red-600" role="alert">
              {errors.title}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 py-2">
          <input
            id="allDay"
            type="checkbox"
            checked={formData.allDay}
            onChange={(e) => handleChange('allDay', e.target.checked)}
            className="w-5 h-5 border-2 border-black focus:ring-2 focus:ring-black"
          />
          <label htmlFor="allDay" className="text-sm font-medium text-black cursor-pointer">
            All-day event
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-xs font-medium text-black mb-2">
              START DATE *
            </label>
            <input
              id="startDate"
              type="date"
              value={formData.startDate}
              onChange={(e) => handleChange('startDate', e.target.value)}
              onBlur={() => handleBlur('startDate')}
              className={`w-full px-4 py-3 border-2 ${
                touched.startDate && errors.startDate ? 'border-red-600' : 'border-black'
              } focus:outline-none focus:ring-2 focus:ring-black text-black`}
              aria-invalid={touched.startDate && !!errors.startDate}
              aria-describedby={touched.startDate && errors.startDate ? 'startDate-error' : undefined}
            />
            {touched.startDate && errors.startDate && (
              <p id="startDate-error" className="mt-1 text-sm text-red-600" role="alert">
                {errors.startDate}
              </p>
            )}
          </div>

          {!formData.allDay && (
            <div>
              <label htmlFor="startTime" className="block text-xs font-medium text-black mb-2">
                START TIME
              </label>
              <input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) => handleChange('startTime', e.target.value)}
                className="w-full px-4 py-3 border-2 border-black focus:outline-none focus:ring-2 focus:ring-black text-black"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="endDate" className="block text-xs font-medium text-black mb-2">
              END DATE *
            </label>
            <input
              id="endDate"
              type="date"
              value={formData.endDate}
              onChange={(e) => handleChange('endDate', e.target.value)}
              onBlur={() => handleBlur('endDate')}
              className={`w-full px-4 py-3 border-2 ${
                touched.endDate && errors.endDate ? 'border-red-600' : 'border-black'
              } focus:outline-none focus:ring-2 focus:ring-black text-black`}
              aria-invalid={touched.endDate && !!errors.endDate}
              aria-describedby={touched.endDate && errors.endDate ? 'endDate-error' : undefined}
            />
            {touched.endDate && errors.endDate && (
              <p id="endDate-error" className="mt-1 text-sm text-red-600" role="alert">
                {errors.endDate}
              </p>
            )}
          </div>

          {!formData.allDay && (
            <div>
              <label htmlFor="endTime" className="block text-xs font-medium text-black mb-2">
                END TIME
              </label>
              <input
                id="endTime"
                type="time"
                value={formData.endTime}
                onChange={(e) => handleChange('endTime', e.target.value)}
                className="w-full px-4 py-3 border-2 border-black focus:outline-none focus:ring-2 focus:ring-black text-black"
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="location" className="block text-xs font-medium text-black mb-2">
            LOCATION
          </label>
          <input
            id="location"
            type="text"
            value={formData.location}
            onChange={(e) => handleChange('location', e.target.value)}
            className="w-full px-4 py-3 border-2 border-black focus:outline-none focus:ring-2 focus:ring-black text-black"
            placeholder="Event location"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-xs font-medium text-black mb-2">
            DESCRIPTION
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={4}
            className="w-full px-4 py-3 border-2 border-black focus:outline-none focus:ring-2 focus:ring-black text-black resize-none"
            placeholder="Additional details"
          />
        </div>

        {formData.attachments.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-black mb-2">ATTACHMENTS</label>
            <div className="space-y-2">
              {formData.attachments.map((attachment, index) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between p-3 border-2 border-black"
                >
                  <p className="text-sm text-black">
                    [{attachment.type === 'original-image' ? 'Image' : attachment.type === 'original-text' ? 'Text' : 'Metadata'} #{index + 1}] {attachment.filename} ({(attachment.size / 1024).toFixed(1)} KB)
                  </p>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(attachment.id)}
                    className="px-3 py-1 text-sm bg-white border-2 border-black text-black hover:bg-black hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                    aria-label={`Remove ${attachment.filename}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t-2 border-black">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 px-6 bg-white border-2 border-black text-black font-medium hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-3 px-6 bg-black text-white font-medium hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
