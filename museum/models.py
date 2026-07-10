from datetime import datetime

from .extensions import db


def _iso(value):
    return (value.isoformat() + "Z") if value else None


class SecurityReading(db.Model):
    __tablename__ = "security_readings"

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(64), default="esp32-security")
    temperature = db.Column(db.Float)
    humidity = db.Column(db.Float)
    motion = db.Column(db.Boolean, default=False)
    smoke = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "temperature": self.temperature,
            "humidity": self.humidity,
            "motion": self.motion,
            "smoke": self.smoke,
            "created_at": _iso(self.created_at),
        }


class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(db.Integer, primary_key=True)
    alert_type = db.Column(db.String(32), index=True)  # motion, smoke, temperature, humidity
    message = db.Column(db.String(255))
    is_resolved = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    resolved_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            "id": self.id,
            "alert_type": self.alert_type,
            "message": self.message,
            "is_resolved": self.is_resolved,
            "created_at": _iso(self.created_at),
            "resolved_at": _iso(self.resolved_at),
        }


class Checkpoint(db.Model):
    __tablename__ = "checkpoints"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64))
    order_index = db.Column(db.Integer, default=0)
    qr_link = db.Column(db.String(255))
    is_stopped = db.Column(db.Boolean, default=False)
    last_stopped_at = db.Column(db.DateTime)

    item = db.relationship(
        "HistoricalItem", backref="checkpoint", uselist=False, cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "order_index": self.order_index,
            "qr_link": self.qr_link,
            "is_stopped": self.is_stopped,
            "last_stopped_at": _iso(self.last_stopped_at),
            "item": self.item.to_dict() if self.item else None,
        }


class HistoricalItem(db.Model):
    __tablename__ = "historical_items"

    id = db.Column(db.Integer, primary_key=True)
    checkpoint_id = db.Column(db.Integer, db.ForeignKey("checkpoints.id"))
    title = db.Column(db.String(128))
    summary = db.Column(db.Text)  # cached text used for read aloud
    content_url = db.Column(db.String(255))  # txt file link stored in the QR code
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "checkpoint_id": self.checkpoint_id,
            "checkpoint_name": self.checkpoint.name if self.checkpoint else None,
            "title": self.title,
            "summary": self.summary,
            "content_url": self.content_url,
            "updated_at": _iso(self.updated_at),
        }


class RobotStatus(db.Model):
    __tablename__ = "robot_status"

    id = db.Column(db.Integer, primary_key=True)
    state = db.Column(db.String(32), default="idle")  # idle, following, stopped
    current_checkpoint_id = db.Column(db.Integer)
    video_url = db.Column(db.String(255), default="")
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        checkpoint = None
        if self.current_checkpoint_id:
            checkpoint = Checkpoint.query.get(self.current_checkpoint_id)
        return {
            "id": self.id,
            "state": self.state,
            "current_checkpoint_id": self.current_checkpoint_id,
            "current_checkpoint": checkpoint.to_dict() if checkpoint else None,
            "video_url": self.video_url,
            "updated_at": _iso(self.updated_at),
        }


class CheckpointEvent(db.Model):
    __tablename__ = "checkpoint_events"

    id = db.Column(db.Integer, primary_key=True)
    checkpoint_id = db.Column(db.Integer, db.ForeignKey("checkpoints.id"))
    event = db.Column(db.String(32))  # stopped, left
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "checkpoint_id": self.checkpoint_id,
            "event": self.event,
            "created_at": _iso(self.created_at),
        }
