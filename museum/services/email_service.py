import smtplib
from email.mime.text import MIMEText
from email.utils import formatdate

from flask import current_app


def send_alert_email(subject, body):
    """Send an alert email through Google SMTP.

    Returns True when the email is sent, False when it is skipped or fails.
    Failures are logged and never raised so alerts do not break the API.
    """
    cfg = current_app.config

    if not cfg.get("ENABLE_EMAIL_ALERTS"):
        current_app.logger.info("Email alerts disabled, skipping: %s", subject)
        return False

    recipients = cfg.get("ALERT_RECIPIENTS") or []
    sender = cfg.get("MAIL_SENDER") or cfg.get("MAIL_USERNAME")

    if not (sender and cfg.get("MAIL_PASSWORD") and recipients):
        current_app.logger.warning("Email not fully configured, skipping alert email")
        return False

    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message["Date"] = formatdate(localtime=True)

    try:
        with smtplib.SMTP(cfg["MAIL_SERVER"], cfg["MAIL_PORT"], timeout=15) as server:
            if cfg.get("MAIL_USE_TLS"):
                server.starttls()
            server.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
            server.sendmail(sender, recipients, message.as_string())
        current_app.logger.info("Alert email sent: %s", subject)
        return True
    except Exception as exc:  # noqa: BLE001
        current_app.logger.error("Failed to send alert email: %s", exc)
        return False
