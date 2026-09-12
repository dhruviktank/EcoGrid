import os
import sys
from pathlib import Path

# Add EcoGrid root and EcoGrid/backend to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = Path(__file__).resolve().parent.parent

for path in (str(BACKEND_DIR), str(ROOT_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)
