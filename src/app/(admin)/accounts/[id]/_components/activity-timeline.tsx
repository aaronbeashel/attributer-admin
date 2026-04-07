import { Badge } from "@/components/base/badges/badges";
import type { EventLogEntry } from "@/lib/queries/account-detail";
import { getEventDescription, getEventTypeColor } from "@/lib/utils/events";
import { formatDateTime } from "@/lib/utils/format";
import { SOURCE_LABELS } from "@/lib/utils/constants";

interface ActivityTimelineProps {
  events: EventLogEntry[];
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  return (
    <div className="rounded-xl border border-secondary bg-primary">
      <div className="border-b border-secondary px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-lg font-semibold text-primary">Activity Timeline</h2>
      </div>
      <div className="divide-y divide-secondary">
        {events.length === 0 ? (
          <div className="px-4 py-8 text-center sm:px-6">
            <p className="text-sm text-tertiary">No activity recorded</p>
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex items-start gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary">
                  {getEventDescription(event.eventType, event.eventSubtype)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-quaternary sm:gap-3">
                  <span>{formatDateTime(event.createdAt)}</span>
                  <span>{SOURCE_LABELS[event.source] ?? event.source}</span>
                </div>
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-tertiary hover:text-secondary">
                      Metadata
                    </summary>
                    <pre className="mt-1 max-w-full overflow-x-auto rounded-md bg-secondary p-2 text-xs text-tertiary">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <div className="mt-0.5 shrink-0">
                <Badge color={getEventTypeColor(event.eventType)} size="sm">
                  {event.eventType}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
