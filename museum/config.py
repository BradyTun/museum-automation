import os

from dotenv import load_dotenv

load_dotenv()

basedir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    # On Vercel the app runs on a read-only filesystem, so the SQLite file
    # must live in the writable /tmp directory. Data there is temporary and
    # resets on cold starts, which is fine for a demo deployment.
    _default_sqlite = (
        "sqlite:////tmp/museum.db"
        if os.environ.get("VERCEL")
        else "sqlite:///" + os.path.join(basedir, "museum.db")
    )
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", _default_sqlite)
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Google SMTP settings
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "true").lower() == "true"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
    MAIL_SENDER = os.environ.get("MAIL_SENDER", os.environ.get("MAIL_USERNAME", ""))
    ALERT_RECIPIENTS = [
        e.strip() for e in os.environ.get("ALERT_RECIPIENTS", "").split(",") if e.strip()
    ]
    ENABLE_EMAIL_ALERTS = os.environ.get("ENABLE_EMAIL_ALERTS", "false").lower() == "true"

    # Alert thresholds
    TEMP_MAX = float(os.environ.get("TEMP_MAX", 45))
    HUMIDITY_MAX = float(os.environ.get("HUMIDITY_MAX", 80))
