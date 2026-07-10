import os
import sys

# Ensure the project root is importable so "museum" resolves on Vercel.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from museum import create_app  # noqa: E402

app = create_app()
