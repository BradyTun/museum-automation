import requests
from flask import current_app

try:
    import cv2
    import numpy as np

    _CV2_READY = True
except Exception:  # noqa: BLE001
    _CV2_READY = False


def decode_qr(image_bytes):
    """Read QR text from raw image bytes. Returns the text or None.

    Uses OpenCV when it is installed. If OpenCV is missing the function
    returns None so the caller can fall back to a stored checkpoint link.
    """
    if not _CV2_READY:
        return None
    try:
        array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(array, cv2.IMREAD_COLOR)
        if image is None:
            return None
        detector = cv2.QRCodeDetector()
        data, _points, _straight = detector.detectAndDecode(image)
        return data or None
    except Exception as exc:  # noqa: BLE001
        current_app.logger.error("QR decode failed: %s", exc)
        return None


def fetch_text(url, limit=20000):
    """Fetch plain text from a URL. Returns the text or None on error."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return response.text[:limit]
    except Exception as exc:  # noqa: BLE001
        current_app.logger.error("Failed to fetch text from %s: %s", url, exc)
        return None
