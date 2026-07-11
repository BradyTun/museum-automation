from datetime import datetime

from flask import Blueprint, current_app, jsonify, request

from ..extensions import db
from ..models import (
    Alert,
    Checkpoint,
    CheckpointEvent,
    HistoricalItem,
    RobotStatus,
    SecurityReading,
)
from ..services.email_service import send_alert_email
from ..services.qr_service import decode_qr, fetch_text

api_bp = Blueprint("api", __name__)

HARDCODED_EXHIBIT = {
    "title": "Min Don Min (မင်းတုန်းမင်း)",
    "text": (
        "Name: Mindon Min, birth name Maung Lwin. "
        "Reign: 1853 to 1878. "
        "Title: King of the Konbaung Dynasty. "
        "Lifespan: July 8, 1808 to October 1, 1878. "
        "Predecessor: Pagan Min. "
        "Successor: Thibaw Min. "
        "During his reign, King Mindon ruled independent Myanmar from 1853 to 1878. "
        "After the Second Anglo Burmese War, he focused on modernization and diplomacy. "
        "He founded Mandalay in 1857, hosted the Fifth Buddhist Council in 1871, "
        "carved the Buddhist canon on 729 marble slabs, introduced Myanmar's first "
        "machine minted coins, built a telegraph network, and modernized salary and tax systems."
    ),
}


def _to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_bool(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in ("1", "true", "yes", "on", "detected")


def _get_robot():
    robot = RobotStatus.query.get(1)
    if not robot:
        robot = RobotStatus(id=1, state="idle")
        db.session.add(robot)
        db.session.commit()
    return robot


def _get_or_create_primary_checkpoint():
    """Return the single checkpoint used by the simplified tour flow."""
    checkpoint = Checkpoint.query.order_by(Checkpoint.order_index).first()
    if checkpoint:
        return checkpoint

    checkpoint = Checkpoint(
        name="Main Checkpoint",
        order_index=1,
        qr_link="",
        is_stopped=False,
    )
    db.session.add(checkpoint)
    db.session.commit()
    return checkpoint


def _create_alert(alert_type, message):
    alert = Alert(alert_type=alert_type, message=message)
    db.session.add(alert)
    try:
        send_alert_email(f"[Museum Alert] {alert_type.title()} detected", message)
    except Exception as exc:  # noqa: BLE001
        current_app.logger.error("Alert email error: %s", exc)
    return alert


@api_bp.get("/health")
def health():
    return jsonify(status="ok", time=datetime.utcnow().isoformat() + "Z")


@api_bp.post("/security/reading")
def security_reading():
    """Receive a reading from the ESP32 security board."""
    data = request.get_json(silent=True) or request.form.to_dict()

    reading = SecurityReading(
        device_id=data.get("device_id", "esp32-security"),
        temperature=_to_float(data.get("temperature")),
        humidity=_to_float(data.get("humidity")),
        motion=_to_bool(data.get("motion")),
        smoke=_to_bool(data.get("smoke")),
    )
    db.session.add(reading)

    created = []
    if reading.motion:
        created.append(_create_alert("motion", "Motion detected in the gallery."))
    if reading.smoke:
        created.append(_create_alert("smoke", "Smoke detected in the gallery."))
    if reading.temperature is not None and reading.temperature > current_app.config["TEMP_MAX"]:
        created.append(
            _create_alert("temperature", f"High temperature: {reading.temperature} C")
        )
    if reading.humidity is not None and reading.humidity > current_app.config["HUMIDITY_MAX"]:
        created.append(_create_alert("humidity", f"High humidity: {reading.humidity} %"))

    db.session.commit()
    return jsonify(
        ok=True,
        reading=reading.to_dict(),
        alerts=[a.to_dict() for a in created],
        buzzer=bool(reading.motion or reading.smoke),
    )


@api_bp.get("/security/latest")
def security_latest():
    latest = SecurityReading.query.order_by(SecurityReading.created_at.desc()).first()
    recent = (
        SecurityReading.query.order_by(SecurityReading.created_at.desc()).limit(20).all()
    )
    return jsonify(
        latest=latest.to_dict() if latest else None,
        recent=[r.to_dict() for r in recent],
    )


@api_bp.get("/security/alerts")
def security_alerts():
    open_only = request.args.get("open") == "1"
    query = Alert.query
    if open_only:
        query = query.filter_by(is_resolved=False)
    alerts = query.order_by(Alert.created_at.desc()).limit(50).all()
    open_count = Alert.query.filter_by(is_resolved=False).count()
    return jsonify(alerts=[a.to_dict() for a in alerts], open_count=open_count)


@api_bp.post("/alerts/<int:alert_id>/resolve")
def resolve_alert(alert_id):
    alert = Alert.query.get_or_404(alert_id)
    alert.is_resolved = True
    alert.resolved_at = datetime.utcnow()
    db.session.commit()
    return jsonify(ok=True, alert=alert.to_dict())


@api_bp.get("/checkpoints")
def list_checkpoints():
    checkpoints = Checkpoint.query.order_by(Checkpoint.order_index).all()
    return jsonify(checkpoints=[c.to_dict() for c in checkpoints])


@api_bp.post("/checkpoint/<int:cp_id>/status")
def checkpoint_status(cp_id):
    """A checkpoint IR sensor reports whether the car has stopped."""
    checkpoint = Checkpoint.query.get_or_404(cp_id)
    data = request.get_json(silent=True) or request.form.to_dict()
    is_stopped = _to_bool(data.get("is_stopped"))

    checkpoint.is_stopped = is_stopped
    robot = _get_robot()

    if is_stopped:
        checkpoint.last_stopped_at = datetime.utcnow()
        db.session.add(CheckpointEvent(checkpoint_id=checkpoint.id, event="stopped"))
        robot.state = "stopped"
        robot.current_checkpoint_id = checkpoint.id
    else:
        db.session.add(CheckpointEvent(checkpoint_id=checkpoint.id, event="left"))
        robot.state = "following"
        if robot.current_checkpoint_id == checkpoint.id:
            robot.current_checkpoint_id = None

    db.session.commit()
    return jsonify(ok=True, checkpoint=checkpoint.to_dict(), robot=robot.to_dict())


@api_bp.get("/checkpoint/status")
def single_checkpoint_status_get():
    """Read single checkpoint status for a one sensor setup."""
    checkpoint = _get_or_create_primary_checkpoint()
    return jsonify(ok=True, checkpoint=checkpoint.to_dict(), detected=checkpoint.is_stopped)


@api_bp.post("/checkpoint/status")
def single_checkpoint_status_post():
    """Set single checkpoint status for a one IR sensor setup.

    Payload: {"detected": true|false} or {"is_stopped": true|false}
    """
    checkpoint = _get_or_create_primary_checkpoint()
    data = request.get_json(silent=True) or request.form.to_dict()
    is_stopped = _to_bool(data.get("detected", data.get("is_stopped")))

    checkpoint.is_stopped = is_stopped
    robot = _get_robot()

    if is_stopped:
        checkpoint.last_stopped_at = datetime.utcnow()
        db.session.add(CheckpointEvent(checkpoint_id=checkpoint.id, event="stopped"))
        robot.state = "stopped"
        robot.current_checkpoint_id = checkpoint.id
    else:
        db.session.add(CheckpointEvent(checkpoint_id=checkpoint.id, event="left"))
        robot.state = "following"
        if robot.current_checkpoint_id == checkpoint.id:
            robot.current_checkpoint_id = None

    db.session.commit()
    return jsonify(
        ok=True,
        detected=checkpoint.is_stopped,
        checkpoint=checkpoint.to_dict(),
        robot=robot.to_dict(),
    )


@api_bp.get("/robot/status")
def robot_status_get():
    return jsonify(robot=_get_robot().to_dict())


@api_bp.post("/robot/status")
def robot_status_post():
    """The robot (or ESP32 CAM) updates its state and video URL."""
    data = request.get_json(silent=True) or request.form.to_dict()
    robot = _get_robot()

    if "state" in data:
        robot.state = data.get("state")
    if "current_checkpoint_id" in data:
        robot.current_checkpoint_id = data.get("current_checkpoint_id") or None
    if "video_url" in data:
        robot.video_url = data.get("video_url") or ""

    db.session.commit()
    return jsonify(ok=True, robot=robot.to_dict())


@api_bp.get("/items")
def list_items():
    items = HistoricalItem.query.all()
    return jsonify(items=[i.to_dict() for i in items])


@api_bp.post("/items/<int:item_id>")
def update_item(item_id):
    item = HistoricalItem.query.get_or_404(item_id)
    data = request.get_json(silent=True) or request.form.to_dict()

    if "title" in data:
        item.title = data.get("title")
    if "summary" in data:
        item.summary = data.get("summary")
    if "content_url" in data:
        item.content_url = data.get("content_url")

    db.session.commit()
    return jsonify(ok=True, item=item.to_dict())


@api_bp.get("/items/checkpoint/<int:cp_id>/content")
def item_content(cp_id):
    """Return the text a staff app should read aloud for a checkpoint."""
    checkpoint = Checkpoint.query.get_or_404(cp_id)
    item = checkpoint.item
    if not item:
        return jsonify(ok=False, error="No item for this checkpoint"), 404

    text = None
    source = "cache"
    if item.content_url:
        text = fetch_text(item.content_url)
        if text:
            source = "url"
    if not text:
        text = item.summary

    return jsonify(
        ok=True,
        title=item.title,
        text=text or "",
        source=source,
        checkpoint=checkpoint.name,
    )


@api_bp.post("/qr/scan")
def qr_scan():
    """Decode a QR code and return the linked text.

    Accepts an uploaded image, or JSON with a content or url field.
    """
    content = None
    if "image" in request.files:
        content = decode_qr(request.files["image"].read())

    if not content:
        data = request.get_json(silent=True) or request.form.to_dict()
        content = data.get("content") or data.get("url")

    if not content:
        return jsonify(ok=False, error="No QR content found"), 400

    text = fetch_text(content) if str(content).startswith("http") else content
    return jsonify(ok=True, content=content, text=text or "")


@api_bp.get("/tour/script")
def tour_script():
    """Return hardcoded exhibit content for one checkpoint mode."""
    return jsonify(ok=True, source="hardcoded", **HARDCODED_EXHIBIT)
