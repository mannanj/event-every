'use client';

import { EventAttachment } from '@/types/event';
import { downloadAttachment } from '@/utils/downloadAttachment';

interface AttachmentListProps {
  attachments: EventAttachment[];
}

export default function AttachmentList({ attachments }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div>
      <p className="font-semibold text-gray-700">Attachments:</p>
      <div className="space-y-1">
        {attachments.map((attachment, index) => (
          <button
            key={attachment.id}
            onClick={() => downloadAttachment(attachment)}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left block"
          >
            [{ attachment.type === 'original-image'
              ? 'Image'
              : attachment.type === 'original-text'
              ? 'Text'
              : 'Metadata'
            } #{index + 1}] {attachment.filename} ({(attachment.size / 1024).toFixed(1)} KB)
          </button>
        ))}
      </div>
    </div>
  );
}
