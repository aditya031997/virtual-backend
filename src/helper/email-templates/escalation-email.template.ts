import type { IEscalationEmailData } from '@/types';

/**
 * Generate escalation email HTML template
 */
export function generateEscalationEmailHtml(data: IEscalationEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #00A6DA 0%, #0090C0 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .header p {
      margin: 10px 0 0;
      opacity: 0.9;
      font-size: 14px;
    }
    .content {
      padding: 30px;
    }
    .section {
      margin-bottom: 25px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #00A6DA;
      margin-bottom: 15px;
    }
    .detail-item {
      margin-bottom: 10px;
      font-size: 14px;
    }
    .detail-item .icon {
      margin-right: 8px;
    }
    .detail-item .label {
      font-weight: 600;
      color: #333;
    }
    .detail-item .value {
      color: #555;
    }
    .detail-item a {
      color: #3498db;
      text-decoration: none;
    }
    .detail-item a:hover {
      text-decoration: underline;
    }
    .summary-box {
      background: #f8f9fa;
      border-left: 4px solid #3498db;
      padding: 15px 20px;
      border-radius: 0 8px 8px 0;
      margin-top: 10px;
    }
    .summary-box p {
      margin: 0;
      color: #34495e;
      font-size: 14px;
      line-height: 1.7;
    }
    .transcript-box {
      background: #fafafa;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      margin-top: 10px;
      max-height: 300px;
      overflow-y: auto;
    }
    .transcript-box pre {
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 13px;
      color: #555;
      line-height: 1.8;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      border-top: 1px solid #eee;
    }
    .footer p {
      margin: 5px 0;
      font-size: 12px;
      color: #95a5a6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Callback Request</h1>
      <p>A caller requires follow-up assistance</p>
    </div>
    
    <div class="content">
      <div class="section">
        <div class="section-title">Customer Details:</div>
        <div class="detail-item">
          <span class="label">Name:</span>
          <span class="value">${data.callerName || 'NA'}</span>
        </div>
        <div class="detail-item">
          <span class="label">Phone Number:</span>
          <span class="value">${data.callerPhone || 'NA'}</span>
        </div>
        <div class="detail-item">
          <span class="label">Email:</span>
          <span class="value">${data.callerEmail ? `<a href="mailto:${data.callerEmail}">${data.callerEmail}</a>` : 'NA'}</span>
        </div>
      </div>

      ${data.siteInfo ? `
      <div class="section">
        <div class="section-title">Site Details:</div>
        ${data.siteInfo.siteName ? `
        <div class="detail-item">
          <span class="label">Site Name:</span>
          <span class="value">${data.siteInfo.siteName}</span>
        </div>
        ` : ''}
        ${data.siteInfo.email ? `
        <div class="detail-item">
          <span class="label">Email:</span>
          <span class="value"><a href="mailto:${data.siteInfo.email}">${data.siteInfo.email}</a></span>
        </div>
        ` : ''}
        ${data.siteInfo.contactNumber ? `
        <div class="detail-item">
          <span class="label">Contact Number:</span>
          <span class="value">${data.siteInfo.contactNumber}</span>
        </div>
        ` : ''}
        ${data.siteInfo.assignedDealer?.dealerCode ? `
        <div class="detail-item">
          <span class="label">Assigned Dealer Code:</span>
          <span class="value">${data.siteInfo.assignedDealer.dealerCode}</span>
        </div>
        ` : ''}
        ${data.siteInfo.assignedDealer?.dealerName ? `
        <div class="detail-item">
          <span class="label">Dealer Name:</span>
          <span class="value">${data.siteInfo.assignedDealer.dealerName}</span>
        </div>
        ` : ''}
        ${data.siteInfo.assignedDealer?.phone ? `
        <div class="detail-item">
          <span class="label">Dealer Phone:</span>
          <span class="value">${data.siteInfo.assignedDealer.phone}</span>
        </div>
        ` : ''}
        ${data.siteInfo.assignedDealer?.email ? `
        <div class="detail-item">
          <span class="label">Dealer Email:</span>
          <span class="value"><a href="mailto:${data.siteInfo.assignedDealer.email}">${data.siteInfo.assignedDealer.email}</a></span>
        </div>
        ` : ''}
      </div>
      ` : ''}

      ${data.callSummary ? `
      <div class="section">
        <div class="section-title">Call Summary:</div>
        <div class="summary-box">
          <p>${data.callSummary}</p>
        </div>
      </div>
      ` : ''}

      ${data.callTranscript ? `
      <div class="section">
        <div class="section-title">Call Transcript:</div>
        <div class="transcript-box">
          <pre>${data.callTranscript}</pre>
        </div>
      </div>
      ` : ''}
    </div>
    
    <div class="footer">
      <p>This is an automated message from SmartCaller AI</p>
      <p>© ${new Date().getFullYear()} SmartCaller. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate escalation email plain text template
 */
export function generateEscalationEmailText(data: IEscalationEmailData): string {
  let text = `
CALLBACK REQUEST
================

A caller requires follow-up assistance.

CUSTOMER DETAILS
----------------
Name: ${data.callerName || 'NA'}
Phone Number: ${data.callerPhone || 'NA'}
Email: ${data.callerEmail || 'NA'}`;

  if (data.siteInfo) {
    text += `

SITE DETAILS
------------
Site Name: ${data.siteInfo.siteName || 'NA'}
Email: ${data.siteInfo.email || 'NA'}
Contact Number: ${data.siteInfo.contactNumber || 'NA'}
Assigned Dealer Code: ${data.siteInfo.assignedDealer?.dealerCode || 'NA'}
Dealer Name: ${data.siteInfo.assignedDealer?.dealerName || 'NA'}
Dealer Phone: ${data.siteInfo.assignedDealer?.phone || 'NA'}
Dealer Email: ${data.siteInfo.assignedDealer?.email || 'NA'}`;
  }

  if (data.callSummary) {
    text += `

CALL SUMMARY
------------
${data.callSummary}`;
  }

  if (data.callTranscript) {
    text += `

CALL TRANSCRIPT
---------------
${data.callTranscript}`;
  }

  text += `

---
This is an automated message from SmartCaller AI
`;

  return text;
}

