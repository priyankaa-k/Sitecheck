import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import settings
import asyncio
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=2)


def _send_email_sync(to_emails: list[str], subject: str, html_body: str):
    """Send an email synchronously (run in thread pool)."""
    if not settings.smtp_host or not settings.smtp_user:
        print(f"[EMAIL] SMTP not configured. Would send to {to_emails}: {subject}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email or settings.smtp_user
    msg["To"] = ", ".join(to_emails)
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(msg["From"], to_emails, msg.as_string())
        print(f"[EMAIL] Sent to {to_emails}: {subject}")
    except Exception as e:
        print(f"[EMAIL] Failed: {e}")


async def send_email(to_emails: list[str], subject: str, html_body: str):
    """Send email in background thread (non-blocking)."""
    loop = asyncio.get_event_loop()
    loop.run_in_executor(_executor, _send_email_sync, to_emails, subject, html_body)


def build_phase_report_html(project_name: str, phase_name: str, categories: list, inspector_name: str = "") -> str:
    """Build HTML email body for a completed phase report."""
    rows = ""
    total = 0
    confirmed = 0
    na = 0
    flagged = 0

    for cat in categories:
        for item in cat.items:
            total += 1
            status = item.status
            if status == "confirmed":
                confirmed += 1
            elif status == "na":
                na += 1
            elif status == "flagged":
                flagged += 1

            color = {"confirmed": "#2E7D32", "flagged": "#F28C38", "na": "#9E9E9E", "unchecked": "#F4C542"}.get(status, "#666")
            label = {"confirmed": "Approved", "flagged": "Flagged", "na": "N/A", "unchecked": "Open"}.get(status, status)
            rows += f"""<tr>
                <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px">{cat.name}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px">{item.description}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;color:{color};font-weight:600">{label}</td>
            </tr>"""

    active = total - na
    pct = round((confirmed / active) * 100) if active > 0 else 100

    return f"""
    <div style="font-family:Inter,system-ui,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1E3A5F;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
            <h1 style="margin:0;font-size:20px">SiteCheck Phase Report</h1>
            <p style="margin:4px 0 0;opacity:.8;font-size:14px">All items approved - phase complete!</p>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #E3E8EF;border-top:none;border-radius:0 0 12px 12px">
            <table style="width:100%;margin-bottom:16px">
                <tr><td style="font-size:13px;color:#5A6474;padding:3px 0">Project</td><td style="font-size:14px;font-weight:600">{project_name}</td></tr>
                <tr><td style="font-size:13px;color:#5A6474;padding:3px 0">Phase</td><td style="font-size:14px;font-weight:600">{phase_name}</td></tr>
                <tr><td style="font-size:13px;color:#5A6474;padding:3px 0">Progress</td><td style="font-size:14px;font-weight:600;color:#2E7D32">{pct}% Complete</td></tr>
                {f'<tr><td style="font-size:13px;color:#5A6474;padding:3px 0">Inspector</td><td style="font-size:14px;font-weight:600">{inspector_name}</td></tr>' if inspector_name else ''}
            </table>
            <div style="display:flex;gap:12px;margin-bottom:16px">
                <div style="flex:1;background:#E8F5E9;padding:10px;border-radius:8px;text-align:center">
                    <div style="font-size:20px;font-weight:700;color:#2E7D32">{confirmed}</div>
                    <div style="font-size:11px;color:#5A6474">Approved</div>
                </div>
                <div style="flex:1;background:#F5F5F5;padding:10px;border-radius:8px;text-align:center">
                    <div style="font-size:20px;font-weight:700;color:#9E9E9E">{na}</div>
                    <div style="font-size:11px;color:#5A6474">N/A</div>
                </div>
                <div style="flex:1;background:#FEF0E5;padding:10px;border-radius:8px;text-align:center">
                    <div style="font-size:20px;font-weight:700;color:#F28C38">{flagged}</div>
                    <div style="font-size:11px;color:#5A6474">Flagged</div>
                </div>
            </div>
            <h3 style="font-size:14px;margin:16px 0 8px;color:#1E3A5F">Item Details</h3>
            <table style="width:100%;border-collapse:collapse">
                <thead><tr style="background:#F8FAFC">
                    <th style="padding:8px 10px;text-align:left;font-size:12px;color:#5A6474;font-weight:600">Category</th>
                    <th style="padding:8px 10px;text-align:left;font-size:12px;color:#5A6474;font-weight:600">Item</th>
                    <th style="padding:8px 10px;text-align:left;font-size:12px;color:#5A6474;font-weight:600">Status</th>
                </tr></thead>
                <tbody>{rows}</tbody>
            </table>
            <p style="font-size:12px;color:#8E99A4;margin-top:20px;text-align:center">Sent automatically by SiteCheck</p>
        </div>
    </div>"""
