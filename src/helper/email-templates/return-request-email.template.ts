import type { IReturnRequestEmailData } from '@/types';

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
function multilineHtml(
  value: string | null | undefined,
  fallback = '—',
): string {
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
 * Return / RMA request email — "Modern editorial card" design.
 *
 * Layout:
 *   - Soft neutral background (#f4f6fb)
 *   - White card, generous padding (32–40px), subtle 1px border
 *   - Top row: pill-shaped "RETURN REQUEST" status chip + monospaced order id
 *   - H1 product name + meta line (submitter + timestamp)
 *   - Section headers in uppercase muted gray (the "editorial" labels)
 *   - Customer line: name on top, email · phone inline below
 *   - Reason: left-bar quoted block (the "pull quote")
 *   - Return address: address-style stacked lines
 *
 * Everything inline-styled (no <style> block, no class selectors) so it
 * renders consistently in Gmail / Outlook / Apple Mail.
 */
export function generateReturnRequestEmailHtml(
  data: IReturnRequestEmailData,
): string {
  const submittedAt = formatSubmittedAt(new Date());
  const submitter = nonEmpty(data.customerName) ?? 'a customer';

  const customerEmailLink = data.customerEmail
    ? `<a href="mailto:${escapeHtml(data.customerEmail)}" style="color:#0a8fbc;text-decoration:none;">${escapeHtml(data.customerEmail)}</a>`
    : '—';
  const customerPhoneLink = data.customerPhone
    ? `<a href="tel:${escapeHtml(data.customerPhone)}" style="color:#0a8fbc;text-decoration:none;">${escapeHtml(data.customerPhone)}</a>`
    : '—';

  const reasonHtml = multilineHtml(data.reasonForReturn);
  const addressHtml = multilineHtml(data.returnAddress);

  // Reusable inline styles (declared once for readability)
  const sectionLabel =
    'margin:0 0 8px 0;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;';
  // A label/value pair rendered on one line (label above the value, stacked
  // tightly) so two pairs sit side-by-side per row in the Customer Details grid.
  const pairLabel =
    'display:block;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin:0 0 2px 0;';
  const pairValue =
    'display:block;font-size:15px;line-height:22px;color:#0f172a;font-weight:600;word-break:break-word;';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Return Request</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <!-- Preheader (hidden, shows in inbox preview) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;color:transparent;visibility:hidden;opacity:0;">
    New return request from ${escapeHtml(submitter)} for ${val(data.productName)} (Order ${val(data.orderId)}).
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fb;width:100%;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:14px;border-collapse:separate;">

          <!-- Header banner (matches the appointment / other transactional emails) -->
          <tr>
            <td align="center" style="background-color:#0aa6d4;padding:28px 20px;border-top-left-radius:14px;border-top-right-radius:14px;">
              <div style="margin:0;font-size:24px;line-height:30px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">RMA Request</div>
              <div style="margin-top:6px;font-size:13px;line-height:20px;color:#dff6fc;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;">Return Merchandise Authorization</div>
              <div style="margin-top:10px;font-size:14px;line-height:20px;color:#eaf8fd;">A customer has requested to return a product</div>
            </td>
          </tr>

          <!-- Product headline + meta line (moved out of header) -->
          <tr>
            <td style="padding:28px 40px 4px 40px;">
              <p style="margin:0 0 6px 0;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Product</p>
              <h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">
                ${val(data.productName)}
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 22px 40px;">
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">
                ${escapeHtml(submittedAt)}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;line-height:1px;font-size:0;background-color:#e5e7eb;">&nbsp;</div>
            </td>
          </tr>

          ${
            nonEmpty(data.departmentType)
              ? `<!-- Department routing chip -->
          <tr>
            <td style="padding:24px 40px 0 40px;">
              <span style="display:inline-block;background:#e0f5fb;color:#0a6e8c;font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:5px 12px;border-radius:999px;">Department: ${escapeHtml(String(data.departmentType))}</span>
            </td>
          </tr>`
              : ''
          }
          <!-- Customer Details — two-column label/value grid -->
          <tr>
            <td style="padding:28px 40px 4px 40px;">
              <p style="${sectionLabel}">Customer Details</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                <!-- Row 1: Name | Email -->
                <tr>
                  <td width="50%" valign="top" style="padding:6px 12px 6px 0;">
                    <span style="${pairLabel}">Name</span>
                    <span style="${pairValue}">${val(data.customerName)}</span>
                  </td>
                  <td width="50%" valign="top" style="padding:6px 0 6px 12px;">
                    <span style="${pairLabel}">Email</span>
                    <span style="${pairValue}">${customerEmailLink}</span>
                  </td>
                </tr>
                <!-- Row 2: Phone | Order ID -->
                <tr>
                  <td width="50%" valign="top" style="padding:6px 12px 6px 0;">
                    <span style="${pairLabel}">Phone</span>
                    <span style="${pairValue}">${customerPhoneLink}</span>
                  </td>
                  <td width="50%" valign="top" style="padding:6px 0 6px 12px;">
                    <span style="${pairLabel}">Order ID</span>
                    <span style="${pairValue}font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;">${val(data.orderId)}</span>
                  </td>
                </tr>
                <!-- Row 3: Alternate Number (under Phone) | Return From Address (under Order ID) -->
                <tr>
                  <td width="50%" valign="top" style="padding:6px 12px 6px 0;">
                    ${
                      nonEmpty(data.alternateNumber)
                        ? `<span style="${pairLabel}">Alternate Number</span>
                    <span style="${pairValue}">${val(data.alternateNumber)}</span>`
                        : '&nbsp;'
                    }
                  </td>
                  <td width="50%" valign="top" style="padding:6px 0 6px 12px;">
                    <span style="${pairLabel}">Return From Address</span>
                    <span style="${pairValue}">${addressHtml}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Reason for return -->
          <tr>
            <td style="padding:0 40px 32px 40px;">
              <div>
                <p style="${sectionLabel}">Reason for return</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-left:3px solid #0aa6d4;padding:4px 0 4px 14px;">
                      <p style="margin:0;font-size:15px;line-height:24px;color:#1f2937;word-break:break-word;">${reasonHtml}</p>
                    </td>
                  </tr>
                </table>
              </div>
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
 * CUSTOMER-FACING confirmation email — sent to the person who raised the return
 * (not the support inbox). Reassuring tone: "we've received your request, here's
 * what you told us, our team will be in touch." Reuses the same helpers + visual
 * styling as the support template so the two stay consistent.
 */
export function generateReturnRequestConfirmationHtml(
  data: IReturnRequestEmailData,
): string {
  const submittedAt = formatSubmittedAt(new Date());
  const firstName = (nonEmpty(data.customerName) ?? 'there').split(/\s+/)[0];

  const reasonHtml = multilineHtml(data.reasonForReturn);
  const addressHtml = multilineHtml(data.returnAddress);

  const sectionLabel =
    'margin:0 0 8px 0;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;';
  const sectionValue =
    'margin:0;font-size:15px;line-height:24px;color:#1f2937;word-break:break-word;';
  const sectionWrap = 'padding:0 0 24px 0;';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your return request has been received</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <!-- Preheader (hidden, shows in inbox preview) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;color:transparent;visibility:hidden;opacity:0;">
    We've received your return request for ${val(data.productName)}. Our team will be in touch shortly.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fb;width:100%;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:14px;border-collapse:separate;">

          <!-- Header banner -->
          <tr>
            <td align="center" style="background-color:#0aa6d4;padding:28px 20px;border-top-left-radius:14px;border-top-right-radius:14px;">
              <div style="margin:0;font-size:24px;line-height:30px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">Return Request Received</div>
              <div style="margin-top:10px;font-size:14px;line-height:20px;color:#eaf8fd;">We're on it — here's a copy of your request</div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:28px 40px 4px 40px;">
              <p style="margin:0 0 12px 0;font-size:16px;line-height:24px;color:#0f172a;">Hi ${escapeHtml(firstName)},</p>
              <p style="margin:0;font-size:15px;line-height:24px;color:#374151;">
                Thanks for your return request. We've received the details below and our support team will review it and contact you shortly with the next steps.
              </p>
            </td>
          </tr>

          <!-- Product headline -->
          <tr>
            <td style="padding:24px 40px 4px 40px;">
              <p style="margin:0 0 6px 0;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Product</p>
              <h1 style="margin:0;font-size:22px;line-height:30px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">
                ${val(data.productName)}
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 22px 40px;">
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">
                Submitted ${escapeHtml(submittedAt)}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;line-height:1px;font-size:0;background-color:#e5e7eb;">&nbsp;</div>
            </td>
          </tr>

          <!-- Reason for return -->
          <tr>
            <td style="padding:28px 40px 0 40px;">
              <div style="${sectionWrap}">
                <p style="${sectionLabel}">Reason for return</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-left:3px solid #0aa6d4;padding:4px 0 4px 14px;">
                      <p style="margin:0;font-size:15px;line-height:24px;color:#1f2937;word-break:break-word;">${reasonHtml}</p>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Return address -->
          <tr>
            <td style="padding:0 40px;">
              <div style="${sectionWrap}">
                <p style="${sectionLabel}">Return from address</p>
                <p style="${sectionValue}">${addressHtml}</p>
              </div>
            </td>
          </tr>

          <!-- Order ID -->
          <tr>
            <td style="padding:0 40px ${nonEmpty(data.alternateNumber) ? '12px' : '28px'} 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Order ID</td>
                        <td align="right" style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:14px;color:#0f172a;letter-spacing:0.02em;">${val(data.orderId)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${
            nonEmpty(data.alternateNumber)
              ? `<!-- Alternate Number -->
          <tr>
            <td style="padding:0 40px 28px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Alternate Number</td>
                        <td align="right" style="font-size:14px;color:#0f172a;letter-spacing:0.02em;">${val(data.alternateNumber)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
              : ''
          }

          <!-- Footer note -->
          <tr>
            <td style="padding:0 40px 32px 40px;">
              <p style="margin:0;font-size:13px;line-height:20px;color:#6b7280;">
                If any of these details look incorrect, simply reply to this email and we'll update your request. No action is needed from you right now.
              </p>
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
 * Plain text fallback for the CUSTOMER confirmation email.
 */
export function generateReturnRequestConfirmationText(
  data: IReturnRequestEmailData,
): string {
  const submittedAt = formatSubmittedAt(new Date());
  const firstName = (nonEmpty(data.customerName) ?? 'there').split(/\s+/)[0];

  return `RETURN REQUEST RECEIVED

Hi ${firstName},

Thanks for your return request. We've received the details below and our support team will review it and contact you shortly with the next steps.

────────────────────────────────────────

PRODUCT
${nonEmpty(data.productName) ?? '(no product specified)'}
Submitted ${submittedAt}

REASON FOR RETURN
${nonEmpty(data.reasonForReturn) ?? '—'}

RETURN FROM ADDRESS
${nonEmpty(data.returnAddress) ?? '—'}

ORDER ID
${nonEmpty(data.orderId) ?? '—'}
${nonEmpty(data.alternateNumber) ? `\nALTERNATE NUMBER\n${nonEmpty(data.alternateNumber)}\n` : ''}
If any of these details look incorrect, simply reply to this email and we'll update your request. No action is needed from you right now.
`;
}

/**
 * Plain text fallback — laid out to read cleanly in mail clients that don't
 * render HTML (and in the SES preview / logs).
 */
export function generateReturnRequestEmailText(
  data: IReturnRequestEmailData,
): string {
  const submittedAt = formatSubmittedAt(new Date());

  return `RMA REQUEST
Return Merchandise Authorization
A customer has requested to return a product.

────────────────────────────────────────

PRODUCT
${nonEmpty(data.productName) ?? '(no product specified)'}
${submittedAt}
${nonEmpty(data.departmentType) ? `\nDEPARTMENT: ${String(data.departmentType).toUpperCase()}\n` : ''}
CUSTOMER DETAILS
Name: ${nonEmpty(data.customerName) ?? '—'}     Email: ${nonEmpty(data.customerEmail) ?? '—'}
Phone: ${nonEmpty(data.customerPhone) ?? '—'}     Order ID: ${nonEmpty(data.orderId) ?? '—'}
${nonEmpty(data.alternateNumber) ? `Alternate Number: ${nonEmpty(data.alternateNumber)}     ` : ''}Return From Address: ${nonEmpty(data.returnAddress) ?? '—'}

REASON FOR RETURN
${nonEmpty(data.reasonForReturn) ?? '—'}
`;
}
