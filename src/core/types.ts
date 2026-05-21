export type ViewName = "month" | "resource-time-grid";

export interface RosterEvent {
  id: string;
  title: string;
  start: Date | string;
  end?: Date | string;
  allDay?: boolean;
  resourceId?: string;
  color?: string;
  extendedProps?: Record<string, unknown>;
}

export interface Resource {
  id: string;
  title: string;
  order?: number;
}

export type OpString = `${"GET" | "POST" | "PATCH" | "PUT" | "DELETE"} ${string}`;

export interface CrudAdapter {
  list?: OpString | ((range: { from: Date; to: Date }) => Promise<unknown>);
  create?: OpString | ((event: RosterEvent) => Promise<unknown>);
  update?: OpString | ((event: RosterEvent) => Promise<unknown>);
  delete?: OpString | ((id: string) => Promise<unknown>);
  fromServer?: (raw: unknown) => RosterEvent | RosterEvent[];
  toServer?: (event: RosterEvent) => unknown;
  fetcher?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  optimistic?: boolean;
  debounceMs?: number;
}

export interface CalendarOptions {
  view?: ViewName;
  date?: Date;
  firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  locale?: string;
  theme?: string;
  events?: RosterEvent[];
  resources?: Resource[];
  data?: CrudAdapter;
  dnd?: boolean;
  /** Minutes per time-grid slot. Default 30. Used by resource-time-grid view. */
  slotMinutes?: number;
  /** Force 12 or 24-hour clock. Undefined = follow locale default. */
  hour12?: boolean;
  /** Which clock to use for positioning and labelling. Default "local". */
  timezone?: "local" | "UTC";
  /**
   * Called after each event element is fully built and inserted into the DOM.
   * Use it to add custom badges, icons, or event listeners to the element.
   */
  eventDidMount?: (info: { event: RosterEvent; el: HTMLElement }) => void;
  /**
   * Resource Time Grid only. Called for each empty time-slot cell after it is
   * inserted. Use it to inject controls — e.g. a "+" button to create
   * appointments. The built-in class `rc-rtg__slot-add` gives you a themed
   * add-button that appears on hover at no extra CSS cost.
   */
  slotDidMount?: (info: { date: Date; resourceId: string; el: HTMLElement }) => void;
}
