import random
from datetime import datetime, timedelta

from .extensions import db
from .models import Checkpoint, HistoricalItem, RobotStatus, SecurityReading


def seed_if_empty():
    """Add starter data so the dashboard looks alive on first run."""
    if Checkpoint.query.first():
        return

    checkpoints = [
        (
            "Checkpoint 1 - Ancient Pottery",
            "The Blue Jar of the Old Kingdom",
            "This painted jar is more than two thousand years old. People used it to "
            "store grain and oil. The blue color comes from a natural mineral that the "
            "potters ground by hand.",
        ),
        (
            "Checkpoint 2 - Bronze Statue",
            "The Standing Guardian",
            "This bronze statue shows a temple guardian. Artists made it with the lost "
            "wax method. It once stood at the gate of a royal palace to protect the king.",
        ),
        (
            "Checkpoint 3 - Old Manuscript",
            "The Palm Leaf Scripture",
            "This manuscript was written on dried palm leaves. Monks copied the text by "
            "hand with an iron pen. It records old stories and daily life in the temple.",
        ),
    ]

    for index, (name, title, summary) in enumerate(checkpoints, start=1):
        qr_link = f"https://example.com/items/checkpoint-{index}.txt"
        checkpoint = Checkpoint(name=name, order_index=index, qr_link=qr_link)
        db.session.add(checkpoint)
        db.session.flush()
        db.session.add(
            HistoricalItem(
                checkpoint_id=checkpoint.id,
                title=title,
                summary=summary,
                content_url=qr_link,
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
