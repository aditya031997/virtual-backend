import type { IAppointmentEmailData } from '@/types';

/**
 * Escape user-supplied values so they cannot break the email layout or inject
 * markup.
 */
function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function val(value: string | null | undefined, fallback = '—'): string {
  const v = nonEmpty(value);
  return v ? escapeHtml(v) : fallback;
}

/**
 * Convert a multi-line string into HTML preserving line breaks, while
 * escaping any markup the user typed.
 */
function multilineHtml(value: string | null | undefined, fallback = '—'): string {
  const v = nonEmpty(value);
  if (!v) return fallback;
  return escapeHtml(v).replace(/\r?\n/g, '<br>');
}

/**
 * Format the submission date as "28 May 2026, 09:24". Falls back to ISO if the
 * locale formatter is unavailable for any reason.
 */
function formatSubmittedAt(date: Date): string {
  try {
    const datePart = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
    const timePart = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    return `${datePart}, ${timePart}`;
  } catch {
    return date.toISOString();
  }
}

/**
 * Appointment request email — matches the "Modern editorial card" design used
 * by the RMA / return-request email so the support inbox stays visually
 * consistent across both flows.
 *
 * Layout:
 *   - Solid teal header banner with three stacked lines
 *     (title, subtitle in small-caps, descriptive line)
 *   - White card on a soft neutral background, 14px rounded corners
 *   - "Care Facility & Location" treated as the editorial headline
 *   - Customer block (name on top, email · phone inline below)
 *   - Nature of request: left-bar pull-quote block
 *   - Preferred time: monospaced callout box at the bottom
 *   - No footer (matches the return-request template)
 *
 * Everything inline-styled so it renders consistently across Gmail / Outlook
 * / Apple Mail.
 */
export function generateAppointmentEmailHtml(
  data: IAppointmentEmailData,
): string {
  const submittedAt = formatSubmittedAt(new Date());
  const submitter = nonEmpty(data.customerName) ?? 'a customer';

  const customerEmailLink = data.customerEmail
    ? `<a href="mailto:${escapeHtml(data.customerEmail)}" style="color:#0a8fbc;text-decoration:none;">${escapeHtml(data.customerEmail)}</a>`
    : '—';
  const customerPhoneLink = data.customerPhone
    ? `<a href="tel:${escapeHtml(data.customerPhone)}" style="color:#0a8fbc;text-decoration:none;">${escapeHtml(data.customerPhone)}</a>`
    : '—';

  const natureHtml = multilineHtml(data.natureOfRequest);
  const hasNature = nonEmpty(data.natureOfRequest) !== null;

  // Reusable inline styles (declared once for readability)
  const sectionLabel =
    'margin:0 0 8px 0;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;';
  const sectionWrap = 'padding:0 0 24px 0;';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Request</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <!-- Preheader (hidden, shows in inbox preview) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;color:transparent;visibility:hidden;opacity:0;">
    New appointment request from ${escapeHtml(submitter)} for ${val(data.careFacilityLocation)} at ${val(data.preferredTime)}.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fb;width:100%;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:14px;border-collapse:separate;">

          <!-- Header banner -->
          <tr>
            <td align="center" style="background-color:#0aa6d4;padding:28px 20px;border-top-left-radius:14px;border-top-right-radius:14px;">
              <div style="margin:0;font-size:24px;line-height:30px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">Appointment Request</div>
              <div style="margin-top:6px;font-size:13px;line-height:20px;color:#dff6fc;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;">Service &amp; Care Booking</div>
              <div style="margin-top:10px;font-size:14px;line-height:20px;color:#eaf8fd;">A customer has requested an appointment</div>
            </td>
          </tr>

          <!-- Care facility headline + meta line -->
          <tr>
            <td style="padding:28px 40px 4px 40px;">
              <p style="margin:0 0 6px 0;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Care Facility &amp; Location</p>
              <h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">
                ${val(data.careFacilityLocation)}
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 22px 40px;">
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">
                Submitted by <span style="color:#374151;font-weight:600;">${escapeHtml(submitter)}</span> · ${escapeHtml(submittedAt)}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;line-height:1px;font-size:0;background-color:#e5e7eb;">&nbsp;</div>
            </td>
          </tr>

          <!-- Customer section -->
          <tr>
            <td style="padding:28px 40px 0 40px;">
              <div style="${sectionWrap}">
                <p style="${sectionLabel}">Customer</p>
                <p style="margin:0 0 4px 0;font-size:16px;line-height:24px;font-weight:600;color:#0f172a;">${val(data.customerName)}</p>
                <p style="margin:0;font-size:14px;line-height:22px;color:#4b5563;">
                  ${customerEmailLink}
                  <span style="color:#d1d5db;padding:0 8px;">·</span>
                  ${customerPhoneLink}
                </p>
              </div>
            </td>
          </tr>

          ${
            hasNature
              ? `
          <!-- Nature of request -->
          <tr>
            <td style="padding:0 40px;">
              <div style="${sectionWrap}">
                <p style="${sectionLabel}">Nature of request / issue</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-left:3px solid #0aa6d4;padding:4px 0 4px 14px;">
                      <p style="margin:0;font-size:15px;line-height:24px;color:#1f2937;word-break:break-word;">${natureHtml}</p>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          `
              : ''
          }

          <!-- Preferred time (callout box at bottom for scannability) -->
          <tr>
            <td style="padding:0 40px 32px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Preferred Date</td>
                        <td align="right" style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:14px;color:#0f172a;letter-spacing:0.02em;">${val(data.preferredDate)}</td>
                      </tr>
                      <tr>
                        <td style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Preferred Time</td>
                        <td align="right" style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:14px;color:#0f172a;letter-spacing:0.02em;">${val(data.preferredTime)}</td>
                      </tr>
                      <tr>
                        <td style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Department</td>
                        <td align="right" style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:14px;color:#0f172a;letter-spacing:0.02em;">${val(data.department)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Plain text fallback — laid out to read cleanly in mail clients that don't
 * render HTML (and in the SES preview / logs). Mirrors the return-request
 * plain-text structure for consistency.
 */
export function generateAppointmentEmailText(
  data: IAppointmentEmailData,
): string {
  const submittedAt = formatSubmittedAt(new Date());
  const submitter = nonEmpty(data.customerName) ?? 'a customer';

  let text = `APPOINTMENT REQUEST
Service & Care Booking
A customer has requested an appointment.

────────────────────────────────────────

CARE FACILITY & LOCATION
${nonEmpty(data.careFacilityLocation) ?? '(no facility specified)'}
Submitted by ${submitter} · ${submittedAt}

CUSTOMER
${nonEmpty(data.customerName) ?? '—'}
${nonEmpty(data.customerEmail) ?? '—'}  ·  ${nonEmpty(data.customerPhone) ?? '—'}`;

  if (nonEmpty(data.natureOfRequest)) {
    text += `

NATURE OF REQUEST / ISSUE
${data.natureOfRequest}`;
  }

  text += `

PREFERRED DATE
${nonEmpty(data.preferredDate) ?? '—'}

PREFERRED TIME
${nonEmpty(data.preferredTime) ?? '—'}

DEPARTMENT
${nonEmpty(data.department) ?? '—'}
`;

  return text;
}
