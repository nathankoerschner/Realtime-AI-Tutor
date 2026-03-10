#!/usr/bin/env python3
"""Simple script to run AI tutor evaluations."""

import sys
import asyncio
from pathlib import Path

# Add the project root to Python path so we can import evals modules
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from evals.runners.cli import main as cli_main


if __name__ == "__main__":
    # If no arguments provided, show help
    if len(sys.argv) == 1:
        sys.argv.extend(['--help'])
    
    asyncio.run(cli_main())