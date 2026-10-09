export interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  data?: T;
}

export interface ToggleAvailabilityResponse {
  success: boolean;
  message: string;
  data: BusinessHoursResponse;
}

export interface ToggleAfterAvailabilityResponse {
  success: boolean;
  message: string;
  data: AfterHoursResponse;
}

// Business Hours Interfaces
export interface BusinessHoursResponse {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBusinessHoursResponse
  extends ApiResponse<BusinessHoursResponse> {}
export interface UpdateBusinessHoursResponse
  extends ApiResponse<BusinessHoursResponse> {}
export interface DeleteBusinessHoursResponse extends ApiResponse {}
export interface BulkUpdateBusinessHoursResponse
  extends ApiResponse<BusinessHoursResponse[]> {}

// After Hours Interfaces
export interface AfterHoursResponse {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAfterHoursResponse
  extends ApiResponse<AfterHoursResponse> {}
export interface UpdateAfterHoursResponse
  extends ApiResponse<AfterHoursResponse> {}
export interface DeleteAfterHoursResponse extends ApiResponse {}
export interface BulkUpdateAfterHoursResponse
  extends ApiResponse<AfterHoursResponse[]> {}

/** Time window for current-day availability */
export interface CurrentDayTimeWindow {
  startTime: string;
  endTime: string;
}

/** Response for GET /availability/current-day. By default this describes TODAY; when a `date` query param is supplied it describes THAT day instead (used when a caller asks about tomorrow / next Monday / a specific date). `date` is the ISO date (YYYY-MM-DD) the answer is for, and `isToday` is true only when that resolves to the current business-timezone date. currentMode is businessHours if now is within business hours, otherwise afterHours — for a future day it is always afterHours (the business is not open "now" on a future date). `holiday` is true only when an active public holiday falls on that date; `close` is true when the business is unavailable that day (no business-hours record or isAvailable=false). The two flags are independent and can both be true. */
export interface CurrentDayAvailabilityResponse {
  date: string;
  isToday: boolean;
  dayOfWeek: string;
  currentTime: string;
  currentMode: 'businessHours' | 'afterHours';
  holiday: boolean;
  close: boolean;
  businessHours: CurrentDayTimeWindow | null;
  afterHours: CurrentDayTimeWindow | null;
}

// Public Holidays Interfaces
export interface PublicHolidaysResponse {
  id: string;
  holidayName: string;
  startDate: Date;
  endDate: Date;
  startTime?: string;
  endTime?: string;
  isActive: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePublicHolidaysResponse
  extends ApiResponse<PublicHolidaysResponse> {}
export interface UpdatePublicHolidaysResponse
  extends ApiResponse<PublicHolidaysResponse> {}
export interface DeletePublicHolidaysResponse extends ApiResponse {}
