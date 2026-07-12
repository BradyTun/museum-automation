"""Local mock of the ESP32-CAM MJPEG stream for testing without hardware.

Run:  python mock_cam.py
Then set the Video feed URL in the app to:  http://127.0.0.1:8080/stream
"""

import base64
import math
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import cv2
    import numpy as np

    HAVE_CV2 = True
except Exception:
    HAVE_CV2 = False

BOUNDARY = "frameboundary"

# 1x1 JPEG used only if OpenCV is not available.
_FALLBACK_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAgAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB"
    "AAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q=="
)


def make_frame(i):
    if not HAVE_CV2:
        return _FALLBACK_JPEG
    img = np.zeros((240, 320, 3), dtype=np.uint8)
    img[:] = (60, 30, 40)
    x = int(160 + 120 * math.sin(i / 10.0))
    y = int(120 + 80 * math.cos(i / 12.0))
    cv2.circle(img, (x, y), 26, (180, 40, 170), -1)
    cv2.putText(img, time.strftime("%H:%M:%S"), (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(img, "MOCK CAM  frame %d" % i, (10, 225),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (210, 210, 210), 1)
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    return buf.tobytes()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/stream"):
            self.send_response(200)
            self.send_header(
                "Content-Type",
                "multipart/x-mixed-replace; boundary=%s" % BOUNDARY,
            )
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            i = 0
            try:
                while True:
                    frame = make_frame(i)
                    self.wfile.write(b"--" + BOUNDARY.encode() + b"\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n")
                    self.wfile.write(("Content-Length: %d\r\n\r\n" % len(frame)).encode())
                    self.wfile.write(frame)
                    self.wfile.write(b"\r\n")
                    i += 1
                    time.sleep(0.1)
            except (BrokenPipeError, ConnectionResetError):
                pass
        else:
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Mock ESP32-CAM. Stream is at /stream")

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print("OpenCV frames:", HAVE_CV2)
    print("Mock cam streaming on http://127.0.0.1:8080/stream")
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
