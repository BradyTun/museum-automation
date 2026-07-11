import random
from datetime import datetime, timedelta

from .extensions import db
from .models import Checkpoint, HistoricalItem, RobotStatus, SecurityReading


def seed_if_empty():
    """Add starter data so the dashboard looks alive on first run."""
    if Checkpoint.query.first():
        return

    checkpoint = Checkpoint(name="Main Checkpoint", order_index=1, qr_link="")
    db.session.add(checkpoint)
    db.session.flush()
    db.session.add(
        HistoricalItem(
            checkpoint_id=checkpoint.id,
            title="Min Don Min (မင်းတုန်းမင်း)",
            summary=(
                "King Mindon ruled independent Myanmar from 1853 to 1878. He founded "
                "Mandalay in 1857, hosted the Fifth Buddhist Council in 1871, and "
                "modernized the kingdom with new coins, a telegraph network, and "
                "updated tax systems."
            ),
            content_url="",
        )
    )

    db.session.add(RobotStatus(id=1, state="idle", current_checkpoint_id=None, video_url=""))

    now = datetime.utcnow()
    for step in range(12):
        db.session.add(
            SecurityReading(
                temperature=round(random.uniform(22, 27), 1),
                humidity=round(random.uniform(45, 60), 1),
                motion=False,
                smoke=False,
                created_at=now - timedelta(minutes=5 * (12 - step)),
            )
        )

    db.session.commit()
