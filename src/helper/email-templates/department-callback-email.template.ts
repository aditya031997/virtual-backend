/**
 * Business-hours department callback email — same "modern editorial card" style
 * as the return-request email. Shows the chosen department, the caller, and —
 * prominently — the CALLBACK NUMBER (the number the team should actually dial,
 * which may be an alternate the user gave, separate from their registered phone).
 */

export interface IDepartmentCallbackEmailData {
  department: string;
  callerName: string;
  callerEmail: string;
  callerPhone: string;
  callbackNumber?: string;
  concern?: string;
}

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

function multilineHtml(
  value: string | null | undefined,
  fallback = '—',
): string {
  const v = nonEmpty(value);
  if (!v) return fallback;
  return escapeHtml(v).replace(/\r?\n/g, '<br>');
}

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

export function generateDepartmentCallbackEmailHtml(
  data: IDepartmentCallbackEmailData,
): string {
  const submittedAt = formatSubmittedAt(new Date());
  const deptLabel = (data.department || '').trim().toUpperCase();
  // The number the team should actually call: the alternate if given, else the
  // caller's registered phone.
  const numberToCall =
    nonEmpty(data.callbackNumber) ?? nonEmpty(data.callerPhone);

  const emailLink = data.callerEmail
    ? `<a href="mailto:${escapeHtml(data.callerEmail)}" style="color:#0a8fbc;text-decoration:none;">${escapeHtml(data.callerEmail)}</a>`
    : '—';
  const callbackLink = numberToCall
    ? `<a href="tel:${escapeHtml(numberToCall)}" style="color:#0a8fbc;text-decoration:none;">${escapeHtml(numberToCall)}</a>`
    : '—';
  const registeredLink = data.callerPhone
    ? `<a href="tel:${escapeHtml(data.callerPhone)}" style="color:#0a8fbc;text-decoration:none;">${escapeHtml(data.callerPhone)}</a>`
    : '—';

  const sectionLabel =
    'margin:0 0 8px 0;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;';
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
  <title>Callback Request</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;color:transparent;visibility:hidden;opacity:0;">
    New ${escapeHtml(deptLabel)} callback request from ${val(data.callerName, 'a customer')} — call ${val(numberToCall)}.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fb;width:100%;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:14px;border-collapse:separate;">

          <!-- Header banner -->
          <tr>
            <td align="center" style="background-color:#0aa6d4;padding:28px 20px;border-top-left-radius:14px;border-top-right-radius:14px;">
              <div style="margin:0;font-size:24px;line-height:30px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">Callback Request</div>
              <div style="margin-top:10px;font-size:14px;line-height:20px;color:#eaf8fd;">A caller has requested a callback during business hours</div>
            </td>
          </tr>

          <!-- Department chip -->
          ${
            nonEmpty(deptLabel)
              ? `<tr>
            <td style="padding:24px 40px 0 40px;">
              <span style="display:inline-block;background:#e0f5fb;color:#0a6e8c;font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:5px 12px;border-radius:999px;">Department: ${escapeHtml(deptLabel)}</span>
            </td>
          </tr>`
              : ''
          }

          <!-- Callback number — the key action, highlighted -->
          <tr>
            <td style="padding:20px 40px 4px 40px;">
              <p style="${sectionLabel}">Call Back On</p>
              <h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">
                ${callbackLink}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 22px 40px;">
              <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">${escapeHtml(submittedAt)}</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;line-height:1px;font-size:0;background-color:#e5e7eb;">&nbsp;</div>
            </td>
          </tr>

          <!-- Customer Details — two-column grid -->
          <tr>
            <td style="padding:28px 40px 4px 40px;">
              <p style="${sectionLabel}">Customer Details</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                <tr>
                  <td width="50%" valign="top" style="padding:6px 12px 6px 0;">
                    <span style="${pairLabel}">Name</span>
                    <span style="${pairValue}">${val(data.callerName)}</span>
                  </td>
                  <td width="50%" valign="top" style="padding:6px 0 6px 12px;">
                    <span style="${pairLabel}">Email</span>
                    <span style="${pairValue}">${emailLink}</span>
                  </td>
                </tr>
                <tr>
                  <td width="50%" valign="top" style="padding:6px 12px 6px 0;">
                    <span style="${pairLabel}">Callback Number</span>
                    <span style="${pairValue}">${callbackLink}</span>
                  </td>
                  <td width="50%" valign="top" style="padding:6px 0 6px 12px;">
                    <span style="${pairLabel}">Registered Phone</span>
                    <span style="${pairValue}">${registeredLink}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Concern -->
          <tr>
            <td style="padding:0 40px 8px 40px;">
              <p style="${sectionLabel}">Concern</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 28px 40px;">
              <div style="border-left:3px solid #0aa6d4;padding:4px 0 4px 14px;font-size:15px;line-height:22px;color:#374151;">
                ${multilineHtml(data.concern)}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background-color:#f8f9fa;padding:18px 20px;border-top:1px solid #eee;border-bottom-left-radius:14px;border-bottom-right-radius:14px;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#95a5a6;">This is an automated message from SmartCaller AI</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function generateDepartmentCallbackEmailText(
  data: IDepartmentCallbackEmailData,
): string {
  const deptLabel = (data.department || '').trim().toUpperCase();
  const numberToCall =
    nonEmpty(data.callbackNumber) ?? nonEmpty(data.callerPhone) ?? 'NA';
  return [
    `${deptLabel} CALLBACK REQUEST`,
    '',
    'A caller has requested a callback during business hours.',
    '',
    `Call Back On: ${numberToCall}`,
    '',
    'Customer Details:',
    `Name: ${nonEmpty(data.callerName) ?? 'NA'}`,
    `Email: ${nonEmpty(data.callerEmail) ?? 'NA'}`,
    `Callback Number: ${numberToCall}`,
    `Registered Phone: ${nonEmpty(data.callerPhone) ?? 'NA'}`,
    '',
    `Concern: ${nonEmpty(data.concern) ?? 'NA'}`,
    '',
    'This is an automated message from SmartCaller AI',
  ].join('\n');
}
